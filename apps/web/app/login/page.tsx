"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: fd.get("password") }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("סיסמה שגויה");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold">מערכת מסחר אישית</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">הזן סיסמה כדי להיכנס</p>
        </div>
        <input
          name="password"
          type="password"
          autoFocus
          placeholder="סיסמה"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-center text-sm text-[var(--text)]"
        />
        {error && <p className="text-center text-sm neg">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? "נכנס…" : "כניסה"}
        </button>
      </form>
    </div>
  );
}
