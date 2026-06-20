"use client";

import { useState } from "react";
import type { PaperTrade, TradeDossier } from "@trading/core";
import { TradingViewChart } from "@/components/TradingViewChart";

const PLATFORM_LABEL: Record<string, string> = {
  youtube: "🎬 יוטיוב",
  tiktok: "🎬 טיקטוק",
  instagram: "📷 אינסטגרם",
  x: "𝕏",
  rss: "📰 כתבה",
};

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function parseDossier(raw: string | null): TradeDossier | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TradeDossier;
  } catch {
    return null;
  }
}

export function PaperTradeLog({ trades }: { trades: PaperTrade[] }) {
  const [open, setOpen] = useState<PaperTrade | null>(null);

  if (trades.length === 0) {
    return <p className="text-sm text-[var(--muted)]">עדיין לא בוצעו פעולות.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              {["תאריך", "פעולה", "טיקר", "כמות", "מחיר", "שווי", "Conviction", "סיבה", ""].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr
                key={t.id}
                onClick={() => setOpen(t)}
                className="cursor-pointer border-t border-[var(--border)] align-top transition-colors hover:bg-[var(--surface)]"
              >
                <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{t.date}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      t.action === "buy" ? "bg-[var(--pos)] text-black" : "bg-[var(--neg)] text-white"
                    }`}
                  >
                    {t.action === "buy" ? "קנייה" : "מכירה"}
                  </span>
                </td>
                <td className="px-3 py-2 font-semibold">{t.ticker}</td>
                <td className="px-3 py-2">{t.qty}</td>
                <td className="whitespace-nowrap px-3 py-2">{t.price.toLocaleString()} {t.currency}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtUsd(t.value_usd)}</td>
                <td className="px-3 py-2">{t.conviction != null ? `${t.conviction}%` : "—"}</td>
                <td className="max-w-md px-3 py-2 text-[var(--muted)]">{t.reason}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[var(--pos)]">פירוט ←</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <DossierModal trade={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function DossierModal({ trade, onClose }: { trade: PaperTrade; onClose: () => void }) {
  const d = parseDossier(trade.analysis);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                trade.action === "buy" ? "bg-[var(--pos)] text-black" : "bg-[var(--neg)] text-white"
              }`}
            >
              {trade.action === "buy" ? "קנייה" : "מכירה"}
            </span>
            <span className="text-2xl font-bold">{trade.ticker}</span>
            <span className="text-sm text-[var(--muted)]">
              {trade.date} · {trade.qty} × {trade.price.toLocaleString()} {trade.currency} = {fmtUsd(trade.value_usd)}
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>

        <p className="mb-4 text-sm">{trade.reason}</p>

        {/* Chart + technical overlays */}
        <div className="mb-4">
          <div className="mb-1 text-xs font-semibold text-[var(--muted)]">📈 גרף + ניתוח טכני (SMA50 · SMA200 · RSI · MACD)</div>
          <TradingViewChart symbol={trade.ticker} />
        </div>

        {!d ? (
          <p className="text-sm text-[var(--muted)]">אין נתוני ניתוח שמורים לפעולה זו.</p>
        ) : (
          <div className="space-y-4">
            {d.market.summary && (
              <Box title="מצב שוק (מחקר לפני הפעולה)">
                <p className="text-sm">
                  <span className="font-semibold">{regimeHe(d.market.regime)}</span> — {d.market.summary}
                </p>
              </Box>
            )}

            <Box title="דירוג מכל הבחינות">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Metric label="טכני" value={d.scores.technical} />
                <Metric label="פונדמנטלי" value={d.scores.fundamental} />
                <Metric label="חברתי" value={d.scores.social} />
                <Metric label="conviction" value={d.scores.conviction} strong />
              </div>
              {(d.scores.delta != null && Math.round(d.scores.delta) !== 0) || d.scores.reinforce > 0 ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {d.scores.delta != null && Math.round(d.scores.delta) !== 0
                    ? `שינוי conviction: ${d.scores.delta > 0 ? "+" : ""}${Math.round(d.scores.delta)}% · `
                    : ""}
                  {d.scores.reinforce > 0 ? `חיזוקים ×${d.scores.reinforce}` : ""}
                </p>
              ) : null}
            </Box>

            {d.plan && (
              <Box title="תוכנית יציאה (נקבעה בכניסה)">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-[var(--muted)]">סטופ-לוס</div>
                    <div className="font-semibold neg">{d.plan.stop_price} ({d.plan.stop_pct}%)</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted)]">יעד מימוש</div>
                    <div className="font-semibold pos">{d.plan.target_price} (+{d.plan.target_pct}%)</div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">{d.plan.exit_rule}</p>
              </Box>
            )}

            {d.ret_pct != null && (
              <Box title="תשואה ביציאה">
                <p className={`text-lg font-bold ${d.ret_pct >= 0 ? "pos" : "neg"}`}>
                  {d.ret_pct >= 0 ? "+" : ""}{d.ret_pct.toFixed(1)}%
                </p>
              </Box>
            )}

            {d.analyst && (
              <Box title="תחזיות אנליסטים">
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Field label="יעד ממוצע" value={d.analyst.target_mean != null ? `$${d.analyst.target_mean}` : "—"} />
                  <Field label="טווח" value={d.analyst.target_low != null && d.analyst.target_high != null ? `$${d.analyst.target_low}–$${d.analyst.target_high}` : "—"} />
                  <Field label="פוטנציאל" value={d.analyst.upside_pct != null ? `${d.analyst.upside_pct.toFixed(1)}%` : "—"} />
                  <Field label="קונצנזוס" value={d.analyst.recommendation ?? "—"} />
                </div>
                {d.analyst.big_banks.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-[var(--muted)]">
                    {d.analyst.big_banks.map((b, i) => <li key={i}>• {b}</li>)}
                  </ul>
                )}
              </Box>
            )}

            {d.quotes.length > 0 && (
              <Box title="ציטוטים ומקורות מהרשת">
                <ul className="space-y-2">
                  {d.quotes.map((q, i) => (
                    <li key={i} className="text-sm">
                      <span className="text-xs text-[var(--muted)]">{PLATFORM_LABEL[q.platform] ?? q.platform} · </span>
                      {q.url ? (
                        <a href={q.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{q.handle}</a>
                      ) : (
                        <span className="font-semibold">{q.handle}</span>
                      )}
                      {q.claim && <span className="text-[var(--muted)]"> — “{q.claim}”</span>}
                    </li>
                  ))}
                </ul>
              </Box>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-2 text-xs font-semibold text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  const cls = value == null ? "text-[var(--muted)]" : value >= 60 ? "pos" : value <= 40 ? "neg" : "";
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`font-semibold ${strong ? "text-base" : ""} ${cls}`}>{value ?? "—"}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function regimeHe(regime: string): string {
  return regime === "risk_on" ? "סיכון-און" : regime === "risk_off" ? "סיכון-אוף" : "ניטרלי";
}
