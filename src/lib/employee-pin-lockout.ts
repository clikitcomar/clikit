import { InvalidEmployeePinError, verifyEmployeePinValue } from "@/lib/employee-pin";
import { prisma } from "@/lib/prisma";
import {
  EMPLOYEE_PIN_MAX_FAILED_ATTEMPTS,
  EMPLOYEE_PIN_LOCKOUT_MS,
  isEmployeePinLocked,
} from "@/lib/employee-pin-lockout-policy";

type PinLockoutRow = {
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
};

export type EmployeePinAttemptResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "locked" | "invalid" };

export { isEmployeePinLocked };

export async function recordEmployeePinFailure(employeeId: string, now: Date = new Date()) {
  const nextLockUntil = new Date(now.getTime() + EMPLOYEE_PIN_LOCKOUT_MS);
  const query = [
    'UPDATE "Employee"',
    'SET "pinFailedAttempts" = CASE WHEN "pinLockedUntil" IS NOT NULL AND "pinLockedUntil" <= $1 THEN 1 ELSE "pinFailedAttempts" + 1 END,',
    '"pinLockedUntil" = CASE WHEN (CASE WHEN "pinLockedUntil" IS NOT NULL AND "pinLockedUntil" <= $1 THEN 1 ELSE "pinFailedAttempts" + 1 END) >= $2 THEN $3',
    'WHEN "pinLockedUntil" IS NOT NULL AND "pinLockedUntil" <= $1 THEN NULL ELSE "pinLockedUntil" END',
    'WHERE "id" = $4 AND ("pinLockedUntil" IS NULL OR "pinLockedUntil" <= $1)',
    'RETURNING "pinFailedAttempts", "pinLockedUntil"',
  ].join(" ");

  const rows = await prisma.$queryRawUnsafe<PinLockoutRow[]>(
    query,
    now,
    EMPLOYEE_PIN_MAX_FAILED_ATTEMPTS,
    nextLockUntil,
    employeeId,
  );

  return rows[0] ?? null;
}

export async function resetEmployeePinFailures(employeeId: string, upgradedHash?: string) {
  const now = new Date();
  const result = await prisma.employee.updateMany({
    where: {
      id: employeeId,
      OR: [{ pinLockedUntil: null }, { pinLockedUntil: { lte: now } }],
    },
    data: {
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      ...(upgradedHash ? { pin: upgradedHash } : {}),
    },
  });
  return result.count === 1;
}

export async function verifyAndTrackEmployeePin(
  employeeId: string,
  storedPin: string | null | undefined,
  candidatePin: string,
  lockedUntil?: Date | null,
): Promise<EmployeePinAttemptResult> {
  if (!storedPin) return { ok: false, reason: "missing" };
  if (isEmployeePinLocked(lockedUntil)) return { ok: false, reason: "locked" };

  let verification: Awaited<ReturnType<typeof verifyEmployeePinValue>>;
  try {
    verification = await verifyEmployeePinValue(storedPin, candidatePin);
  } catch (error) {
    if (!(error instanceof InvalidEmployeePinError)) throw error;
    verification = { ok: false, upgradedHash: undefined };
  }

  if (!verification.ok) {
    const state = await recordEmployeePinFailure(employeeId);
    if (!state || isEmployeePinLocked(state.pinLockedUntil)) {
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "invalid" };
  }

  const reset = await resetEmployeePinFailures(employeeId, verification.upgradedHash);
  if (!reset) return { ok: false, reason: "locked" };
  return { ok: true };
}
