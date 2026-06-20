import {
  computeStats,
  enrichPositions,
  getRepository,
  type PaperAccount,
  type PaperTrade,
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
}

/**
 * Load + price + enrich the isolated paper portfolio. Reads from the same
 * background-refreshed quote cache as the real dashboard, so it loads instantly
 * and stays fully isolated from real positions/pages.
 */
export async function getPaperPortfolio(): Promise<PaperPortfolioData> {
  const repo = getRepository();
  const [positions, fxRow, cached, account, trades] = await Promise.all([
    repo.listPaperPositions(),
    repo.latestFx(),
    repo.listCachedQuotes(),
    repo.getPaperAccount(),
    repo.listPaperTrades(),
  ]);

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
  };
}
