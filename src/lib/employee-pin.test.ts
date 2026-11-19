import { describe, expect, it } from "vitest";

import {
  InvalidEmployeePinError,
  MissingEmployeePinError,
  normalizeEmployeePinInput,
  prepareRequiredEmployeePinForStorage,
  verifyEmployeePinValue,
} from "@/lib/employee-pin";

describe("employee PIN policy", () => {
  it("normalizes numeric PINs without losing leading zeroes", () => {
    expect(normalizeEmployeePinInput(" 001234 ")).toBe("001234");
  });

  it("rejects empty or missing PINs for required employee access", async () => {
    await expect(prepareRequiredEmployeePinForStorage(undefined)).rejects.toBeInstanceOf(
      MissingEmployeePinError,
    );
    await expect(prepareRequiredEmployeePinForStorage(null)).rejects.toBeInstanceOf(
      MissingEmployeePinError,
    );
    await expect(prepareRequiredEmployeePinForStorage("   ")).rejects.toBeInstanceOf(
      MissingEmployeePinError,
    );
  });

  it("accepts only one to six numeric digits", async () => {
    await expect(prepareRequiredEmployeePinForStorage("1234567")).rejects.toBeInstanceOf(
      InvalidEmployeePinError,
    );
    await expect(prepareRequiredEmployeePinForStorage("12a4")).rejects.toBeInstanceOf(
      InvalidEmployeePinError,
    );
  });

  it("stores a hash and verifies the PIN rather than the clear text", async () => {
    const storedPin = await prepareRequiredEmployeePinForStorage("0123");

    expect(storedPin).not.toBe("0123");
    expect(storedPin).toMatch(/^\$2[aby]\$/);
    await expect(verifyEmployeePinValue(storedPin, "0123")).resolves.toMatchObject({ ok: true });
    await expect(verifyEmployeePinValue(storedPin, "")).resolves.toMatchObject({ ok: false });
    await expect(verifyEmployeePinValue(storedPin, "9999")).resolves.toMatchObject({ ok: false });
  });
});
