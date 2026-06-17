import { getRepository, type Post, type Recommendation, type Signal, type Source } from "@trading/core";
import { RecommendationGrid, type RecCard, type TrailItem } from "@/components/RecommendationGrid";
import { TrackedTable, type TrackedRow } from "@/components/TrackedTable";
import { UpdatedNote } from "@/components/format";

export const dynamic = "force-dynamic";

function discoveryType(platform: string, externalId: string): string {
  switch (platform) {
    case "youtube":
      return "🎬 סרטון יוטיוב";
    case "tiktok":
      return "🎬 סרטון טיקטוק";
    case "instagram":
      return externalId.startsWith("story_") ? "📸 סטורי אינסטגרם" : "📷 פוסט אינסטגרם";
    case "x":
      return "𝕏 ציוץ";
    case "rss":
      return "📰 כתבה";
    default:
      return platform;
  }
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

function quality(r: Recommendation): number {
  const base = r.system_score * 0.6 + r.social_score * 0.4;
  return r.manipulation_flag ? base - 100 : base;
}

function distinctSources(items: TrailItem[]): string[] {
  return [...new Set(items.map((i) => i.handle).filter((h) => h && h !== "—"))];
}

export default async function LeadsPage() {
  const repo = getRepository();
  const [recommendations, signals, posts, sources, positions, tracked, cached, runs] = await Promise.all([
    repo.listRecommendations(),
    repo.listSignals(),
    repo.listPosts(),
    repo.listSources(),
    repo.listPositions(),
    repo.listTracked(),
    repo.listCachedQuotes(),
    repo.listRuns(),
  ]);
  // "Last updated" = when the recommendation engine last finished a run.
  const lastRun = runs
    .slice()
    .sort((a, b) => (b.started_at ?? b.date).localeCompare(a.started_at ?? a.date))[0];
  const lastUpdated = lastRun?.finished_at ?? lastRun?.started_at ?? null;
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const priceByTicker = new Map(cached.map((c) => [c.ticker.toUpperCase(), c]));
  const held = new Set(positions.map((p) => p.ticker.toUpperCase()));
  const todayStr = new Date().toISOString().slice(0, 10);

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

  // Verified recommendations, latest run only, ranked best → worst.
  const verifiedAll = recommendations
    .filter((r) => (r.verified_sources ?? []).length > 0)
    .sort((a, b) => quality(b) - quality(a));
  const latestDate = verifiedAll.reduce((m, r) => (r.date > m ? r.date : m), "");
  const verified = verifiedAll.filter((r) => r.date === latestDate);

  const cards: RecCard[] = verified.map((rec, i) => {
    const trail = buildTrail(rec.ticker, signals, postsById, sourcesById);
    return {
      id: rec.id,
      rank: i,
      ticker: rec.ticker,
      date: rec.date,
      system_score: rec.system_score,
      social_score: rec.social_score,
      manipulation_flag: rec.manipulation_flag,
      rationale: rec.rationale,
      verified_sources: rec.verified_sources ?? [],
      trail,
      sources: distinctSources(trail),
    };
  });

  const crossSource = cards.filter((c) => c.sources.length >= 2);

  // Latest recommendation per ticker → used for the tracked-item analysis modal.
  const recByTicker = new Map<string, Recommendation>();
  for (const r of recommendations) {
    const k = r.ticker.toUpperCase();
    const ex = recByTicker.get(k);
    if (!ex || r.date > ex.date) recByTicker.set(k, r);
  }

  // Tracking: enrich each tracked ticker with price/performance + clickable analysis.
  const trackingRows: TrackedRow[] = tracked
    .slice()
    .sort((a, b) => b.last_seen_date.localeCompare(a.last_seen_date))
    .map((t) => {
      const cur = priceByTicker.get(t.ticker.toUpperCase());
      const ret = t.entry_price && cur ? ((cur.price - t.entry_price) / t.entry_price) * 100 : null;
      const dayN = Math.min(
        7,
        Math.floor((Date.parse(`${todayStr}T00:00:00Z`) - Date.parse(`${t.first_date}T00:00:00Z`)) / 86_400_000) + 1,
      );
      const rec = recByTicker.get(t.ticker.toUpperCase());
      const trail = buildTrail(t.ticker, signals, postsById, sourcesById);
      const detail: RecCard | null = rec
        ? {
            id: rec.id,
            rank: 99, // no chart in the tracking modal
            ticker: rec.ticker,
            date: rec.date,
            system_score: rec.system_score,
            social_score: rec.social_score,
            manipulation_flag: rec.manipulation_flag,
            rationale: rec.rationale,
            verified_sources: rec.verified_sources ?? [],
            trail,
            sources: distinctSources(trail),
          }
        : null;
      return {
        id: t.id,
        ticker: t.ticker,
        dayN,
        entry_price: t.entry_price,
        entry_currency: t.entry_currency,
        current: cur?.price ?? null,
        ret,
        sentiment_trend: t.sentiment_trend,
        reinforce_count: t.reinforce_count,
        last_seen_date: t.last_seen_date,
        detail,
      };
    });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">לידים והמלצות</h1>
        <p className="mt-1"><UpdatedNote when={lastUpdated} /></p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">המלצות מאומתות ({cards.length}) — לחץ על כרטיס להסבר</h2>
        <RecommendationGrid cards={cards} />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 text-lg font-semibold">📋 מעקב המלצות (7 ימים)</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          המלצות מהימים האחרונים — ביצוע מאז ההמלצה, וחיזוק אם הופיעו שוב (כולל אם הסנטימנט התחזק או נחלש).
          לחץ על שם מניה לניתוח ולמקורות.
        </p>
        <TrackedTable rows={trackingRows} />
      </section>

      {crossSource.length > 0 && (
        <section className="rounded-lg border border-[var(--pos)] bg-[var(--surface)] p-4">
          <h2 className="mb-2 text-lg font-semibold">🔥 הצלבות בין מקורות</h2>
          <p className="mb-2 text-xs text-[var(--muted)]">מניות שהומלצו ע"י יותר ממקור אחד — איתות חזק יותר.</p>
          <ul className="space-y-1 text-sm">
            {crossSource.map((c) => (
              <li key={c.id}>
                <span className="font-bold">{c.ticker}</span> — {c.sources.length} מקורות:{" "}
                <span className="text-[var(--muted)]">{c.sources.join(" · ")}</span>
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
    </div>
  );
}
