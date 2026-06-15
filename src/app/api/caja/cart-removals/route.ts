import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const productName = typeof body?.productName === "string" ? body.productName.trim() : "";
  const price = Number(body?.price);
  const quantity = Number(body?.quantity);

  if (!productName) {
    return NextResponse.json({ error: "Falta el nombre del producto." }, { status: 400 });
  }

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Precio inválido." }, { status: 400 });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Cantidad inválida." }, { status: 400 });
  }

  const employeeId = session.user.employeeId ?? null;
  const shiftId = typeof body?.shiftId === "string" ? body.shiftId : null;

  const removal = await prisma.cartRemoval.create({
    data: {
      branchId,
      shiftId,
      productId: typeof body?.productId === "string" ? body.productId : null,
      variantId: typeof body?.variantId === "string" ? body.variantId : null,
      productName,
      price,
      quantity,
      createdByEmployeeId: employeeId,
    },
  });

  return NextResponse.json({ id: removal.id });
}
