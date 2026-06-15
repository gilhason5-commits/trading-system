import type { Currency, Dual } from "./types.ts";

// USD is the base currency for all computation; ILS is derived for display (spec §1).

/** Convert a native amount to a USD+ILS dual given the current USD/ILS rate. */
export function toDual(
  amount: number,
  currency: Currency,
  usdIls: number,
): Dual {
  if (currency === "USD") {
    return { usd: amount, ils: amount * usdIls };
  }
  // amount is in ILS → divide by rate to get USD
  return { usd: amount / usdIls, ils: amount };
}

/** Convert any native amount to USD base. */
export function toUsd(amount: number, currency: Currency, usdIls: number): number {
  return currency === "USD" ? amount : amount / usdIls;
}

export function addDual(a: Dual, b: Dual): Dual {
  return { usd: a.usd + b.usd, ils: a.ils + b.ils };
}

export function zeroDual(): Dual {
  return { usd: 0, ils: 0 };
}

export function sumDual(items: Dual[]): Dual {
  return items.reduce(addDual, zeroDual());
}

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const ilsFmt = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

/** Render a dual amount as "$X / ₪Y" (spec §5). */
export function formatDual(d: Dual): string {
  return `${usdFmt.format(d.usd)} / ${ilsFmt.format(d.ils)}`;
}

export function formatUsd(n: number): string {
  return usdFmt.format(n);
}

export function formatIls(n: number): string {
  return ilsFmt.format(n);
}

export function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
