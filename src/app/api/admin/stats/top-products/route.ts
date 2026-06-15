import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getSaleItemSubtotal } from "@/lib/sale-item";
import { artDayRange, todayART } from "@/lib/utils";
import { isPlatformAdmin } from "@/lib/platform-admin";

// GET /api/admin/stats/top-products?scope=kiosco|branch|global&targetId=XXX&email=XXX&periodo=dia|semana|mes&isoDate=YYYY-MM-DD&sortBy=cantidad|revenue
const getAdminTopProducts = unstable_cache(
  async (params: {
    scope: string;
    targetId: string;
    email: string;
    periodo: string;
    isoDate: string;
    sortBy: string;
  }) => {
    const { scope, targetId, email, periodo, isoDate, sortBy } = params;
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
      // Specific branch
      branchIds = [targetId];
    } else if (scope === "kiosco" && targetId) {
      // All branches of a kiosco
      const branches = await prisma.branch.findMany({
        where: { kioscoId: targetId },
        select: { id: true },
      });
      branchIds = branches.map((b) => b.id);
    } else if (scope === "email" && email) {
      // All branches of a kiosco by owner email
      const kiosco = await prisma.kiosco.findFirst({
        where: {
          owner: {
            email: {
              equals: email,
              mode: "insensitive",
            },
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
      // All branches (platform-wide)
      const branches = await prisma.branch.findMany({
        select: { id: true },
      });
      branchIds = branches.map((b) => b.id);
    }

    if (branchIds.length === 0) {
      return {
        topProducts: [],
        totalVentas: 0,
        cantidadVentas: 0,
        branchCount: 0,
        kioscoName: null,
        branchName: null,
        ownerEmail: null,
        periodo,
        desde: start.toISOString(),
        hasta: end.toISOString(),
      };
    }

    // Get all non-voided sales in the period with their items
    const sales = await prisma.sale.findMany({
      where: {
        branchId: { in: branchIds },
        createdAt: { gte: start, lte: end },
        voided: false,
      },
      select: {
        id: true,
        total: true,
        branchId: true,
        items: {
          select: {
            name: true,
            quantity: true,
            price: true,
            soldByWeight: true,
            productId: true,
          },
        },
      },
      take: 10000, // Limit for performance
    });

    // Aggregate products by name
    const productMap: Record<string, { name: string; cantidad: number; total: number }> = {};

    for (const sale of sales) {
      for (const item of sale.items) {
        if (!productMap[item.name]) {
          productMap[item.name] = { name: item.name, cantidad: 0, total: 0 };
        }
        productMap[item.name].cantidad += item.quantity;
        productMap[item.name].total += getSaleItemSubtotal(item);
      }
    }

    // Sort by quantity or revenue and get top 10
    const topProducts = Object.values(productMap)
      .sort((a, b) => {
        if (sortBy === "revenue") {
          return b.total - a.total;
        }
        return b.cantidad - a.cantidad;
      })
      .slice(0, 10);

    // Calculate total sales for context
    const totalVentas = sales.reduce((sum, sale) => sum + sale.total, 0);
    const cantidadVentas = sales.length;

    // Get context info (kiosco name, branch name, email)
    let kioscoName: string | null = null;
    let branchName: string | null = null;
    let ownerEmail: string | null = null;

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
        branchName = branch.name;
        kioscoName = branch.kiosco.name;
        ownerEmail = branch.kiosco.owner.email;
      }
    } else if (scope === "kiosco" && targetId) {
      const kiosco = await prisma.kiosco.findUnique({
        where: { id: targetId },
        select: { name: true, owner: { select: { email: true } } },
      });
      if (kiosco) {
        kioscoName = kiosco.name;
        ownerEmail = kiosco.owner.email;
      }
    } else if (scope === "email" && email) {
      const kiosco = await prisma.kiosco.findFirst({
        where: { owner: { email: { equals: email, mode: "insensitive" } } },
        select: { name: true, owner: { select: { email: true } } },
      });
      if (kiosco) {
        kioscoName = kiosco.name;
        ownerEmail = kiosco.owner.email;
      }
    }

    return {
      topProducts,
      totalVentas: Math.round(totalVentas),
      cantidadVentas,
      branchCount: branchIds.length,
      kioscoName,
      branchName,
      ownerEmail,
      periodo,
      desde: start.toISOString(),
      hasta: end.toISOString(),
    };
  },
  ["admin-stats-top-products"],
  { revalidate: 60 }
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
  const sortBy = searchParams.get("sortBy") ?? "cantidad";

  const data = await getAdminTopProducts({ scope, targetId, email, periodo, isoDate, sortBy });

  return NextResponse.json(data);
}
