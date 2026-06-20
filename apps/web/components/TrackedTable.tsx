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
  /** Blended buy-conviction 0–100 (≥80 strong buy, ≤20 strong sell), + breakdown. */
  conviction: number | null;
  /** Change in conviction vs the previous run (points). */
  convictionDelta: number | null;
  technical: number | null;
  fundamental: number | null;
  social: number | null;
  /** ISO time + source/claim of the most recent bullish / bearish mention. */
  lastBull: string | null;
  lastBullInfo: MentionInfo | null;
  lastBear: string | null;
  lastBearInfo: MentionInfo | null;
  reinforce_count: number;
  /** Analysis + sources for the detail modal (null if no recommendation found). */
  detail: RecCard | null;
}

export interface MentionInfo {
  source: string;
  claim: string;
  url: string;
}

/** Date cell that reveals the source + what it said on hover. */
function MentionCell({ when, info }: { when: string | null; info: MentionInfo | null }) {
  if (!when) return <span className="text-[var(--muted)]">—</span>;
  if (!info) return <span className="text-[var(--muted)]">{fmtWhen(when)}</span>;
  return (
    <span className="group relative inline-block cursor-help whitespace-nowrap text-[var(--muted)] underline decoration-dotted">
      {fmtWhen(when)}
      <span className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1 w-64 whitespace-normal rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-right text-xs shadow-lg group-hover:visible">
        <span className="font-semibold text-[var(--text)]">{info.source}</span>
        <span className="mt-1 block text-[var(--muted)]">“{info.claim}”</span>
      </span>
    </span>
  );
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

function Conviction({ row }: { row: TrackedRow }) {
  const c = row.conviction;
  if (c === null) return <span className="text-[var(--muted)]">—</span>;
  let cls = "text-[var(--muted)]";
  let label: string;
  if (c >= 80) { cls = "pos"; label = `קנייה חזקה ${c}%`; }
  else if (c >= 60) { cls = "pos"; label = `קנייה ${c}%`; }
  else if (c <= 20) { cls = "neg"; label = `מכירה חזקה ${100 - c}%`; }
  else if (c <= 40) { cls = "neg"; label = `מכירה ${100 - c}%`; }
  else label = `נייטרלי ${c}%`;
  const d = row.convictionDelta;
  const delta =
    d != null && Math.round(d) !== 0 ? (
      <span className={Math.round(d) > 0 ? "pos" : "neg"}>
        {" "}({d > 0 ? "+" : ""}{Math.round(d)}%)
      </span>
    ) : null;
  return (
    <div className="whitespace-nowrap">
      <span className={`font-semibold ${cls}`}>{label}</span>
      {delta}
      <div className="text-[10px] text-[var(--muted)]">
        ט {row.technical ?? "—"} · פ {row.fundamental ?? "—"} · ח {row.social ?? "—"}
      </div>
    </div>
  );
}

export function TrackedTable({ rows }: { rows: TrackedRow[] }) {
  const [open, setOpen] = useState<RecCard | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">אין עדיין מניות במעקב.</p>;
  }

  const headers = ["מניה", "יום", "מחיר כניסה", "נוכחי", "תשואה", "Conviction (ט/פ/ח)", "אזכור חיובי אחרון", "אזכור שלילי אחרון", "חיזוקים"];

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
                <td className="px-3 py-2"><Conviction row={r} /></td>
                <td className="px-3 py-2"><MentionCell when={r.lastBull} info={r.lastBullInfo} /></td>
                <td className="px-3 py-2"><MentionCell when={r.lastBear} info={r.lastBearInfo} /></td>
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
