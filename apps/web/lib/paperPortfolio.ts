import {
  computeStats,
  enrichPositions,
  getRepository,
  type PortfolioStats,
  type PositionView,
  type Quote,
} from "@trading/core";
import { cachedToQuote, latestUpdate } from "@/lib/portfolio";

/** Enriched paper holding — keeps the row id so it can be removed. */
export type PaperPositionView = PositionView & { id: string };

export interface PaperPortfolioData {
  views: PaperPositionView[];
  stats: PortfolioStats;
  usdIls: number;
  lastUpdated: string | null;
}

/**
 * Load + price + enrich the isolated paper portfolio. Reads from the same
 * background-refreshed quote cache as the real dashboard, so it loads instantly
 * and stays fully isolated from real positions/pages.
 */
export async function getPaperPortfolio(): Promise<PaperPortfolioData> {
  const repo = getRepository();
  const [positions, fxRow, cached] = await Promise.all([
    repo.listPaperPositions(),
    repo.latestFx(),
    repo.listCachedQuotes(),
  ]);

  const usdIls = fxRow?.rate ?? 3.62;
  const quotes = new Map<string, Quote>(cached.map((c) => [c.ticker, cachedToQuote(c)]));

  // enrichPositions preserves input order, so re-attach each row's id for removal.
  const enriched = enrichPositions(positions, quotes, usdIls);
  const views: PaperPositionView[] = enriched.map((v, i) => ({ ...v, id: positions[i]!.id }));
  const stats = computeStats(views, usdIls, []); // no equity-curve history for paper
  return { views, stats, usdIls, lastUpdated: latestUpdate(cached) };
}
