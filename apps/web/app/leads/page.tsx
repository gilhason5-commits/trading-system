import { getRepository } from "@trading/core";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "חדש",
  researching: "במחקר",
  recommended: "מומלץ",
  dismissed: "נדחה",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--background)]">
        <div className="h-full bg-[var(--pos)]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default async function LeadsPage() {
  const repo = getRepository();
  const [recommendations, leads] = await Promise.all([
    repo.listRecommendations(),
    repo.listLeads(),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">לידים והמלצות</h1>

      {/* Recommendations */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">המלצות</h2>
        {recommendations.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">אין המלצות עדיין — יופקו בריצה היומית הבאה.</p>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-lg font-bold">{rec.ticker}</span>
                  <span className="text-xs text-[var(--muted)]">{rec.date}</span>
                  {rec.manipulation_flag && (
                    <span className="rounded bg-[var(--neg)] px-2 py-0.5 text-xs font-semibold text-white">
                      ⚠ חשד מניפולציה
                    </span>
                  )}
                </div>
                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ScoreBar label="ציון מערכת" value={rec.system_score} />
                  <ScoreBar label="ציון חברתי" value={rec.social_score} />
                </div>
                <p className="text-sm text-[var(--muted)]">{rec.rationale}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Leads table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">כל הלידים ({leads.length})</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">אין לידים עדיין.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface)] text-[var(--muted)]">
                <tr>
                  {["טיקר", "סטטוס", "אזכורים", "נראה לראשונה"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-semibold">{lead.ticker}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[lead.status] ?? lead.status}</td>
                    <td className="px-3 py-2">{lead.mention_count}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{lead.first_seen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
