import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getSaleItemSubtotal } from "@/lib/sale-item";
import { artDayRange, todayART } from "@/lib/utils";

// GET /api/stats/top-products?periodo=dia|semana|mes&isoDate=YYYY-MM-DD
const getTopProducts = unstable_cache(
  async (branchId: string, periodo: string, isoDate: string) => {
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
      // dia
      const { end: dayEnd } = artDayRange(isoDate);
      start = dayStart;
      end = dayEnd;
    }

    // Get all non-voided sales in the period with their items
    const sales = await prisma.sale.findMany({
      where: {
        branchId,
        createdAt: { gte: start, lte: end },
        voided: false,
      },
      select: {
        id: true,
        total: true,
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

    // Sort by quantity and get top 10
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    // Calculate total sales for context
    const totalVentas = sales.reduce((sum, sale) => sum + sale.total, 0);
    const cantidadVentas = sales.length;

    return {
      topProducts,
      totalVentas: Math.round(totalVentas),
      cantidadVentas,
      periodo,
      desde: start.toISOString(),
      hasta: end.toISOString(),
    };
  },
  ["stats-top-products"],
  { revalidate: 30 }
);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";

  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? "semana";
  const isoDate = searchParams.get("isoDate") ?? todayART();

  const data = await getTopProducts(branchId, periodo, isoDate);

  return NextResponse.json(data);
}
