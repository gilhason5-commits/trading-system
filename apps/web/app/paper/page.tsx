import { formatDual, getRepository } from "@trading/core";
import { PnL, Pct, formatPct, sinceLabel } from "@/components/format";
import { PaperAddForm, PaperRemoveButton } from "@/components/PaperManager";
import { getPaperPortfolio } from "@/lib/paperPortfolio";

export const dynamic = "force-dynamic";

export default async function PaperPage() {
  const [{ views, stats, usdIls, lastUpdated }, recommendations] = await Promise.all([
    getPaperPortfolio(),
    getRepository().listRecommendations(),
  ]);

  // Quick-add candidates: best non-flagged recommendations, unique tickers.
  const recTickers = [
    ...new Set(
      recommendations
        .filter((r) => !r.manipulation_flag)
        .sort((a, b) => b.system_score - a.system_score)
        .map((r) => r.ticker.toUpperCase()),
    ),
  ].slice(0, 12);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">תיק דמה (מסחר ניסיוני)</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          תיק מבודד לבדיקת ההמלצות — מתומחר ומנותח כמו התיק האמיתי, אך אינו משפיע על שאר העמודים.
          הוספה במחיר השוק הנוכחי. שער USD/ILS: {usdIls.toFixed(3)} · מחירים {sinceLabel(lastUpdated)}
        </p>
      </section>

      <PaperAddForm recommendations={recTickers} />

      {views.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          התיק הניסיוני ריק. הוסף מניות מהטופס למעלה או מההמלצות כדי להתחיל.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="שווי כולל" value={formatDual(stats.total_value)} />
            <Stat label="עלות כניסה" value={formatDual(stats.total_cost)} />
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

          <section>
            <h2 className="mb-3 text-lg font-semibold">פוזיציות דמה ({views.length})</h2>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface)] text-[var(--muted)]">
                  <tr>
                    {["טיקר", "שוק", "כמות", "מחיר כניסה", "מחיר נוכחי", "יומי", "שווי", "רווח/הפסד", "%", "משקל", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {views.map((v) => (
                    <tr key={v.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-semibold">
                        <a href={`/stock/${encodeURIComponent(v.ticker)}`} className="hover:underline">{v.ticker}</a>
                      </td>
                      <td className="px-3 py-2">{v.market}</td>
                      <td className="px-3 py-2">{v.qty}</td>
                      <td className="px-3 py-2">{v.avg_cost.toLocaleString()} {v.currency}</td>
                      <td className="px-3 py-2">{v.price_native.toLocaleString()} {v.currency}</td>
                      <td className="px-3 py-2"><Pct value={v.day_change_pct} /></td>
                      <td className="px-3 py-2">{formatDual(v.market_value)}</td>
                      <td className="px-3 py-2"><PnL d={v.unrealized_pl} /></td>
                      <td className="px-3 py-2"><Pct value={v.unrealized_pl_pct} /></td>
                      <td className="px-3 py-2">{v.weight_pct.toFixed(1)}%</td>
                      <td className="px-3 py-2"><PaperRemoveButton id={v.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
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
