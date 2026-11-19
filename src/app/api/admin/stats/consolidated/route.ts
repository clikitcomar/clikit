import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getSaleItemCostSubtotal, getSaleItemSubtotal } from "@/lib/sale-item";
import { artDayRange, todayART } from "@/lib/utils";
import { isPlatformAdmin } from "@/lib/platform-admin";

// GET /api/admin/stats/consolidated?scope=kiosco|branch|global&targetId=XXX&email=XXX&periodo=dia|semana|mes&isoDate=YYYY-MM-DD
const getConsolidatedMetrics = unstable_cache(
  async (params: {
    scope: string;
    targetId: string;
    email: string;
    periodo: string;
    isoDate: string;
  }) => {
    const { scope, targetId, email, periodo, isoDate } = params;
    const { start: dayStart } = artDayRange(isoDate);
    let start: Date;
    let end: Date;

    if (periodo === "semana") {
      const d = new Date(dayStart);
      const dow = d.getUTCDay();
      const daysFromMonday = dow === 0 ? 6 : dow - 1;
      start = new Date(d);
      start.setUTCDate(d.getUTCDate() - daysFromMonday);
      end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      end.setUTCHours(23, 59, 59, 999);
    } else if (periodo === "mes") {
      const [y, m] = isoDate.split("-").map(Number);
      start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`);
      const lastDay = new Date(y, m, 0).getDate();
      end = new Date(`${y}-${String(m).padStart(2, "0")}-${lastDay}T23:59:59.999-03:00`);
    } else {
      const { end: dayEnd } = artDayRange(isoDate);
      start = dayStart;
      end = dayEnd;
    }

    // Determine which branches to query
    let branchIds: string[] = [];

    if (scope === "branch" && targetId) {
      branchIds = [targetId];
    } else if (scope === "kiosco" && targetId) {
      const branches = await prisma.branch.findMany({
        where: { kioscoId: targetId },
        select: { id: true },
      });
      branchIds = branches.map((b) => b.id);
    } else if (scope === "email" && email) {
      const kiosco = await prisma.kiosco.findFirst({
        where: {
          owner: {
            email: { equals: email, mode: "insensitive" },
          },
        },
        select: { id: true },
      });
      if (kiosco) {
        const branches = await prisma.branch.findMany({
          where: { kioscoId: kiosco.id },
          select: { id: true },
        });
        branchIds = branches.map((b) => b.id);
      }
    } else if (scope === "global") {
      const branches = await prisma.branch.findMany({
        select: { id: true },
      });
      branchIds = branches.map((b) => b.id);
    }

    if (branchIds.length === 0) {
      return {
        totalRevenue: 0,
        totalCost: 0,
        totalExpenses: 0,
        grossProfit: 0,
        netProfit: 0,
        marginPercent: null as number | null,
        totalSales: 0,
        totalUnits: 0,
        branchCount: 0,
        kioscoCount: 0,
        productConsolidation: [] as Array<{ name: string; units: number; revenue: number; cost: number; profit: number }>,
        revenueByPaymentMethod: {} as Record<string, number>,
        periodo,
        desde: start.toISOString(),
        hasta: end.toISOString(),
        context: { kioscoName: null as string | null, branchName: null as string | null, ownerEmail: null as string | null },
      };
    }

    // Get all sales, expenses, and withdrawals
    const [sales, expenses, withdrawals] = await Promise.all([
      prisma.sale.findMany({
        where: {
          branchId: { in: branchIds },
          createdAt: { gte: start, lte: end },
          voided: false,
        },
        select: {
          total: true,
          paymentMethod: true,
          branchId: true,
          items: {
            select: {
              name: true,
              quantity: true,
              price: true,
              cost: true,
              soldByWeight: true,
            },
          },
        },
        take: 50000,
      }),
      prisma.expense.aggregate({
        where: { branchId: { in: branchIds }, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { branchId: { in: branchIds }, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
    ]);

    // Consolidate products and calculate margins
    const productMap: Record<string, { name: string; units: number; revenue: number; cost: number }> = {};
    const revenueByPaymentMethod: Record<string, number> = {};
    let totalRevenue = 0;
    const totalCost = 0;
    let totalUnits = 0;

    for (const sale of sales) {
      totalRevenue += sale.total;
      revenueByPaymentMethod[sale.paymentMethod] =
        (revenueByPaymentMethod[sale.paymentMethod] ?? 0) + sale.total;

      for (const item of sale.items) {
        if (!productMap[item.name]) {
          productMap[item.name] = { name: item.name, units: 0, revenue: 0, cost: 0 };
        }
        productMap[item.name].units += item.quantity;
        productMap[item.name].revenue += getSaleItemSubtotal(item);
        totalUnits += item.quantity;

        if (item.cost !== null) {
          productMap[item.name].cost += getSaleItemCostSubtotal({
            ...item,
            cost: item.cost,
          });
        }
      }
    }

    const totalExpenses = expenses._sum.amount ?? 0;
    const totalWithdrawals = withdrawals._sum.amount ?? 0;
    const hasCosts = Object.values(productMap).some((p) => p.cost > 0);
    const grossProfit = hasCosts ? totalRevenue - totalCost : null;
    const netProfit = hasCosts && grossProfit !== null ? grossProfit - totalExpenses : null;
    const marginPercent =
      hasCosts && totalRevenue > 0 && netProfit !== null
        ? Math.round((netProfit / totalRevenue) * 100)
        : null;

    // Build consolidated product list with profit calculations
    const productConsolidation = Object.values(productMap)
      .map((p) => ({
        ...p,
        profit: hasCosts ? p.revenue - p.cost : null,
      }))
      .sort((a, b) => {
        const profitA = hasCosts ? (a.profit ?? 0) : a.revenue;
        const profitB = hasCosts ? (b.profit ?? 0) : b.revenue;
        return profitB - profitA;
      })
      .slice(0, 50);

    // Get unique kioscos count
    const kioscos = await prisma.kiosco.findMany({
      where: {
        branches: {
          some: {
            id: { in: branchIds },
          },
        },
      },
      select: { id: true },
    });

    // Get context info
    let context = {
      kioscoName: null as string | null,
      branchName: null as string | null,
      ownerEmail: null as string | null,
    };

    if (scope === "branch" && targetId) {
      const branch = await prisma.branch.findUnique({
        where: { id: targetId },
        select: {
          name: true,
          kiosco: {
            select: {
              name: true,
              owner: { select: { email: true } },
            },
          },
        },
      });
      if (branch) {
        context = {
          kioscoName: branch.kiosco.name,
          branchName: branch.name,
          ownerEmail: branch.kiosco.owner.email,
        };
      }
    } else if (scope === "kiosco" && targetId) {
      const kiosco = await prisma.kiosco.findUnique({
        where: { id: targetId },
        select: { name: true, owner: { select: { email: true } } },
      });
      if (kiosco) {
        context = {
          kioscoName: kiosco.name,
          branchName: null,
          ownerEmail: kiosco.owner.email,
        };
      }
    } else if (scope === "email" && email) {
      const kiosco = await prisma.kiosco.findFirst({
        where: { owner: { email: { equals: email, mode: "insensitive" } } },
        select: { name: true, owner: { select: { email: true } } },
      });
      if (kiosco) {
        context = {
          kioscoName: kiosco.name,
          branchName: null,
          ownerEmail: kiosco.owner.email,
        };
      }
    }

    return {
      totalRevenue: Math.round(totalRevenue),
      totalCost: Math.round(totalCost),
      totalExpenses: Math.round(totalExpenses),
      grossProfit: grossProfit !== null ? Math.round(grossProfit) : null,
      netProfit: netProfit !== null ? Math.round(netProfit) : null,
      marginPercent,
      totalSales: sales.length,
      totalUnits,
      branchCount: branchIds.length,
      kioscoCount: kioscos.length,
      productConsolidation,
      revenueByPaymentMethod,
      periodo,
      desde: start.toISOString(),
      hasta: end.toISOString(),
      context,
      hasCosts,
      totalWithdrawals: Math.round(totalWithdrawals),
    };
  },
  ["admin-stats-consolidated"],
  { revalidate: 120 }
);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isPlatformAdmin(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "global";
  const targetId = searchParams.get("targetId") ?? "";
  const email = searchParams.get("email") ?? "";
  const periodo = searchParams.get("periodo") ?? "semana";
  const isoDate = searchParams.get("isoDate") ?? todayART();

  const data = await getConsolidatedMetrics({ scope, targetId, email, periodo, isoDate });

  return NextResponse.json(data);
}
