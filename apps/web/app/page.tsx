import { getRepository } from "@trading/core";

// Step 1 placeholder dashboard: proves the core (mock repo) → web wiring works.
// Full portfolio dashboard with P&L, allocation and charts lands in Step 2.

export default async function DashboardPage() {
  const repo = getRepository();
  const [positions, fx, snapshots] = await Promise.all([
    repo.listPositions(),
    repo.latestFx(),
    repo.listSnapshots(),
  ]);
  const latest = snapshots.at(-1);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">דשבורד תיק</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          נתוני דמו (mock) — לפני חיבור מפתחות. שער USD/ILS: {fx?.rate ?? "—"}
        </p>
      </section>

      {latest && (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="שווי כולל (USD)" value={`$${latest.total_value_usd.toLocaleString()}`} />
          <Stat label="שווי כולל (ILS)" value={`₪${latest.total_value_ils.toLocaleString()}`} />
          <Stat label="רווח/הפסד כולל" value={`$${latest.total_pl_usd.toLocaleString()}`} positive />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">פוזיציות ({positions.length})</h2>
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface)] text-[var(--muted)]">
              <tr>
                <Th>טיקר</Th>
                <Th>שוק</Th>
                <Th>כמות</Th>
                <Th>עלות ממוצעת</Th>
                <Th>מטבע</Th>
                <Th>סקטור</Th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticker} className="border-t border-[var(--border)]">
                  <Td bold>{p.ticker}</Td>
                  <Td>{p.market}</Td>
                  <Td>{p.qty}</Td>
                  <Td>{p.avg_cost.toLocaleString()}</Td>
                  <Td>{p.currency}</Td>
                  <Td>{p.sector ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-xl font-bold ${positive ? "pos" : ""}`}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-right font-medium">{children}</th>;
}
function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td className={`px-4 py-2 ${bold ? "font-semibold" : ""}`}>{children}</td>;
}
