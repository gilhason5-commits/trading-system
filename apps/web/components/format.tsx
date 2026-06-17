import { formatDual, formatPct, formatUsd, type Dual } from "@trading/core";

export { formatDual, formatPct, formatUsd };

/** Colour-coded signed money (USD/ILS) for P&L cells. */
export function PnL({ d }: { d: Dual }) {
  const cls = d.usd > 0 ? "pos" : d.usd < 0 ? "neg" : "";
  return <span className={cls}>{formatDual(d)}</span>;
}

function relativeHe(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins === 0) return "הרגע";
  if (mins < 60) return `לפני ${mins} ד׳`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `לפני ${hrs} ש׳`;
  const days = Math.round(hrs / 24);
  return `לפני ${days} ימים`;
}

/** "עודכן לאחרונה: DD/MM HH:MM · לפני N" — per-page data-freshness stamp (Israel time). */
export function UpdatedNote({ when }: { when: string | null }) {
  if (!when) return <span className="text-xs text-[var(--muted)]">עודכן לאחרונה: —</span>;
  const abs = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(when));
  return (
    <span className="text-xs text-[var(--muted)]">
      עודכן לאחרונה: {abs} · {relativeHe(when)}
    </span>
  );
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
