export function formatSubscriptionPrice(amountArs: number) {
  return `$${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(amountArs)}`;
}

export function getSubscriptionPromoLabel(amountArs: number) {
  return `Activalo por ${formatSubscriptionPrice(amountArs)} por mes.`;
}

export const SUBSCRIPTION_CANCEL_LABEL = "Si no es para vos, podes cancelar cuando quieras.";
