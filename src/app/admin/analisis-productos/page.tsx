"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatARS } from "@/lib/utils";
import { todayART } from "@/lib/utils";
import { artDayRange } from "@/lib/utils";

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
  branchCount: number;
  kioscoName: string | null;
  branchName: string | null;
  ownerEmail: string | null;
  periodo: string;
  desde: string;
  hasta: string;
}

type ScopeType = "global" | "email" | "kiosco" | "branch";

interface SearchResults {
  kioscos: Array<{ id: string; name: string; email: string; branchCount: number }>;
  users: Array<{ email: string; name: string | null; kioscoId: string | null; kioscoName: string | null }>;
  branches: Array<{ id: string; name: string; kioscoId: string; kioscoName: string; email: string }>;
}

type Periodo = "dia" | "semana" | "mes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODO_LABEL: Record<Periodo, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
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
          : { background: "rgba(51, 65, 85, 0.5)", color: "#94a3b8" };

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

function ProductRow({ product, rank, sortBy }: { product: TopProduct; rank: number; sortBy: "cantidad" | "revenue" }) {
  const isPrimary = (sortBy === "cantidad" && rank <= 3) || (sortBy === "revenue" && rank <= 3);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 12px",
        borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
        transition: "background 0.2s",
        background: isPrimary ? "rgba(34, 197, 94, 0.03)" : "transparent",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(51, 65, 85, 0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = isPrimary ? "rgba(34, 197, 94, 0.03)" : "transparent";
      }}
    >
      <ProductRankBadge rank={rank} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "#e2e8f0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {product.name}
        </div>
      </div>

      {/* Units column */}
      <div style={{ textAlign: "center", minWidth: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: sortBy === "cantidad" ? "#22c55e" : "#94a3b8" }}>
          {product.cantidad}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>unidades</div>
      </div>

      {/* Revenue column */}
      <div style={{ textAlign: "right", minWidth: 120 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: sortBy === "revenue" ? "#22c55e" : "#e2e8f0" }}>
          {formatARS(product.total)}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>revenue</div>
      </div>
    </div>
  );
}

function SearchAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: {
    type: ScopeType;
    targetId: string;
    email: string;
    label: string;
  }) => void;
}) {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!value || value.length < 2) {
      setResults(null);
      setShowResults(false);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?query=${encodeURIComponent(value)}`);
        const data = await res.json();
        setResults(data);
        setShowResults(true);
      } catch (error) {
        console.error("Search error:", error);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const newValue = e.target.value;
          onChange(newValue);
          if (newValue.length < 2) {
            setShowResults(false);
            setResults(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            setShowResults(false);
            setResults(null);
            onSelect({ type: "global", targetId: "", email: "", label: "Todos los negocios" });
          }
        }}
        placeholder="Buscar por email, kiosco o sucursal..."
        style={{
          width: "100%",
          padding: "12px 40px 12px 16px",
          borderRadius: "12px",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          background: "rgba(30, 41, 59, 0.8)",
          color: "#e2e8f0",
          fontSize: 14,
          paddingRight: value ? "40px" : "16px",
        }}
      />

      {value && (
        <button
          onClick={() => {
            onChange("");
            setShowResults(false);
            setResults(null);
            onSelect({ type: "global", targetId: "", email: "", label: "Todos los negocios" });
          }}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "none",
            background: "rgba(148, 163, 184, 0.2)",
            color: "#94a3b8",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
          title="Limpiar búsqueda"
        >
          ×
        </button>
      )}

      {showResults && results && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 8,
            background: "rgba(30, 41, 59, 0.98)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
            maxHeight: 400,
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          {/* Users by email */}
          {results.users.length > 0 && (
            <div>
              <div
                style={{
                  padding: "8px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#64748b",
                }}
              >
                Usuarios por email
              </div>
              {results.users.map((user) => (
                <button
                  key={user.email}
                  onClick={() => {
                    onSelect({
                      type: "email",
                      targetId: user.kioscoId || "",
                      email: user.email,
                      label: user.email,
                    });
                    setShowResults(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "10px 16px",
                    background: "transparent",
                    border: "none",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(51, 65, 85, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 20 }}>👤</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{user.email}</div>
                    {user.name && (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{user.name}</div>
                    )}
                  </div>
                  {user.kioscoName && (
                    <span style={{ fontSize: 12, color: "#22c55e" }}>{user.kioscoName}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Kioscos */}
          {results.kioscos.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
              <div
                style={{
                  padding: "8px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#64748b",
                }}
              >
                Kioscos
              </div>
              {results.kioscos.map((kiosco) => (
                <button
                  key={kiosco.id}
                  onClick={() => {
                    onSelect({
                      type: "kiosco",
                      targetId: kiosco.id,
                      email: kiosco.email,
                      label: kiosco.name,
                    });
                    setShowResults(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "10px 16px",
                    background: "transparent",
                    border: "none",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(51, 65, 85, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 20 }}>🏪</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{kiosco.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{kiosco.email}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {kiosco.branchCount} sucursal{kiosco.branchCount !== 1 ? "es" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Branches */}
          {results.branches.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
              <div
                style={{
                  padding: "8px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#64748b",
                }}
              >
                Sucursales
              </div>
              {results.branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => {
                    onSelect({
                      type: "branch",
                      targetId: branch.id,
                      email: branch.email,
                      label: `${branch.kioscoName} - ${branch.name}`,
                    });
                    setShowResults(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "10px 16px",
                    background: "transparent",
                    border: "none",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(51, 65, 85, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 20 }}>🏬</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{branch.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {branch.kioscoName} · {branch.email}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.kioscos.length === 0 &&
            results.users.length === 0 &&
            results.branches.length === 0 && (
              <div
                style={{
                  padding: "20px 16px",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: 13,
                }}
              >
                No se encontraron resultados
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 20px",
        color: "#94a3b8",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: "#e2e8f0" }}>
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
              background: "rgba(51, 65, 85, 0.5)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 14,
              borderRadius: 4,
              background: "rgba(51, 65, 85, 0.5)",
            }}
          />
          <div
            style={{
              width: 70,
              height: 14,
              borderRadius: 4,
              background: "rgba(51, 65, 85, 0.5)",
            }}
          />
          <div
            style={{
              width: 100,
              height: 14,
              borderRadius: 4,
              background: "rgba(51, 65, 85, 0.5)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminTopProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState<ScopeType>("global");
  const [targetId, setTargetId] = useState("");
  const [email, setEmail] = useState("");
  const [scopeLabel, setScopeLabel] = useState("Todos los negocios");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [currentDate, setCurrentDate] = useState(todayART());
  const [sortBy, setSortBy] = useState<"cantidad" | "revenue">("cantidad");
  const [data, setData] = useState<TopProductsData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        scope,
        periodo,
        isoDate: currentDate,
        sortBy,
      });

      if (targetId) queryParams.set("targetId", targetId);
      if (email) queryParams.set("email", email);

      const res = await fetch(`/api/admin/stats/top-products?${queryParams}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [scope, targetId, email, periodo, currentDate, sortBy]);

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
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Link href="/admin" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 14 }}>
            ← Volver al panel
          </Link>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: "#e2e8f0" }}>
          📊 Análisis de Productos Más Vendidos
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 8 }}>
          Inteligencia de negocio: entendé qué productos venden más tus clientes
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

        {/* Sort toggle */}
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
            📊 Ordenar por
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
            <button
              onClick={() => setSortBy("cantidad")}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 10,
                border: "none",
                background: sortBy === "cantidad" ? "#22c55e" : "transparent",
                color: sortBy === "cantidad" ? "#000" : "#94a3b8",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              📦 Unidades
            </button>
            <button
              onClick={() => setSortBy("revenue")}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 10,
                border: "none",
                background: sortBy === "revenue" ? "#22c55e" : "transparent",
                color: sortBy === "revenue" ? "#000" : "#94a3b8",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              💰 Revenue ($)
            </button>
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
      <div
        style={{
          background: "rgba(15, 23, 42, 0.8)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <>
            <div
              style={{
                padding: "16px",
                borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
              }}
            >
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#94a3b8",
                  margin: 0,
                }}
              >
                🏆 Top 10 productos más vendidos
              </h3>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Cargando...</div>
            </div>
            <LoadingState />
          </>
        ) : data ? (
          <>
            {/* Header */}
            <div
              style={{
                padding: "16px",
                borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#94a3b8",
                    margin: 0,
                  }}
                >
                  🏆 Top 10 productos más vendidos
                </h3>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  {PERIODO_LABEL[periodo]} · {formatDate(data.desde)} - {formatDate(data.hasta)}
                  {data.kioscoName && (
                    <span style={{ marginLeft: 8 }}>
                      · {data.kioscoName}
                    </span>
                  )}
                </div>
              </div>

              {/* Summary badges */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: "rgba(51, 65, 85, 0.5)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#22c55e" }}>
                    {data.cantidadVentas}
                  </span>
                  <span style={{ color: "#94a3b8", marginLeft: 4 }}>ventas</span>
                </div>
                <div
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: "rgba(51, 65, 85, 0.5)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#22c55e" }}>
                    {formatARS(data.totalVentas)}
                  </span>
                  <span style={{ color: "#94a3b8", marginLeft: 4 }}>total</span>
                </div>
                {data.branchCount > 0 && (
                  <div
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      background: "rgba(51, 65, 85, 0.5)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#22c55e" }}>
                      {data.branchCount}
                    </span>
                    <span style={{ color: "#94a3b8", marginLeft: 4 }}>
                      sucursal{data.branchCount !== 1 ? "es" : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Product list */}
            {data.topProducts.length === 0 ? (
              <EmptyState />
            ) : (
              <div>
                {/* Column headers */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "10px 12px",
                    borderBottom: "2px solid rgba(148, 163, 184, 0.2)",
                    background: "rgba(30, 41, 59, 0.3)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <div style={{ width: 32 }} />
                  <div style={{ flex: 1 }}>Producto</div>
                  <div
                    style={{
                      textAlign: "center",
                      minWidth: 80,
                      cursor: "pointer",
                      color: sortBy === "cantidad" ? "#22c55e" : "#64748b",
                    }}
                    onClick={() => setSortBy("cantidad")}
                  >
                    📦 Unidades {sortBy === "cantidad" && "▼"}
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      minWidth: 120,
                      cursor: "pointer",
                      color: sortBy === "revenue" ? "#22c55e" : "#64748b",
                    }}
                    onClick={() => setSortBy("revenue")}
                  >
                    💰 Revenue {sortBy === "revenue" && "▼"}
                  </div>
                </div>

                <div style={{ padding: "8px 0" }}>
                  {data.topProducts.map((product, idx) => (
                    <ProductRow key={product.name} product={product} rank={idx + 1} sortBy={sortBy} />
                  ))}
                </div>

                {/* Accumulated totals footer */}
                <div
                  style={{
                    padding: "16px 12px",
                    borderTop: "2px solid rgba(148, 163, 184, 0.2)",
                    background: "rgba(34, 197, 94, 0.03)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Total Top 10
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                      {data.topProducts.reduce((sum, p) => sum + p.cantidad, 0).toLocaleString("es-AR")} unidades
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Revenue acumulado
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#22c55e", marginTop: 2 }}>
                      {formatARS(data.topProducts.reduce((sum, p) => sum + p.total, 0))}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {data.totalVentas > 0
                        ? Math.round((data.topProducts.reduce((sum, p) => sum + p.total, 0) / data.totalVentas) * 100)
                        : 0}
                      % del total
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Business insights */}
      {data && data.topProducts.length > 0 && (
        <div
          style={{
            marginTop: 24,
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: 18,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", color: "#e2e8f0" }}>
            💡 Insights del Negocio
          </h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                padding: "14px 16px",
                background: "rgba(34, 197, 94, 0.05)",
                border: "1px solid rgba(34, 197, 94, 0.15)",
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
                Producto estrella
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>
                {data.topProducts[0].name}
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                {data.topProducts[0].cantidad} unidades · {formatARS(data.topProducts[0].total)} en ventas
              </div>
            </div>

            {data.topProducts.length > 1 && (
              <div
                style={{
                  padding: "14px 16px",
                  background: "rgba(59, 130, 246, 0.05)",
                  border: "1px solid rgba(59, 130, 246, 0.15)",
                  borderRadius: 12,
                }}
              >
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
                  Top 3 productos concentran
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#3b82f6" }}>
                  {data.totalVentas > 0
                    ? Math.round(
                      (data.topProducts
                        .slice(0, 3)
                        .reduce((sum, p) => sum + p.total, 0) /
                        data.totalVentas) *
                      100
                    )
                    : 0}
                  % del total en ventas
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                  de los ingresos del período
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
