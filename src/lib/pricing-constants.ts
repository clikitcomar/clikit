/**
 * Shared commission percentages and monetary formatting.
 * The current subscription list price is managed in PlatformSalesPolicy
 * and must be supplied by the database-backed pricing API/resolver.
 */

export const MP_SALES_FEE_PCT = 0.0466;
export const COMM_FIRST_PCT = 0.5;
export const COMM_RECUR_PCT = 0.3;

export function estimateMpNet(grossAmount: number): number {
  const fee = Math.round(grossAmount * MP_SALES_FEE_PCT);
  return grossAmount - fee;
}

export function formatArs(n: number): string {
  return "$" + Math.round(Math.abs(n)).toLocaleString("es-AR");
}
