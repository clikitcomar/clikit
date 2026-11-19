import { createHmac, randomInt } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_LOGIN_IP_RATE_LIMIT, EMPLOYEE_PIN_IP_RATE_LIMIT, type EmployeePinIpRateLimitScope } from "@/lib/employee-pin-ip-rate-limit-policy";
type RateLimitRow = { attempts: number; windowStartedAt: Date; blockedUntil: Date | null };
export function getTrustedClientIp(request: Pick<Request, "headers">): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedIp && isIP(forwardedIp)) return forwardedIp;
  return null;
}
function getRateLimitKey(scope: EmployeePinIpRateLimitScope, ip: string) {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) return null;
  return createHmac("sha256", secret).update(scope + String.fromCharCode(0) + ip).digest("hex");
}
function getPolicy(scope: EmployeePinIpRateLimitScope) { return scope === "employee-login" ? EMPLOYEE_LOGIN_IP_RATE_LIMIT : EMPLOYEE_PIN_IP_RATE_LIMIT; }
export async function enforceEmployeePinIpRateLimit(request: Pick<Request, "headers">, scope: EmployeePinIpRateLimitScope): Promise<NextResponse | null> {
  const ip = getTrustedClientIp(request);
  if (!ip) return process.env.NODE_ENV === "production" ? unavailableResponse() : null;
  const key = getRateLimitKey(scope, ip);
  if (!key) return unavailableResponse();
  const policy = getPolicy(scope);
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - policy.windowMs);
  const blockUntil = new Date(now.getTime() + policy.blockMs);
  const query = [
    'INSERT INTO "EmployeePinIpRateLimit" ("id", "attempts", "windowStartedAt", "blockedUntil", "updatedAt") VALUES ($1, 1, $2, NULL, $2)',
    'ON CONFLICT ("id") DO UPDATE SET',
    '"attempts" = CASE WHEN "EmployeePinIpRateLimit"."blockedUntil" IS NOT NULL AND "EmployeePinIpRateLimit"."blockedUntil" > $2 THEN "EmployeePinIpRateLimit"."attempts" WHEN "EmployeePinIpRateLimit"."windowStartedAt" <= $3 THEN 1 ELSE "EmployeePinIpRateLimit"."attempts" + 1 END,',
    '"windowStartedAt" = CASE WHEN "EmployeePinIpRateLimit"."blockedUntil" IS NOT NULL AND "EmployeePinIpRateLimit"."blockedUntil" > $2 THEN "EmployeePinIpRateLimit"."windowStartedAt" WHEN "EmployeePinIpRateLimit"."windowStartedAt" <= $3 THEN $2 ELSE "EmployeePinIpRateLimit"."windowStartedAt" END,',
    '"blockedUntil" = CASE WHEN "EmployeePinIpRateLimit"."blockedUntil" IS NOT NULL AND "EmployeePinIpRateLimit"."blockedUntil" > $2 THEN "EmployeePinIpRateLimit"."blockedUntil" WHEN (CASE WHEN "EmployeePinIpRateLimit"."windowStartedAt" <= $3 THEN 1 ELSE "EmployeePinIpRateLimit"."attempts" + 1 END) > $4 THEN $5 ELSE NULL END,',
    '"updatedAt" = $2 RETURNING "attempts", "windowStartedAt", "blockedUntil"'
  ].join(" ");
  let rows: RateLimitRow[];
  try { rows = await prisma.$queryRawUnsafe<RateLimitRow[]>(query, key, now, windowCutoff, policy.maxAttempts, blockUntil); }
  catch (error) { console.error("[EMPLOYEE_PIN_RATE_LIMIT] No se pudo consultar el límite:", error); return unavailableResponse(); }
  const row = rows[0];
  if (!row) return unavailableResponse();
  if (row.blockedUntil && row.blockedUntil.getTime() > now.getTime()) return limitedResponse(Math.max(1, Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000)));
  if (randomInt(128) === 0) await prisma.employeePinIpRateLimit.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } }).catch((error) => console.warn("[EMPLOYEE_PIN_RATE_LIMIT] cleanup:", error));
  return null;
}
export async function clearEmployeePinIpRateLimit(request: Pick<Request, "headers">, scope: EmployeePinIpRateLimitScope) {
  const ip = getTrustedClientIp(request);
  if (!ip) return;
  const key = getRateLimitKey(scope, ip);
  if (!key) return;
  await prisma.employeePinIpRateLimit.deleteMany({ where: { id: key } }).catch((error) => console.warn("[EMPLOYEE_PIN_RATE_LIMIT] reset:", error));
}
function limitedResponse(retryAfterSeconds: number) { return NextResponse.json({ error: "Demasiados intentos desde esta conexión. Esperá unos minutos y volvé a intentar." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds) } }); }
function unavailableResponse() { return NextResponse.json({ error: "No se pudo validar el límite de intentos. Volvé a intentar en unos minutos." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }