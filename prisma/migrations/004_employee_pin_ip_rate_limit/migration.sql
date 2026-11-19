CREATE TABLE "EmployeePinIpRateLimit" (
  "id" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeePinIpRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeePinIpRateLimit_updatedAt_idx" ON "EmployeePinIpRateLimit"("updatedAt");