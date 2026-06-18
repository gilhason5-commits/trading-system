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
      )}
    </div>
  );
}
