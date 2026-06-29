import { getEnv, isLive } from "../env.ts";
import type { Currency, Market } from "../types.ts";
import { fetchHistoricalTechnicals } from "./technicals.ts";
import { fetchYahooQuote } from "./yahoo.ts";

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
  /** Average True Range (14) — volatility, for volatility-scaled stops. */
  atr?: number;
  /** 20-day EMA — short-term reference for the anti-extension entry gate. */
  ema20?: number;
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

// Free tier allows 8 requests/minute. Serialize + space calls (~7.5/min) so a
// burst (quote + 4 indicators per position) never trips the per-minute limit.
const TD_MIN_GAP_MS = 8000;
let tdNextSlot = 0;
async function tdFetch(url: string): Promise<Response> {
  const now = Date.now();
  const start = Math.max(now, tdNextSlot);
  tdNextSlot = start + TD_MIN_GAP_MS;
  const wait = start - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return fetch(url);
}

export class LiveMarketData implements MarketDataSource {
  constructor(private readonly apiKey: string) {}

  private q(path: string, params: Record<string, string>): string {
    const usp = new URLSearchParams({ ...params, apikey: this.apiKey });
    return `${BASE}${path}?${usp.toString()}`;
  }

  async getQuote(symbol: string, market: Market): Promise<Quote> {
    const params: Record<string, string> = { symbol };
    if (market === "TASE") params.mic_code = "XTAE";
    const res = await tdFetch(this.q("/quote", params));
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
    const res = await tdFetch(this.q("/exchange_rate", { symbol: "USD/ILS" }));
    const j = (await res.json()) as { rate?: number; message?: string };
    if (!j.rate) throw new Error(`twelvedata fx: ${j.message}`);
    return j.rate;
  }

  async getTechnicals(symbol: string, market: Market): Promise<Technicals> {
    const base: Record<string, string> = { symbol, interval: "1day" };
    if (market === "TASE") base.mic_code = "XTAE";

    const [rsiRes, macdRes, sma50Res, sma200Res, atrRes] = await Promise.all([
      tdFetch(this.q("/rsi", { ...base, time_period: "14" })),
      tdFetch(this.q("/macd", { ...base, fast_period: "12", slow_period: "26", signal_period: "9" })),
      tdFetch(this.q("/sma", { ...base, time_period: "50" })),
      tdFetch(this.q("/sma", { ...base, time_period: "200" })),
      tdFetch(this.q("/atr", { ...base, time_period: "14" })),
    ]);

    if (!rsiRes.ok) throw new Error(`twelvedata rsi ${symbol}: HTTP ${rsiRes.status}`);
    if (!macdRes.ok) throw new Error(`twelvedata macd ${symbol}: HTTP ${macdRes.status}`);
    if (!sma50Res.ok) throw new Error(`twelvedata sma50 ${symbol}: HTTP ${sma50Res.status}`);
    if (!sma200Res.ok) throw new Error(`twelvedata sma200 ${symbol}: HTTP ${sma200Res.status}`);

    const rsiJ = (await rsiRes.json()) as { values?: Array<{ rsi?: string }>; message?: string; status?: string };
    const macdJ = (await macdRes.json()) as { values?: Array<{ macd?: string; macd_signal?: string }>; message?: string; status?: string };
    const sma50J = (await sma50Res.json()) as { values?: Array<{ sma?: string }>; message?: string; status?: string };
    const sma200J = (await sma200Res.json()) as { values?: Array<{ sma?: string }>; message?: string; status?: string };

    if (rsiJ.status === "error") throw new Error(`twelvedata rsi ${symbol}: ${rsiJ.message}`);
    if (macdJ.status === "error") throw new Error(`twelvedata macd ${symbol}: ${macdJ.message}`);
    if (sma50J.status === "error") throw new Error(`twelvedata sma50 ${symbol}: ${sma50J.message}`);
    if (sma200J.status === "error") throw new Error(`twelvedata sma200 ${symbol}: ${sma200J.message}`);

    const rsi = Number(rsiJ.values?.[0]?.rsi ?? 50);
    const macd = Number(macdJ.values?.[0]?.macd ?? 0);
    const macd_signal = Number(macdJ.values?.[0]?.macd_signal ?? 0);
    const sma50 = Number(sma50J.values?.[0]?.sma ?? 0);
    const sma200 = Number(sma200J.values?.[0]?.sma ?? 0);
    const atrJ = (await atrRes.json().catch(() => ({}))) as { values?: Array<{ atr?: string }> };
    const atr = Number(atrJ.values?.[0]?.atr ?? 0) || undefined;

    // Trend: "up" when sma50 > sma200 (golden-cross structure), "down" when sma50 < sma200, else "flat"
    const gap = sma200 > 0 ? (sma50 - sma200) / sma200 : 0;
    const trend: "up" | "down" | "flat" =
      gap > 0.005 ? "up" : gap < -0.005 ? "down" : "flat";

    return { rsi, macd, macd_signal, sma50, sma200, atr, trend };
  }
}

