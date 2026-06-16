import {
  computeStats,
  concentrationBreaches,
  enrichPositions,
  getRepository,
  type AllocationSlice,
  type CachedQuote,
  type PortfolioSnapshot,
  type PortfolioStats,
  type PositionView,
  type Quote,
} from "@trading/core";

export interface PortfolioData {
  views: PositionView[];
  stats: PortfolioStats;
  breaches: AllocationSlice[];
  snapshots: PortfolioSnapshot[];
  usdIls: number;
  /** ISO time the cached quotes were last refreshed (by pollPrices), or null. */
  lastUpdated: string | null;
}

export function cachedToQuote(c: CachedQuote): Quote {
  return {
    symbol: c.ticker,
    price: c.price,
    currency: c.currency,
    percent_change: c.percent_change,
    previous_close: c.previous_close,
  };
}

export function latestUpdate(cached: CachedQuote[]): string | null {
  return cached.reduce<string | null>((m, c) => (!m || c.updated_at > m ? c.updated_at : m), null);
}

/**
 * Load + price + enrich the whole portfolio for server components. Prices come
 * from the background-refreshed quote cache (pollPrices), so the page loads
 * instantly and never blocks on Twelve Data's 8-req/min throttle.
 */
export async function getPortfolio(): Promise<PortfolioData> {
  const repo = getRepository();
  const [positions, fxRow, snapshots, settings, cached] = await Promise.all([
    repo.listPositions(),
    repo.latestFx(),
    repo.listSnapshots(),
    repo.getSettings(),
    repo.listCachedQuotes(),
  ]);

  const usdIls = fxRow?.rate ?? 3.62;
  const quotes = new Map<string, Quote>(cached.map((c) => [c.ticker, cachedToQuote(c)]));

  const views = enrichPositions(positions, quotes, usdIls);
  const stats = computeStats(views, usdIls, snapshots);
  const breaches = concentrationBreaches(stats, settings.concentration_threshold);

  return { views, stats, breaches, snapshots, usdIls, lastUpdated: latestUpdate(cached) };
}
