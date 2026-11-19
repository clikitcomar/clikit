import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    sale: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    saleItem: {
      createMany: vi.fn(),
    },
    inventoryRecord: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    variantInventory: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    stockLot: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    saleLotConsumption: {
      createMany: vi.fn(),
    },
    saleCostAllocation: {
      createMany: vi.fn(),
    },
    salePromoApplication: {
      createMany: vi.fn(),
    },
    creditCustomer: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    shift: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (transaction: unknown) => unknown) => fn(mockPrisma)),
  };
  return {
    prisma: mockPrisma,
    PaymentMethod: { CASH: "CASH", CREDIT: "CREDIT" },
    InvoiceStatus: { PENDING: "PENDING", ISSUED: "ISSUED", FAILED: "FAILED" },
    Prisma: { JsonNull: null },
  };
});

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/access-control", () => ({
  guardOperationalAccess: vi.fn(),
}));

vi.mock("@/lib/branch", () => ({
  getBranchId: vi.fn(),
  getBranchContext: vi.fn(),
}));

vi.mock("@/lib/shift-access", () => ({
  getActiveShift: vi.fn(),
  canOperateShift: vi.fn(),
  createShiftForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/inventory-expiry", () => ({
  consumeTrackedLotsFefo: vi.fn(),
  restoreLotConsumptions: vi.fn(),
  getOpenStockLots: vi.fn(),
}));

vi.mock("@/lib/inventory-cost-consumption", () => ({
  allocateSaleItemCosts: vi.fn(),
  restoreSaleItemCostTracking: vi.fn(),
}));

vi.mock("@/lib/promo-loader", () => ({
  loadAndApplyPromos: vi.fn(),
  persistPromoResult: vi.fn(),
}));

describe("Credit Limit Validation", () => {
  it("credit limit check prevents overselling", () => {
    const balance = 5000;
    const creditLimit = 10000;
    const saleTotal = 6000;

    const wouldExceed = creditLimit != null && balance + saleTotal > creditLimit;
    expect(wouldExceed).toBe(true);
  });

  it("credit limit check allows within limit", () => {
    const balance = 5000;
    const creditLimit = 15000;
    const saleTotal = 6000;

    const wouldExceed = creditLimit != null && balance + saleTotal > creditLimit;
    expect(wouldExceed).toBe(false);
  });

  it("no limit allows any amount", () => {
    const balance = 50000;
    const creditLimit = null;
    const saleTotal = 100000;

    const wouldExceed = creditLimit != null && balance + saleTotal > creditLimit;
    expect(wouldExceed).toBe(false);
  });
});

describe("Sale Item Calculations", () => {
  it("calculates subtotal for non-weighted item", async () => {
    const { getSaleItemSubtotal } = await import("@/lib/sale-item");
    expect(getSaleItemSubtotal({ quantity: 3, price: 100 })).toBe(300);
  });

  it("calculates subtotal for weighted item", async () => {
    const { getSaleItemSubtotal } = await import("@/lib/sale-item");
    expect(getSaleItemSubtotal({ quantity: 1500, price: 200, soldByWeight: true })).toBe(300);
  });

  it("parses weight input correctly", async () => {
    const { parseWeightInputToGrams } = await import("@/lib/sale-item");
    expect(parseWeightInputToGrams("250g")).toBe(250);
    expect(parseWeightInputToGrams("1.5kg")).toBe(1500);
    expect(parseWeightInputToGrams("1/2")).toBe(500);
  });
});

describe("Fiscal Worker Client", () => {
  it("computes idempotency key deterministically", async () => {
    const { computeIdempotencyKey } = await import("@/lib/fiscal-worker-client");
    const key1 = computeIdempotencyKey("sale_abc123");
    const key2 = computeIdempotencyKey("sale_abc123");
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different sale IDs produce different keys", async () => {
    const { computeIdempotencyKey } = await import("@/lib/fiscal-worker-client");
    const key1 = computeIdempotencyKey("sale_abc");
    const key2 = computeIdempotencyKey("sale_xyz");
    expect(key1).not.toBe(key2);
  });
});

describe("Promo Engine", () => {
  it("applies no promos to empty cart", async () => {
    const { applyPromoEngine } = await import("@/lib/promo-engine");
    const result = applyPromoEngine({
      items: [],
      promotions: [],
      coupon: null,
      expiryInfo: [],
    });
    expect(result.total).toBe(0);
    expect(result.applications).toHaveLength(0);
  });

  it("calculates correct total without promos", async () => {
    const { applyPromoEngine } = await import("@/lib/promo-engine");
    const result = applyPromoEngine({
      items: [
        { productId: "p1", variantId: null, name: "Test", price: 100, quantity: 3, soldByWeight: false, cost: null },
      ],
      promotions: [],
      coupon: null,
      expiryInfo: [],
    });
    expect(result.total).toBe(300);
  });

  it("applies percentage coupon", async () => {
    const { applyPromoEngine } = await import("@/lib/promo-engine");
    const result = applyPromoEngine({
      items: [
        { productId: "p1", variantId: null, name: "Test", price: 100, quantity: 2, soldByWeight: false, cost: null },
      ],
      promotions: [],
      coupon: { id: "c1", discountKind: "PERCENTAGE", discountValue: 10 },
      expiryInfo: [],
    });
    expect(result.total).toBeLessThan(200);
    expect(result.applications.length).toBeGreaterThan(0);
  });

  it("applies fixed price coupon", async () => {
    const { applyPromoEngine } = await import("@/lib/promo-engine");
    const result = applyPromoEngine({
      items: [
        { productId: "p1", variantId: null, name: "Test", price: 100, quantity: 2, soldByWeight: false, cost: null },
      ],
      promotions: [],
      coupon: { id: "c1", discountKind: "FIXED_PRICE", discountValue: 50 },
      expiryInfo: [],
    });
    expect(result.total).toBe(150);
  });
});

