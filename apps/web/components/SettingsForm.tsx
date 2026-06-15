"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@trading/core";

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    const payload = {
      digest_time: fd.get("digest_time"),
      concentration_threshold: fd.get("concentration_threshold"),
      digest_email: fd.get("digest_email"),
    };
    const res = await fetch("/api/settings", {
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
    setSuccess(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          שעת סיכום יומי (שעון ישראל)
          <input
            name="digest_time"
            type="time"
            defaultValue={settings.digest_time}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          סף ריכוזיות
          <input
            name="concentration_threshold"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={settings.concentration_threshold}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]"
          />
          <span className="text-[var(--muted)]">0.25 = 25%</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)] sm:col-span-2">
          כתובת אימייל לסיכום
          <input
            name="digest_email"
            type="email"
            defaultValue={settings.digest_email}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--text)]"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          disabled={busy}
          className="rounded-md bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? "שומר…" : "שמור הגדרות"}
        </button>
        {error && <span className="neg text-sm">{error}</span>}
        {success && <span className="pos text-sm">נשמר בהצלחה ✓</span>}
      </div>
    </form>
  );
}
