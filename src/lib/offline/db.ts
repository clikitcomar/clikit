import { openDB } from "idb";
import { LEGACY_OFFLINE_DB_NAME, OFFLINE_DB_NAME } from "@/lib/brand";

const STORE_NAME = "pending_sales";
let dbNamePromise: Promise<string> | null = null;

type PendingSaleRecord = {
  id?: number;
  branchId?: string;
  clientSaleId?: string;
  timestamp?: number;
  items: unknown[];
  total: number;
  paymentMethod: string;
  receivedAmount?: number | null;
  creditCustomerId?: string | null;
  retryAfterAt?: number;
};

async function resolveDbName() {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
    return LEGACY_OFFLINE_DB_NAME;
  }

  const databases = await indexedDB.databases();
  if (databases.some((database) => database.name === OFFLINE_DB_NAME)) {
    return OFFLINE_DB_NAME;
  }
  if (databases.some((database) => database.name === LEGACY_OFFLINE_DB_NAME)) {
    return LEGACY_OFFLINE_DB_NAME;
  }

  return OFFLINE_DB_NAME;
}

function getResolvedDbName() {
  if (!dbNamePromise) {
    dbNamePromise = resolveDbName();
  }

  return dbNamePromise;
}

export async function getDb() {
  return openDB(await getResolvedDbName(), 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

export async function savePendingSale(saleData: PendingSaleRecord) {
  const db = await getDb();
  await db.add(STORE_NAME, {
    ...saleData,
    timestamp: Date.now(),
  });
}

export async function getPendingSales() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function clearPendingSale(id: number) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

let dailyQuotaRetryTimer: ReturnType<typeof setTimeout> | null = null;
let dailyQuotaRetryAt = 0;

function scheduleDailyQuotaRetry(timestamp: number) {
  if (typeof window === "undefined" || !Number.isFinite(timestamp)) return;
  if (dailyQuotaRetryAt && dailyQuotaRetryAt <= timestamp) return;

  if (dailyQuotaRetryTimer) {
    clearTimeout(dailyQuotaRetryTimer);
  }

  dailyQuotaRetryAt = timestamp;
  dailyQuotaRetryTimer = setTimeout(() => {
    dailyQuotaRetryTimer = null;
    dailyQuotaRetryAt = 0;
    void syncPendingSales();
  }, Math.max(250, timestamp - Date.now() + 1000));
}

export async function syncPendingSales() {
  if (!navigator.onLine) return;

  const sales = (await getPendingSales()) as PendingSaleRecord[];
  if (sales.length === 0) return;

  const now = Date.now();
  const nextRetryAt = sales
    .map((sale) => sale.retryAfterAt)
    .filter((value): value is number => typeof value === "number" && value > now)
    .sort((a, b) => a - b)[0];

  if (nextRetryAt) {
    scheduleDailyQuotaRetry(nextRetryAt);
  }

  for (const sale of sales) {
    if (!sale.id) {
      continue;
    }

    if (sale.retryAfterAt && sale.retryAfterAt > Date.now()) {
      continue;
    }

    if (!sale.branchId) {
      console.warn("[Offline] Venta pendiente sin branchId. No se puede sincronizar de forma segura.", sale);
      continue;
    }

    try {
      const {
        id,
        timestamp: _timestamp,
        retryAfterAt: _retryAfterAt,
        ...payload
      } = sale;
      void _timestamp;
      void _retryAfterAt;

      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": sale.branchId,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await clearPendingSale(id);
        continue;
      }

      if (res.status === 429) {
        const responseData = await res.json().catch(() => null);
        if (responseData?.code === "DAILY_SALES_LIMIT_REACHED" && typeof responseData.nextResetAt === "string") {
          const retryAt = Date.parse(responseData.nextResetAt);
          if (Number.isFinite(retryAt) && retryAt > Date.now()) {
            const db = await getDb();
            await db.put(STORE_NAME, { ...sale, retryAfterAt: retryAt });
            scheduleDailyQuotaRetry(retryAt);
          }
        }
      }
    } catch (err) {
      console.error("Error syncing sale", err);
    }
  }
}
