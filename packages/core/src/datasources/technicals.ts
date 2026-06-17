import type { Market } from "../types.ts";
import type { Technicals } from "./twelvedata.ts";

// Free, key-less technical indicators computed from Yahoo Finance daily history
// (Twelve Data's free tier caps indicator calls at 8/min + 800/day, which can't
// sustain ~21 tracked tickers × 4 indicators daily). One request per ticker gives
// a year of closes; we compute SMA50/200, RSI(14) and MACD(12,26,9) locally.

function yahooSymbol(ticker: string, market: Market): string {
  const t = ticker.toUpperCase();
  if (market === "crypto") return `${t}-USD`;
  if (market === "TASE") return `${t}.TA`;
  return t;
}

function sma(arr: number[], n: number): number {
  if (arr.length < n) return 0;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function emaSeries(arr: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = arr[0] ?? 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] ?? 0;
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(closes: number[], n = 14): number {
  if (closes.length < n + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (d >= 0) gain += d;
    else loss -= d;
  }
  const avgGain = gain / n;
  const avgLoss = loss / n;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export async function fetchHistoricalTechnicals(ticker: string, market: Market): Promise<Technicals> {
  const sym = yahooSymbol(ticker, market);
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  );
  if (!res.ok) throw new Error(`yahoo ${sym}: HTTP ${res.status}`);
  const j = (await res.json()) as {
    chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
  };
  const raw = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const closes = raw.filter((n): n is number => typeof n === "number" && n > 0);
  if (closes.length < 60) throw new Error(`yahoo ${sym}: insufficient history (${closes.length})`);

  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, Math.min(200, closes.length));
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const macdLine = closes.map((_, i) => (e12[i] ?? 0) - (e26[i] ?? 0));
  const macd = macdLine.at(-1) ?? 0;
  const macd_signal = emaSeries(macdLine, 9).at(-1) ?? 0;
  const gap = sma200 > 0 ? (sma50 - sma200) / sma200 : 0;
  const trend: "up" | "down" | "flat" = gap > 0.005 ? "up" : gap < -0.005 ? "down" : "flat";

  return { rsi: rsi(closes), macd, macd_signal, sma50, sma200, trend };
}
