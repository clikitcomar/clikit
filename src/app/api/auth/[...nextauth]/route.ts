import { handlers } from "@/lib/auth";
import { enforceEmployeePinIpRateLimit } from "@/lib/employee-pin-ip-rate-limit";
export const GET = handlers.GET;
export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/callback/employee-login")) {
    const limited = await enforceEmployeePinIpRateLimit(request, "employee-login");
    if (limited) return limited;
  }
  return handlers.POST(request);
}