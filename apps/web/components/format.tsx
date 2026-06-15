import { formatDual, formatPct, formatUsd, type Dual } from "@trading/core";

export { formatDual, formatPct, formatUsd };

/** Colour-coded signed money (USD/ILS) for P&L cells. */
export function PnL({ d }: { d: Dual }) {
  const cls = d.usd > 0 ? "pos" : d.usd < 0 ? "neg" : "";
  return <span className={cls}>{formatDual(d)}</span>;
}

/** Colour-coded percentage. */
export function Pct({ value }: { value: number }) {
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "";
  return <span className={cls}>{formatPct(value)}</span>;
}
