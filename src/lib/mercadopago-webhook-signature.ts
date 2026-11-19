import crypto from "crypto";

type MercadoPagoWebhookSignatureInput = {
  secret: string;
  dataId: string | number | null | undefined;
  requestId: string;
  timestamp: string;
  signature: string;
};

/**
 * Validates the x-signature HMAC before a webhook is allowed to mutate data.
 * The signature format is SHA-256 hex, so comparison is performed on equal
 * length buffers using timingSafeEqual.
 */
export function verifyMercadoPagoWebhookSignature({
  secret,
  dataId,
  requestId,
  timestamp,
  signature,
}: MercadoPagoWebhookSignatureInput): boolean {
  if (
    !secret ||
    dataId === null ||
    dataId === undefined ||
    String(dataId).length === 0 ||
    !requestId.trim() ||
    !timestamp.trim() ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const template = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const expected = crypto.createHmac("sha256", secret).update(template).digest();
  const received = Buffer.from(signature, "hex");

  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}
