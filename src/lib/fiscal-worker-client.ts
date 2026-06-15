import { createHash } from "crypto";

const WORKER_BASE_URL = process.env.ZAP_FISCAL_BASE_URL || "https://arca.zap.com.ar";
const WORKER_API_KEY = process.env.ZAP_FISCAL_API_KEY || "";

export type FiscalWorkerEnvironment = "TEST" | "PROD";

export interface EmitInvoicePayload {
  externalId: string;
  idempotencyKey: string;
  contributor: {
    cuit: string;
    pointOfSale: number;
    environment: FiscalWorkerEnvironment;
  };
  voucher: {
    type: "A" | "B" | "C";
    concept: number;
    date: string;
  };
  amounts: {
    total: number;
    net: number;
    vat: number;
    exempt?: number;
    vatBreakdown?: Array<{ rate: number; base: number; amount: number }>;
  };
  customer: {
    docType: number;
    docNumber: string;
    name?: string | null;
    vatCondition?: number;
  };
  webhook?: {
    url?: string;
    secret?: string;
  };
}

export interface EmitInvoiceResponse {
  jobId: string;
  status: "PENDING" | "DONE" | "PROCESSING" | "FAILED";
  externalId: string;
  voucher?: {
    id: string;
    voucherType: number;
    voucherNumber: number;
    cae: string;
    caeFchVto: string;
    issuedAt: string;
  };
  lastError?: string | null;
  message?: string;
}

export interface VoidInvoicePayload {
  externalId: string;
  idempotencyKey: string;
  originalVoucherId: string;
  voidReason?: string;
  contributor?: {
    cuit: string;
    pointOfSale: number;
    environment: FiscalWorkerEnvironment;
  };
  webhook?: {
    url?: string;
    secret?: string;
  };
}

export interface VoidInvoiceResponse {
  jobId: string;
  status: string;
  externalId: string;
  ncType: number;
  originalVoucherId: string;
  message: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: string;
  externalId: string;
  lastError?: string | null;
  voucher?: {
    id: string;
    voucherType: number;
    voucherNumber: number;
    cae: string;
    caeFchVto: string;
    issuedAt: string;
  };
}

export interface ArcaStatusResponse {
  status: "operational" | "degraded" | "down";
  message?: string;
  since?: string;
  lastChecked?: string;
}

export function computeIdempotencyKey(saleId: string): string {
  return createHash("sha256").update(saleId).digest("hex");
}

async function workerFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; timeout?: number } = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const { method = "GET", body, timeout = 15_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${WORKER_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": WORKER_API_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json() as T;
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function emitInvoice(
  payload: EmitInvoicePayload,
  sync = false,
): Promise<{ ok: boolean; status: number; data: EmitInvoiceResponse }> {
  const query = sync ? "?sync=true" : "";
  return workerFetch<EmitInvoiceResponse>(`/v1/invoices/emit${query}`, {
    method: "POST",
    body: payload,
    timeout: sync ? 12_000 : 10_000,
  });
}

export async function emitInvoiceDryRun(
  payload: EmitInvoicePayload,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return workerFetch(`/v1/invoices/emit?dryRun=true`, {
    method: "POST",
    body: payload,
  });
}

export async function voidInvoice(
  payload: VoidInvoicePayload,
): Promise<{ ok: boolean; status: number; data: VoidInvoiceResponse }> {
  return workerFetch<VoidInvoiceResponse>("/v1/invoices/void", {
    method: "POST",
    body: payload,
  });
}

export async function getJobStatus(
  jobId: string,
): Promise<{ ok: boolean; status: number; data: JobStatusResponse }> {
  return workerFetch<JobStatusResponse>(`/v1/invoices/jobs/${jobId}`);
}

export async function getArcaStatus(): Promise<{
  ok: boolean;
  status: number;
  data: ArcaStatusResponse;
}> {
  return workerFetch<ArcaStatusResponse>("/v1/status/arca", { timeout: 5_000 });
}
