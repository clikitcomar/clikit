import { NextResponse } from "next/server";

import { getPlatformSalesPolicy } from "@/lib/platform-sales-policy";

export async function GET() {
  const policy = await getPlatformSalesPolicy();

  return NextResponse.json(
    { subscriptionPriceArs: policy.subscriptionPriceArs },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
