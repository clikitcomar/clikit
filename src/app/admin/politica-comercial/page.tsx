"use client";

import { useCallback, useEffect, useState } from "react";

type Policy = {
  id: string;
  freeDailySalesLimit: number;
  subscriptionPriceArs: number;
  timeZone: string;
  updatedAt: string;
  updatedByEmail: string | null;
};

const TIME_ZONES = [
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/Argentina/Cordoba", label: "Argentina (Córdoba)" },
  { value: "America/Argentina/Mendoza", label: "Argentina (Mendoza)" },
  { value: "America/Argentina/Salta", label: "Argentina (Salta)" },
  { value: "America/Argentina/Ushuaia", label: "Argentina (Ushuaia)" },
  { value: "America/Montevideo", label: "Uruguay (Montevideo)" },
];

function formatArs(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminCommercialPolicyPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [freeDailySalesLimit, setFreeDailySalesLimit] = useState("");
  const [subscriptionPriceArs, setSubscriptionPriceArs] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/sales-policy", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar la política comercial.");
      }
      const saved = data as Policy;
      setPolicy(saved);
      setFreeDailySalesLimit(String(saved.freeDailySalesLimit));
      setSubscriptionPriceArs(String(saved.subscriptionPriceArs));
      setTimeZone(saved.timeZone);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la política comercial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/sales-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeDailySalesLimit: Number(freeDailySalesLimit),
          subscriptionPriceArs: Number(subscriptionPriceArs),
          timeZone,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar la política comercial.");
      }

      const saved = data as Policy;
      setPolicy(saved);
      setFreeDailySalesLimit(String(saved.freeDailySalesLimit));
      setSubscriptionPriceArs(String(saved.subscriptionPriceArs));
      setTimeZone(saved.timeZone);
      setNotice("La política comercial quedó guardada.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la política comercial.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "28px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Administración de plataforma
        </div>
        <h1 style={{ margin: "6px 0", fontSize: 28, fontWeight: 900, color: "var(--text)" }}>
          Plan y límites
        </h1>
        <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.6 }}>
          Configurá el acceso gratuito y el precio mensual que se ofrece al superar el cupo.
          Los cambios se guardan en la base de datos y se aplican a todos los comercios.
        </p>
      </div>

      {error && (
        <div role="alert" style={{ padding: 12, borderRadius: 12, marginBottom: 16, color: "var(--red)", background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.25)" }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: 12, borderRadius: 12, marginBottom: 16, color: "var(--green)", background: "rgba(34,197,94,.10)", border: "1px solid rgba(34,197,94,.25)" }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div className="admin-card" style={{ padding: 24, color: "var(--text-2)" }}>Cargando configuración...</div>
      ) : !policy ? (
        <div className="admin-card" style={{ padding: 24, display: "grid", gap: 12 }}>
          <span>No pudimos cargar los valores guardados. Volvé a intentar.</span>
          <button type="button" className="btn btn-ghost" onClick={() => void loadPolicy()}>Reintentar</button>
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: "grid", gap: 18 }}>
          <section className="admin-card" style={{ padding: 22, display: "grid", gap: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Acceso gratuito</h2>
              <p style={{ margin: "5px 0 0", color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>
                Cada comercio comparte este cupo entre todas sus sucursales. Se cuentan las ventas confirmadas y no anuladas del día.
              </p>
            </div>
            <label style={{ display: "grid", gap: 7, maxWidth: 360 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Ventas gratuitas por día y comercio</span>
              <input
                className="input"
                type="number"
                min={0}
                max={10000}
                step={1}
                required
                value={freeDailySalesLimit}
                onChange={(event) => setFreeDailySalesLimit(event.target.value)}
              />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
Al llegar al límite, el sistema ofrece pasar al plan mensual. El cupo se renueva al comenzar el siguiente día; con 0 se desactiva el límite.
              </span>
            </label>
          </section>

          <section className="admin-card" style={{ padding: 22, display: "grid", gap: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Plan mensual</h2>
              <p style={{ margin: "5px 0 0", color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>
                Este importe se muestra en el modal y se utiliza al crear nuevas suscripciones de Mercado Pago. Las suscripciones activas, ofertas congeladas y precios especiales conservan sus condiciones vigentes.
              </p>
            </div>
            <label style={{ display: "grid", gap: 7, maxWidth: 360 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Precio mensual (ARS)</span>
              <input
                className="input"
                type="number"
                min={1}
                max={100000000}
                step={1}
                required
                value={subscriptionPriceArs}
                onChange={(event) => setSubscriptionPriceArs(event.target.value)}
              />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Vista previa: {formatArs(Number(subscriptionPriceArs) || 0)} por mes.
              </span>
            </label>
          </section>

          <section className="admin-card" style={{ padding: 22, display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Reinicio diario</h2>
              <p style={{ margin: "5px 0 0", color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>
                La hora local determina cuándo vuelve a estar disponible el cupo gratuito.
              </p>
            </div>
            <label style={{ display: "grid", gap: 7, maxWidth: 420 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Zona horaria</span>
              <select className="input" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
                {TIME_ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>{zone.label}</option>
                ))}
                {!TIME_ZONES.some((zone) => zone.value === timeZone) && (
                  <option value={timeZone}>{timeZone}</option>
                )}
              </select>
            </label>
          </section>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ color: "var(--text-3)", fontSize: 12 }}>
              {policy?.updatedAt ? "Última actualización: " + new Date(policy.updatedAt).toLocaleString("es-AR") : ""}
              {policy?.updatedByEmail ? " · " + policy.updatedByEmail : ""}
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar política"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
