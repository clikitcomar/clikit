export const EMPLOYEE_LOGIN_IP_RATE_LIMIT = { maxAttempts: 15, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 } as const;
export const EMPLOYEE_PIN_IP_RATE_LIMIT = { maxAttempts: 10, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 } as const;
export type EmployeePinIpRateLimitScope = "employee-login" | "pin-verification";
export type EmployeePinIpRateLimitState = { attempts: number; windowStartedAt: Date; blockedUntil: Date | null; allowed: boolean };
type Policy = { maxAttempts: number; windowMs: number; blockMs: number };
export function nextEmployeePinIpRateLimitState(current: { attempts: number; windowStartedAt: Date | null; blockedUntil: Date | null }, policy: Policy, now: Date = new Date()): EmployeePinIpRateLimitState {
  if (current.blockedUntil && current.blockedUntil.getTime() > now.getTime()) return { attempts: current.attempts, windowStartedAt: current.windowStartedAt ?? now, blockedUntil: current.blockedUntil, allowed: false };
  const windowExpired = !current.windowStartedAt || current.windowStartedAt.getTime() <= now.getTime() - policy.windowMs;
  const attempts = windowExpired ? 1 : current.attempts + 1;
  const blockedUntil = attempts > policy.maxAttempts ? new Date(now.getTime() + policy.blockMs) : null;
  return { attempts, windowStartedAt: windowExpired ? now : current.windowStartedAt!, blockedUntil, allowed: blockedUntil === null };
}