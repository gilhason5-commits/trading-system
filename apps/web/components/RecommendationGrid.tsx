"use client";

import { useState } from "react";
import { TradingViewChart } from "@/components/TradingViewChart";

export interface TrailItem {
  type: string;
  handle: string;
  claim: string;
  url: string;
}

export interface RecCard {
  id: string;
  /** 0-based position in the day's ranking (top picks first). */
  rank: number;
  ticker: string;
  date: string;
  system_score: number;
  social_score: number;
  manipulation_flag: boolean;
  rationale: string;
  verified_sources: string[];
  trail: TrailItem[];
  sources: string[];
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--background)]">
        <div className="h-full bg-[var(--pos)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/** Shared detail modal: scores, rationale, (chart for top picks), trail + sources. */
export function RecDetailModal({ card, onClose }: { card: RecCard; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 ${
          card.rank < 3 ? "max-w-2xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">{card.ticker}</span>
            <span className="text-xs text-[var(--muted)]">{card.date}</span>
            {card.sources.length >= 2 && (
              <span className="rounded bg-[var(--pos)] px-2 py-0.5 text-xs font-semibold text-black">
                🔥 {card.sources.length} מקורות
              </span>
            )}
            {card.manipulation_flag && (
              <span className="rounded bg-[var(--neg)] px-2 py-0.5 text-xs font-semibold text-white">
                ⚠ חשד מניפולציה
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <ScoreBar label="ציון מערכת" value={card.system_score} />
          <ScoreBar label="ציון חברתי" value={card.social_score} />
        </div>

        <p className="mb-4 text-sm text-[var(--muted)]">{card.rationale}</p>

        {card.rank < 3 && (
          <div className="mb-4">
            <div className="mb-1 text-xs font-semibold text-[var(--muted)]">
              📈 גרף + ניתוח טכני (SMA50 · SMA200 · RSI · MACD)
            </div>
            <TradingViewChart symbol={card.ticker} />
          </div>
        )}

        <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="text-xs font-semibold text-[var(--muted)]">מסלול החשיבה</div>
          <div>
            <div className="text-xs text-[var(--muted)]">מאיפה הגיע:</div>
            {card.trail.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">—</div>
            ) : (
              <ul className="mt-1 space-y-1">
                {card.trail.map((it, i) => (
                  <li key={i} className="text-sm">
                    <span>{it.type}</span> ·{" "}
                    <a href={it.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                      {it.handle}
                    </a>
                    {it.claim && <span className="text-[var(--muted)]"> — “{it.claim}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">איפה אומת:</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {card.verified_sources.map((v, i) => (
                <span key={i} className="rounded bg-[var(--surface)] px-2 py-0.5 text-xs">✓ {v}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecommendationGrid({ cards }: { cards: RecCard[] }) {
  const [open, setOpen] = useState<RecCard | null>(null);

  if (cards.length === 0) {
    return <p className="text-sm text-[var(--muted)]">אין המלצות מאומתות עדיין.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((rec, idx) => (
          <button
            key={rec.id}
            onClick={() => setOpen(rec)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-right transition-colors hover:border-[var(--pos)]"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm text-[var(--muted)]">#{idx + 1}</span>
              <span className="text-lg font-bold">{rec.ticker}</span>
              {rec.sources.length >= 2 && (
                <span className="rounded bg-[var(--pos)] px-2 py-0.5 text-xs font-semibold text-black">
                  🔥 {rec.sources.length}
                </span>
              )}
              {rec.manipulation_flag && (
                <span className="rounded bg-[var(--neg)] px-2 py-0.5 text-xs font-semibold text-white">⚠</span>
              )}
            </div>
            <div className="space-y-2">
              <ScoreBar label="ציון מערכת" value={rec.system_score} />
              <ScoreBar label="ציון חברתי" value={rec.social_score} />
            </div>
            <p className="mt-3 line-clamp-2 text-xs text-[var(--muted)]">{rec.rationale}</p>
            <p className="mt-2 text-xs text-[var(--pos)]">לחץ לפרטים ←</p>
          </button>
        ))}
      </div>

      {open && <RecDetailModal card={open} onClose={() => setOpen(null)} />}
    </>
  );
}
