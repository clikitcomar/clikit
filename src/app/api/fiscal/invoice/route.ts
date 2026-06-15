import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { createInvoicePdf } from "@/lib/fiscal-pdf";
import { buildEmitterSnapshot, getAfipDateNumber, getReceiverName, normalizeDocNumber, parseAfipDate, resolveReceiverDefaults, validateReceiverDocument, AFIP_DOCUMENT_TYPES, AFIP_INVOICE_TYPES } from "@/lib/fiscal";
import { sanitizeReceiverName } from "@/lib/fiscal-invoices";
import { getAfipInstance } from "@/lib/fiscal-server";
import { buildInvoicePreviewData } from "@/lib/invoice-format";
import { getSaleItemSubtotal } from "@/lib/sale-item";
import { getPaymentMethodLabel } from "@/lib/ticket-format";
import { getDefaultTicketSettings, type TicketPrintMode } from "@/lib/ticketing";
import { FiscalVatCondition, InvoiceStatus, Prisma, prisma } from "@/lib/prisma";
import {
  emitInvoice,
  computeIdempotencyKey,
  type EmitInvoicePayload,
  type FiscalWorkerEnvironment,
} from "@/lib/fiscal-worker-client";

export const runtime = "nodejs";
export const maxDuration = 30;

const WORKER_CONFIGURED = Boolean(
  process.env.ZAP_FISCAL_BASE_URL && process.env.ZAP_FISCAL_API_KEY,
);
const WEBHOOK_SECRET = process.env.ZAP_FISCAL_WEBHOOK_SECRET || "";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

function normalizeFiscalError(error: unknown) {
  const message = error instanceof Error ? error.message : "No se pudo emitir la factura.";
  return message.replace(/\s+/g, " ").trim();
}

function isAmbiguousFiscalError(error: unknown) {
  const message = normalizeFiscalError(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network error")
  );
}

