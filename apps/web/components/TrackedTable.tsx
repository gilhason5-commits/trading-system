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
  sentiment_trend: string;
  reinforce_count: number;
  last_seen_date: string;
  /** Analysis + sources for the detail modal (null if no recommendation found). */
  detail: RecCard | null;
}

const TREND_LABEL: Record<string, string> = {
  new: "חדש",
  strengthened: "התחזק ↑",
  weakened: "נחלש ↓",
  stable: "יציב",
};

export function TrackedTable({ rows }: { rows: TrackedRow[] }) {
  const [open, setOpen] = useState<RecCard | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">אין עדיין מניות במעקב.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              {["מניה", "יום", "מחיר כניסה", "מחיר נוכחי", "תשואה", "סנטימנט", "חיזוקים", "נראה לאחרונה"].map((h) => (
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
                <td className="px-3 py-2">
                  <span className={r.sentiment_trend === "strengthened" ? "pos" : r.sentiment_trend === "weakened" ? "neg" : ""}>
                    {TREND_LABEL[r.sentiment_trend] ?? r.sentiment_trend}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.reinforce_count > 0 ? (
                    <span className="rounded bg-[var(--pos)] px-2 py-0.5 text-xs font-semibold text-black">×{r.reinforce_count}</span>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{r.last_seen_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <RecDetailModal card={open} onClose={() => setOpen(null)} />}
    </>
  );
}
