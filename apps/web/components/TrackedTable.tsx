"use client";

import { useState } from "react";
import { RecDetailModal, type RecCard } from "@/components/RecommendationGrid";
import { Pct } from "@/components/format";

export interface TrackedRow {
  id: string;
  ticker: string;
  dayN: number;
  entry_price: number | null;
  entry_currency: string | null;
  current: number | null;
  ret: number | null;
  /** % of bull/bear mentions that are bullish (buy lean); null if no signed mentions. */
  buyPct: number | null;
  /** ISO time of the most recent bullish / bearish mention. */
  lastBull: string | null;
  lastBear: string | null;
  reinforce_count: number;
  /** Analysis + sources for the detail modal (null if no recommendation found). */
  detail: RecCard | null;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function Sentiment({ buyPct }: { buyPct: number | null }) {
  if (buyPct === null) return <span className="text-[var(--muted)]">—</span>;
  const sellPct = 100 - buyPct;
  return (
    <span className="whitespace-nowrap font-semibold">
      <span className="pos">▲{buyPct}% קנייה</span>
      <span className="text-[var(--muted)]"> · </span>
      <span className="neg">▼{sellPct}% מכירה</span>
    </span>
  );
}

export function TrackedTable({ rows }: { rows: TrackedRow[] }) {
  const [open, setOpen] = useState<RecCard | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">אין עדיין מניות במעקב.</p>;
  }

  const headers = ["מניה", "יום", "מחיר כניסה", "נוכחי", "תשואה", "סנטימנט (קנייה/מכירה)", "אזכור חיובי אחרון", "אזכור שלילי אחרון", "חיזוקים"];

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-semibold">
                  {r.detail ? (
                    <button onClick={() => setOpen(r.detail)} className="text-[var(--pos)] hover:underline">
                      {r.ticker}
                    </button>
                  ) : (
                    r.ticker
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{r.dayN}/7</td>
                <td className="px-3 py-2">{r.entry_price ? `${r.entry_price.toLocaleString()} ${r.entry_currency ?? ""}` : "—"}</td>
                <td className="px-3 py-2">{r.current !== null ? r.current.toLocaleString() : "—"}</td>
                <td className="px-3 py-2">{r.ret !== null ? <Pct value={r.ret} /> : "—"}</td>
                <td className="px-3 py-2"><Sentiment buyPct={r.buyPct} /></td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--muted)]">{fmtWhen(r.lastBull)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--muted)]">{fmtWhen(r.lastBear)}</td>
                <td className="px-3 py-2">
                  {r.reinforce_count > 0 ? (
                    <span className="rounded bg-[var(--pos)] px-2 py-0.5 text-xs font-semibold text-black">×{r.reinforce_count}</span>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <RecDetailModal card={open} onClose={() => setOpen(null)} />}
    </>
  );
}
