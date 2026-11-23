import { describe, expect, it } from "vitest";

import { getSalesDayWindow } from "@/lib/sales-day-window";

describe("getSalesDayWindow", () => {
  const timeZone = "America/Argentina/Buenos_Aires";

  it("uses the local date in Argentina rather than the UTC date", () => {
    const window = getSalesDayWindow(new Date("2026-11-21T02:30:00.000Z"), timeZone);

    expect(window.dateKey).toBe("2026-11-20");
    expect(window.start.toISOString()).toBe("2026-11-20T03:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-21T03:00:00.000Z");
  });

  it("keeps sales in the same local day until midnight Argentina time", () => {
    const window = getSalesDayWindow(new Date("2026-11-22T02:59:59.000Z"), timeZone);

    expect(window.dateKey).toBe("2026-11-21");
    expect(window.start.toISOString()).toBe("2026-11-21T03:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-22T03:00:00.000Z");
  });

  it("starts a new quota window exactly at local midnight", () => {
    const window = getSalesDayWindow(new Date("2026-11-22T03:00:00.000Z"), timeZone);

    expect(window.dateKey).toBe("2026-11-22");
    expect(window.start.toISOString()).toBe("2026-11-22T03:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-23T03:00:00.000Z");
  });
});
