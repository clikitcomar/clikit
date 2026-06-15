import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getBranchId } from "@/lib/branch";

// GET /api/fiados/customers — list customers sorted by recently used
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  const isCashier = session.user.role === "EMPLOYEE" && session.user.employeeRole === "CASHIER";

  if (!isOwner && !isManager && !isCashier) {
    return NextResponse.json({ error: "No tenés permiso para ver la lista de fiados." }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json([]);

  const customers = await prisma.creditCustomer.findMany({
    where: { branchId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, phone: true, balance: true, creditLimit: true, updatedAt: true },
  });

  return NextResponse.json(customers);
}

// POST /api/fiados/customers — create new customer
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const rawCreditLimit = body?.creditLimit;
  const creditLimit =
    rawCreditLimit === null || rawCreditLimit === undefined || rawCreditLimit === ""
      ? null
      : Number(rawCreditLimit);

  if (!name) {
    return NextResponse.json({ error: "El nombre del cliente es obligatorio." }, { status: 400 });
  }

  if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
    return NextResponse.json({ error: "El límite de crédito debe ser un número positivo." }, { status: 400 });
  }

  const customer = await prisma.creditCustomer.create({
    data: { branchId, name, phone: phone || null, creditLimit },
    select: { id: true, name: true, phone: true, balance: true, creditLimit: true, updatedAt: true },
  });

  return NextResponse.json(customer);
}

// PATCH /api/fiados/customers — update credit limit
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "OWNER" && session.user.employeeRole !== "MANAGER") {
    return NextResponse.json({ error: "Solo el dueño o encargado puede editar límites." }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const customerId = typeof body?.customerId === "string" ? body.customerId : "";
  const rawCreditLimit = body?.creditLimit;
  const creditLimit =
    rawCreditLimit === null || rawCreditLimit === undefined || rawCreditLimit === ""
      ? null
      : Number(rawCreditLimit);

  if (!customerId) {
    return NextResponse.json({ error: "Falta el ID del cliente." }, { status: 400 });
  }

  if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
    return NextResponse.json({ error: "El límite de crédito debe ser un número positivo." }, { status: 400 });
  }

  const customer = await prisma.creditCustomer.findFirst({
    where: { id: customerId, branchId },
  });

  if (!customer) {
    return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  }

  const updated = await prisma.creditCustomer.update({
    where: { id: customerId },
    data: { creditLimit },
    select: { id: true, name: true, phone: true, balance: true, creditLimit: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}
