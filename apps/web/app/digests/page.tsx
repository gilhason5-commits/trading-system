import { getRepository } from "@trading/core";
import { UpdatedNote } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function DigestsPage() {
  const repo = getRepository();
  const digests = await repo.listDigests();
  // Show only the most recent digest (the page ends at its last section — analyst
  // forecasts); older digests aren't listed below it.
  const latest = digests.length
    ? digests.reduce((a, b) =>
        b.date > a.date || (b.date === a.date && (b.created_at ?? "") > (a.created_at ?? "")) ? b : a,
      )
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">סיכום יומי</h1>
        <p className="mt-1"><UpdatedNote when={latest?.created_at ?? null} /></p>
      </div>

      {!latest ? (
        <p className="text-sm text-[var(--muted)]">אין סיכום עדיין — יופק בריצה היומית הבאה.</p>
      ) : (
        <>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-semibold">{latest.date}</h2>
              <UpdatedNote when={latest.created_at ?? null} />
            </div>
            <div
              dir="rtl"
              className="prose-sm max-w-none rounded border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--text)]"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: latest.html }}
            />
          </div>

          <MarketNews items={latest.market_news ?? []} />
        </>
      )}
    </div>
  );
}

const REGION = {
  IL: "🇮🇱 ישראל",
  US: "🇺🇸 ארה״ב",
  global: "🌍 גלובלי",
} as const;

function MarketNews({ items }: { items: { headline: string; source: string; region: string }[] }) {
  if (items.length === 0) return null;
  const regions = (["IL", "US", "global"] as const).filter((r) => items.some((i) => i.region === r));
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" dir="rtl">
      <h2 className="mb-1 text-xl font-bold">📰 חדשות מהשוק</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        כותרות מרכזיות משוק ההון — לא בהכרח קשורות לתיק — בהתמקדות בישראל ובארה״ב.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {regions.map((r) => (
          <div key={r} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
            <h3 className="mb-3 text-sm font-semibold">{REGION[r]}</h3>
            <ul className="space-y-3">
              {items.filter((i) => i.region === r).map((i, idx) => (
                <li key={idx} className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium leading-snug text-[var(--text)]">{i.headline}</p>
                  {i.source && <p className="mt-1 text-xs text-[var(--muted)]">{i.source}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
