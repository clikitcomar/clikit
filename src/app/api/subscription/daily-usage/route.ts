import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getKioscoAccessContextForSession, getAccessBlockMessage } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import {
  countKioscoSalesForDay,
  getPlatformSalesPolicy,
  isDailySalesLimitExemptReason,
} from "@/lib/platform-sales-policy";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const access = await getKioscoAccessContextForSession(session.user);
  if (!access.allowed) {
    return NextResponse.json(
      { error: getAccessBlockMessage(access.reason), code: access.reason },
      { status: 402 },
    );
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId || !access.kioscoId) {
    return NextResponse.json({ error: "No se encontró el comercio o la sucursal." }, { status: 404 });
  }

  const policy = await getPlatformSalesPolicy();
  if (isDailySalesLimitExemptReason(access.reason) || policy.freeDailySalesLimit === 0) {
    return NextResponse.json({
      isMetered: false,
      priceArs: policy.subscriptionPriceArs,
    });
  }

  const usage = await countKioscoSalesForDay(
    prisma,
    access.kioscoId,
    policy.timeZone,
  );

  return NextResponse.json({
    isMetered: true,
    used: usage.count,
    limit: policy.freeDailySalesLimit,
    remaining: Math.max(0, policy.freeDailySalesLimit - usage.count),
    priceArs: policy.subscriptionPriceArs,
    timeZone: policy.timeZone,
    dateKey: usage.dateKey,
    nextResetAt: usage.end.toISOString(),
  });
}
