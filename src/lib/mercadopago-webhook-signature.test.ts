import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { verifyMercadoPagoWebhookSignature } from "@/lib/mercadopago-webhook-signature";

const SECRET = "test-webhook-secret";
const DATA_ID = "987654321";
const REQUEST_ID = "request-abc-123";
const TIMESTAMP = "1795091000";

function makeSignature() {
  const template = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${TIMESTAMP};`;
  return crypto.createHmac("sha256", SECRET).update(template).digest("hex");
}

describe("Mercado Pago webhook signature", () => {
  it("accepts a valid SHA-256 HMAC", () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        secret: SECRET,
        dataId: DATA_ID,
        requestId: REQUEST_ID,
        timestamp: TIMESTAMP,
        signature: makeSignature(),
      }),
    ).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const signature = makeSignature();
    const tampered = (signature[0] === "0" ? "1" : "0") + signature.slice(1);

    expect(
      verifyMercadoPagoWebhookSignature({
        secret: SECRET,
        dataId: DATA_ID,
        requestId: REQUEST_ID,
        timestamp: TIMESTAMP,
        signature: tampered,
      }),
    ).toBe(false);
  });

  it("rejects missing signed fields", () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        secret: SECRET,
        dataId: DATA_ID,
        requestId: "",
        timestamp: TIMESTAMP,
        signature: makeSignature(),
      }),
    ).toBe(false);
  });

  it("rejects malformed or incomplete hex signatures", () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        secret: SECRET,
        dataId: DATA_ID,
        requestId: REQUEST_ID,
        timestamp: TIMESTAMP,
        signature: "deadbeef",
      }),
    ).toBe(false);
  });

  it("rejects an empty secret", () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        secret: "",
        dataId: DATA_ID,
        requestId: REQUEST_ID,
        timestamp: TIMESTAMP,
        signature: makeSignature(),
      }),
    ).toBe(false);
  });
});
