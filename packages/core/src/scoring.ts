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

/**
 * Minimum blended buy-conviction for a recommendation to stay relevant. Anything
 * below this (incl. a name that started ≥60 and slid under it on a negative
 * mention) is dropped from recommendations + tracking — it can re-enter fresh if
 * it's recommended again later.
 */
export const MIN_CONVICTION = 60;

/**
 * Minimum holistic research score (Claude's system_score, 0–100) for a name to be
 * recommended / tracked. The mechanical conviction blend can be lifted over the
 * floor by one strong leg (e.g. good technicals) even when the research verdict is
 * clearly negative — a fundamentally broken name (absurd P/E, no margins). This
 * floor makes the negative analysis count: if the research itself scored it low,
 * it's not a recommendation, regardless of the blend.
 */
export const MIN_SYSTEM_SCORE = 50;

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

/**
 * Readable Hebrew technical read of the chart (RSI / MACD / price-vs-MAs / trend),
 * for the thesis flow chart. `score` is the technicalScore so the line ends with a
 * verdict on whether the chart confirms, is neutral on, or weakens the thesis.
 */
export function technicalSummary(t: Technicals, price: number | null, score: number): string {
  const parts: string[] = [];
  const rsi = Math.round(t.rsi);
  parts.push(
    t.rsi >= 70 ? `RSI ${rsi} (קנוי-יתר)` :
    t.rsi <= 30 ? `RSI ${rsi} (מכור-יתר)` :
    t.rsi >= 50 ? `RSI ${rsi} (בריא)` : `RSI ${rsi} (חלש)`,
  );
  parts.push(t.macd > t.macd_signal ? "MACD חיובי (מעל הסיגנל)" : "MACD שלילי (מתחת לסיגנל)");
  if (price && t.sma50 > 0 && t.sma200 > 0) {
    const a50 = price > t.sma50;
    const a200 = price > t.sma200;
    parts.push(
      a50 && a200 ? "מעל SMA50 ו-SMA200" :
      !a50 && !a200 ? "מתחת ל-SMA50 ו-SMA200" :
      a50 ? "מעל SMA50, מתחת ל-SMA200" : "מתחת ל-SMA50, מעל SMA200",
    );
  }
  parts.push(t.trend === "up" ? "מגמה עולה" : t.trend === "down" ? "מגמה יורדת" : "מגמה שטוחה");
  const verdict = score >= 60 ? "מאשר את התזה" : score >= 45 ? "ניטרלי" : "מחליש את התזה";
  return `${parts.join(" · ")} → ${verdict} (ט ${score})`;
}
