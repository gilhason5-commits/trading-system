import type { Platform, ScoreObservation, SocialEvidenceItem } from "../types.ts";
import type { RunContext } from "./context.ts";

// Validation logging stage (runs daily, after tracking — does NOT trade). Two jobs:
//
//  1. Snapshot — for every ticker first recommended today, write an immutable
//     score_observations row: the factor scores, the entry price, and the raw
//     social evidence behind the social score (which account said what).
//  2. Backfill — for past observations whose +1/+3/+5/+7-day mark has arrived,
//     compute the forward return vs entry and fill the column in.
//
// Unlike tracked_recommendations (mutated daily, dropped after 7 days), these rows
// are append-only — the point-in-time dataset we measure the score against (IC,
// quantiles, per-source social IC). For a social-driven edge that can't be cleanly
// backtested, this live capture IS the validation, so it accrues from day one.
//
// NOTE: horizons are calendar-day approximations using the latest cached price
// (good enough for forward-logging; can be refined to trading-day close prices).

const HORIZONS = [1, 3, 5, 7] as const;
type RetKey = `ret_${(typeof HORIZONS)[number]}d`;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function runValidationStage(ctx: RunContext): Promise<void> {
  await recordTodaysObservations(ctx);
  await backfillReturns(ctx);
}

/** Snapshot today's freshly-recommended (and surviving) tickers, once each. */
async function recordTodaysObservations(ctx: RunContext): Promise<void> {
  const todays = (await ctx.repo.listTracked()).filter((t) => t.first_date === ctx.date);
  if (todays.length === 0) return;

  const already = new Set(
    (await ctx.repo.listScoreObservations()).map((o) => `${o.ticker.toUpperCase()}:${o.obs_date}`),
  );
  const marketByTicker = new Map(
    (await ctx.repo.listLeads()).map((l) => [l.ticker.toUpperCase(), l.market]),
  );
  const signals = await ctx.repo.listSignals();
  const posts = new Map((await ctx.repo.listPosts()).map((p) => [p.id, p]));
  const sources = new Map((await ctx.repo.listSources()).map((s) => [s.id, s]));

  function evidenceFor(ticker: string): {
    items: SocialEvidenceItem[];
    bull: number;
    bear: number;
    mentions: number;
  } {
    const items: SocialEvidenceItem[] = [];
    const handles = new Set<string>();
    let bull = 0;
    let bear = 0;
    for (const s of signals) {
      if (s.ticker.toUpperCase() !== ticker.toUpperCase()) continue;
      if (s.sentiment === "bullish") bull++;
      else if (s.sentiment === "bearish") bear++;
      const post = posts.get(s.post_id);
      const src = post ? sources.get(post.source_id) : undefined;
      if (src) handles.add(src.handle);
      items.push({
        platform: (src?.platform ?? "rss") as Platform,
        handle: src?.handle ?? "—",
        claim: s.claim,
        url: post?.url ?? "",
        sentiment: s.sentiment,
      });
    }
    return { items: items.slice(0, 20), bull, bear, mentions: handles.size };
  }

  for (const t of todays) {
    if (already.has(`${t.ticker.toUpperCase()}:${ctx.date}`)) continue;
    const ev = evidenceFor(t.ticker);
    await ctx.repo.addScoreObservation({
      ticker: t.ticker,
      market: marketByTicker.get(t.ticker.toUpperCase()) ?? "US",
      obs_date: ctx.date,
      entry_price: t.entry_price,
      entry_currency: t.entry_currency,
      technical_score: t.technical_score ?? null,
      fundamental_score: t.fundamental_score ?? null,
      social_score: t.social_score ?? null,
      conviction: t.conviction ?? null,
      bull_count: ev.bull,
      bear_count: ev.bear,
      mention_count: ev.mentions,
      social_evidence: ev.items,
      ret_1d: null,
      ret_3d: null,
      ret_5d: null,
      ret_7d: null,
    });
  }
}

/** Fill any due forward-return columns using the latest cached price. */
async function backfillReturns(ctx: RunContext): Promise<void> {
  const observations = await ctx.repo.listScoreObservations();
  if (observations.length === 0) return;
  const priceByTicker = new Map(
    (await ctx.repo.listCachedQuotes()).map((c) => [c.ticker.toUpperCase(), c.price]),
  );

  for (const o of observations) {
    if (!o.entry_price || o.entry_price <= 0) continue;
    const elapsed = daysBetween(o.obs_date, ctx.date);
    if (elapsed < 1) continue;
    const price = priceByTicker.get(o.ticker.toUpperCase());
    if (!price || price <= 0) continue;
    const ret = round2((price / o.entry_price - 1) * 100);

    const updates: Partial<Record<RetKey, number>> = {};
    for (const h of HORIZONS) {
      const col: RetKey = `ret_${h}d`;
      // Fill when the mark has arrived; the small grace window absorbs weekends /
      // missed runs, but we abandon a horizon that's gone stale (honest null).
      if (o[col] == null && elapsed >= h && elapsed <= h + 3) updates[col] = ret;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.repo.updateScoreObservationReturns(o.id, updates);
    }
  }
}
