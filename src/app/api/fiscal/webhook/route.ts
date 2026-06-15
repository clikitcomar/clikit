import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus, Prisma } from "@/lib/prisma";
import { createInvoicePdf } from "@/lib/fiscal-pdf";
import { parseAfipDate } from "@/lib/fiscal";
import { buildInvoicePreviewData } from "@/lib/invoice-format";
import { getPaymentMethodLabel } from "@/lib/ticket-format";
import { getDefaultTicketSettings } from "@/lib/ticketing";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.ZAP_FISCAL_WEBHOOK_SECRET || "";

interface WebhookEvent {
  id: string;
  type: string;
  createdAt: string;
  data: {
    jobId: string;
    externalId: string;
    status: string;
    cae?: string;
    caeFchVto?: string;
    voucherNumber?: number;
    voucherType?: number;
    pointOfSale?: number;
    observations?: Array<{ code: string; message: string }>;
    attempts?: number;
    lastError?: string;
  };
}

function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
): boolean {
  if (!WEBHOOK_SECRET || !signatureHeader || !timestampHeader) {
    return false;
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  const expectedSig = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const receivedSig = signatureHeader.replace("sha256=", "");
  if (receivedSig.length !== expectedSig.length) return false;

  let mismatch = 0;
  for (let i = 0; i < receivedSig.length; i++) {
    mismatch |= receivedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("X-Fiscal-Signature");
  const timestamp = req.headers.get("X-Fiscal-Timestamp");

  if (!verifySignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data } = event;
  if (!data?.jobId || !data?.externalId) {
    return NextResponse.json({ ok: true });
  }

  const saleId = data.externalId;

  const existingInvoice = await prisma.invoice.findFirst({
    where: { saleId },
    select: {
      id: true,
      saleId: true,
      status: true,
      branchId: true,
      docTipo: true,
      docNro: true,
      receiverName: true,
      receiverIvaConditionId: true,
      receiverIvaConditionLabel: true,
      impTotal: true,
      impNeto: true,
      impIva: true,
      emitterSnapshot: true,
      sale: {
        select: {
          paymentMethod: true,
          creditCustomer: { select: { name: true } },
          items: {
            select: {
              name: true,
              quantity: true,
              price: true,
              soldByWeight: true,
            },
          },
        },
      },
    },
  });

  if (!existingInvoice) {
    return NextResponse.json({ ok: true });
  }

  if (existingInvoice.status === InvoiceStatus.ISSUED) {
    return NextResponse.json({ ok: true });
  }

  if (event.type === "invoice.failed" || data.status === "DEAD") {
    await prisma.invoice.update({
      where: { id: existingInvoice.id },
      data: {
        status: InvoiceStatus.FAILED,
        lastError: data.lastError || `Worker: job ${data.status} tras ${data.attempts ?? "?"} intentos`,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (data.status === "DONE" && data.cae) {
    const caeDueDate = parseAfipDate(data.caeFchVto ?? null);
    const issuedAt = new Date();

    let pdfBlobUrl: string | null = null;
    let pdfWarning: string | null = null;

    const branch = await prisma.branch.findUnique({
      where: { id: existingInvoice.branchId },
      select: {
        ticketSettings: { select: { printMode: true } },
      },
    });

    const emitterSnapshot = existingInvoice.emitterSnapshot as Record<string, unknown> | null;
    const branchPrintMode = branch?.ticketSettings?.printMode ?? getDefaultTicketSettings().printMode;

    try {
      const pdf = await createInvoicePdf({
        emitter: emitterSnapshot as Parameters<typeof createInvoicePdf>[0]["emitter"],
        voucherNumber: data.voucherNumber ?? 0,
        pointOfSale: data.pointOfSale ?? 0,
        printMode: branchPrintMode,
        issueDate: issuedAt,
        cae: data.cae,
        caeDueDate: caeDueDate ?? issuedAt,
        receiverName: existingInvoice.receiverName ?? "Consumidor Final",
        receiverDocumentType: existingInvoice.docTipo,
        receiverDocumentNumber: existingInvoice.docNro,
        receiverIvaConditionLabel: existingInvoice.receiverIvaConditionLabel ?? "Consumidor Final",
        paymentMethod: existingInvoice.sale.paymentMethod,
        total: existingInvoice.impTotal,
        items: existingInvoice.sale.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          subtotal: item.price * (item.soldByWeight ? item.quantity / 1000 : item.quantity),
          soldByWeight: item.soldByWeight,
        })),
      });

      pdfBlobUrl = pdf.blobUrl;
      if (!pdf.blobUrl) {
        pdfWarning = "La factura se emitio, pero el PDF no pudo guardarse en Blob.";
      }
    } catch (pdfError) {
      console.error("[Fiscal Webhook] Error generando PDF", pdfError);
      pdfWarning = "La factura se emitio, pero no se pudo generar el PDF.";
    }

    await prisma.invoice.update({
      where: { id: existingInvoice.id },
      data: {
        status: InvoiceStatus.ISSUED,
        cae: data.cae,
        caeFchVto: caeDueDate,
        comprobanteTipo: data.voucherType ?? 11,
        comprobanteNro: data.voucherNumber ?? 0,
        puntoDeVenta: data.pointOfSale ?? 0,
        fechaEmision: issuedAt,
        pdfBlobUrl,
        lastError: pdfWarning,
        afipRawResponse: event as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
