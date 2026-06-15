"use client";

import { useCallback, useState } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { formatARS } from "@/lib/utils";
import { todayART } from "@/lib/utils";
import { artDayRange } from "@/lib/utils";
import SearchAutocomplete from "@/components/admin/SearchAutocomplete";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsolidatedProduct {
  name: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number | null;
}

interface ConsolidatedData {
  totalRevenue: number;
  totalCost: number;
  totalExpenses: number;
  grossProfit: number | null;
  netProfit: number | null;
  marginPercent: number | null;
  totalSales: number;
  totalUnits: number;
  branchCount: number;
  kioscoCount: number;
  productConsolidation: ConsolidatedProduct[];
  revenueByPaymentMethod: Record<string, number>;
  periodo: string;
  desde: string;
  hasta: string;
  context: { kioscoName: string | null; branchName: string | null; ownerEmail: string | null };
  hasCosts: boolean;
  totalWithdrawals: number;
}

type Periodo = "dia" | "semana" | "mes";
type ScopeType = "global" | "email" | "kiosco" | "branch";
type SortBy = "profit" | "revenue" | "units";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODO_LABEL: Record<Periodo, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "💵 Efectivo",
  MERCADOPAGO: "📱 MercadoPago",
  TRANSFER: "🏦 Transferencia",
  DEBIT: "💳 Débito",
  CREDIT_CARD: "🏧 Tarjeta",
  CREDIT: "📋 Fiado",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  color = "green",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "blue" | "purple" | "amber";
}) {
  const colors = {
    green: { bg: "rgba(34, 197, 94, 0.05)", border: "rgba(34, 197, 94, 0.2)", value: "#22c55e" },
    blue: { bg: "rgba(59, 130, 246, 0.05)", border: "rgba(59, 130, 246, 0.2)", value: "#3b82f6" },
    purple: { bg: "rgba(168, 85, 247, 0.05)", border: "rgba(168, 85, 247, 0.2)", value: "#a855f7" },
    amber: { bg: "rgba(245, 158, 11, 0.05)", border: "rgba(245, 158, 11, 0.2)", value: "#f59e0b" },
  };

  const scheme = colors[color];

  return (
    <div
      style={{
        padding: "20px",
        background: scheme.bg,
        border: `1px solid ${scheme.border}`,
        borderRadius: 16,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: scheme.value }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      <div>Cargando datos consolidados...</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminConsolidatedPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState<ScopeType>("global");
  const [targetId, setTargetId] = useState("");
  const [email, setEmail] = useState("");
  const [scopeLabel, setScopeLabel] = useState("Todos los negocios");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [currentDate, setCurrentDate] = useState(todayART());
  const [sortBy, setSortBy] = useState<SortBy>("profit");
  const [data, setData] = useState<ConsolidatedData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        scope,
        periodo,
        isoDate: currentDate,
      });

      if (targetId) queryParams.set("targetId", targetId);
      if (email) queryParams.set("email", email);

      const res = await fetch(`/api/admin/stats/consolidated?${queryParams}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [scope, targetId, email, periodo, currentDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelect = useCallback((result: {
    type: ScopeType;
    targetId: string;
    email: string;
    label: string;
  }) => {
    setScope(result.type);
    setTargetId(result.targetId);
    setEmail(result.email);
    setScopeLabel(result.label);
    setSearchQuery(result.label);
  }, []);

  const handlePeriodoChange = useCallback((p: Periodo) => {
    setPeriodo(p);
    setCurrentDate(todayART());
  }, []);

  return (
    <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Link href="/admin" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 14 }}>
            ← Volver al panel
          </Link>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: "#e2e8f0" }}>
          💰 Facturación Consolidada y Márgenes
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 8 }}>
          Análisis de facturación total, productos vendidos y rentabilidad del negocio
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.8)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          borderRadius: 18,
          padding: 20,
          marginBottom: 24,
          display: "grid",
          gap: 18,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "#94a3b8",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            🔍 Buscar negocio
          </label>
          <SearchAutocomplete
            value={searchQuery}
            onChange={setSearchQuery}
            onSelect={handleSelect}
          />
        </div>

        {/* Period selector */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "#94a3b8",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            📅 Período
          </label>
          <div
            style={{
              display: "flex",
              gap: 8,
              background: "rgba(30, 41, 59, 0.5)",
              padding: 4,
              borderRadius: 12,
              border: "1px solid rgba(148, 163, 184, 0.1)",
            }}
          >
            {(["dia", "semana", "mes"] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodoChange(p)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  background: periodo === p ? "#22c55e" : "transparent",
                  color: periodo === p ? "#000" : "#94a3b8",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {PERIODO_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Active scope indicator */}
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.2)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20 }}>
            {scope === "global" ? "🌍" : scope === "email" ? "📧" : scope === "kiosco" ? "🏪" : "🏬"}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Analizando:</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>{scopeLabel}</div>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <LoadingState />
      ) : data ? (
        <>
          {/* KPIs principales */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <KPICard
              label="💰 Facturación Total"
              value={formatARS(data.totalRevenue)}
              sub={`${data.totalSales} ventas · ${data.totalUnits.toLocaleString("es-AR")} unidades`}
              color="green"
            />
            <KPICard
              label="📊 Ganancia Neta"
              value={data.netProfit !== null ? formatARS(data.netProfit) : "Sin costos"}
              sub={data.marginPercent !== null ? `Margen: ${data.marginPercent}%` : "Configurá costos para ver margen"}
              color={data.netProfit !== null && data.netProfit >= 0 ? "blue" : "amber"}
            />
            <KPICard
              label="💸 Gastos y Retiros"
              value={formatARS(data.totalExpenses + data.totalWithdrawals)}
              sub={`Gastos: ${formatARS(data.totalExpenses)} · Retiros: ${formatARS(data.totalWithdrawals)}`}
              color="purple"
            />
            <KPICard
              label="🏢 Cobertura"
              value={`${data.kioscoCount} kioscos`}
              sub={`${data.branchCount} sucursales analizadas`}
              color="amber"
            />
          </div>

          {/* Revenue by payment method */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 18,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", color: "#e2e8f0" }}>
              💳 Facturación por Método de Pago
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {Object.entries(data.revenueByPaymentMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([method, amount]) => (
                  <div
                    key={method}
                    style={{
                      padding: "14px 16px",
                      background: "rgba(30, 41, 59, 0.5)",
                      borderRadius: 12,
                      border: "1px solid rgba(148, 163, 184, 0.1)",
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
                      {PAYMENT_METHOD_LABEL[method] || method}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>
                      {formatARS(amount)}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {Math.round((amount / data.totalRevenue) * 100)}% del total
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Consolidated products table */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 18,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#e2e8f0" }}>
                  📦 Productos Consolidados
                </h3>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  {data.productConsolidation.length} productos · {formatDate(data.desde)} - {formatDate(data.hasta)}
                </div>
              </div>

              {/* Sort controls */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  background: "rgba(30, 41, 59, 0.5)",
                  padding: 4,
                  borderRadius: 10,
                }}
              >
                <button
                  onClick={() => setSortBy("profit")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: sortBy === "profit" ? "#22c55e" : "transparent",
                    color: sortBy === "profit" ? "#000" : "#94a3b8",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  💰 Ganancia
                </button>
                <button
                  onClick={() => setSortBy("revenue")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: sortBy === "revenue" ? "#22c55e" : "transparent",
                    color: sortBy === "revenue" ? "#000" : "#94a3b8",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  💵 Revenue
                </button>
                <button
                  onClick={() => setSortBy("units")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: sortBy === "units" ? "#22c55e" : "transparent",
                    color: sortBy === "units" ? "#000" : "#94a3b8",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  📦 Unidades
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "2px solid rgba(148, 163, 184, 0.2)" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      #
                    </th>
                    <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Producto
                    </th>
                    <th style={{ padding: "12px 16px", textAlign: "center", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Unidades
                    </th>
                    <th style={{ padding: "12px 16px", textAlign: "right", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Revenue
                    </th>
                    {data.hasCosts && (
                      <>
                        <th style={{ padding: "12px 16px", textAlign: "right", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Costo
                        </th>
                        <th style={{ padding: "12px 16px", textAlign: "right", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Ganancia
                        </th>
                        <th style={{ padding: "12px 16px", textAlign: "center", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Margen
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.productConsolidation
                    .sort((a, b) => {
                      if (sortBy === "profit") {
                        return (b.profit ?? b.revenue) - (a.profit ?? a.revenue);
                      } else if (sortBy === "revenue") {
                        return b.revenue - a.revenue;
                      } else {
                        return b.units - a.units;
                      }
                    })
                    .map((product, idx) => {
                      const profit = product.profit ?? product.revenue;
                      const margin = product.revenue > 0 ? Math.round((profit / product.revenue) * 100) : 0;

                      return (
                        <tr
                          key={product.name}
                          style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}
                        >
                          <td style={{ padding: "12px 16px", fontWeight: 700, color: "#94a3b8" }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: "12px 16px", fontWeight: 600, color: "#e2e8f0" }}>
                            {product.name}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "center", color: "#e2e8f0" }}>
                            {product.units.toLocaleString("es-AR")}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#22c55e" }}>
                            {formatARS(product.revenue)}
                          </td>
                          {data.hasCosts && (
                            <>
                              <td style={{ padding: "12px 16px", textAlign: "right", color: "#94a3b8" }}>
                                {formatARS(product.cost)}
                              </td>
                              <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: profit >= 0 ? "#3b82f6" : "#ef4444" }}>
                                {formatARS(profit)}
                              </td>
                              <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                <span
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    background: margin >= 30 ? "rgba(34, 197, 94, 0.15)" : margin >= 15 ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                                    color: margin >= 30 ? "#22c55e" : margin >= 15 ? "#f59e0b" : "#ef4444",
                                    fontWeight: 700,
                                    fontSize: 12,
                                  }}
                                >
                                  {margin}%
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Footer totals */}
            <div
              style={{
                padding: "16px 20px",
                borderTop: "2px solid rgba(148, 163, 184, 0.2)",
                background: "rgba(34, 197, 94, 0.03)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Totales Consolidados
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  {data.productConsolidation.length} productos · {data.productConsolidation.reduce((sum, p) => sum + p.units, 0).toLocaleString("es-AR")} unidades
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Revenue Total
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e", marginTop: 2 }}>
                  {formatARS(data.productConsolidation.reduce((sum, p) => sum + p.revenue, 0))}
                </div>
              </div>
              {data.hasCosts && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Ganancia Total
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#3b82f6", marginTop: 2 }}>
                    {formatARS(data.productConsolidation.reduce((sum, p) => sum + (p.profit ?? 0), 0))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
