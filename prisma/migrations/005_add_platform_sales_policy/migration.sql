CREATE TABLE "PlatformSalesPolicy" (
  "id" TEXT NOT NULL,
  "freeDailySalesLimit" INTEGER NOT NULL DEFAULT 15,
  "subscriptionPriceArs" INTEGER NOT NULL DEFAULT 36900,
  "timeZone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  "updatedById" TEXT,
  "updatedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSalesPolicy_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSalesPolicy" (
  "id",
  "freeDailySalesLimit",
  "subscriptionPriceArs",
  "timeZone"
) VALUES (
  'global',
  15,
  36900,
  'America/Argentina/Buenos_Aires'
);
