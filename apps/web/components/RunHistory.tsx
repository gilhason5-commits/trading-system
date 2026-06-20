"use client";

import { useState } from "react";
import type { Run } from "@trading/core";
import { formatUsd } from "@trading/core";

function ProviderBadge({ providers }: { providers?: string | null }) {
  if (!providers) return <span className="text-[var(--muted)]">—</span>;
  const has = (p: string) => providers.toLowerCase().includes(p);
  return (
    <span className="inline-flex gap-1">
      {has("claude") && <span className="rounded bg-[var(--pos)] px-1.5 py-0.5 text-[10px] font-semibold text-black">Claude</span>}
      {has("grok") && <span className="rounded bg-[#7c3aed] px-1.5 py-0.5 text-[10px] font-semibold text-white">Grok</span>}
      {has("mock") && <span className="rounded bg-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">Mock</span>}
    </span>
  );
}

export function RunHistory({ runs }: { runs: Run[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...runs].sort((a, b) => (b.started_at ?? b.date).localeCompare(a.started_at ?? a.date));

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-[var(--pos)] hover:underline">
        היסטוריית ריצות ↗
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">היסטוריית ריצות — עלות ומנוע (Claude/Grok)</h2>
              <button onClick={() => setOpen(false)} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
            {sorted.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">אין ריצות עדיין.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--background)] text-[var(--muted)]">
                    <tr>
                      {["תאריך", "סטטוס", "מנוע", "טוקנים (in/out)", "Claude/Grok", "סקרייפינג", 'סה"כ'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--border)]">
                        <td className="whitespace-nowrap px-3 py-2">{(r.started_at ?? r.date).slice(0, 16).replace("T", " ")}</td>
                        <td className="px-3 py-2">
                          <span className={r.status === "ok" ? "pos" : r.status === "error" ? "neg" : "text-[var(--muted)]"}>
                            {r.status === "ok" ? "הושלם" : r.status === "error" ? "נכשל" : "רץ"}
                          </span>
                        </td>
                        <td className="px-3 py-2"><ProviderBadge providers={r.providers} /></td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                          {r.tokens_in.toLocaleString()} / {r.tokens_out.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{formatUsd(r.claude_cost)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatUsd(r.scraping_cost)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">{formatUsd(r.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
