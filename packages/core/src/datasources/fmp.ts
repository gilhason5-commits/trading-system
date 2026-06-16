import { getEnv, isLive } from "../env.ts";

// Financial Modeling Prep — deep fundamentals for US stocks (spec §3.2).
// Endpoints: /income-statement, /ratios, /key-metrics, /profile, /earning_calendar.

export interface Fundamentals {
  ticker: string;
  sector: string;
  /** Net profit margin as a fraction (e.g. 0.25 = 25%). */
  net_margin: number;
  /** YoY revenue growth as a fraction. */
  revenue_growth: number;
  /** Price-to-earnings ratio. */
  pe_ratio: number;
  /** Debt-to-equity ratio. */
  debt_to_equity: number;
  /** Next expected earnings date (ISO date). */
  next_earnings_date: string;
  /** Earnings surprise for the most recent quarter as a fraction (0.05 = beat by 5%). */
  last_earnings_surprise: number;
  /** Analyst consensus price target in USD. */
  analyst_price_target: number;
}

export interface FundamentalsSource {
  getFundamentals(ticker: string): Promise<Fundamentals>;
}

// ── Mock ──────────────────────────────────────────────────────────────────
const MOCK_FUNDAMENTALS: Record<string, Fundamentals> = {
  AAPL: {
    ticker: "AAPL", sector: "Technology",
    net_margin: 0.255, revenue_growth: 0.064, pe_ratio: 29.4, debt_to_equity: 1.75,
    next_earnings_date: "2026-07-31", last_earnings_surprise: 0.048, analyst_price_target: 235,
  },
  NVDA: {
    ticker: "NVDA", sector: "Technology",
    net_margin: 0.558, revenue_growth: 1.22, pe_ratio: 45.2, debt_to_equity: 0.41,
    next_earnings_date: "2026-08-20", last_earnings_surprise: 0.118, analyst_price_target: 200,
  },
  MSFT: {
    ticker: "MSFT", sector: "Technology",
    net_margin: 0.361, revenue_growth: 0.158, pe_ratio: 34.1, debt_to_equity: 0.87,
    next_earnings_date: "2026-07-24", last_earnings_surprise: 0.032, analyst_price_target: 510,
  },
  SOFI: {
    ticker: "SOFI", sector: "Financial Services",
    net_margin: 0.062, revenue_growth: 0.212, pe_ratio: 22.8, debt_to_equity: 2.34,
    next_earnings_date: "2026-07-29", last_earnings_surprise: 0.091, analyst_price_target: 17.5,
  },
  RKLB: {
    ticker: "RKLB", sector: "Aerospace & Defense",
    net_margin: -0.182, revenue_growth: 0.78, pe_ratio: -1, debt_to_equity: 0.62,
    next_earnings_date: "2026-08-12", last_earnings_surprise: 0.055, analyst_price_target: 32,
  },
};

const DEFAULT_FUNDAMENTALS: Omit<Fundamentals, "ticker"> = {
  sector: "Unknown",
  net_margin: 0.1, revenue_growth: 0.05, pe_ratio: 20, debt_to_equity: 1.0,
  next_earnings_date: "2026-09-01", last_earnings_surprise: 0, analyst_price_target: 0,
};

export class MockFundamentals implements FundamentalsSource {
  async getFundamentals(ticker: string): Promise<Fundamentals> {
    return MOCK_FUNDAMENTALS[ticker] ?? { ticker, ...DEFAULT_FUNDAMENTALS };
  }
}

// ── Live ──────────────────────────────────────────────────────────────────
const BASE = "https://financialmodelingprep.com/api/v3";

export class LiveFundamentals implements FundamentalsSource {
  constructor(private readonly apiKey: string) {}

  private url(path: string, extra: Record<string, string> = {}): string {
    const usp = new URLSearchParams({ apikey: this.apiKey, ...extra });
    return `${BASE}${path}?${usp.toString()}`;
  }

