import {
  computeStats,
  concentrationBreaches,
  enrichPositions,
  getMarketData,
  getRepository,
  type AllocationSlice,
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
}

// Short-lived price cache so dashboard reloads don't hammer Twelve Data's
// 8-req/min free tier (and don't collide with the worker's price polling).
const PRICE_TTL_MS = 60_000;
let priceCache: { at: number; usdIls: number; quotes: Map<string, Quote> } | null = null;

/** Load + price + enrich the whole portfolio for server components. */
export async function getPortfolio(): Promise<PortfolioData> {
  const repo = getRepository();
  const md = getMarketData();

  const [positions, fxRow, snapshots, settings] = await Promise.all([
    repo.listPositions(),
    repo.latestFx(),
    repo.listSnapshots(),
    repo.getSettings(),
  ]);

  let usdIls: number;
  let quotes: Map<string, Quote>;
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) {
    usdIls = priceCache.usdIls;
    quotes = priceCache.quotes;
  } else {
    usdIls = (await md.getUsdIls().catch(() => fxRow?.rate)) ?? fxRow?.rate ?? 3.62;
    // Resilient per-quote: a single failure/rate-limit must not crash the page —
    // enrichPositions falls back to avg cost for any missing quote.
    const quotePairs = await Promise.all(
      positions.map(async (p): Promise<[string, Quote] | null> => {
        try {
          return [p.ticker, await md.getQuote(p.ticker, p.market)];
        } catch {
          return null;
        }
      }),
    );
    quotes = new Map(quotePairs.filter((x): x is [string, Quote] => x !== null));
    priceCache = { at: Date.now(), usdIls, quotes };
  }

  const views = enrichPositions(positions, quotes, usdIls);
  const stats = computeStats(views, usdIls, snapshots);
  const breaches = concentrationBreaches(stats, settings.concentration_threshold);

  return { views, stats, breaches, snapshots, usdIls };
}
