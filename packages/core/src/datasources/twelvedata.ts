import { getEnv, isLive } from "../env.ts";
import type { Currency, Market } from "../types.ts";

// Twelve Data — prices, FX, technicals for all three markets (spec §3.2).
// Step 2 needs quotes + FX; technicals (for Module 2) land with Step 3's full
// datasource pass. Interface + mock here; live impl covers quote/FX, Step 3 extends.

export interface Quote {
  symbol: string;
  /** Last price in the instrument's native currency. */
  price: number;
  currency: Currency;
  /** Percent change vs previous close. */
  percent_change: number;
  previous_close: number;
}

export interface Technicals {
  rsi: number;
  macd: number;
  macd_signal: number;
  sma50: number;
  sma200: number;
  /** "up" | "down" | "flat" trend from MA structure. */
  trend: "up" | "down" | "flat";
}

export interface MarketDataSource {
  getQuote(symbol: string, market: Market): Promise<Quote>;
  getUsdIls(): Promise<number>;
  getTechnicals(symbol: string, market: Market): Promise<Technicals>;
}

// ── Mock ──────────────────────────────────────────────────────────────────
const MOCK_QUOTES: Record<string, Omit<Quote, "symbol">> = {
  AAPL: { price: 210.4, currency: "USD", percent_change: 1.15, previous_close: 208.01 },
  NVDA: { price: 165.2, currency: "USD", percent_change: 2.4, previous_close: 161.33 },
  MSFT: { price: 455.1, currency: "USD", percent_change: -0.3, previous_close: 456.47 },
  "BTC/USD": { price: 88000, currency: "USD", percent_change: 1.8, previous_close: 86444 },
  TEVA: { price: 70.0, currency: "ILS", percent_change: -0.9, previous_close: 70.64 },
  SOFI: { price: 14.2, currency: "USD", percent_change: 3.1, previous_close: 13.77 },
  RKLB: { price: 27.6, currency: "USD", percent_change: 1.4, previous_close: 27.22 },
};

const MOCK_TECHNICALS: Record<string, Technicals> = {
  AAPL: { rsi: 58, macd: 1.2, macd_signal: 0.9, sma50: 205, sma200: 195, trend: "up" },
  NVDA: { rsi: 67, macd: 3.4, macd_signal: 2.1, sma50: 150, sma200: 128, trend: "up" },
  MSFT: { rsi: 51, macd: 0.2, macd_signal: 0.3, sma50: 452, sma200: 440, trend: "flat" },
  "BTC/USD": { rsi: 55, macd: 420, macd_signal: 380, sma50: 84000, sma200: 78000, trend: "up" },
  TEVA: { rsi: 43, macd: -0.4, macd_signal: -0.1, sma50: 72, sma200: 71, trend: "down" },
};

const DEFAULT_TECHNICALS: Technicals = {
  rsi: 50, macd: 0, macd_signal: 0, sma50: 0, sma200: 0, trend: "flat",
};

export class MockMarketData implements MarketDataSource {
  async getQuote(symbol: string, _market: Market): Promise<Quote> {
    const q = MOCK_QUOTES[symbol] ?? {
      price: 100, currency: "USD" as Currency, percent_change: 0, previous_close: 100,
    };
    return { symbol, ...q };
  }
  async getUsdIls(): Promise<number> {
    return 3.62;
  }
  async getTechnicals(symbol: string, _market: Market): Promise<Technicals> {
    return MOCK_TECHNICALS[symbol] ?? DEFAULT_TECHNICALS;
  }
}

// ── Live ──────────────────────────────────────────────────────────────────
const BASE = "https://api.twelvedata.com";

export class LiveMarketData implements MarketDataSource {
  constructor(private readonly apiKey: string) {}

  private q(path: string, params: Record<string, string>): string {
    const usp = new URLSearchParams({ ...params, apikey: this.apiKey });
    return `${BASE}${path}?${usp.toString()}`;
  }

  async getQuote(symbol: string, market: Market): Promise<Quote> {
    const params: Record<string, string> = { symbol };
    if (market === "TASE") params.mic_code = "XTAE";
    const res = await fetch(this.q("/quote", params));
    const j = (await res.json()) as Record<string, string>;
    if (j.code || j.status === "error") throw new Error(`twelvedata quote ${symbol}: ${j.message}`);
    return {
      symbol,
      price: Number(j.close),
      currency: market === "TASE" ? "ILS" : "USD",
      percent_change: Number(j.percent_change),
      previous_close: Number(j.previous_close),
    };
  }

  async getUsdIls(): Promise<number> {
    const res = await fetch(this.q("/exchange_rate", { symbol: "USD/ILS" }));
    const j = (await res.json()) as { rate?: number; message?: string };
    if (!j.rate) throw new Error(`twelvedata fx: ${j.message}`);
    return j.rate;
  }

  // Technicals fan-out (RSI/MACD/SMA) is built out in Step 3's datasource pass.
  async getTechnicals(_symbol: string, _market: Market): Promise<Technicals> {
    return DEFAULT_TECHNICALS;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: MarketDataSource | null = null;

export function getMarketData(): MarketDataSource {
  if (instance) return instance;
  instance = isLive("TWELVEDATA_API_KEY")
    ? new LiveMarketData(getEnv().TWELVEDATA_API_KEY!)
    : new MockMarketData();
  return instance;
}