function buildWorkerPayload(
  saleId: string,
  saleTotal: number,
  docType: number,
  normalizedDoc: string,
  receiverIvaConditionId: number,
  pontoDeVenta: number,
  environment: FiscalWorkerEnvironment,
  cuit: string,
): EmitInvoicePayload {
  const idempotencyKey = computeIdempotencyKey(saleId);
  const emissionDate = new Date();
  const year = emissionDate.getFullYear();
  const month = String(emissionDate.getMonth() + 1).padStart(2, "0");
  const day = String(emissionDate.getDate()).padStart(2, "0");

  return {
    externalId: saleId,
    idempotencyKey,
    contributor: {
      cuit,
      pointOfSale: pontoDeVenta,
      environment,
    },
    voucher: {
      type: "C",
      concept: 1,
      date: `${year}${month}${day}`,
    },
    amounts: {
      total: saleTotal,
      net: saleTotal,
      vat: 0,
    },
    customer: {
      docType,
      docNumber: docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL ? "0" : normalizedDoc,
      vatCondition: receiverIvaConditionId,
    },
    webhook: WEBHOOK_SECRET
      ? {
          url: `${BASE_URL}/api/fiscal/webhook`,
          secret: WEBHOOK_SECRET,
        }
      : undefined,
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const saleId = typeof body?.saleId === "string" ? body.saleId : "";
  const docType = Number(body?.docType);
  const normalizedDoc = normalizeDocNumber(body?.docNro ?? "");
  const receiverName = sanitizeReceiverName(body?.receiverName);
  const requestedReceiverIvaConditionId =
    body?.receiverIvaConditionId === null || body?.receiverIvaConditionId === undefined
      ? null
      : Number(body.receiverIvaConditionId);

  if (!saleId) {
    return NextResponse.json({ error: "Falta la venta a facturar." }, { status: 400 });
  }

  if (
    docType !== AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL &&
    docType !== AFIP_DOCUMENT_TYPES.DNI &&
    docType !== AFIP_DOCUMENT_TYPES.CUIT
  ) {
    return NextResponse.json({ error: "Tipo de documento invalido." }, { status: 400 });
  }

  const docValidation = validateReceiverDocument(docType, normalizedDoc);
  if (!docValidation.valid) {
    return NextResponse.json({ error: docValidation.error || "Documento invalido." }, { status: 400 });
  }

  const receiverIvaCondition = resolveReceiverDefaults(docType, requestedReceiverIvaConditionId);
  const normalizedReceiverName = getReceiverName(docType, receiverName);

  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      branchId,
    },
    select: {
      id: true,
      total: true,
      voided: true,
      paymentMethod: true,
      branchId: true,
      invoice: {
        select: {
          id: true,
          status: true,
          saleId: true,
        },
      },
      creditCustomer: {
        select: {
          name: true,
        },
      },
      items: {
          select: {
            name: true,
            quantity: true,
            price: true,
            soldByWeight: true,
          },
        },
      },
  });

  if (!sale) {
    return NextResponse.json({ error: "Venta no encontrada." }, { status: 404 });
  }

  if (sale.voided) {
    return NextResponse.json({ error: "No se puede facturar una venta anulada." }, { status: 409 });
  }

  if (sale.invoice?.status === InvoiceStatus.ISSUED) {
    return NextResponse.json({ error: "La venta ya tiene una factura emitida." }, { status: 409 });
  }

  if (sale.invoice?.status === InvoiceStatus.PENDING) {
    return NextResponse.json({ error: "Ya hay una emision pendiente para esta venta." }, { status: 409 });
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      name: true,
      fiscalSettings: true,
      ticketSettings: {
        select: {
          printMode: true,
        },
      },
      kiosco: {
        select: {
          fiscalProfile: true,
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Sucursal no encontrada." }, { status: 404 });
  }

  const fiscalProfile = branch.kiosco.fiscalProfile;
  const branchFiscalSettings = branch.fiscalSettings;
  const branchPrintMode: TicketPrintMode = (branch.ticketSettings?.printMode ?? getDefaultTicketSettings().printMode) as TicketPrintMode;

  if (!fiscalProfile || !branchFiscalSettings?.activo || !branchFiscalSettings.puntoDeVenta) {
    return NextResponse.json(
      { error: "La facturacion electronica no esta configurada en esta sucursal." },
      { status: 400 },
    );
  }

  if (fiscalProfile.condicionIva !== FiscalVatCondition.MONOTRIBUTO) {
    return NextResponse.json(
      { error: "La V1 de facturacion electronica solo admite Monotributo." },
      { status: 400 },
    );
  }

  if (sale.total < branchFiscalSettings.minimumInvoiceAmount) {
    return NextResponse.json(
      { error: `La venta no alcanza el minimo para facturar (${branchFiscalSettings.minimumInvoiceAmount}).` },
      { status: 400 },
    );
  }

  const emitterSnapshot = buildEmitterSnapshot(fiscalProfile);
  const pendingInvoice = sale.invoice?.id
    ? await prisma.invoice.update({
        where: { id: sale.invoice.id },
        data: {
          status: InvoiceStatus.PENDING,
          docTipo: docType,
          docNro: docValidation.normalized,
          receiverName: normalizedReceiverName,
          receiverIvaConditionId: receiverIvaCondition.id,
          receiverIvaConditionLabel: receiverIvaCondition.label,
          impTotal: sale.total,
          impNeto: sale.total,
          impIva: 0,
          cae: null,
          caeFchVto: null,
          comprobanteTipo: null,
          comprobanteNro: null,
          puntoDeVenta: null,
          fechaEmision: null,
          pdfBlobUrl: null,
          pdfAfipUrl: null,
          lastError: null,
          afipRawResponse: Prisma.JsonNull,
          emitterSnapshot: emitterSnapshot as Prisma.InputJsonValue,
        },
      })
    : await prisma.invoice.create({
        data: {
          saleId: sale.id,
          branchId,
          status: InvoiceStatus.PENDING,
          docTipo: docType,
          docNro: docValidation.normalized,
          receiverName: normalizedReceiverName,
          receiverIvaConditionId: receiverIvaCondition.id,
          receiverIvaConditionLabel: receiverIvaCondition.label,
          impTotal: sale.total,
          impNeto: sale.total,
          impIva: 0,
          emitterSnapshot: emitterSnapshot as Prisma.InputJsonValue,
        },
      });

  if (WORKER_CONFIGURED) {
    return handleWorkerEmission(
      pendingInvoice.id,
      sale,
      fiscalProfile,
      branchFiscalSettings.puntoDeVenta,
      docType,
      docValidation.normalized,
      receiverIvaCondition.id,
      normalizedReceiverName,
      branchPrintMode,
    );
  }

  return handleLegacyAfipEmission(
    pendingInvoice.id,
    sale,
    fiscalProfile,
    branchFiscalSettings.puntoDeVenta,
    docType,
    docValidation.normalized,
    receiverIvaCondition.id,
    normalizedReceiverName,
    emitterSnapshot,
    branchPrintMode,
  );
}

async function handleWorkerEmission(
  invoiceId: string,
  sale: { id: string; total: number; paymentMethod: string; creditCustomer: { name: string } | null; items: Array<{ name: string; quantity: number; price: number; soldByWeight: boolean }> },
  fiscalProfile: { cuit: string; environment: string },
  puntoDeVenta: number,
  docType: number,
  normalizedDoc: string,
  receiverIvaConditionId: number,
  normalizedReceiverName: string,
  branchPrintMode: TicketPrintMode,
) {
  try {
    const workerPayload = buildWorkerPayload(
      sale.id,
      sale.total,
      docType,
      normalizedDoc,
      receiverIvaConditionId,
      puntoDeVenta,
      fiscalProfile.environment as FiscalWorkerEnvironment,
      fiscalProfile.cuit,
    );

    const result = await emitInvoice(workerPayload, true);

    if (!result.ok) {
      const errorMsg = (result.data as { error?: { message?: string } })?.error?.message || `Worker error: ${result.status}`;
      throw new Error(errorMsg);
    }

    if (result.data.status === "DONE" && result.data.voucher) {
      const v = result.data.voucher;
      const caeDueDate = parseAfipDate(v.caeFchVto);
      const issuedAt = new Date();

      let pdfBlobUrl: string | null = null;
      let pdfWarning: string | null = null;

      try {
        const pdf = await createInvoicePdf({
          emitter: (await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { emitterSnapshot: true } }))?.emitterSnapshot as Parameters<typeof createInvoicePdf>[0]["emitter"],
          voucherNumber: v.voucherNumber,
          pointOfSale: puntoDeVenta,
          printMode: branchPrintMode,
          issueDate: issuedAt,
          cae: v.cae,
          caeDueDate: caeDueDate ?? issuedAt,
          receiverName: normalizedReceiverName,
          receiverDocumentType: docType,
          receiverDocumentNumber: normalizedDoc,
          receiverIvaConditionLabel: "Consumidor Final",
          paymentMethod: sale.paymentMethod,
          total: sale.total,
          items: sale.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            subtotal: getSaleItemSubtotal(item),
            soldByWeight: item.soldByWeight,
          })),
        });

        pdfBlobUrl = pdf.blobUrl;
        if (!pdf.blobUrl) {
          pdfWarning = "La factura se emitio, pero el PDF no pudo guardarse en Blob.";
        }
      } catch (pdfError) {
        console.error("[Fiscal Worker] Error generando PDF", pdfError);
        pdfWarning = "La factura se emitio, pero no se pudo generar el PDF.";
      }

      const issuedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.ISSUED,
          cae: v.cae,
          caeFchVto: caeDueDate,
          comprobanteTipo: v.voucherType,
          comprobanteNro: v.voucherNumber,
          puntoDeVenta,
          fechaEmision: issuedAt,
          pdfBlobUrl,
          lastError: pdfWarning,
          fiscalJobId: result.data.jobId,
          fiscalWorkerEnv: fiscalProfile.environment,
          afipRawResponse: result.data as unknown as Prisma.InputJsonValue,
        },
        select: {
          id: true, saleId: true, status: true, cae: true, caeFchVto: true,
          comprobanteTipo: true, comprobanteNro: true, puntoDeVenta: true, fechaEmision: true,
          docTipo: true, docNro: true, receiverName: true, receiverIvaConditionId: true,
          receiverIvaConditionLabel: true, impTotal: true, impNeto: true, impIva: true,
          pdfBlobUrl: true, pdfAfipUrl: true, lastError: true, emitterSnapshot: true,
          sale: {
            select: {
              paymentMethod: true,
              creditCustomer: { select: { name: true } },
              items: { select: { name: true, quantity: true, price: true, soldByWeight: true } },
            },
          },
        },
      });

      return NextResponse.json({
        invoice: buildInvoicePreviewData(
          issuedInvoice,
          getPaymentMethodLabel(issuedInvoice.sale.paymentMethod, issuedInvoice.sale.creditCustomer?.name ?? null),
          branchPrintMode,
        ),
      });
    }

    if (result.data.status === "PROCESSING" || result.data.status === "PENDING") {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          fiscalJobId: result.data.jobId,
          fiscalWorkerEnv: fiscalProfile.environment,
        },
      });

      return NextResponse.json({
        invoice: buildInvoicePreviewData(
          {
            id: invoiceId, saleId: sale.id, status: InvoiceStatus.PENDING,
            cae: null, caeFchVto: null, comprobanteTipo: null, comprobanteNro: null,
            puntoDeVenta, fechaEmision: null, docTipo: docType, docNro: normalizedDoc,
            receiverName: normalizedReceiverName, receiverIvaConditionId: null,
            receiverIvaConditionLabel: null, impTotal: sale.total, impNeto: sale.total,
            impIva: 0, pdfBlobUrl: null, pdfAfipUrl: null,
            lastError: "Emision en proceso. Se notificara por webhook.",
            emitterSnapshot: (await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { emitterSnapshot: true } }))?.emitterSnapshot,
            sale: { paymentMethod: sale.paymentMethod, creditCustomer: sale.creditCustomer, items: sale.items },
          },
          getPaymentMethodLabel(sale.paymentMethod, sale.creditCustomer?.name ?? null),
          branchPrintMode,
        ),
      }, { status: 202 });
    }

    throw new Error(result.data.lastError || "Estado desconocido del worker");
  } catch (error) {
    const message = normalizeFiscalError(error);
    const ambiguous = isAmbiguousFiscalError(error);

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: ambiguous ? InvoiceStatus.PENDING : InvoiceStatus.FAILED,
        lastError: ambiguous
          ? "No pudimos confirmar la respuesta del worker. La emision quedo pendiente."
          : message,
      },
    });

    return NextResponse.json(
      { error: ambiguous ? "Emision en proceso. Se notificara por webhook." : message, ambiguous },
      { status: ambiguous ? 202 : 400 },
    );
  }
}

