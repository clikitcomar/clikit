import { describe, it, expect } from "vitest";
import {
  isWeightedSaleItem,
  getSaleItemDisplayQuantity,
  getSaleItemSubtotal,
  formatSaleItemWeightLabel,
  parseWeightInputToGrams,
} from "./sale-item";

describe("isWeightedSaleItem", () => {
  it("returns true when soldByWeight is true", () => {
    expect(isWeightedSaleItem({ quantity: 500, soldByWeight: true })).toBe(true);
  });

  it("returns false when soldByWeight is false", () => {
    expect(isWeightedSaleItem({ quantity: 500, soldByWeight: false })).toBe(false);
  });

  it("returns false when soldByWeight is null/undefined", () => {
    expect(isWeightedSaleItem({ quantity: 500 })).toBe(false);
    expect(isWeightedSaleItem({ quantity: 500, soldByWeight: null })).toBe(false);
  });
});

describe("getSaleItemDisplayQuantity", () => {
  it("returns raw quantity for non-weighted items", () => {
    expect(getSaleItemDisplayQuantity({ quantity: 3 })).toBe(3);
  });

  it("converts grams to kilos for weighted items", () => {
    expect(getSaleItemDisplayQuantity({ quantity: 1500, soldByWeight: true })).toBe(1.5);
  });

  it("handles 0 grams", () => {
    expect(getSaleItemDisplayQuantity({ quantity: 0, soldByWeight: true })).toBe(0);
  });
});

describe("getSaleItemSubtotal", () => {
  it("calculates subtotal for non-weighted item", () => {
    expect(getSaleItemSubtotal({ quantity: 3, price: 100 })).toBe(300);
  });

  it("calculates subtotal for weighted item", () => {
    expect(getSaleItemSubtotal({ quantity: 1500, price: 200, soldByWeight: true })).toBe(300);
  });

  it("rounds to 2 decimal places", () => {
    expect(getSaleItemSubtotal({ quantity: 1, price: 33.33 })).toBe(33.33);
  });
});

describe("formatSaleItemWeightLabel", () => {
  it("formats grams as kilos with 3 decimals", () => {
    expect(formatSaleItemWeightLabel({ quantity: 1500 })).toBe("1,500 kg");
  });

  it("formats exact kilo", () => {
    expect(formatSaleItemWeightLabel({ quantity: 1000 })).toBe("1,000 kg");
  });
});

describe("parseWeightInputToGrams", () => {
  it("parses grams with 'g' suffix", () => {
    expect(parseWeightInputToGrams("250g")).toBe(250);
  });

  it("parses grams with 'gr' suffix", () => {
    expect(parseWeightInputToGrams("250gr")).toBe(250);
  });

  it("parses kilos with 'kg' suffix", () => {
    expect(parseWeightInputToGrams("1.5kg")).toBe(1500);
  });

  it("parses fraction notation", () => {
    expect(parseWeightInputToGrams("1/2")).toBe(500);
    expect(parseWeightInputToGrams("3/4")).toBe(750);
  });

  it("parses decimal as kilos by default", () => {
    expect(parseWeightInputToGrams("1.5")).toBe(1500);
    expect(parseWeightInputToGrams("0.250")).toBe(250);
  });

  it("parses whole numbers as grams by default", () => {
    expect(parseWeightInputToGrams("250")).toBe(250);
    expect(parseWeightInputToGrams("1000")).toBe(1000);
  });

  it("parses all as kilos when assumeWholeNumbersAreKilos=true", () => {
    expect(parseWeightInputToGrams("2", true)).toBe(2000);
    expect(parseWeightInputToGrams("500", true)).toBe(500000);
  });

  it("handles comma as decimal separator", () => {
    expect(parseWeightInputToGrams("1,5")).toBe(1500);
  });

  it("returns null for empty/invalid input", () => {
    expect(parseWeightInputToGrams("")).toBeNull();
    expect(parseWeightInputToGrams("abc")).toBeNull();
  });

  it("returns null for zero or negative", () => {
    expect(parseWeightInputToGrams("0")).toBeNull();
    expect(parseWeightInputToGrams("-5")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseWeightInputToGrams("  250g  ")).toBe(250);
  });
});
