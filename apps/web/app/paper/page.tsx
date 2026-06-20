import { formatDual, formatUsd, getRepository } from "@trading/core";
import { PnL, Pct, formatPct, sinceLabel } from "@/components/format";
import { PaperTradeLog } from "@/components/PaperTradeLog";
import { Sparkline } from "@/components/Sparkline";
import { getPaperPortfolio } from "@/lib/paperPortfolio";

export const dynamic = "force-dynamic";

export default async function PaperPage() {
  const [{ views, stats, usdIls, lastUpdated, account, cash, totalValueUsd, totalReturnUsd, totalReturnPct, trades }, snapshots] =
    await Promise.all([getPaperPortfolio(), getRepository().listPaperSnapshots()]);

  const opened = account !== null;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">תיק דמה — מסחר אוטונומי 🤖</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          תיק שאני מנהל לבדי כמערכת אלגו (אגרסיבי אך ממושמע): סוחר רק בשעות המסחר של וול-סטריט, אחרי מחקר שוק,
          קונה רק כשהמניה משכנעת מכל הבחינות, עם סטופ-לוס ויעד יציאה מוגדרים מראש — ומדרג את ההון בהדרגה תוך
          שמירת רזרבת מזומן. לחץ על כל פעולה ביומן לתהליך החשיבה המלא. שער USD/ILS: {usdIls.toFixed(3)} ·
          מחירים {sinceLabel(lastUpdated)}
        </p>
      </section>

      {!opened ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          התיק האוטונומי ייפתח עם {formatUsd(10000)} מזומן ויתחיל לסחור בפתיחת המסחר הבא בוול-סטריט.
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

          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">ביצועים</h2>
              <span className="text-sm text-[var(--muted)]">
                {formatUsd(snapshots.at(0)?.total_value_usd ?? 10000)} → {formatUsd(totalValueUsd)}
              </span>
            </div>
            {snapshots.length >= 2 ? (
              <Sparkline snapshots={snapshots} />
            ) : (
              <p className="text-xs text-[var(--muted)]">גרף ההתפתחות יתמלא לאורך הימים (נקודה ליום).</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">פוזיציות ({views.length})</h2>
            {views.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">אין פוזיציות פתוחות כרגע — כל ההון במזומן ({formatUsd(cash)}).</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface)] text-[var(--muted)]">
                    <tr>
                      {["טיקר", "שוק", "כמות", "מחיר כניסה", "מחיר נוכחי", "יומי", "שווי", "רווח/הפסד", "%", "משקל"].map((h) => (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">📒 יומן פעולות — מה עשיתי ולמה</h2>
            <p className="mb-3 text-xs text-[var(--muted)]">
              כל קנייה/מכירה אוטונומית, החדשות למעלה. לחץ על שורה לתהליך החשיבה המלא — גרף, דירוגים, תחזיות אנליסטים,
              תוכנית יציאה וציטוטים מהרשת. תן לי משוב על השיטה ואשנה בהתאם.
            </p>
            <PaperTradeLog trades={trades} />
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
