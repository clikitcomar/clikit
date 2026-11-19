import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Restore is intentionally disabled until the export format includes the
 * complete operational history and the importer can preserve all relations.
 * The previous implementation could cascade-delete sales when replacing
 * branches and could partially import an incomplete backup in merge mode.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño puede restaurar backup." }, { status: 403 });
  }

  return NextResponse.json(
    {
      error:
        "Restauración temporalmente deshabilitada por seguridad. El backup actual no contiene ventas, turnos, comprobantes ni todo el historial operativo.",
      code: "BACKUP_RESTORE_UNAVAILABLE",
    },
    { status: 503 },
  );
}
