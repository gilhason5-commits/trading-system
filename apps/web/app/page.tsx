import { formatDual, formatUsd, getRepository, type AllocationSlice } from "@trading/core";
import { AddTransaction } from "@/components/AddTransaction";
import { PnL, Pct, formatPct, UpdatedNote } from "@/components/format";
import { Sparkline } from "@/components/Sparkline";
import { getPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ views, stats, snapshots, usdIls, lastUpdated }, runs] = await Promise.all([
    getPortfolio(),
    getRepository().listRuns(),
  ]);
  // Sum every run in the current calendar (Gregorian) month.
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthRuns = runs.filter((r) => r.date.startsWith(month));
  const monthCost = monthRuns.reduce(
    (a, r) => ({
      tokens_in: a.tokens_in + r.tokens_in,
      tokens_out: a.tokens_out + r.tokens_out,
      claude_cost: a.claude_cost + r.claude_cost,
      scraping_cost: a.scraping_cost + r.scraping_cost,
      total_cost: a.total_cost + r.total_cost,
    }),
    { tokens_in: 0, tokens_out: 0, claude_cost: 0, scraping_cost: 0, total_cost: 0 },
  );

  return (
    <div className="space-y-8">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">דשבורד תיק</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-[var(--muted)]">
            <span>שער USD/ILS: {usdIls.toFixed(3)}</span>
            <span>·</span>
            <UpdatedNote when={lastUpdated} />
          </p>
        </div>
        <AddTransaction />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
      </section>

      <MonthlyCost month={month} runs={monthRuns.length} cost={monthCost} />

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
                {["טיקר", "שוק", "כמות", "מחיר כניסה", "מחיר נוכחי", "יומי", "רווח/הפסד יומי", "שווי", "רווח/הפסד", "%", "משקל"].map((h) => (
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
                  <td className="px-3 py-2">{v.avg_cost.toLocaleString()} {v.currency}</td>
                  <td className="px-3 py-2">{v.price_native.toLocaleString()} {v.currency}</td>
                  <td className="px-3 py-2"><Pct value={v.day_change_pct} /></td>
                  <td className="px-3 py-2"><PnL d={v.day_pl} /></td>
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

interface CostTotals {
  tokens_in: number;
  tokens_out: number;
  claude_cost: number;
  scraping_cost: number;
  total_cost: number;
}

function MonthlyCost({ month, runs, cost }: { month: string; runs: number; cost: CostTotals }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">עלות ריצה חודשית</h2>
        <span className="text-xs text-[var(--muted)]">{month} · {runs} ריצות</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="טוקנים (in/out)" value={`${cost.tokens_in.toLocaleString()} / ${cost.tokens_out.toLocaleString()}`} />
        <Stat label="Claude" value={formatUsd(cost.claude_cost)} />
        <Stat label="סקרייפינג" value={formatUsd(cost.scraping_cost)} />
        <Stat label='סה"כ' value={formatUsd(cost.total_cost)} />
      </div>
    </section>
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
