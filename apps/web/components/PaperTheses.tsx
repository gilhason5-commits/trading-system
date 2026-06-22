"use client";

import { useState } from "react";
import type { ThesisView } from "@/lib/paperPortfolio";
import { ThesisFlow } from "@/components/PaperTradeLog";
import { TradingViewChart } from "@/components/TradingViewChart";

// Buy bar (mirror of BUY_BAR in core's thesis stage) for the progress display.
const BUY_BAR = 80;

const PLATFORM_LABEL: Record<string, string> = {
  x: "X", youtube: "יוטיוב", tiktok: "טיקטוק", instagram: "אינסטגרם", rss: "RSS",
};

export function PaperTheses({ theses }: { theses: ThesisView[] }) {
  const [open, setOpen] = useState<ThesisView | null>(null);
  if (theses.length === 0) {
    return <p className="text-sm text-[var(--muted)]">אין כרגע תזות בבנייה.</p>;
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {theses.map((t) => {
          const pct = Math.min(100, Math.round((t.strength / BUY_BAR) * 100));
          const ready = t.strength >= BUY_BAR;
          return (
            <button
              key={t.id}
              onClick={() => setOpen(t)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-right transition-colors hover:border-[var(--pos)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{t.ticker}</span>
                <span className="text-xs text-[var(--muted)]">{t.days} ימי בנייה</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={ready ? "pos" : "text-[var(--muted)]"}>
                  עוצמה {t.strength}/{BUY_BAR} {ready ? "· מוכן לקנייה" : ""}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--background)]">
                <div className={`h-full ${ready ? "bg-[var(--pos)]" : "bg-[var(--muted)]"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-[var(--muted)]">🔗 {t.sources.length} מקורות</span>
                <span className="pos">▲ {t.bull}</span>
                <span className="neg">▼ {t.bear}</span>
                {t.manipulation && <span className="neg font-semibold">⚠️ חשד מניפולציה</span>}
              </div>
              <p className="mt-2 text-xs text-[var(--pos)]">תרשים זרימה ומקורות ←</p>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(null)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xl font-bold">{open.ticker} — תזה בבנייה</span>
              <button onClick={() => setOpen(null)} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">
              עוצמה {open.strength}/{BUY_BAR} · {open.days} ימי בנייה
              {open.conviction != null ? ` · קונביקשן ${open.conviction}%` : ""}. כשהעוצמה תעבור את הסף — קנייה אוטומטית.
            </p>

            <TradingViewChart symbol={open.ticker} />
            <p className="mb-3 mt-2 text-xs text-[var(--muted)]">
              אינדיקטורים בגרף: <b>SMA50/200</b> (מגמה ותמיכה) · <b>RSI</b> (קנוי/מכור-יתר) · <b>MACD</b> (מומנטום).
              הקריאה הטכנית המילולית — ואם היא <b>מאשרת</b> או <b>מחלישה</b> את התזה — בצעד "ניתוח טכני" בתרשים הזרימה למטה.
            </p>

            {open.manipulation && (
              <div className="mb-3 rounded-lg border border-[var(--neg)] p-3 text-sm">
                <span className="neg font-semibold">⚠️ דגל חשד מניפולציה</span>
                <span className="text-[var(--muted)]"> — המערכת סימנה את הטיקר כחשוד. בדוק את המקורות לפני שאתה סומך על התזה.</span>
              </div>
            )}

            <ThesisFlow steps={open.steps} />

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">מקורות ואזכורים ({open.sources.length})</h3>
                <span className="text-xs"><span className="pos">▲ {open.bull} חיוביים</span> · <span className="neg">▼ {open.bear} שליליים</span></span>
              </div>
              {open.sources.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">אין מקורות חברתיים — התזה נשענת על טכני/פונדמנטלי בלבד.</p>
              ) : (
                <ul className="space-y-2">
                  {open.sources.map((q, i) => (
                    <li key={i} className="text-sm">
                      <span className={q.sentiment === "bullish" ? "pos" : q.sentiment === "bearish" ? "neg" : "text-[var(--muted)]"}>
                        {q.sentiment === "bullish" ? "▲" : q.sentiment === "bearish" ? "▼" : "•"}
                      </span>{" "}
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
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
