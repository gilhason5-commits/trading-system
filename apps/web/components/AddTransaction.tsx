"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Manual trade entry form (spec §5). Posts to /api/transactions, then refreshes
// server data so positions/P&L recompute.

const MARKETS = [
  { v: "US", label: "ארה\"ב" },
  { v: "TASE", label: "ת\"א" },
  { v: "crypto", label: "קריפטו" },
];

export function AddTransaction() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "שמירה נכשלה");
      return;
    }
    (e.target as HTMLFormElement).reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-black"
      >
        + הזן עסקה
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-4"
    >
      <Field name="ticker" label="טיקר" placeholder="AAPL" required />
      <Select name="market" label="שוק" options={MARKETS} />
      <Select name="side" label="צד" options={[{ v: "buy", label: "קנייה" }, { v: "sell", label: "מכירה" }]} />
      <Field name="qty" label="כמות" type="number" step="any" required />
      <Field name="price" label="מחיר" type="number" step="any" required />
      <Select name="currency" label="מטבע" options={[{ v: "USD", label: "USD" }, { v: "ILS", label: "ILS" }]} />
      <Field name="date" label="תאריך" type="date" required />
      <Field name="note" label="הערה" placeholder="(אופציונלי)" />
      <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
        <button disabled={busy} className="rounded-md bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
          {busy ? "שומר…" : "שמור"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">
          ביטול
        </button>
        {error && <span className="neg text-sm">{error}</span>}
      </div>
    </form>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
      {label}
      <input {...props} className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]" />
    </label>
  );
}

function Select({ label, name, options }: { label: string; name: string; options: { v: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
      {label}
      <select name={name} className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]">
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
