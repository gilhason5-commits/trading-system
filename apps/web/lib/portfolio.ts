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

  const usdIls = (await md.getUsdIls().catch(() => fxRow?.rate)) ?? fxRow?.rate ?? 3.62;

  const quotePairs = await Promise.all(
    positions.map(async (p): Promise<[string, Quote]> => [p.ticker, await md.getQuote(p.ticker, p.market)]),
  );
  const quotes = new Map<string, Quote>(quotePairs);

  const views = enrichPositions(positions, quotes, usdIls);
  const stats = computeStats(views, usdIls, snapshots);
  const breaches = concentrationBreaches(stats, settings.concentration_threshold);

  return { views, stats, breaches, snapshots, usdIls };
}
