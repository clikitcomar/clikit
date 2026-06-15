"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScopeType = "global" | "email" | "kiosco" | "branch";

interface SearchKiosco {
  id: string;
  name: string;
  email: string;
  branchCount: number;
}

interface SearchUser {
  email: string;
  name: string | null;
  kioscoId: string | null;
  kioscoName: string | null;
}

interface SearchBranch {
  id: string;
  name: string;
  kioscoId: string;
  kioscoName: string;
  email: string;
}

interface SearchResults {
  kioscos: SearchKiosco[];
  users: SearchUser[];
  branches: SearchBranch[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchAutocomplete({
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
    if (!value || value.length < 2 || value === "Todos los negocios") {
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
