import { formatDual, formatUsd, type AllocationSlice } from "@trading/core";
import { AddTransaction } from "@/components/AddTransaction";
import { PnL, Pct, formatPct } from "@/components/format";
import { Sparkline } from "@/components/Sparkline";
import { getPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { views, stats, breaches, snapshots, usdIls } = await getPortfolio();

  return (
    <div className="space-y-8">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">דשבורד תיק</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            שער USD/ILS: {usdIls.toFixed(3)} · נתוני דמו (mock) עד חיבור מפתחות
          </p>
        </div>
        <AddTransaction />
      </section>

      {breaches.length > 0 && (
        <div className="rounded-lg border border-[var(--neg)] bg-[var(--surface)] p-3 text-sm">
          ⚠ ריכוזיות גבוהה:{" "}
          {breaches.map((b) => `${b.key} (${formatPct(b.weight_pct)})`).join(" · ")}
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="שווי כולל" value={formatDual(stats.total_value)} />
        <Stat
          label="רווח/הפסד כולל"
          value={formatDual(stats.total_pl)}
          sub={formatPct(stats.total_pl_pct)}
          tone={stats.total_pl.usd}
        />
        <Stat
          label="רווח/הפסד יומי"
          value={formatDual(stats.day_pl)}
          sub={formatPct(stats.day_pl_pct)}
          tone={stats.day_pl.usd}
        />
        <Stat
          label="תנודתיות / Drawdown"
          value={`${stats.volatility_pct.toFixed(1)}%`}
          sub={`max DD ${stats.max_drawdown_pct.toFixed(1)}%`}
        />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">ביצועים</h2>
          <span className="text-sm text-[var(--muted)]">
            {formatUsd(snapshots.at(0)?.total_value_usd ?? 0)} → {formatUsd(snapshots.at(-1)?.total_value_usd ?? 0)}
          </span>
        </div>
        <Sparkline snapshots={snapshots} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Allocation title="הקצאה לפי סקטור" slices={stats.by_sector} />
        <Allocation title="הקצאה לפי מטבע" slices={stats.by_currency} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">פוזיציות ({views.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                {["טיקר", "שוק", "כמות", "מחיר", "יומי", "שווי", "רווח/הפסד", "%", "משקל"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {views.map((v) => (
                <tr key={v.ticker} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-semibold">
                    <a href={`/stock/${encodeURIComponent(v.ticker)}`} className="hover:underline">{v.ticker}</a>
                  </td>
                  <td className="px-3 py-2">{v.market}</td>
                  <td className="px-3 py-2">{v.qty}</td>
                  <td className="px-3 py-2">{v.price_native.toLocaleString()} {v.currency}</td>
                  <td className="px-3 py-2"><Pct value={v.day_change_pct} /></td>
                  <td className="px-3 py-2">{formatDual(v.market_value)}</td>
                  <td className="px-3 py-2"><PnL d={v.unrealized_pl} /></td>
                  <td className="px-3 py-2"><Pct value={v.unrealized_pl_pct} /></td>
                  <td className="px-3 py-2">{v.weight_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  const toneCls = tone === undefined ? "" : tone > 0 ? "pos" : tone < 0 ? "neg" : "";
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-lg font-bold ${toneCls}`}>{value}</div>
      {sub && <div className={`text-xs ${toneCls}`}>{sub}</div>}
    </div>
  );
}

function Allocation({ title, slices }: { title: string; slices: AllocationSlice[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {slices.map((s) => (
          <div key={s.key}>
            <div className="flex justify-between text-xs text-[var(--muted)]">
              <span>{s.key}</span>
              <span>{s.weight_pct.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--background)]">
              <div className="h-full bg-[var(--pos)]" style={{ width: `${s.weight_pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
