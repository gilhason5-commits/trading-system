import type { Technicals } from "./datasources/twelvedata.ts";
import type { Fundamentals } from "./datasources/fmp.ts";

// Medium-term conviction scoring. Each dimension is 0–100 where 50 = neutral,
// >50 leans buy, <50 leans sell. The blended conviction is a buy-conviction:
// ≥80 = strong buy, ≤20 = strong sell, ~50 = no edge. A name only reaches the
// extremes when technical + fundamental + social agree — so it can't sit at 100%
// just because social chatter is one-sided.

const W_TECHNICAL = 0.35;
const W_FUNDAMENTAL = 0.35;
const W_SOCIAL = 0.3;

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export interface ConvictionScores {
  technical: number;
  fundamental: number;
  social: number;
  conviction: number;
}

/** Technical lean from trend structure, momentum (MACD) and RSI. */
export function technicalScore(t: Technicals, price?: number | null): number {
  let s = 50;
  if (price && t.sma50 > 0) s += price > t.sma50 ? 8 : -8;
  if (price && t.sma200 > 0) s += price > t.sma200 ? 8 : -8;
  s += t.trend === "up" ? 10 : t.trend === "down" ? -10 : 0;
  s += t.macd > t.macd_signal ? 10 : -10;
  if (t.rsi >= 70) s -= 8; // overbought
  else if (t.rsi <= 30) s += 6; // oversold bounce
  else if (t.rsi > 50) s += 6;
  else s -= 2;
  return clamp(s);
}

/** Fundamental lean from growth, margins, valuation, leverage and earnings. */
export function fundamentalScore(f: Fundamentals): number {
  let s = 50;
  s += f.revenue_growth > 0.2 ? 15 : f.revenue_growth > 0.05 ? 7 : f.revenue_growth < 0 ? -12 : 0;
  s += f.net_margin > 0.2 ? 12 : f.net_margin > 0 ? 5 : -12;
  s += f.pe_ratio > 0 && f.pe_ratio < 30 ? 6 : f.pe_ratio >= 100 ? -12 : f.pe_ratio >= 50 ? -6 : 0;
  s += f.debt_to_equity >= 0 && f.debt_to_equity < 1 ? 6 : f.debt_to_equity > 2 ? -8 : 0;
  s += f.last_earnings_surprise > 0.02 ? 6 : f.last_earnings_surprise < -0.02 ? -6 : 0;
  return clamp(s);
}

/**
 * Social lean from bullish vs bearish mentions, dampened by volume so a single
 * mention can't read as 100% conviction — it takes ~5 consistent mentions to
 * reach the extreme. 50 = neutral / no mentions.
 */
export function socialScore(bull: number, bear: number): number {
  const total = bull + bear;
  if (total === 0) return 50;
  const lean = (bull / total) * 100; // 0–100 direction
  const confidence = Math.min(1, total / 5); // 5+ mentions ⇒ full weight
  return clamp(50 + (lean - 50) * confidence);
}

/** Weighted buy-conviction (0–100). */
export function blendConviction(technical: number, fundamental: number, social: number): number {
  return clamp(W_TECHNICAL * technical + W_FUNDAMENTAL * fundamental + W_SOCIAL * social);
}
