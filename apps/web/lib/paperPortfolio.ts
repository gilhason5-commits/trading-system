import {
  BUY_BAR,
  EXIT_BAR,
  computeStats,
  enrichPositions,
  getRepository,
  getUsMarketState,
  type PaperAccount,
  type PaperThesis,
  type PaperTrade,
  type PortfolioStats,
  type PositionView,
  type Post,
  type Quote,
  type Sentiment,
  type Signal,
  type Source,
} from "@trading/core";
import { cachedToQuote, latestUpdate } from "@/lib/portfolio";

// Mirror of the engine's hard exit levels (STRATEGY in autotrade.ts).
const STOP_PCT = -15;
const TAKE_PROFIT_PCT = 40;

/** A trade the engine intends to make next session (shown while the market is shut). */
export interface PlannedSell {
  ticker: string;
  reason: string;
}

/** One raw piece of social evidence behind a thesis (for the manipulation audit). */
export interface ThesisSource {
  platform: string;
  handle: string;
  claim: string;
  url: string;
  sentiment: Sentiment;
}

/**
 * A building/planned thesis enriched with the raw sources behind it + a
 * manipulation flag, so the paper page can show — already at 14:30, before any
 * buy — exactly which accounts/claims drove each target and whether it's flagged
 * as possible manipulation.
 */
export type ThesisView = PaperThesis & {
  sources: ThesisSource[];
  bull: number;
  bear: number;
  manipulation: boolean;
  conviction: number | null;
};

/** Enriched paper holding — keeps the row id so it can be removed. */
export type PaperPositionView = PositionView & { id: string };

export interface PaperPortfolioData {
  views: PaperPositionView[];
  stats: PortfolioStats;
  usdIls: number;
  lastUpdated: string | null;
  /** Autonomous-book cash + total value (USD). null account = book not opened yet. */
  account: PaperAccount | null;
  /** Available cash (USD). */
  cash: number;
  /** Cash + holdings (USD). */
  totalValueUsd: number;
  /** Total return vs starting cash (USD and %). */
  totalReturnUsd: number;
  totalReturnPct: number;
  /** Most recent autonomous trades, newest first. */
  trades: PaperTrade[];
  /** Long theses still building toward a buy (strongest first), with sources. */
  buildingTheses: ThesisView[];
  /** US market state ("REGULAR"/"CLOSED"/"PRE"/"POST"/…), or null if unknown. */
  marketState: string | null;
  /** Buy ideas ready for the next session (long theses past the bar, not held). */
  plannedBuys: ThesisView[];
  /** Sell ideas ready for the next session (holdings that hit an exit rule). */
  plannedSells: PlannedSell[];
  /** Latest end-of-day self-reflection (lessons), shown under the trade log. */
  reflection: { date: string; text: string } | null;
}

/**
 * Load + price + enrich the isolated paper portfolio. Reads from the same
 * background-refreshed quote cache as the real dashboard, so it loads instantly
 * and stays fully isolated from real positions/pages.
 */