  async getFundamentals(ticker: string): Promise<Fundamentals> {
    const [incomeRes, ratiosRes, metricsRes, profileRes, calendarRes] = await Promise.all([
      fetch(this.url(`/income-statement/${ticker}`, { limit: "1" })),
      fetch(this.url(`/ratios/${ticker}`, { limit: "1" })),
      fetch(this.url(`/key-metrics/${ticker}`, { limit: "1" })),
      fetch(this.url(`/profile/${ticker}`)),
      fetch(this.url(`/earning_calendar`, { symbol: ticker })),
    ]);

    if (!incomeRes.ok) throw new Error(`FMP income-statement ${ticker}: HTTP ${incomeRes.status}`);
    if (!ratiosRes.ok) throw new Error(`FMP ratios ${ticker}: HTTP ${ratiosRes.status}`);
    if (!metricsRes.ok) throw new Error(`FMP key-metrics ${ticker}: HTTP ${metricsRes.status}`);
    if (!profileRes.ok) throw new Error(`FMP profile ${ticker}: HTTP ${profileRes.status}`);
    if (!calendarRes.ok) throw new Error(`FMP earning_calendar ${ticker}: HTTP ${calendarRes.status}`);

    const income = ((await incomeRes.json()) as Record<string, unknown>[])[0] ?? {};
    const ratios = ((await ratiosRes.json()) as Record<string, unknown>[])[0] ?? {};
    const metrics = ((await metricsRes.json()) as Record<string, unknown>[])[0] ?? {};
    const profiles = (await profileRes.json()) as Record<string, unknown>[];
    const profile = profiles[0] ?? {};
    const calendar = (await calendarRes.json()) as Record<string, unknown>[];

    const revenueArr = income as { revenue?: number; netIncome?: number; revenueGrowth?: number };
    const rev = Number(revenueArr.revenue ?? 0);
    const net = Number(revenueArr.netIncome ?? 0);
    const net_margin = rev > 0 ? net / rev : 0;

    // Revenue growth from ratios endpoint (revenueGrowth field)
    const revenue_growth = Number((ratios as Record<string, unknown>).revenueGrowth ?? 0);

    const pe_ratio = Number((ratios as Record<string, unknown>).priceEarningsRatio ?? (metrics as Record<string, unknown>).peRatio ?? 0);
    const debt_to_equity = Number((ratios as Record<string, unknown>).debtEquityRatio ?? 0);

    const sector = String((profile as Record<string, unknown>).sector ?? "Unknown");
    const analyst_price_target = Number((profile as Record<string, unknown>).price ?? 0);

    // Next upcoming earnings date
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = calendar.filter((e) => {
      const d = String((e as Record<string, unknown>).date ?? "");
      return d >= today;
    });
    const next_earnings_date = upcoming.length > 0
      ? String((upcoming[0] as Record<string, unknown>).date ?? "")
      : "";

    // Last earnings surprise
    const past = calendar.filter((e) => {
      const d = String((e as Record<string, unknown>).date ?? "");
      return d < today;
    });
    let last_earnings_surprise = 0;
    if (past.length > 0) {
      const last = past[past.length - 1] as Record<string, unknown>;
      const eps = Number(last.eps ?? 0);
      const epsEst = Number(last.epsEstimated ?? eps);
      last_earnings_surprise = epsEst !== 0 ? (eps - epsEst) / Math.abs(epsEst) : 0;
    }

    return {
      ticker, sector, net_margin, revenue_growth, pe_ratio, debt_to_equity,
      next_earnings_date, last_earnings_surprise, analyst_price_target,
    };
  }
}

// ── Live (Finnhub Basic Financials) ─────────────────────────────────────────
// FMP's free tier 403s on financial statements, so fundamentals default to
// Finnhub's /stock/metric (free) — P/E, margins, revenue growth, leverage.
const FINNHUB_BASE = "https://finnhub.io/api/v1";

export class LiveFinnhubFundamentals implements FundamentalsSource {
  constructor(private readonly token: string) {}

  async getFundamentals(ticker: string): Promise<Fundamentals> {
    const t = encodeURIComponent(ticker);
    const [mRes, pRes] = await Promise.all([
      fetch(`${FINNHUB_BASE}/stock/metric?symbol=${t}&metric=all&token=${this.token}`),
      fetch(`${FINNHUB_BASE}/stock/profile2?symbol=${t}&token=${this.token}`),
    ]);
    if (!mRes.ok) throw new Error(`Finnhub metric ${ticker}: HTTP ${mRes.status}`);
    const mj = (await mRes.json()) as { metric?: Record<string, unknown> };
    const m = mj.metric ?? {};
    const profile = pRes.ok ? ((await pRes.json()) as Record<string, unknown>) : {};
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      ticker,
      sector: String(profile.finnhubIndustry ?? "Unknown"),
      net_margin: num(m.netProfitMarginTTM) / 100,
      revenue_growth: num(m.revenueGrowthTTMYoy) / 100,
      pe_ratio: num(m.peTTM),
      debt_to_equity: num(
        m["totalDebt/totalEquityQuarterly"] ?? m["totalDebt/totalEquityAnnual"] ?? m["longTermDebt/equityQuarterly"],
      ),
      next_earnings_date: "",
      last_earnings_surprise: 0,
      analyst_price_target: 0,
    };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: FundamentalsSource | null = null;

export function getFundamentals(): FundamentalsSource {
  if (instance) return instance;
  // Prefer Finnhub (free fundamentals work); fall back to FMP if its key is set.
  if (isLive("FINNHUB_API_KEY")) instance = new LiveFinnhubFundamentals(getEnv().FINNHUB_API_KEY!);
  else if (isLive("FMP_API_KEY")) instance = new LiveFundamentals(getEnv().FMP_API_KEY!);
  else instance = new MockFundamentals();
  return instance;
}
