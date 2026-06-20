"use client";

import { useState } from "react";
import type { PaperThesis } from "@trading/core";
import { ThesisFlow } from "@/components/PaperTradeLog";

// Buy bar (mirror of BUY_BAR in core's thesis stage) for the progress display.
const BUY_BAR = 70;

export function PaperTheses({ theses }: { theses: PaperThesis[] }) {
  const [open, setOpen] = useState<PaperThesis | null>(null);
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
              <p className="mt-2 text-xs text-[var(--pos)]">תרשים זרימה ←</p>
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
              עוצמה {open.strength}/{BUY_BAR} · {open.days} ימי בנייה. כשהעוצמה תעבור את הסף — קנייה אוטומטית.
            </p>
            <ThesisFlow steps={open.steps} />
          </div>
        </div>
      )}
    </>
  );
}
