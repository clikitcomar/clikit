import { Prisma, prisma } from "@/lib/prisma";
import { getSalesDayWindow } from "@/lib/sales-day-window";

export { getSalesDayWindow } from "@/lib/sales-day-window";

const GLOBAL_POLICY_ID = "global";

export async function getPlatformSalesPolicy() {
  const existing = await prisma.platformSalesPolicy.findUnique({
    where: { id: GLOBAL_POLICY_ID },
  });
  if (existing) return existing;

  try {
    return await prisma.platformSalesPolicy.create({
      data: { id: GLOBAL_POLICY_ID },
    });
  } catch (error) {
    // Another request may have initialized the singleton at the same time.
    const raced = await prisma.platformSalesPolicy.findUnique({
      where: { id: GLOBAL_POLICY_ID },
    });
    if (raced) return raced;
    throw error;
  }
}

type SalesPolicyTransactionClient = Pick<Prisma.TransactionClient, "branch" | "sale">;

export async function countKioscoSalesForDay(
  client: SalesPolicyTransactionClient,
  kioscoId: string,
  timeZone: string,
  now = new Date(),
) {
  const window = getSalesDayWindow(now, timeZone);
  const branches = await client.branch.findMany({
    where: { kioscoId },
    select: { id: true },
  });

  if (branches.length === 0) {
    return { count: 0, ...window };
  }

  const count = await client.sale.count({
    where: {
      branchId: { in: branches.map((branch) => branch.id) },
      createdAt: { gte: window.start, lt: window.end },
      voided: false,
    },
  });

  return { count, ...window };
}

export async function getKioscoDailySalesUsage(kioscoId: string) {
  const policy = await getPlatformSalesPolicy();
  const usage = await countKioscoSalesForDay(prisma, kioscoId, policy.timeZone);

  return {
    isMetered: policy.freeDailySalesLimit > 0,
    used: usage.count,
    limit: policy.freeDailySalesLimit,
    remaining: Math.max(0, policy.freeDailySalesLimit - usage.count),
    priceArs: policy.subscriptionPriceArs,
    timeZone: policy.timeZone,
    dateKey: usage.dateKey,
    nextResetAt: usage.end,
  };
}

export function isDailySalesLimitExemptReason(reason: string) {
  return (
    reason === "PLATFORM_ADMIN" ||
    reason === "ADMIN_FORCE_ALLOW" ||
    reason === "ACTIVE_GRACE" ||
    reason === "SUBSCRIPTION_ACTIVE"
  );
}
