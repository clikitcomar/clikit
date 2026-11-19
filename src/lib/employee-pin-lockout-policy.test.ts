import { describe, expect, it } from "vitest";

import {
  EMPLOYEE_PIN_LOCKOUT_MS,
  EMPLOYEE_PIN_MAX_FAILED_ATTEMPTS,
  isEmployeePinLocked,
  nextEmployeePinFailureState,
} from "@/lib/employee-pin-lockout-policy";

describe("employee PIN lockout policy", () => {
  const now = new Date("2026-11-19T12:00:00.000Z");

  it("allows fewer than five failures without a lock", () => {
    expect(EMPLOYEE_PIN_MAX_FAILED_ATTEMPTS).toBe(5);
    expect(nextEmployeePinFailureState(2, null, now)).toEqual({ failedAttempts: 3, lockedUntil: null });
  });

  it("locks for 15 minutes on the fifth failed attempt", () => {
    const state = nextEmployeePinFailureState(4, null, now);
    expect(state.failedAttempts).toBe(5);
    expect(state.lockedUntil?.getTime()).toBe(now.getTime() + EMPLOYEE_PIN_LOCKOUT_MS);
    expect(isEmployeePinLocked(state.lockedUntil, now)).toBe(true);
  });

  it("resets the attempt count after an expired lock", () => {
    const expired = new Date(now.getTime() - 1);
    expect(nextEmployeePinFailureState(5, expired, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
  });

  it("keeps an active lock in place", () => {
    const active = new Date(now.getTime() + 60_000);
    expect(nextEmployeePinFailureState(5, active, now)).toEqual({ failedAttempts: 5, lockedUntil: active });
  });
});
