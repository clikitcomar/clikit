import { describe, it, expect } from "vitest";
import {
  formatARS,
  artDayRange,
  roundToTen,
  applyPercentage,
  getCashSuggestions,
  hexToRgb,
} from "./utils";

describe("formatARS", () => {
  it("formats zero", () => {
    expect(formatARS(0)).toMatch(/\$[\s]?0/);
  });

  it("formats positive amounts", () => {
    expect(formatARS(14900)).toMatch(/14[\.\s]?900/);
  });

  it("formats large amounts", () => {
    expect(formatARS(1500000)).toMatch(/1[\.\s]?500[\.\s]?000/);
  });

  it("formats negative amounts", () => {
    expect(formatARS(-5000)).toMatch(/-.*5[\.\s]?000/);
  });
});

describe("artDayRange", () => {
  it("returns correct start/end for a given date", () => {
    const { start, end } = artDayRange("2026-06-15");
    expect(start.toISOString()).toBe("2026-06-15T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-16T02:59:59.999Z");
  });

  it("start is before end", () => {
    const { start, end } = artDayRange("2026-01-01");
    expect(start.getTime()).toBeLessThan(end.getTime());
  });
});

describe("roundToTen", () => {
  it("rounds to nearest 10", () => {
    expect(roundToTen(12)).toBe(10);
    expect(roundToTen(15)).toBe(20);
    expect(roundToTen(14900)).toBe(14900);
  });

  it("rounds down", () => {
    expect(roundToTen(14)).toBe(10);
  });

  it("rounds up", () => {
    expect(roundToTen(16)).toBe(20);
  });
});

describe("applyPercentage", () => {
  it("applies percentage increase and rounds to 10", () => {
    expect(applyPercentage(100, 10)).toBe(110);
    expect(applyPercentage(100, 50)).toBe(150);
  });

  it("handles zero percentage", () => {
    expect(applyPercentage(100, 0)).toBe(100);
  });
});

describe("getCashSuggestions", () => {
  it("returns empty for zero or negative", () => {
    expect(getCashSuggestions(0)).toEqual([]);
    expect(getCashSuggestions(-100)).toEqual([]);
  });

  it("returns suggestions for typical amounts", () => {
    const suggestions = getCashSuggestions(6900);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toBeGreaterThanOrEqual(6900);
    suggestions.forEach((s) => expect(s).toBeGreaterThanOrEqual(6900));
  });

  it("suggestions are sorted ascending", () => {
    const suggestions = getCashSuggestions(1250);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i]).toBeGreaterThanOrEqual(suggestions[i - 1]);
    }
  });

  it("first suggestion is >= total", () => {
    const suggestions = getCashSuggestions(95);
    expect(suggestions[0]).toBeGreaterThanOrEqual(95);
  });
});

describe("hexToRgb", () => {
  it("converts hex to RGB string", () => {
    expect(hexToRgb("#22c55e")).toBe("34, 197, 94");
  });

  it("converts black", () => {
    expect(hexToRgb("#000000")).toBe("0, 0, 0");
  });

  it("converts white", () => {
    expect(hexToRgb("#ffffff")).toBe("255, 255, 255");
  });
});
