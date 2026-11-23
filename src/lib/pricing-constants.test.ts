import { describe, it, expect } from "vitest";
import {
  COMM_FIRST_PCT,
  COMM_RECUR_PCT,
  estimateMpNet,
  formatArs,
} from "./pricing-constants";

describe("commercial pricing rules", () => {
  it("keeps commission percentages valid", () => {
    expect(COMM_FIRST_PCT).toBeGreaterThan(0);
    expect(COMM_FIRST_PCT).toBeLessThanOrEqual(1);
    expect(COMM_RECUR_PCT).toBeGreaterThan(0);
    expect(COMM_RECUR_PCT).toBeLessThanOrEqual(1);
    expect(COMM_FIRST_PCT).toBeGreaterThan(COMM_RECUR_PCT);
  });

  it("derives commissions and payment estimates from any DB-managed price", () => {
    for (const priceArs of [12000, 36900, 52000]) {
      const mpNet = estimateMpNet(priceArs);
      const firstCommission = Math.round(priceArs * COMM_FIRST_PCT);
      const recurringCommission = Math.round(priceArs * COMM_RECUR_PCT);

      expect(mpNet).toBeGreaterThan(0);
      expect(mpNet).toBeLessThan(priceArs);
      expect(firstCommission).toBeGreaterThan(recurringCommission);
      expect(mpNet - firstCommission).toBeGreaterThan(0);
      expect(mpNet - recurringCommission).toBeGreaterThan(0);
    }
  });
});

describe("formatArs", () => {
  it("formats with $ prefix and no decimals", () => {
    expect(formatArs(36900)).toBe("$36.900");
  });

  it("handles zero", () => {
    expect(formatArs(0)).toBe("$0");
  });

  it("handles negative values (absolute)", () => {
    expect(formatArs(-5000)).toBe("$5.000");
  });
});
