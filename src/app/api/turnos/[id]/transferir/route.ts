import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import {
  canManageShiftLifecycle,
  computeShiftExpectedAmount,
  createShiftForbiddenResponse,
  getActiveShift,
} from "@/lib/shift-access";
import { verifyAndTrackEmployeePin } from "@/lib/employee-pin-lockout";
import { clearEmployeePinIpRateLimit, enforceEmployeePinIpRateLimit } from "@/lib/employee-pin-ip-rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { id } = await params;
  const { employeeId, pin } = await req.json();

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      employee: {
        select: { id: true, name: true },
      },
    },
  });

  if (!shift || shift.branchId !== branchId || shift.closedAt) {
    return NextResponse.json({ error: "Turno invalido" }, { status: 404 });
  }

  const activeShift = await getActiveShift(branchId);
  if (!activeShift || activeShift.id !== shift.id) {
    return NextResponse.json({ error: "Solo se puede transferir el turno activo actual." }, { status: 409 });
  }

  if (!canManageShiftLifecycle(session.user, shift)) {
    return createShiftForbiddenResponse(shift);
  }

  let nextEmployeeId: string | null = null;
  let nextEmployeeName = "Dueño";

  if (typeof employeeId === "string" && employeeId) {
    const limited = await enforceEmployeePinIpRateLimit(req, "pin-verification");
    if (limited) return limited;

    const employeeWhere: Prisma.EmployeeWhereInput = {
      id: employeeId,
      branches: { some: { id: branchId } },
      active: true,
    };

    const employee = await prisma.employee.findFirst({
      where: employeeWhere,
      select: {
        id: true,
        name: true,
        pin: true,
        pinLockedUntil: true,
        suspendedUntil: true,
      },
    });

    if (!employee || (employee.suspendedUntil && employee.suspendedUntil > new Date())) {
      return NextResponse.json({ error: "Empleado no disponible para recibir el turno." }, { status: 400 });
    }

    const pinVerification = await verifyAndTrackEmployeePin(
      employee.id,
      employee.pin,
      typeof pin === "string" ? pin : "",
      employee.pinLockedUntil,
    );
    if (!pinVerification.ok) {
      const message =
        pinVerification.reason === "locked"
          ? "Demasiados intentos. El acceso quedó bloqueado durante 15 minutos."
          : pinVerification.reason === "missing"
            ? "El empleado debe tener un PIN configurado."
            : "PIN incorrecto.";
      return NextResponse.json({ error: message }, { status: pinVerification.reason === "locked" ? 429 : 401 });
    }

    await clearEmployeePinIpRateLimit(req, "pin-verification");
    nextEmployeeId = employee.id;
    nextEmployeeName = employee.name;
  }

  if (shift.employeeId === nextEmployeeId) {
    return NextResponse.json(
      { error: `${nextEmployeeName} ya esta a cargo de la caja.` },
      { status: 400 },
    );
  }

  const currentResponsible = shift.employee?.name || shift.employeeName || "Dueño";

  const nextShift = await prisma.$transaction(async (tx) => {
    const expectedAmount = await computeShiftExpectedAmount(shift.id, shift.openingAmount, tx);

    await tx.shift.update({
      where: { id: shift.id },
      data: {
        closingAmount: expectedAmount,
        expectedAmount,
        difference: 0,
        note: shift.note
          ? `${shift.note}\nTransferido a ${nextEmployeeName}.`
          : `Transferido a ${nextEmployeeName}.`,
        closedAt: new Date(),
      },
    });

    const createdShift = await tx.shift.create({
      data: {
        branchId,
        openingAmount: expectedAmount,
        employeeId: nextEmployeeId,
        employeeName: nextEmployeeName,
        note: `Recibido desde ${currentResponsible}.`,
      },
      include: {
        employee: {
          select: { id: true, name: true },
        },
      },
    });

    await tx.branch.update({
      where: { id: branchId },
      data: { activeShiftId: createdShift.id },
    });

    return createdShift;
  });

  return NextResponse.json(nextShift);
}