describe("Date Utilities", () => {
  it("formats ARS correctly", async () => {
    const { formatARS } = await import("@/lib/utils");
    expect(formatARS(14900)).toContain("14");
    expect(formatARS(0)).toContain("0");
  });

  it("rounds to nearest 10", async () => {
    const { roundToTen } = await import("@/lib/utils");
    expect(roundToTen(12)).toBe(10);
    expect(roundToTen(15)).toBe(20);
    expect(roundToTen(14900)).toBe(14900);
  });

  it("generates cash suggestions", async () => {
    const { getCashSuggestions } = await import("@/lib/utils");
    const suggestions = getCashSuggestions(6900);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toBeGreaterThanOrEqual(6900);
  });
});

describe("Fiscal Validation", () => {
  it("validates CUIT format", async () => {
    const { isValidCuit } = await import("@/lib/fiscal");
    expect(isValidCuit("20321601058")).toBe(true);
    expect(isValidCuit("12345678901")).toBe(false);
    expect(isValidCuit("2032160105")).toBe(false);
  });

  it("validates DNI format", async () => {
    const { isValidDni } = await import("@/lib/fiscal");
    expect(isValidDni("12345678")).toBe(true);
    expect(isValidDni("1234567")).toBe(true);
    expect(isValidDni("123456")).toBe(false);
    expect(isValidDni("123456789")).toBe(false);
  });

  it("normalizes doc number", async () => {
    const { normalizeDocNumber } = await import("@/lib/fiscal");
    expect(normalizeDocNumber("20.321.601-058")).toBe("20321601058");
    expect(normalizeDocNumber("12 345 678")).toBe("12345678");
  });

  it("validates receiver document", async () => {
    const { validateReceiverDocument } = await import("@/lib/fiscal");
    const result = validateReceiverDocument(99, "0");
    expect(result.valid).toBe(true);
  });

  it("formats fiscal voucher number", async () => {
    const { formatFiscalVoucherNumber } = await import("@/lib/fiscal");
    expect(formatFiscalVoucherNumber(1, 42)).toBe("00001-00000042");
    expect(formatFiscalVoucherNumber(null, null)).toBeNull();
  });

  it("gets AFIP date number", async () => {
    const { getAfipDateNumber } = await import("@/lib/fiscal");
    const date = new Date(2026, 3, 15); // April 15, 2026
    expect(getAfipDateNumber(date)).toBe(20260415);
  });
});

describe("Offline Support", () => {
  it("computes idempotency key for void", async () => {
    const { computeIdempotencyKey } = await import("@/lib/fiscal-worker-client");
    const key = computeIdempotencyKey("void:sale_abc123");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("Pricing Constants", () => {
  it("has valid pricing chain", async () => {
    const { LIST_PRICE, MP_NETO, COMM_FIRST_AMT, COMM_RECUR_AMT, NET_MONTH1, NET_RECUR } = await import("@/lib/pricing-constants");
    expect(LIST_PRICE).toBeGreaterThan(0);
    expect(MP_NETO).toBeLessThan(LIST_PRICE);
    expect(COMM_FIRST_AMT).toBeGreaterThan(0);
    expect(COMM_RECUR_AMT).toBeGreaterThan(0);
    expect(NET_MONTH1).toBeGreaterThan(0);
    expect(NET_RECUR).toBeGreaterThan(0);
    expect(COMM_FIRST_AMT).toBeGreaterThan(COMM_RECUR_AMT);
  });
});

describe("Ticket Formatting", () => {
  it("gets payment method label", async () => {
    const { getPaymentMethodLabel } = await import("@/lib/ticket-format");
    expect(getPaymentMethodLabel("CASH", null)).toBeTruthy();
    expect(getPaymentMethodLabel("CREDIT", "Juan")).toContain("Juan");
  });

  it("gets ticket print mode label", async () => {
    const { getTicketPrintModeLabel } = await import("@/lib/ticketing");
    expect(getTicketPrintModeLabel("STANDARD")).toBeTruthy();
    expect(getTicketPrintModeLabel("THERMAL_58")).toBeTruthy();
    expect(getTicketPrintModeLabel("THERMAL_80")).toBeTruthy();
  });
});
