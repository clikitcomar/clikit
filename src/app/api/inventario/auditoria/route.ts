import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];

  if (items.length === 0) {
    return NextResponse.json({ error: "No hay items para auditar." }, { status: 400 });
  }

  const discrepancies: Array<{
    productId: string;
    variantId: string | null;
    name: string;
    expectedStock: number;
    countedStock: number;
    difference: number;
  }> = [];

  for (const item of items) {
    const productId = typeof item?.productId === "string" ? item.productId : null;
    const variantId = typeof item?.variantId === "string" ? item.variantId : null;
    const countedStock = Number(item?.countedStock);

    if (!productId || !Number.isInteger(countedStock) || countedStock < 0) continue;

    if (variantId) {
      const variantInv = await prisma.variantInventory.findFirst({
        where: { variantId, branchId },
        select: {
          stock: true,
          variant: { select: { name: true, product: { select: { name: true } } } },
        },
      });

      if (variantInv && typeof variantInv.stock === "number") {
        const diff = countedStock - variantInv.stock;
        if (diff !== 0) {
          discrepancies.push({
            productId,
            variantId,
            name: `${variantInv.variant.product.name} - ${variantInv.variant.name}`,
            expectedStock: variantInv.stock,
            countedStock,
            difference: diff,
          });
        }
      }
    } else {
      const inv = await prisma.inventoryRecord.findFirst({
        where: { productId, branchId },
        select: {
          stock: true,
          product: { select: { name: true } },
        },
      });

      if (inv && typeof inv.stock === "number") {
        const diff = countedStock - inv.stock;
        if (diff !== 0) {
          discrepancies.push({
            productId,
            variantId: null,
            name: inv.product.name,
            expectedStock: inv.stock,
            countedStock,
            difference: diff,
          });
        }
      }
    }
  }

  return NextResponse.json({
    totalScanned: items.length,
    discrepancies,
    matchCount: items.length - discrepancies.length,
  });
}
