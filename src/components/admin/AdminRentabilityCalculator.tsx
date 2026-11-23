"use client";

import { useMemo, useState } from "react";

import { formatArs } from "@/lib/pricing-constants";

import styles from "./AdminRentabilityCalculator.module.css";

interface PricingModel {
  listPrice: number;
  mpNeto: number;
  mpFee: number;
  firstCommission: number;
  recurringCommission: number;
  netFirstMonth: number;
  netRecurringMonth: number;
}

interface MonthData {
  bruto: number;
  mpFeeTotal: number;
  mpNeto: number;
  commVend: number;
  ganancia: number;
  recurrentClients: number;
  newClients: number;
  totalClients: number;
}

interface ProjectionRow {
  month: number;
  clients: number;
  actualNew: number;
  bruto: number;
  mpFeeTotal: number;
  mpNeto: number;
  commVend: number;
  ganancia: number;
}

function cx(...classNames: Array<keyof typeof styles>) {
  return classNames.map((className) => styles[className]).join(" ");
}

function computeMonth(totalClients: number, newClients: number, pricing: PricingModel): MonthData {
  const recurrentClients = totalClients - newClients;
  const bruto = totalClients * pricing.listPrice;
  const mpFeeTotal = totalClients * pricing.mpFee;
  const mpNeto = totalClients * pricing.mpNeto;
  const commVend = newClients * pricing.firstCommission + recurrentClients * pricing.recurringCommission;
  const ganancia = mpNeto - commVend;

  return {
    bruto,
    mpFeeTotal,
    mpNeto,
    commVend,
    ganancia,
    recurrentClients,
    newClients,
    totalClients,
  };
}

function computeProjection(
  startClients: number,
  newPerMonth: number,
  months: number,
  pricing: PricingModel,
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let clients = startClients;

  for (let month = 1; month <= months; month += 1) {
    const actualNew = newPerMonth;

    if (month > 1) {
      clients += newPerMonth;
    }

    const recurrentClients = clients - actualNew;
    const bruto = clients * pricing.listPrice;
    const mpFeeTotal = clients * pricing.mpFee;
    const mpNeto = clients * pricing.mpNeto;
    const commVend = actualNew * pricing.firstCommission + recurrentClients * pricing.recurringCommission;
    const ganancia = mpNeto - commVend;

    rows.push({
      month,
      clients,
      actualNew,
      bruto,
      mpFeeTotal,
      mpNeto,
      commVend,
      ganancia,
    });
  }

  return rows;
}