async function handleLegacyAfipEmission(
  invoiceId: string,
  sale: { id: string; total: number; paymentMethod: string; creditCustomer: { name: string } | null; items: Array<{ name: string; quantity: number; price: number; soldByWeight: boolean }> },
  fiscalProfile: Parameters<typeof getAfipInstance>[0],
  puntoDeVenta: number,
  docType: number,
  normalizedDoc: string,
  receiverIvaConditionId: number,
  normalizedReceiverName: string,
  emitterSnapshot: ReturnType<typeof buildEmitterSnapshot>,
  branchPrintMode: TicketPrintMode,
) {
  try {
    const afip = getAfipInstance(fiscalProfile);
    const emissionDate = new Date();
    const afipResponse = await afip.ElectronicBilling.createNextVoucher({
      CantReg: 1,
      PtoVta: puntoDeVenta,
      CbteTipo: AFIP_INVOICE_TYPES.FACTURA_C,
      Concepto: 1,
      DocTipo: docType,
      DocNro: docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL ? 0 : Number(normalizedDoc),
      CbteFch: getAfipDateNumber(emissionDate),
      ImpTotal: sale.total,
      ImpTotConc: 0,
      ImpNeto: sale.total,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: "PES",
      MonCotiz: 1,
      CondicionIVAReceptorId: receiverIvaConditionId,
    });

    const voucherNumber = Number(afipResponse?.voucherNumber);
    if (!Number.isInteger(voucherNumber) || voucherNumber <= 0) {
      throw new Error("AFIP no devolvio un numero de comprobante valido.");
    }

    const caeDueDate = parseAfipDate(
      typeof afipResponse?.CAEFchVto === "string" ? afipResponse.CAEFchVto : null,
    );
    const issuedAt = emissionDate;

    let pdfBlobUrl: string | null = null;
    let pdfAfipUrl: string | null = null;
    let pdfWarning: string | null = null;

    try {
      const pdf = await createInvoicePdf({
        emitter: emitterSnapshot,
        voucherNumber,
        pointOfSale: puntoDeVenta,
        printMode: branchPrintMode,
        issueDate: issuedAt,
        cae: String(afipResponse?.CAE || ""),
        caeDueDate: caeDueDate ?? issuedAt,
        receiverName: normalizedReceiverName,
        receiverDocumentType: docType,
        receiverDocumentNumber: normalizedDoc,
        receiverIvaConditionLabel: "Consumidor Final",
        paymentMethod: sale.paymentMethod,
        total: sale.total,
        items: sale.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          subtotal: getSaleItemSubtotal(item),
          soldByWeight: item.soldByWeight,
        })),
      });

      pdfBlobUrl = pdf.blobUrl;
      pdfAfipUrl = pdf.afipUrl;
      if (!pdf.blobUrl) {
        pdfWarning = "La factura se emitio, pero el PDF no pudo guardarse en Blob.";
      }
    } catch (pdfError) {
      console.error("[Fiscal] Error generando PDF", pdfError);
      pdfWarning = "La factura se emitio, pero no se pudo generar el PDF.";
    }

    const issuedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.ISSUED,
        cae: typeof afipResponse?.CAE === "string" ? afipResponse.CAE : String(afipResponse?.CAE ?? ""),
        caeFchVto: caeDueDate,
        comprobanteTipo: AFIP_INVOICE_TYPES.FACTURA_C,
        comprobanteNro: voucherNumber,
        puntoDeVenta,
        fechaEmision: issuedAt,
        pdfBlobUrl,
        pdfAfipUrl,
        lastError: pdfWarning,
        afipRawResponse: afipResponse as Prisma.InputJsonValue,
      },
      select: {
        id: true, saleId: true, status: true, cae: true, caeFchVto: true,
        comprobanteTipo: true, comprobanteNro: true, puntoDeVenta: true, fechaEmision: true,
        docTipo: true, docNro: true, receiverName: true, receiverIvaConditionId: true,
        receiverIvaConditionLabel: true, impTotal: true, impNeto: true, impIva: true,
        pdfBlobUrl: true, pdfAfipUrl: true, lastError: true, emitterSnapshot: true,
        sale: {
          select: {
            paymentMethod: true,
            creditCustomer: { select: { name: true } },
            items: { select: { name: true, quantity: true, price: true, soldByWeight: true } },
          },
        },
      },
    });

    return NextResponse.json({
      invoice: buildInvoicePreviewData(
        issuedInvoice,
        getPaymentMethodLabel(issuedInvoice.sale.paymentMethod, issuedInvoice.sale.creditCustomer?.name ?? null),
        branchPrintMode,
      ),
    });
  } catch (error) {
    const message = normalizeFiscalError(error);
    const ambiguous = isAmbiguousFiscalError(error);

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: ambiguous ? InvoiceStatus.PENDING : InvoiceStatus.FAILED,
        lastError: ambiguous
          ? "No pudimos confirmar la respuesta de AFIP. Revisa esta emision desde el historial."
          : message,
      },
    });

    return NextResponse.json(
      { error: ambiguous ? "AFIP no respondio a tiempo. La emision paso a pendiente." : message, ambiguous },
      { status: ambiguous ? 202 : 400 },
    );
  }
}
