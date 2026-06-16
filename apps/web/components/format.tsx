import { formatDual, formatPct, formatUsd, type Dual } from "@trading/core";

export { formatDual, formatPct, formatUsd };

/** Colour-coded signed money (USD/ILS) for P&L cells. */
export function PnL({ d }: { d: Dual }) {
  const cls = d.usd > 0 ? "pos" : d.usd < 0 ? "neg" : "";
  return <span className={cls}>{formatDual(d)}</span>;
}

/** Hebrew "updated N minutes ago" label for a cached-quote timestamp. */
export function sinceLabel(iso: string | null): string {
  if (!iso) return "טרם עודכנו (ממתין לרענון רקע)";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins === 0) return "עודכנו הרגע";
  if (mins === 1) return "עודכנו לפני דקה";
  if (mins < 60) return `עודכנו לפני ${mins} דקות`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? "עודכנו לפני שעה" : `עודכנו לפני ${hrs} שעות`;
}

/** Colour-coded percentage. */
export function Pct({ value }: { value: number }) {
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "";
  return <span className={cls}>{formatPct(value)}</span>;
}
