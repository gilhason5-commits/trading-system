import { formatDual, formatUsd, getRepository, type PaperTrade } from "@trading/core";
import { PnL, Pct, formatPct, sinceLabel } from "@/components/format";
import { PaperAddForm, PaperRemoveButton } from "@/components/PaperManager";
import { Sparkline } from "@/components/Sparkline";
import { getPaperPortfolio } from "@/lib/paperPortfolio";

export const dynamic = "force-dynamic";

export default async function PaperPage() {
  const [{ views, stats, usdIls, lastUpdated, account, cash, totalValueUsd, totalReturnUsd, totalReturnPct, trades }, recommendations, snapshots] =
    await Promise.all([
      getPaperPortfolio(),
      getRepository().listRecommendations(),
      getRepository().listPaperSnapshots(),
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

  const opened = account !== null;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">תיק דמה — מסחר אוטונומי 🤖</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          תיק מבודד שאני מנהל בעצמי כמערכת מסחר אלגוריתמית (אגרסיבי): קונה ומוכר לבד לפי הקונביקשן והמעקב,
          ומתעד כאן כל פעולה ולמה עשיתי אותה. אינו משפיע על שאר העמודים. שער USD/ILS: {usdIls.toFixed(3)} ·
          מחירים {sinceLabel(lastUpdated)}
        </p>
      </section>

      {!opened ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          התיק האוטונומי ייפתח בריצה הקרובה עם {formatUsd(10000)} מזומן ויתחיל לסחור לפי ההמלצות.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="שווי כולל (מזומן + אחזקות)" value={formatUsd(totalValueUsd)} />
            <Stat label="מזומן פנוי" value={formatUsd(cash)} />
            <Stat
              label="תשואה מתחילת הדרך"
              value={formatUsd(totalReturnUsd)}
              sub={formatPct(totalReturnPct)}
              tone={totalReturnUsd}
            />
            <Stat
              label="רווח/הפסד יומי (אחזקות)"
              value={formatDual(stats.day_pl)}
              sub={formatPct(stats.day_pl_pct)}
              tone={stats.day_pl.usd}
            />
          </section>

          {snapshots.length >= 2 && (
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">ביצועים</h2>
                <span className="text-sm text-[var(--muted)]">
                  {formatUsd(snapshots.at(0)?.total_value_usd ?? 0)} → {formatUsd(snapshots.at(-1)?.total_value_usd ?? 0)}
                </span>
              </div>
              <Sparkline snapshots={snapshots} />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">פוזיציות ({views.length})</h2>
            {views.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">אין פוזיציות פתוחות כרגע — כל ההון במזומן ({formatUsd(cash)}).</p>
            ) : (
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
            )}
          </section>

          <TradeLog trades={trades} />
        </>
      )}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 text-lg font-semibold">התערבות ידנית</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          אפשר להזריק או להסיר פוזיציה ידנית; המנוע ימשיך לנהל אותה לפי הכללים שלו.
        </p>
        <PaperAddForm recommendations={recTickers} />
      </section>
    </div>
  );
}

function TradeLog({ trades }: { trades: PaperTrade[] }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">📒 יומן פעולות — מה עשיתי ולמה</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        כל קנייה/מכירה אוטונומית, החדשות למעלה. תן לי משוב על השיטה ואשנה בהתאם.
      </p>
      {trades.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">עדיין לא בוצעו פעולות.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                {["תאריך", "פעולה", "טיקר", "כמות", "מחיר", "שווי", "Conviction", "סיבה"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)] align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{t.date}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        t.action === "buy" ? "bg-[var(--pos)] text-black" : "bg-[var(--neg)] text-white"
                      }`}
                    >
                      {t.action === "buy" ? "קנייה" : "מכירה"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    <a href={`/stock/${encodeURIComponent(t.ticker)}`} className="hover:underline">{t.ticker}</a>
                  </td>
                  <td className="px-3 py-2">{t.qty}</td>
                  <td className="whitespace-nowrap px-3 py-2">{t.price.toLocaleString()} {t.currency}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatUsd(t.value_usd)}</td>
                  <td className="px-3 py-2">{t.conviction != null ? `${t.conviction}%` : "—"}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
