import { getRepository, type Post, type Recommendation, type Signal, type Source } from "@trading/core";

export const dynamic = "force-dynamic";

function discoveryType(platform: string, externalId: string): string {
  switch (platform) {
    case "youtube":
      return "🎬 סרטון יוטיוב";
    case "tiktok":
      return "🎬 סרטון טיקטוק";
    case "instagram":
      return externalId.startsWith("story_") ? "📸 סטורי אינסטגרם" : "📷 פוסט אינסטגרם";
    case "rss":
      return "📰 כתבה";
    default:
      return platform;
  }
}

interface TrailItem {
  type: string;
  handle: string;
  claim: string;
  url: string;
}

function buildTrail(
  ticker: string,
  signals: Signal[],
  postsById: Map<string, Post>,
  sourcesById: Map<string, Source>,
): TrailItem[] {
  const items: TrailItem[] = [];
  for (const s of signals) {
    if (s.ticker.toUpperCase() !== ticker.toUpperCase()) continue;
    const post = postsById.get(s.post_id);
    const source = post ? sourcesById.get(post.source_id) : undefined;
    items.push({
      type: source ? discoveryType(source.platform, post!.external_id) : "מקור",
      handle: source?.handle ?? "—",
      claim: s.claim,
      url: post?.url ?? "#",
    });
  }
  return items;
}

/** A composite quality score for ranking recommendations (objective-weighted). */
function quality(r: Recommendation): number {
  const base = r.system_score * 0.6 + r.social_score * 0.4;
  return r.manipulation_flag ? base - 100 : base; // push flagged ones to the bottom
}

function distinctSources(items: TrailItem[]): string[] {
  return [...new Set(items.map((i) => i.handle).filter((h) => h && h !== "—"))];
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--background)]">
        <div className="h-full bg-[var(--pos)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function TrailList({ items }: { items: TrailItem[] }) {
  if (items.length === 0) return <div className="text-sm text-[var(--muted)]">—</div>;
  return (
    <ul className="mt-1 space-y-1">
      {items.map((it, i) => (
        <li key={i} className="text-sm">
          <span>{it.type}</span> ·{" "}
          <a href={it.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
            {it.handle}
          </a>
          {it.claim && <span className="text-[var(--muted)]"> — “{it.claim}”</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function LeadsPage() {
  const repo = getRepository();
  const [recommendations, signals, posts, sources, positions] = await Promise.all([
    repo.listRecommendations(),
    repo.listSignals(),
    repo.listPosts(),
    repo.listSources(),
    repo.listPositions(),
  ]);
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const held = new Set(positions.map((p) => p.ticker.toUpperCase()));

  // Warnings: negative discourse (bearish signals), holdings first.
  const warnings = signals
    .filter((s) => s.sentiment === "bearish")
    .map((s) => {
      const post = postsById.get(s.post_id);
      const source = post ? sourcesById.get(post.source_id) : undefined;
      return {
        ticker: s.ticker,
        isHeld: held.has(s.ticker.toUpperCase()),
        type: source ? discoveryType(source.platform, post!.external_id) : "מקור",
        handle: source?.handle ?? "—",
        claim: s.claim,
        url: post?.url ?? "#",
      };
    })
    .sort((a, b) => Number(b.isHeld) - Number(a.isHeld));

  // Only verified recommendations, ranked best → worst.
  const verified = recommendations
    .filter((r) => (r.verified_sources ?? []).length > 0)
    .sort((a, b) => quality(b) - quality(a));

  // Cross-source corroboration: same ticker surfaced by ≥2 distinct accounts.
  const crossSource = verified
    .map((r) => ({ rec: r, srcs: distinctSources(buildTrail(r.ticker, signals, postsById, sourcesById)) }))
    .filter((x) => x.srcs.length >= 2);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">לידים והמלצות</h1>

      {crossSource.length > 0 && (
        <section className="rounded-lg border border-[var(--pos)] bg-[var(--surface)] p-4">
          <h2 className="mb-2 text-lg font-semibold">🔥 הצלבות בין מקורות</h2>
          <p className="mb-2 text-xs text-[var(--muted)]">מניות שהומלצו ע"י יותר ממקור אחד — איתות חזק יותר.</p>
          <ul className="space-y-1 text-sm">
            {crossSource.map(({ rec, srcs }) => (
              <li key={rec.id}>
                <span className="font-bold">{rec.ticker}</span> — {srcs.length} מקורות:{" "}
                <span className="text-[var(--muted)]">{srcs.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="rounded-lg border border-[var(--neg)] bg-[var(--surface)] p-4">
          <h2 className="mb-2 text-lg font-semibold">⚠ אזהרות — שיח שלילי</h2>
          <p className="mb-2 text-xs text-[var(--muted)]">מניות שדוברו לרעה במקורות (אחזקות שלך מסומנות).</p>
          <ul className="space-y-1 text-sm">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-bold neg">{w.ticker}</span>
                {w.isHeld && (
                  <span className="mx-1 rounded bg-[var(--neg)] px-2 py-0.5 text-xs font-semibold text-white">בתיק</span>
                )}
                <span className="text-[var(--muted)]">
                  {" "}
                  {w.type} ·{" "}
                  <a href={w.url} target="_blank" rel="noreferrer" className="hover:underline">{w.handle}</a> — “{w.claim}”
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">המלצות מאומתות ({verified.length}) — מהטובה לפחות</h2>
        {verified.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">אין המלצות מאומתות עדיין.</p>
        ) : (
          <div className="space-y-4">
            {verified.map((rec, idx) => {
              const trail = buildTrail(rec.ticker, signals, postsById, sourcesById);
              const srcs = distinctSources(trail);
              return (
                <div key={rec.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="text-sm text-[var(--muted)]">#{idx + 1}</span>
                    <span className="text-lg font-bold">{rec.ticker}</span>
                    <span className="text-xs text-[var(--muted)]">{rec.date}</span>
                    {srcs.length >= 2 && (
                      <span className="rounded bg-[var(--pos)] px-2 py-0.5 text-xs font-semibold text-black">
                        🔥 {srcs.length} מקורות
                      </span>
                    )}
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
                  <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
                    <div className="text-xs font-semibold text-[var(--muted)]">מסלול החשיבה</div>
                    <div>
                      <div className="text-xs text-[var(--muted)]">מאיפה הגיע:</div>
                      <TrailList items={trail} />
                    </div>
                    <div>
                      <div className="text-xs text-[var(--muted)]">איפה אומת:</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(rec.verified_sources ?? []).map((v, i) => (
                          <span key={i} className="rounded bg-[var(--surface)] px-2 py-0.5 text-xs">
                            ✓ {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
