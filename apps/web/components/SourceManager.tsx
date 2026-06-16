"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Source } from "@trading/core";

const PLATFORMS = [
  { v: "youtube", label: "YouTube" },
  { v: "tiktok", label: "TikTok" },
  { v: "instagram", label: "Instagram" },
  { v: "x", label: "X (Twitter)" },
  { v: "rss", label: "RSS" },
];

export function SourceManager({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = { platform: fd.get("platform"), handle: fd.get("handle") };
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "הוספה נכשלה");
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  async function onToggle(source: Source) {
    setToggling(source.id);
    const res = await fetch("/api/sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: source.id, active: !source.active }),
    });
    setToggling(null);
    if (!res.ok) return;
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Add source form */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-3 text-sm font-semibold">הוסף מקור חדש</h3>
        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            פלטפורמה
            <select
              name="platform"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]"
            >
              {PLATFORMS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            ידית / כתובת
            <input
              name="handle"
              required
              placeholder="@channel או URL"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)] min-w-[200px]"
            />
          </label>
          <button
            disabled={busy}
            className="rounded-md bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "מוסיף…" : "+ הוסף"}
          </button>
          {error && <span className="neg text-sm">{error}</span>}
        </form>
      </div>

      {/* Per-row toggle buttons */}
      {sources.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                {["פלטפורמה", "ידית", "פעיל", "פעולה"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => (
                <tr key={src.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 capitalize">{src.platform}</td>
                  <td className="px-3 py-2 font-mono text-xs">{src.handle}</td>
                  <td className="px-3 py-2">
                    {src.active ? (
                      <span className="pos">✓</span>
                    ) : (
                      <span className="neg">✗</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onToggle(src)}
                      disabled={toggling === src.id}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface)] disabled:opacity-50"
                    >
                      {toggling === src.id ? "…" : src.active ? "השבת" : "הפעל"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
