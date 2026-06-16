"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Client controls for the isolated paper (demo) portfolio: free-hand add at the
// current price, one-click add from recommendations, and remove. All hit
// /api/paper and refresh server data — nothing else on the site is affected.

const MARKETS = [
  { v: "US", label: "ארה\"ב" },
  { v: "TASE", label: "ת\"א" },
  { v: "crypto", label: "קריפטו" },
];

async function addPaper(payload: { ticker: string; market: string; qty: number }): Promise<string | null> {
  const res = await fetch("/api/paper", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.error ?? "הוספה נכשלה";
}

export function PaperAddForm({ recommendations }: { recommendations: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("form");
    setError(null);
    const fd = new FormData(e.currentTarget);
    const err = await addPaper({
      ticker: String(fd.get("ticker") ?? ""),
      market: String(fd.get("market") ?? "US"),
      qty: Number(fd.get("qty")),
    });
    setBusy(null);
    if (err) return setError(err);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  async function quickAdd(ticker: string) {
    setBusy(ticker);
    setError(null);
    const err = await addPaper({ ticker, market: "US", qty: 1 });
    setBusy(null);
    if (err) return setError(err);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={onSubmit}
        className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          טיקר
          <input name="ticker" placeholder="AAPL" required
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          שוק
          <select name="market" className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]">
            {MARKETS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          כמות
          <input name="qty" type="number" step="any" min="0" defaultValue={1} required
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]" />
        </label>
        <div className="flex items-end">
          <button disabled={busy === "form"}
            className="w-full rounded-md bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
            {busy === "form" ? "מוסיף…" : "+ הוסף במחיר נוכחי"}
          </button>
        </div>
        {error && <span className="col-span-2 neg text-sm sm:col-span-4">{error}</span>}
      </form>

      {recommendations.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 text-xs font-semibold text-[var(--muted)]">
            הוספה מהירה מההמלצות (כמות 1, מחיר נוכחי):
          </div>
          <div className="flex flex-wrap gap-2">
            {recommendations.map((t) => (
              <button key={t} onClick={() => quickAdd(t)} disabled={busy === t}
                className="rounded border border-[var(--pos)] px-3 py-1 text-xs text-[var(--pos)] hover:bg-[var(--pos)] hover:text-black disabled:opacity-50">
                {busy === t ? "…" : `+ ${t}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PaperRemoveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    await fetch(`/api/paper?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }
  return (
    <button onClick={remove} disabled={busy} title="הסר"
      className="rounded px-2 py-1 text-xs text-[var(--neg)] hover:underline disabled:opacity-50">
      {busy ? "…" : "✕"}
    </button>
  );
}