export async function getPaperPortfolio(): Promise<PaperPortfolioData> {
  const repo = getRepository();
  const [positions, fxRow, cached, account, trades, theses, tracked, marketState, signals, posts, sources, recommendations, reflections] =
    await Promise.all([
      repo.listPaperPositions(),
      repo.latestFx(),
      repo.listCachedQuotes(),
      repo.getPaperAccount(),
      repo.listPaperTrades(),
      repo.listPaperTheses(),
      repo.listTracked(),
      getUsMarketState().catch(() => null),
      repo.listSignals(),
      repo.listPosts(),
      repo.listSources(),
      repo.listRecommendations(),
      repo.listPaperReflections(),
    ]);
  const heldKeys = new Set(positions.map((p) => p.ticker.toUpperCase()));
  const exitByTicker = new Map(
    theses.filter((t) => t.direction === "exit").map((t) => [t.ticker.toUpperCase(), t]),
  );
  const convByTicker = new Map(tracked.map((t) => [t.ticker.toUpperCase(), t.conviction ?? null]));

  // Attach the raw social evidence + manipulation flag to each thesis so the page
  // can show what's driving the target and let the user audit for manipulation.
  const postsById = new Map<string, Post>(posts.map((p) => [p.id, p]));
  const sourcesById = new Map<string, Source>(sources.map((s) => [s.id, s]));
  const manipByTicker = new Map<string, boolean>(
    recommendations.map((r) => [r.ticker.toUpperCase(), !!r.manipulation_flag]),
  );
  const enrichThesis = (t: PaperThesis): ThesisView => {
    const key = t.ticker.toUpperCase();
    const srcs: ThesisSource[] = [];
    let bull = 0;
    let bear = 0;
    for (const s of signals) {
      if (s.ticker.toUpperCase() !== key) continue;
      if (s.sentiment === "bullish") bull++;
      else if (s.sentiment === "bearish") bear++;
      const post = postsById.get(s.post_id);
      const src = post ? sourcesById.get(post.source_id) : undefined;
      srcs.push({
        platform: src?.platform ?? "rss",
        handle: src?.handle ?? "—",
        claim: s.claim,
        url: post?.url ?? "",
        sentiment: s.sentiment,
      });
    }
    return {
      ...t,
      sources: srcs.slice(0, 20),
      bull,
      bear,
      manipulation: manipByTicker.get(key) ?? false,
      conviction: convByTicker.get(key) ?? null,
    };
  };

  const buildingTheses = theses
    .filter((t) => t.direction === "long" && t.status === "building")
    .sort((a, b) => b.strength - a.strength)
    .map(enrichThesis);

  // Buy ideas the engine would act on next session: matured, not-held long theses.
  const plannedBuys = buildingTheses.filter((t) => t.strength >= BUY_BAR && !heldKeys.has(t.ticker.toUpperCase()));

  const usdIls = fxRow?.rate ?? 3.62;
  const quotes = new Map<string, Quote>(cached.map((c) => [c.ticker, cachedToQuote(c)]));

  // enrichPositions preserves input order, so re-attach each row's id for removal.
  const enriched = enrichPositions(positions, quotes, usdIls);
  const views: PaperPositionView[] = enriched.map((v, i) => ({ ...v, id: positions[i]!.id }));
  const stats = computeStats(views, usdIls, []); // no equity-curve history for paper

  const cash = account?.cash ?? 0;
  const holdingsUsd = views.reduce((s, v) => s + v.market_value.usd, 0);
  const totalValueUsd = cash + holdingsUsd;
  const startCash = account?.starting_cash ?? 0;
  const totalReturnUsd = startCash > 0 ? totalValueUsd - startCash : 0;
  const totalReturnPct = startCash > 0 ? (totalReturnUsd / startCash) * 100 : 0;

  // Sell ideas the engine would act on next session, per holding.
  const plannedSells: PlannedSell[] = [];
  for (const v of views) {
    const key = v.ticker.toUpperCase();
    const conv = convByTicker.get(key);
    const exitStrength = exitByTicker.get(key)?.strength ?? 0;
    let reason: string | null = null;
    if (v.unrealized_pl_pct <= STOP_PCT) reason = `סטופ-לוס צפוי (תשואה ${v.unrealized_pl_pct.toFixed(1)}%)`;
    else if (v.unrealized_pl_pct >= TAKE_PROFIT_PCT) reason = `מימוש רווח צפוי (+${v.unrealized_pl_pct.toFixed(1)}%)`;
    else if (conv != null && conv < 60) reason = `קונביקשן ${conv}% (<60)`;
    else if (exitStrength >= EXIT_BAR) reason = `תזת יציאה הבשילה (${exitStrength}/${EXIT_BAR})`;
    if (reason) plannedSells.push({ ticker: v.ticker, reason });
  }

  return {
    views,
    stats,
    usdIls,
    lastUpdated: latestUpdate(cached),
    account,
    cash,
    totalValueUsd,
    totalReturnUsd,
    totalReturnPct,
    trades,
    buildingTheses,
    marketState,
    plannedBuys,
    plannedSells,
    reflection: reflections[0] ? { date: reflections[0].date, text: reflections[0].reflection } : null,
  };
}
