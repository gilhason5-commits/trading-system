import {
  computeStats,
  enrichPositions,
  getMarketData,
  getRepository,
  type PortfolioStats,
  type PositionView,
  type Quote,
} from "@trading/core";

/** Enriched paper holding — keeps the row id so it can be removed. */
export type PaperPositionView = PositionView & { id: string };

export interface PaperPortfolioData {
  views: PaperPositionView[];
  stats: PortfolioStats;
  usdIls: number;
}

// Separate short-lived price cache so the paper page (a) doesn't hammer Twelve
// Data's free tier and (b) stays fully isolated from the real dashboard's cache.
const PRICE_TTL_MS = 60_000;
let priceCache: { at: number; usdIls: number; quotes: Map<string, Quote> } | null = null;

/** Load + price + enrich the isolated paper portfolio for server components. */
export async function getPaperPortfolio(): Promise<PaperPortfolioData> {
  const repo = getRepository();
  const md = getMarketData();

  const [positions, fxRow] = await Promise.all([repo.listPaperPositions(), repo.latestFx()]);

  let usdIls: number;
  let quotes: Map<string, Quote>;
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) {
    usdIls = priceCache.usdIls;
    quotes = priceCache.quotes;
  } else {
    usdIls = (await md.getUsdIls().catch(() => fxRow?.rate)) ?? fxRow?.rate ?? 3.62;
    const quotePairs = await Promise.all(
      positions.map(async (p): Promise<[string, Quote] | null> => {
        try {
          return [p.ticker, await md.getQuote(p.ticker, p.market)];
        } catch {
          return null; // missing quote → enrichPositions falls back to entry price
        }
      }),
    );
    quotes = new Map(quotePairs.filter((x): x is [string, Quote] => x !== null));
    priceCache = { at: Date.now(), usdIls, quotes };
  }

  // enrichPositions preserves input order, so re-attach each row's id for removal.
  const enriched = enrichPositions(positions, quotes, usdIls);
  const views: PaperPositionView[] = enriched.map((v, i) => ({ ...v, id: positions[i]!.id }));
  const stats = computeStats(views, usdIls, []); // no equity-curve history for paper
  return { views, stats, usdIls };
}
