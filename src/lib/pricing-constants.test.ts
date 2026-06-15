import { describe, it, expect } from "vitest";
import {
  LIST_PRICE,
  MP_NETO,
  MP_FEE,
  COMM_FIRST_PCT,
  COMM_RECUR_PCT,
  COMM_FIRST_AMT,
  COMM_RECUR_AMT,
  NET_MONTH1,
  NET_RECUR,
  formatArs,
} from "./pricing-constants";

describe("pricing constants", () => {
  it("LIST_PRICE is positive", () => {
    expect(LIST_PRICE).toBeGreaterThan(0);
  });

  it("MP_NETO is less than LIST_PRICE", () => {
    expect(MP_NETO).toBeLessThan(LIST_PRICE);
  });

  it("MP_FEE is LIST_PRICE minus MP_NETO", () => {
    expect(MP_FEE).toBeCloseTo(LIST_PRICE - MP_NETO, 2);
  });

  it("commission percentages are valid", () => {
    expect(COMM_FIRST_PCT).toBeGreaterThan(0);
    expect(COMM_FIRST_PCT).toBeLessThanOrEqual(1);
    expect(COMM_RECUR_PCT).toBeGreaterThan(0);
    expect(COMM_RECUR_PCT).toBeLessThanOrEqual(1);
  });

  it("first commission is higher than recurring", () => {
    expect(COMM_FIRST_PCT).toBeGreaterThan(COMM_RECUR_PCT);
  });

  it("NET_MONTH1 is MP_NETO minus first commission", () => {
    expect(NET_MONTH1).toBeCloseTo(MP_NETO - COMM_FIRST_AMT, 0);
  });

  it("NET_RECUR is MP_NETO minus recurring commission", () => {
    expect(NET_RECUR).toBeCloseTo(MP_NETO - COMM_RECUR_AMT, 0);
  });

  it("business is profitable after commissions", () => {
    expect(NET_MONTH1).toBeGreaterThan(0);
    expect(NET_RECUR).toBeGreaterThan(0);
  });
});

describe("formatArs", () => {
  it("formats with $ prefix and no decimals", () => {
    expect(formatArs(14900)).toBe("$14.900");
  });

  it("handles zero", () => {
    expect(formatArs(0)).toBe("$0");
  });

  it("handles negative values (absolute)", () => {
    expect(formatArs(-5000)).toBe("$5.000");
  });
});
