import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { getPlatformSalesPolicy } from "@/lib/platform-sales-policy";
import { prisma } from "@/lib/prisma";

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!isPlatformAdmin(session.user)) {
    return NextResponse.json({ error: "No tenés permisos para administrar la plataforma." }, { status: 403 });
  }

  const policy = await getPlatformSalesPolicy();
  return NextResponse.json(policy);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!isPlatformAdmin(session.user)) {
    return NextResponse.json({ error: "No tenés permisos para administrar la plataforma." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "La configuración enviada no es válida." }, { status: 400 });
  }

  const freeDailySalesLimit = Number(body.freeDailySalesLimit);
  const subscriptionPriceArs = Number(body.subscriptionPriceArs);
  const timeZone = body.timeZone;

  if (!Number.isSafeInteger(freeDailySalesLimit) || freeDailySalesLimit < 0 || freeDailySalesLimit > 10000) {
    return NextResponse.json({ error: "El límite diario debe ser un número entero entre 0 y 10.000. Usá 0 para desactivar el límite." }, { status: 400 });
  }
  if (!Number.isSafeInteger(subscriptionPriceArs) || subscriptionPriceArs < 1 || subscriptionPriceArs > 100000000) {
    return NextResponse.json({ error: "El precio mensual debe ser un importe entero mayor a cero." }, { status: 400 });
  }
  if (!isValidTimeZone(timeZone)) {
    return NextResponse.json({ error: "La zona horaria ingresada no es válida." }, { status: 400 });
  }

  const policy = await prisma.platformSalesPolicy.upsert({
    where: { id: "global" },
    update: {
      freeDailySalesLimit,
      subscriptionPriceArs,
      timeZone: timeZone.trim(),
      updatedById: session.user.id,
      updatedByEmail: session.user.email ?? null,
    },
    create: {
      id: "global",
      freeDailySalesLimit,
      subscriptionPriceArs,
      timeZone: timeZone.trim(),
      updatedById: session.user.id,
      updatedByEmail: session.user.email ?? null,
    },
  });

  return NextResponse.json(policy);
}
