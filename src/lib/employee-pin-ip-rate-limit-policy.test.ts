import { describe, expect, it } from "vitest";
import { EMPLOYEE_LOGIN_IP_RATE_LIMIT, EMPLOYEE_PIN_IP_RATE_LIMIT, nextEmployeePinIpRateLimitState } from "@/lib/employee-pin-ip-rate-limit-policy";
describe("employee IP rate-limit policy", () => {
  const now = new Date("2026-11-19T12:00:00.000Z");
  it("allows configured attempts then blocks the next", () => {
    let state = { attempts: 0, windowStartedAt: null as Date | null, blockedUntil: null as Date | null };
    for (let i = 0; i < EMPLOYEE_LOGIN_IP_RATE_LIMIT.maxAttempts; i += 1) {
      state = nextEmployeePinIpRateLimitState(state, EMPLOYEE_LOGIN_IP_RATE_LIMIT, now);
      expect(state.allowed).toBe(true);
    }
    const blocked = nextEmployeePinIpRateLimitState(state, EMPLOYEE_LOGIN_IP_RATE_LIMIT, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockedUntil?.getTime()).toBe(now.getTime() + EMPLOYEE_LOGIN_IP_RATE_LIMIT.blockMs);
  });
  it("has a distinct tighter budget for PIN verification", () => {
    expect(EMPLOYEE_PIN_IP_RATE_LIMIT.maxAttempts).toBeLessThan(EMPLOYEE_LOGIN_IP_RATE_LIMIT.maxAttempts);
  });
  it("does not extend an active block", () => {
    const until = new Date(now.getTime() + 60000);
    const state = nextEmployeePinIpRateLimitState({ attempts: 20, windowStartedAt: now, blockedUntil: until }, EMPLOYEE_LOGIN_IP_RATE_LIMIT, now);
    expect(state.allowed).toBe(false);
    expect(state.blockedUntil).toEqual(until);
  });
  it("resets the counter after the window expires", () => {
    const old = new Date(now.getTime() - EMPLOYEE_PIN_IP_RATE_LIMIT.windowMs - 1);
    const state = nextEmployeePinIpRateLimitState({ attempts: 50, windowStartedAt: old, blockedUntil: null }, EMPLOYEE_PIN_IP_RATE_LIMIT, now);
    expect(state.allowed).toBe(true);
    expect(state.attempts).toBe(1);
    expect(state.windowStartedAt).toEqual(now);
  });
});