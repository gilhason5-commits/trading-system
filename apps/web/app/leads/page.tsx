import { getRepository, type Post, type Signal, type Source } from "@trading/core";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "חדש",
  researching: "במחקר",
  recommended: "מומלץ",
  dismissed: "נדחה",
};

/** Classify where a signal came from, in Hebrew, from its source + post id. */
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

function Trail({ items, verified }: { items: TrailItem[]; verified: string[] }) {
  return (
    <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-xs font-semibold text-[var(--muted)]">מסלול החשיבה</div>

      <div>
        <div className="text-xs text-[var(--muted)]">מאיפה הגיע:</div>
        {items.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">—</div>
        ) : (
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
        )}
      </div>

      <div>
        <div className="text-xs text-[var(--muted)]">איפה אומת:</div>
        {verified.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">—</div>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {verified.map((v, i) => (
              <span key={i} className="rounded bg-[var(--surface)] px-2 py-0.5 text-xs">
                ✓ {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function LeadsPage() {
  const repo = getRepository();
  const [recommendations, leads, signals, posts, sources] = await Promise.all([
    repo.listRecommendations(),
    repo.listLeads(),
    repo.listSignals(),
    repo.listPosts(),
    repo.listSources(),
  ]);
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const sourcesById = new Map(sources.map((s) => [s.id, s]));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">לידים והמלצות</h1>

      <section>
        <h2 className="mb-4 text-lg font-semibold">המלצות</h2>
        {recommendations.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">אין המלצות עדיין — יופקו בריצה היומית הבאה.</p>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
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
                <Trail
                  items={buildTrail(rec.ticker, signals, postsById, sourcesById)}
                  verified={rec.verified_sources ?? []}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">כל הלידים ({leads.length})</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">אין לידים עדיין.</p>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => {
              const trail = buildTrail(lead.ticker, signals, postsById, sourcesById);
              return (
                <div key={lead.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold">{lead.ticker}</span>
                    <span className="text-[var(--muted)]">{STATUS_LABEL[lead.status] ?? lead.status}</span>
                    <span className="text-[var(--muted)]">· {lead.mention_count} אזכורים</span>
                  </div>
                  {trail.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {trail.map((it, i) => (
                        <li key={i} className="text-sm">
                          <span>{it.type}</span> ·{" "}
                          <a href={it.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                            {it.handle}
                          </a>
                          {it.claim && <span className="text-[var(--muted)]"> — “{it.claim}”</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
