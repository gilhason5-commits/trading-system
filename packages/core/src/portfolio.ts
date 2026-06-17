import { toDual, toUsd } from "./money.ts";
import type {
  Dual,
  PortfolioSnapshot,
  Position,
  PositionView,
  Transaction,
} from "./types.ts";
import type { Quote } from "./datasources/twelvedata.ts";

// Portfolio derivation + enrichment + stats (spec §5). All math in USD base;
// ILS is attached for display via money.ts.

/**
 * Derive current holdings from the raw transaction log using average cost basis.
 * Sells reduce quantity and realise cost proportionally (avg cost unchanged on sell).
 * Positions that net to ~zero quantity are dropped.
 */
export function derivePositions(transactions: Transaction[]): Position[] {
  type Acc = { qty: number; costNative: number; market: Position["market"]; currency: Position["currency"]; sector?: string };
  const byTicker = new Map<string, Acc>();

  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  for (const tx of ordered) {
    const acc = byTicker.get(tx.ticker) ?? {
      qty: 0, costNative: 0, market: tx.market, currency: tx.currency,
    };
    if (tx.side === "buy") {
      acc.qty += tx.qty;
      acc.costNative += tx.qty * tx.price;
    } else {
      // sell: remove qty at current average cost, keeping avg cost stable
      const avg = acc.qty > 0 ? acc.costNative / acc.qty : 0;
      acc.qty -= tx.qty;
      acc.costNative -= tx.qty * avg;
    }
    byTicker.set(tx.ticker, acc);
  }

  const positions: Position[] = [];
  for (const [ticker, acc] of byTicker) {
    if (acc.qty <= 1e-9) continue;
    positions.push({
      ticker,
      market: acc.market,
      qty: acc.qty,
      avg_cost: acc.costNative / acc.qty,
      currency: acc.currency,
      sector: acc.sector,
    });
  }
  return positions.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** Enrich positions with live quotes + FX into dashboard-ready views with P&L. */
export function enrichPositions(
  positions: Position[],
  quotes: Map<string, Quote>,
  usdIls: number,
): PositionView[] {
  const priced = positions.map((p) => {
    const quote = quotes.get(p.ticker);
    const priceNative = quote?.price ?? p.avg_cost;
    const dayChange = quote?.percent_change ?? 0;
    const prevClose = quote?.previous_close ?? priceNative;

    const marketValue = toDual(priceNative * p.qty, p.currency, usdIls);
    const costBasis = toDual(p.avg_cost * p.qty, p.currency, usdIls);
    const pl: Dual = { usd: marketValue.usd - costBasis.usd, ils: marketValue.ils - costBasis.ils };
    const plPct = costBasis.usd !== 0 ? (pl.usd / costBasis.usd) * 100 : 0;
    const dayPl = toDual((priceNative - prevClose) * p.qty, p.currency, usdIls);

    return { p, priceNative, dayChange, marketValue, costBasis, pl, plPct, dayPl };
  });

  const totalValueUsd = priced.reduce((s, x) => s + x.marketValue.usd, 0);

  return priced.map((x) => ({
    ...x.p,
    price_native: x.priceNative,
    market_value: x.marketValue,
    cost_basis: x.costBasis,
    unrealized_pl: x.pl,
    unrealized_pl_pct: x.plPct,
    day_change_pct: x.dayChange,
    day_pl: x.dayPl,
    weight_pct: totalValueUsd !== 0 ? (x.marketValue.usd / totalValueUsd) * 100 : 0,
  }));
}

export interface AllocationSlice {
  key: string;
  value_usd: number;
  weight_pct: number;
}

export interface PortfolioStats {
  total_value: Dual;
  total_cost: Dual;
  total_pl: Dual;
  total_pl_pct: number;
  day_pl: Dual;
  day_pl_pct: number;
  by_ticker: AllocationSlice[];
  by_sector: AllocationSlice[];
  by_currency: AllocationSlice[];
  /** annualised stdev of daily returns from snapshots, in % */
  volatility_pct: number;
  /** worst peak-to-trough on the snapshot equity curve, in % */
  max_drawdown_pct: number;
}

function allocate(
  views: PositionView[],
  keyOf: (v: PositionView) => string,
): AllocationSlice[] {
  const total = views.reduce((s, v) => s + v.market_value.usd, 0);
  const map = new Map<string, number>();
  for (const v of views) map.set(keyOf(v), (map.get(keyOf(v)) ?? 0) + v.market_value.usd);
  return [...map.entries()]
    .map(([key, value_usd]) => ({
      key,
      value_usd,
      weight_pct: total !== 0 ? (value_usd / total) * 100 : 0,
    }))
    .sort((a, b) => b.value_usd - a.value_usd);
}

export function computeStats(
  views: PositionView[],
  usdIls: number,
  snapshots: PortfolioSnapshot[],
): PortfolioStats {
  const totalValue = sumDuals(views.map((v) => v.market_value));
  const totalCost = sumDuals(views.map((v) => v.cost_basis));
  const totalPl: Dual = { usd: totalValue.usd - totalCost.usd, ils: totalValue.ils - totalCost.ils };
  const totalPlPct = totalCost.usd !== 0 ? (totalPl.usd / totalCost.usd) * 100 : 0;

  // Day P&L: value - value/(1+pct) summed per position.
  const dayPlUsd = views.reduce((s, v) => {
    const prevUsd = v.market_value.usd / (1 + v.day_change_pct / 100);
    return s + (v.market_value.usd - prevUsd);
  }, 0);
  const dayPl = toDual(dayPlUsd, "USD", usdIls);
  const prevTotal = totalValue.usd - dayPlUsd;
  const dayPlPct = prevTotal !== 0 ? (dayPlUsd / prevTotal) * 100 : 0;

  return {
    total_value: totalValue,
    total_cost: totalCost,
    total_pl: totalPl,
    total_pl_pct: totalPlPct,
    day_pl: dayPl,
    day_pl_pct: dayPlPct,
    by_ticker: allocate(views, (v) => v.ticker),
    by_sector: allocate(views, (v) => v.sector ?? "אחר"),
    by_currency: allocate(views, (v) => v.currency),
    volatility_pct: annualisedVolatility(snapshots),
    max_drawdown_pct: maxDrawdown(snapshots),
  };
}

/** Concentration warning when any single ticker exceeds the threshold fraction. */
export function concentrationBreaches(
  stats: PortfolioStats,
  threshold: number,
): AllocationSlice[] {
  return stats.by_ticker.filter((s) => s.weight_pct / 100 > threshold);
}

function sumDuals(items: Dual[]): Dual {
  return items.reduce<Dual>((a, b) => ({ usd: a.usd + b.usd, ils: a.ils + b.ils }), { usd: 0, ils: 0 });
}

function dailyReturns(snapshots: PortfolioSnapshot[]): number[] {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.total_value_usd;
    const cur = sorted[i]!.total_value_usd;
    if (prev > 0) returns.push((cur - prev) / prev);
  }
  return returns;
}

function annualisedVolatility(snapshots: PortfolioSnapshot[]): number {
  const r = dailyReturns(snapshots);
  if (r.length < 2) return 0;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function maxDrawdown(snapshots: PortfolioSnapshot[]): number {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  let peak = -Infinity;
  let maxDd = 0;
  for (const s of sorted) {
    peak = Math.max(peak, s.total_value_usd);
    if (peak > 0) maxDd = Math.min(maxDd, (s.total_value_usd - peak) / peak);
  }
  return Math.abs(maxDd) * 100;
}
