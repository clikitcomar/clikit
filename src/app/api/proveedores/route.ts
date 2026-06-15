import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) return NextResponse.json([]);

  const suppliers = await prisma.supplier.findMany({
    where: { kioscoId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true, email: true, note: true },
  });

  return NextResponse.json(suppliers);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "OWNER" && session.user.employeeRole !== "MANAGER") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) return NextResponse.json({ error: "No kiosco" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }

  const supplier = await prisma.supplier.create({
    data: { kioscoId, name, phone: phone || null, email: email || null, note: note || null },
    select: { id: true, name: true, phone: true, email: true, note: true },
  });

  return NextResponse.json(supplier);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "OWNER" && session.user.employeeRole !== "MANAGER") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) return NextResponse.json({ error: "No kiosco" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";

  if (!id) return NextResponse.json({ error: "Falta el ID." }, { status: 400 });

  const existing = await prisma.supplier.findFirst({ where: { id, kioscoId } });
  if (!existing) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.phone !== undefined) data.phone = String(body.phone).trim() || null;
  if (body.email !== undefined) data.email = String(body.email).trim() || null;
  if (body.note !== undefined) data.note = String(body.note).trim() || null;

  const updated = await prisma.supplier.update({
    where: { id },
    data,
    select: { id: true, name: true, phone: true, email: true, note: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño puede eliminar proveedores." }, { status: 403 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) return NextResponse.json({ error: "No kiosco" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";

  if (!id) return NextResponse.json({ error: "Falta el ID." }, { status: 400 });

  const existing = await prisma.supplier.findFirst({ where: { id, kioscoId } });
  if (!existing) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  await prisma.supplier.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
