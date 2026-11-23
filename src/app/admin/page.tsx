import { Suspense } from "react";
import Link from "next/link";
import AdminRentabilityCalculator from "@/components/admin/AdminRentabilityCalculator";
import { getPlatformSalesPolicy } from "@/lib/platform-sales-policy";
import MacroStatsWidget from "@/components/admin/widgets/MacroStatsWidget";
import OperationsHealthWidget from "@/components/admin/widgets/OperationsHealthWidget";
import PartnersWidget from "@/components/admin/widgets/PartnersWidget";
import "./admin-dashboard.css";

function WidgetSkeleton({ title }: { title: string }) {
  return (
    <div className="bento-card skeleton-card">
      <div className="bento-card-header">
        <span className="bento-card-title">{title}</span>
      </div>
      <div className="skeleton-line" style={{ width: "60%", height: "32px", marginTop: "16px" }}></div>
      <div className="skeleton-line" style={{ width: "40%", marginTop: "12px" }}></div>
    </div>
  );
}

export default async function AdminDashboard() {
  const commercialPolicy = await getPlatformSalesPolicy();

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <div>
          <h1 className="admin-dashboard__title">Panel Estratégico</h1>
          <p className="admin-dashboard__subtitle">
            Métricas globales del sistema en tiempo real.
          </p>
        </div>
        <div className="admin-dashboard__actions">
          <span className="live-indicator">
            <span className="pulse-dot"></span> Live
          </span>
        </div>
      </div>

      {/* Quick access cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "16px",
        marginBottom: "32px"
      }}>
        <Link
          href="/admin/analisis-productos"
          style={{
            padding: "20px",
            borderRadius: "18px",
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            textDecoration: "none",
            color: "#e2e8f0",
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📊</div>
          <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700 }}>
            Análisis de Productos
          </h3>
          <p style={{ margin: 0, fontSize: "14px", color: "#94a3b8", lineHeight: 1.5 }}>
            Top productos más vendidos por cliente. Inteligencia de negocio para asesorar a tus clientes.
          </p>
        </Link>
      </div>

      <div className="bento-layout">
        {/* Main Financial & Growth Column */}
        <div className="bento-col-main">
          <Suspense fallback={<WidgetSkeleton title="Macro Economía" />}>
            <MacroStatsWidget />
          </Suspense>
        </div>

        {/* Secondary Column: Operations & Partners */}
        <div className="bento-col-side">
          <Suspense fallback={<WidgetSkeleton title="Salud Operacional" />}>
            <OperationsHealthWidget />
          </Suspense>

          <Suspense fallback={<WidgetSkeleton title="Programa Partners" />}>
            <PartnersWidget />
          </Suspense>
        </div>
      </div>

      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__section-title">Calculadora de rentabilidad</h2>
        <AdminRentabilityCalculator subscriptionPriceArs={commercialPolicy.subscriptionPriceArs} />
      </section>
    </div>
  );
}
