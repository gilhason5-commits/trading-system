import { getMarketData, getRepository, type Stance } from "@trading/core";
import { Pct } from "@/components/format";

export const dynamic = "force-dynamic";

const STANCE_LABEL: Record<Stance, string> = { hold: "החזק", add: "הגדל", trim: "צמצם" };
const STANCE_CLASS: Record<Stance, string> = { hold: "", add: "pos", trim: "neg" };

export default async function StockCard({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();

  const repo = getRepository();
  const md = getMarketData();
  const [positions, analysis, signals] = await Promise.all([
    repo.listPositions(),
    repo.getAnalysis(ticker),
    repo.listSignals(ticker),
  ]);
  const position = positions.find((p) => p.ticker === ticker) ?? null;
  const technicals = position ? await md.getTechnicals(ticker, position.market) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{ticker}</h1>
        <a href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← חזרה לדשבורד</a>
      </div>

      {position ? (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="שוק" value={position.market} />
          <Stat label="כמות" value={String(position.qty)} />
          <Stat label="עלות ממוצעת" value={`${position.avg_cost.toLocaleString()} ${position.currency}`} />
          <Stat label="סקטור" value={position.sector ?? "—"} />
        </section>
      ) : (
        <p className="text-sm text-[var(--muted)]">טיקר זה אינו בתיק (ייתכן שהוא ליד).</p>
      )}

      {technicals && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-2 text-lg font-semibold">טכני</h2>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Kv k="RSI" v={technicals.rsi} />
            <Kv k="MACD" v={`${technicals.macd} / ${technicals.macd_signal}`} />
            <Kv k="מגמה" v={technicals.trend} />
            <Kv k="SMA50" v={technicals.sma50} />
            <Kv k="SMA200" v={technicals.sma200} />
          </div>
        </section>
      )}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-lg font-semibold">ניתוח יומי</h2>
        {analysis ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-[var(--muted)]">נטייה:</span>
              <span className={`text-lg font-bold ${STANCE_CLASS[analysis.stance]}`}>
                {STANCE_LABEL[analysis.stance]}
              </span>
              <span className="text-[var(--muted)]">
                ביטחון: <Pct value={analysis.confidence * 100} />
              </span>
            </div>
            <Para title="טכני" body={analysis.technical_summary} />
            <Para title="פונדמנטלי" body={analysis.fundamental_summary} />
            {analysis.key_events.length > 0 && <List title="אירועי מפתח" items={analysis.key_events} />}
            {analysis.risk_flags.length > 0 && <List title="דגלי סיכון" items={analysis.risk_flags} />}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">אין ניתוח עדיין — יופק בריצה היומית הבאה.</p>
        )}
      </section>

      {signals.length > 0 && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-lg font-semibold">איתותים מהרשת</h2>
          <ul className="space-y-2 text-sm">
            {signals.map((s) => (
              <li key={s.id} className="flex gap-2">
                <span className={s.sentiment === "bullish" ? "pos" : s.sentiment === "bearish" ? "neg" : ""}>
                  {s.sentiment}
                </span>
                <span>{s.claim}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
function Kv({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between border-b border-[var(--border)] py-1">
      <span className="text-[var(--muted)]">{k}</span>
      <span>{v}</span>
    </div>
  );
}
function Para({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{title}</div>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}
function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{title}</div>
      <ul className="mt-0.5 list-inside list-disc">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
