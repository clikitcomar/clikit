"use client";

import ModalPortal from "@/components/ui/ModalPortal";

type Props = {
  used: number;
  limit: number;
  priceArs: number;
  nextResetAt: string;
  timeZone: string;
  canManageSubscription: boolean;
  onClose: () => void;
};

function formatArs(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatResetTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "mañana";

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export default function DailySalesLimitModal({
  used,
  limit,
  priceArs,
  nextResetAt,
  timeZone,
  canManageSubscription,
  onClose,
}: Props) {
  const openSubscriptionPage = () => {
    window.open("/suscripcion", "_blank", "noopener,noreferrer");
  };

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <section
          className="modal animate-slide-up"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-sales-limit-title"
          style={{
            maxWidth: 480,
            width: "min(480px, calc(100vw - 24px))",
            padding: 24,
            display: "grid",
            gap: 18,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={{ display: "grid", gap: 9 }}>
            <div
              style={{
                width: "fit-content",
                padding: "6px 10px",
                borderRadius: 999,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".05em",
                textTransform: "uppercase",
              }}
            >
              Plan gratuito
            </div>
            <h2
              id="daily-sales-limit-title"
              style={{ margin: 0, fontSize: 24, lineHeight: 1.15, fontWeight: 900 }}
            >
              Ya usaste las ventas gratuitas de hoy
            </h2>
            <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.6, fontSize: 14 }}>
              Hoy registraste {used} de {limit} ventas gratuitas. El cupo se renueva {formatResetTime(nextResetAt, timeZone)}.
              Tu ticket actual sigue preparado: no se perdió nada.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
              padding: "15px 16px",
              borderRadius: 16,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 800 }}>
                Plan Clikit
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 3 }}>
                Ventas sin límite diario
              </div>
            </div>
            <div style={{ color: "var(--text)", fontSize: 21, fontWeight: 900, whiteSpace: "nowrap" }}>
              {formatArs(priceArs)}
              <span style={{ display: "block", color: "var(--text-3)", fontSize: 11, fontWeight: 600, textAlign: "right" }}>
                por mes
              </span>
            </div>
          </div>

          {!canManageSubscription && (
            <p style={{ margin: 0, color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>
              Para continuar sin este límite, pedile al titular del negocio que active el plan mensual.
            </p>
          )}

          <div style={{ display: "grid", gap: 9 }}>
            {canManageSubscription && (
              <button type="button" className="btn btn-primary btn-lg" onClick={openSubscriptionPage}>
                Ver plan y activar
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {canManageSubscription ? "Seguir mañana con el plan gratuito" : "Volver al ticket"}
            </button>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}
