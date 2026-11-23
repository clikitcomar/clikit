"use client";

import { useEffect, useState } from "react";

export function usePlatformSubscriptionPrice() {
  const [priceArs, setPriceArs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/subscription/pricing", { cache: "no-store" });
        if (!response.ok) return;

        const data = await response.json();
        const amount = Number(data?.subscriptionPriceArs);
        if (!cancelled && Number.isSafeInteger(amount) && amount > 0) {
          setPriceArs(amount);
        }
      } catch {
        // Keep the price unset rather than showing a stale hardcoded amount.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return priceArs;
}
