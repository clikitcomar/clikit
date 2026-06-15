"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatARS } from "@/lib/utils";
import type { Periodo } from "@/lib/stats-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopProduct {
  name: string;
  cantidad: number;
  total: number;
}

interface TopProductsData {
  topProducts: TopProduct[];
  totalVentas: number;
  cantidadVentas: number;
  periodo: string;
  desde: string;
  hasta: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODO_LABEL: Record<string, string> = {
  dia: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProductRankBadge({ rank }: { rank: number }) {
  const badgeStyle =
    rank === 1
      ? { background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#000" }
      : rank === 2
        ? { background: "linear-gradient(135deg, #C0C0C0, #A0A0A0)", color: "#000" }
        : rank === 3
          ? { background: "linear-gradient(135deg, #CD7F32, #A0522D)", color: "#fff" }
          : { background: "var(--surface-2)", color: "var(--text-3)" };

  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 800,
        flexShrink: 0,
        ...badgeStyle,
      }}
    >
      {rank}
    </span>
  );
}

function ProductRow({
  product,
  rank,
}: {
  product: TopProduct;
  rank: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 12px",
        borderBottom: "1px solid var(--border)",
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <ProductRankBadge rank={rank} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {product.name}
        </div>
      </div>

      <div style={{ textAlign: "center", minWidth: 70 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)" }}>
          {product.cantidad}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>unidades</div>
      </div>

      <div style={{ textAlign: "right", minWidth: 100 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
          {formatARS(product.total)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>en ventas</div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 20px",
        color: "var(--text-3)",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
        Sin datos de ventas
      </div>
      <div style={{ fontSize: 13 }}>
        No hay ventas en el período seleccionado para mostrar productos
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "20px 12px",
      }}
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "14px 12px",
            opacity: 0.5,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--surface-2)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 14,
              borderRadius: 4,
              background: "var(--surface-2)",
            }}
          />
          <div
            style={{
              width: 70,
              height: 14,
              borderRadius: 4,
              background: "var(--surface-2)",
            }}
          />
          <div
            style={{
              width: 100,
              height: 14,
              borderRadius: 4,
              background: "var(--surface-2)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TopProductsPanel({
  periodo,
  currentDate,
}: {
  periodo: Periodo;
  currentDate: string;
}) {
  const params = useParams();
  const branchId = params.branchId as string;

  const [data, setData] = useState<TopProductsData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        periodo,
        isoDate: currentDate,
      });

      const res = await fetch(`/api/stats/top-products?${queryParams}`, {
        headers: { "x-branch-id": branchId },
      });
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [branchId, periodo, currentDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "0" }}>
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-3)",
              margin: 0,
            }}
          >
            🏆 Top 10 productos más vendidos
          </h3>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            Cargando...
          </div>
        </div>
        <LoadingState />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="card" style={{ padding: "0" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-3)",
              margin: 0,
            }}
          >
            🏆 Top 10 productos más vendidos
          </h3>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            {PERIODO_LABEL[periodo] || periodo} · {formatDate(data.desde)} - {formatDate(data.hasta)}
          </div>
        </div>

        {/* Summary badges */}
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "var(--surface-2)",
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--primary)" }}>
              {data.cantidadVentas}
            </span>
            <span style={{ color: "var(--text-3)", marginLeft: 4 }}>ventas</span>
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "var(--surface-2)",
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--primary)" }}>
              {formatARS(data.totalVentas)}
            </span>
            <span style={{ color: "var(--text-3)", marginLeft: 4 }}>total</span>
          </div>
        </div>
      </div>

      {/* Product list */}
      {data.topProducts.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ padding: "8px 0" }}>
          {data.topProducts.map((product, idx) => (
            <ProductRow key={product.name} product={product} rank={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