// ── Hybrid (Finnhub quotes + free FX, Twelve Data technicals) ───────────────
// Twelve Data free is capped at 800 credits/DAY, so it can't sustain a few-minute
// price poll. Finnhub free (60/min, no hard daily cap) serves quotes; USD/ILS
// comes from a free no-key FX API (also fixes Twelve Data's wrong ~2.91 rate).
// Technicals stay on Twelve Data — they're only fetched once/day in research.
const FINNHUB = "https://finnhub.io/api/v1";

export class HybridMarketData implements MarketDataSource {
  private readonly td: LiveMarketData;
  constructor(
    private readonly finnhubKey: string,
    twelveDataKey?: string,
  ) {
    this.td = new LiveMarketData(twelveDataKey ?? "");
  }

  async getQuote(symbol: string, market: Market): Promise<Quote> {
    // US equities: Yahoo first — it's the only free source that prices the
    // pre-market / post-market sessions (marketState-aware). Finnhub (regular
    // session only) is the fast fallback if Yahoo is unavailable.
    if (market === "US") {
      try {
        return await fetchYahooQuote(symbol, market);
      } catch {
        // fall through to Finnhub regular-session quote
      }
      const res = await fetch(`${FINNHUB}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.finnhubKey}`);
      if (res.ok) {
        const j = (await res.json()) as { c?: number; dp?: number; pc?: number };
        if (typeof j.c === "number" && j.c > 0) {
          return {
            symbol,
            price: j.c,
            currency: "USD",
            percent_change: j.dp ?? 0,
            previous_close: j.pc ?? j.c,
          };
        }
      }
    }
    return this.td.getQuote(symbol, market);
  }

  async getUsdIls(): Promise<number> {
    for (const url of [
      "https://open.er-api.com/v6/latest/USD",
      "https://api.exchangerate.host/latest?base=USD&symbols=ILS",
    ]) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const j = (await res.json()) as { rates?: { ILS?: number } };
        const ils = j?.rates?.ILS;
        if (typeof ils === "number" && ils > 0) return ils;
      } catch {
        // try the next source
      }
    }
    return 3.6; // last-resort fallback
  }

  async getTechnicals(symbol: string, market: Market): Promise<Technicals> {
    // Prefer free/unlimited stooq-computed indicators; Twelve Data as fallback.
    try {
      return await fetchHistoricalTechnicals(symbol, market);
    } catch {
      return this.td.getTechnicals(symbol, market);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: MarketDataSource | null = null;

export function getMarketData(): MarketDataSource {
  if (instance) return instance;
  const env = getEnv();
  if (env.DATA_MODE === "live" && env.FINNHUB_API_KEY) {
    instance = new HybridMarketData(env.FINNHUB_API_KEY, env.TWELVEDATA_API_KEY);
  } else if (isLive("TWELVEDATA_API_KEY")) {
    instance = new LiveMarketData(env.TWELVEDATA_API_KEY!);
  } else {
    instance = new MockMarketData();
  }
  return instance;
}
