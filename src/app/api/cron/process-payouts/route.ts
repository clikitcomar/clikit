import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Payout automation stays disabled until a real transfer provider is integrated.
 * A payout must never be marked PAID without a confirmed provider transfer.
 */
export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: "Worker deshabilitado: falta configurar CRON_SECRET." },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "Automatización de pagos deshabilitada.",
      message:
        "Todavía no hay una integración real de transferencias. Las solicitudes aprobadas permanecen sin cambios.",
    },
    { status: 503 },
  );
}