export default function AdminRentabilityCalculator({
  subscriptionPriceArs,
}: {
  subscriptionPriceArs: number;
}) {
  const [totalClients, setTotalClients] = useState(100);
  const [newClients, setNewClients] = useState(20);

  const pricing = useMemo<PricingModel>(() => {
    // Estimación proporcional basada en el neto histórico acreditado por Mercado Pago.
    const mpNeto = Math.round(subscriptionPriceArs * (13709.98 / 14900));
    const firstCommission = Math.round(subscriptionPriceArs * 0.5);
    const recurringCommission = Math.round(subscriptionPriceArs * 0.3);
    return {
      listPrice: subscriptionPriceArs,
      mpNeto,
      mpFee: subscriptionPriceArs - mpNeto,
      firstCommission,
      recurringCommission,
      netFirstMonth: mpNeto - firstCommission,
      netRecurringMonth: mpNeto - recurringCommission,
    };
  }, [subscriptionPriceArs]);

  const effectiveNew = Math.min(newClients, totalClients);
  const data = useMemo(
    () => computeMonth(totalClients, effectiveNew, pricing),
    [effectiveNew, pricing, totalClients],
  );
  const projection = useMemo(
    () => computeProjection(totalClients, effectiveNew, 12, pricing),
    [effectiveNew, pricing, totalClients],
  );

  const pctGanancia = data.bruto > 0 ? Math.round((data.ganancia / data.bruto) * 100) : 0;
  const pctMp = data.bruto > 0 ? Math.round((data.mpFeeTotal / data.bruto) * 100) : 0;
  const pctVend = data.bruto > 0 ? Math.round((data.commVend / data.bruto) * 100) : 0;
  const maxProjection = Math.max(
    ...projection.map((row) => Math.max(row.ganancia, row.mpNeto)),
    1,
  );

  return (
    <div className={styles["admin-calc"]}>
      <div className={styles["admin-calc__header"]}>
        <h3 className={styles["admin-calc__title"]}>Panel de rentabilidad</h3>
        <p className={styles["admin-calc__subtitle"]}>
          Desglose real por cliente: precio de lista, comision de MercadoPago y
          comisiones de vendedores.
        </p>
      </div>

      <div className={styles["admin-calc__waterfall"]}>
        <div className={styles["admin-calc__waterfall-title"]}>
          Cascada de ingresos - primera factura (por cliente)
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Precio de lista
            <small>lo que paga el cliente</small>
          </span>
          <span className={cx("wf-val", "wf-val--base")}>{formatArs(pricing.listPrice)}</span>
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Comision MercadoPago
            <small>~8% aprox - suscripcion</small>
          </span>
          <span className={cx("wf-val", "wf-val--neg")}>
            - {formatArs(pricing.mpFee)}
            <span className={styles["wf-pct"]}>
              {Math.round((pricing.mpFee / pricing.listPrice) * 100)}%
            </span>
          </span>
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Neto recibido de MP
            <small>acreditado en tu cuenta</small>
          </span>
          <span className={cx("wf-val", "wf-val--base")}>{formatArs(pricing.mpNeto)}</span>
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Comision vendedor - primera factura
            <small>{Math.round((pricing.firstCommission / pricing.listPrice) * 100)}% del precio de lista</small>
          </span>
          <span className={cx("wf-val", "wf-val--neg")}>
            - {formatArs(pricing.firstCommission)}
            <span className={styles["wf-pct"]}>
              {Math.round((pricing.firstCommission / pricing.listPrice) * 100)}%
            </span>
          </span>
        </div>
        <div className={cx("wf-row", "wf-row--total")}>
          <span className={cx("wf-label", "wf-label--total")}>Te queda - mes 1</span>
          <span className={cx("wf-val", "wf-val--result")}>{formatArs(pricing.netFirstMonth)}</span>
        </div>
      </div>

      <div className={styles["admin-calc__waterfall"]}>
        <div className={styles["admin-calc__waterfall-title"]}>
          Cascada de ingresos - factura recurrente (mes 2+)
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Precio de lista
            <small>lo que paga el cliente</small>
          </span>
          <span className={cx("wf-val", "wf-val--base")}>{formatArs(pricing.listPrice)}</span>
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Comision MercadoPago
            <small>~8% aprox - suscripcion</small>
          </span>
          <span className={cx("wf-val", "wf-val--neg")}>
            - {formatArs(pricing.mpFee)}
            <span className={styles["wf-pct"]}>
              {Math.round((pricing.mpFee / pricing.listPrice) * 100)}%
            </span>
          </span>
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Neto recibido de MP
            <small>acreditado en tu cuenta</small>
          </span>
          <span className={cx("wf-val", "wf-val--base")}>{formatArs(pricing.mpNeto)}</span>
        </div>
        <div className={styles["wf-row"]}>
          <span className={styles["wf-label"]}>
            Comision vendedor - recurrente
            <small>{Math.round((pricing.recurringCommission / pricing.listPrice) * 100)}% del precio de lista</small>
          </span>
          <span className={cx("wf-val", "wf-val--neg")}>
            - {formatArs(pricing.recurringCommission)}
            <span className={styles["wf-pct"]}>
              {Math.round((pricing.recurringCommission / pricing.listPrice) * 100)}%
            </span>
          </span>
        </div>
        <div className={cx("wf-row", "wf-row--total")}>
          <span className={cx("wf-label", "wf-label--total")}>Te queda - mes 2+</span>
          <span className={cx("wf-val", "wf-val--result2")}>
            {formatArs(pricing.netRecurringMonth)}
          </span>
        </div>
      </div>

      <div className={styles["admin-calc__sliders"]}>
        <div className={styles["slider-group"]}>
          <label className={styles["slider-group__label"]}>
            Clientes activos totales
            <span className={styles["slider-group__value"]}>
              {totalClients} {totalClients === 1 ? "cliente" : "clientes"}
            </span>
          </label>
          <input
            type="range"
            className={cx("slider-group__input", "slider-group__input--teal")}
            min={1}
            max={500}
            value={totalClients}
            onChange={(event) => setTotalClients(Number(event.target.value))}
          />
        </div>
        <div className={styles["slider-group"]}>
          <label className={styles["slider-group__label"]}>
            Nuevos clientes ese mes
            <span className={styles["slider-group__value"]}>
              {effectiveNew} {effectiveNew === 1 ? "nuevo" : "nuevos"}
            </span>
          </label>
          <input
            type="range"
            className={cx("slider-group__input", "slider-group__input--teal")}
            min={0}
            max={100}
            value={newClients}
            onChange={(event) => setNewClients(Number(event.target.value))}
          />
        </div>
      </div>

      <div className={styles["admin-calc__metrics"]}>
        <div className={cx("metric-card", "metric-card--teal")}>
          <div className={styles["metric-card__label"]}>Tu ganancia neta</div>
          <div className={styles["metric-card__value"]}>{formatArs(data.ganancia)}</div>
          <div className={styles["metric-card__sub"]}>
            {pctGanancia}% del bruto - {totalClients} clientes
          </div>
        </div>
        <div className={cx("metric-card", "metric-card--teal2")}>
          <div className={styles["metric-card__label"]}>Por cliente recurrente</div>
          <div className={styles["metric-card__value"]}>
            {formatArs(pricing.netRecurringMonth)}
          </div>
          <div className={styles["metric-card__sub"]}>mes 2 en adelante</div>
        </div>
        <div className={cx("metric-card", "metric-card--red")}>
          <div className={styles["metric-card__label"]}>Comision MP total</div>
          <div className={styles["metric-card__value"]}>{formatArs(data.mpFeeTotal)}</div>
          <div className={styles["metric-card__sub"]}>{pctMp}% del bruto</div>
        </div>
        <div className={cx("metric-card", "metric-card--blue")}>
          <div className={styles["metric-card__label"]}>Comision vendedores</div>
          <div className={styles["metric-card__value"]}>{formatArs(data.commVend)}</div>
          <div className={styles["metric-card__sub"]}>{pctVend}% del bruto</div>
        </div>
      </div>

      <div className={styles["admin-calc__chart-wrap"]}>
        <div className={styles["admin-calc__chart-title"]}>
          Distribucion del ingreso bruto del mes
        </div>
        <div className={styles["chart-legend"]}>
          <span className={styles["chart-legend__item"]}>
            <span className={cx("chart-legend__dot", "chart-legend__dot--teal")} />
            Tu ganancia neta
          </span>
          <span className={styles["chart-legend__item"]}>
            <span className={cx("chart-legend__dot", "chart-legend__dot--green")} />
            Comision vendedores
          </span>
          <span className={styles["chart-legend__item"]}>
            <span className={cx("chart-legend__dot", "chart-legend__dot--red")} />
            Comision MP
          </span>
        </div>
        <div className={styles["h-bar-wrap"]}>
          <div className={styles["h-bar"]}>
            <div
              className={cx("h-bar__seg", "h-bar__seg--teal")}
              style={{
                width: `${data.bruto > 0 ? (data.ganancia / data.bruto) * 100 : 0}%`,
              }}
            />
            <div
              className={cx("h-bar__seg", "h-bar__seg--green")}
              style={{
                width: `${data.bruto > 0 ? (data.commVend / data.bruto) * 100 : 0}%`,
              }}
            />
            <div
              className={cx("h-bar__seg", "h-bar__seg--red")}
              style={{
                width: `${data.bruto > 0 ? (data.mpFeeTotal / data.bruto) * 100 : 0}%`,
              }}
            />
          </div>
          <div className={styles["h-bar-labels"]}>
            <span>
              Tu ganancia:{" "}
              {data.bruto > 0 ? Math.round((data.ganancia / data.bruto) * 100) : 0}%
            </span>
            <span>
              Vendedores:{" "}
              {data.bruto > 0 ? Math.round((data.commVend / data.bruto) * 100) : 0}%
            </span>
            <span>
              MP: {data.bruto > 0 ? Math.round((data.mpFeeTotal / data.bruto) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>

      <div className={styles["admin-calc__chart-wrap"]}>
        <div className={styles["admin-calc__chart-title"]}>
          Proyeccion acumulada - tu ganancia mensual si creces a este ritmo (12 meses)
        </div>
        <div className={styles["chart-legend"]}>
          <span className={styles["chart-legend__item"]}>
            <span className={cx("chart-legend__dot", "chart-legend__dot--teal")} />
            Tu ganancia neta mensual
          </span>
          <span className={styles["chart-legend__item"]}>
            <span className={cx("chart-legend__line", "chart-legend__line--green")} />
            Ingreso bruto MP
          </span>
        </div>
        <div className={styles["chart-bars"]}>
          {projection.map((row) => {
            const pctGananciaBar = (row.ganancia / maxProjection) * 100;
            const pctBrutoBar = (row.mpNeto / maxProjection) * 100;

            return (
              <div
                key={row.month}
                className={styles["chart-bars__col"]}
                title={`Mes ${row.month}: ${formatArs(row.ganancia)}`}
              >
                <div className={styles["chart-bars__dual"]}>
                  <div
                    className={cx("chart-bars__bar", "chart-bars__bar--teal")}
                    style={{ height: `${pctGananciaBar}%` }}
                  />
                  <div
                    className={cx("chart-bars__bar", "chart-bars__bar--outline")}
                    style={{ height: `${pctBrutoBar}%` }}
                  />
                </div>
                <span className={styles["chart-bars__label"]}>M{row.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles["admin-calc__table-wrap"]}>
        <div className={styles["admin-calc__table-header"]}>
          Proyeccion mes a mes - 12 meses desde hoy
        </div>
        <table className={styles["admin-calc__table"]}>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Clientes</th>
              <th>Nuevos</th>
              <th>Bruto MP</th>
              <th>- MP fee</th>
              <th>- Vendedores</th>
              <th>Tu ganancia</th>
            </tr>
          </thead>
          <tbody>
            {projection.map((row) => (
              <tr key={row.month}>
                <td>Mes {row.month}</td>
                <td>{row.clients}</td>
                <td>{row.actualNew}</td>
                <td>{formatArs(row.bruto)}</td>
                <td className={styles.neg}>-{formatArs(row.mpFeeTotal)}</td>
                <td className={styles.neg}>-{formatArs(row.commVend)}</td>
                <td className={styles["total-col"]}>{formatArs(row.ganancia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
