import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { verifyAndTrackEmployeePin } from "@/lib/employee-pin-lockout";
import { clearEmployeePinIpRateLimit, enforceEmployeePinIpRateLimit } from "@/lib/employee-pin-ip-rate-limit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type VerifyEmployeePinRequestBody = {
  employeeId?: string;
  pin?: string;
};

// POST /api/empleados/verificar-pin
// Body: { employeeId: string, pin: string }
// Returns: { ok: boolean }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { branchId } = await getBranchContext(req, session.user.id);
    const { employeeId, pin } = (await req.json()) as VerifyEmployeePinRequestBody;

    if (!branchId) {
      return NextResponse.json({ ok: false, error: "Sucursal no encontrada" }, { status: 404 });
    }

    if (!employeeId || !pin) {
      return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
    }

    const limited = await enforceEmployeePinIpRateLimit(req, "pin-verification");
    if (limited) return limited;

    // Find the employee inside the active branch context
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        branches: { some: { id: branchId } },
        active: true,
        OR: [
          { suspendedUntil: null },
          { suspendedUntil: { lte: new Date() } },
        ],
      },
      select: { id: true, pin: true, pinLockedUntil: true },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: "Empleado no encontrado" }, { status: 404 });
    }

    const verification = await verifyAndTrackEmployeePin(
      employee.id,
      employee.pin,
      pin,
      employee.pinLockedUntil,
    );

    if (!verification.ok) {
      if (verification.reason === "missing") {
        return NextResponse.json(
          { ok: false, error: "Este empleado no tiene un PIN configurado." },
          { status: 403 },
        );
      }
      if (verification.reason === "locked") {
        return NextResponse.json(
          { ok: false, error: "Demasiados intentos. El acceso quedó bloqueado durante 15 minutos." },
          { status: 429 },
        );
      }
      return NextResponse.json({ ok: false, error: "PIN incorrecto." }, { status: 401 });
    }

    await clearEmployeePinIpRateLimit(req, "pin-verification");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error verifying PIN:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
