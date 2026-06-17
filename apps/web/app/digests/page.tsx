import { getRepository } from "@trading/core";
import { UpdatedNote } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function DigestsPage() {
  const repo = getRepository();
  const digests = await repo.listDigests();
  const lastUpdated = digests.reduce<string | null>(
    (m, d) => (!m || (d.created_at ?? "") > m ? d.created_at ?? m : m),
    null,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">סיכומים יומיים</h1>
        <p className="mt-1"><UpdatedNote when={lastUpdated} /></p>
      </div>

      {digests.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">אין סיכומים עדיין — יופקו בריצה היומית הבאה.</p>
      ) : (
        <div className="space-y-6">
          {digests.map((digest) => (
            <div
              key={digest.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-lg font-semibold">{digest.date}</h2>
                <UpdatedNote when={digest.created_at ?? null} />
              </div>

              {digest.key_insights.length > 0 && (
                <div className="mb-4">
                  <div className="mb-1 text-xs text-[var(--muted)]">תובנות מפתח</div>
                  <ul className="space-y-1 text-sm">
                    {digest.key_insights.map((insight, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[var(--muted)]">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-[var(--border)] pt-4">
                <div className="mb-2 text-xs text-[var(--muted)]">סיכום מלא</div>
                <div
                  dir="rtl"
                  className="prose-sm max-w-none rounded border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--text)]"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: digest.html }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
