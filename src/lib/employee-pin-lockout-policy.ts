export const EMPLOYEE_PIN_MAX_FAILED_ATTEMPTS = 5;
export const EMPLOYEE_PIN_LOCKOUT_MS = 15 * 60 * 1000;

export function isEmployeePinLocked(lockedUntil: Date | null | undefined, now: Date = new Date()) {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function nextEmployeePinFailureState(
  currentFailedAttempts: number,
  currentLockedUntil: Date | null | undefined,
  now: Date = new Date(),
) {
  if (isEmployeePinLocked(currentLockedUntil, now)) {
    return { failedAttempts: Math.max(0, currentFailedAttempts), lockedUntil: currentLockedUntil ?? null };
  }

  const failedAttempts = currentLockedUntil && currentLockedUntil.getTime() <= now.getTime()
    ? 1
    : Math.max(0, currentFailedAttempts) + 1;

  return {
    failedAttempts,
    lockedUntil: failedAttempts >= EMPLOYEE_PIN_MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + EMPLOYEE_PIN_LOCKOUT_MS)
      : null,
  };
}
