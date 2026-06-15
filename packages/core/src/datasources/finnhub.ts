import { getEnv, isLive } from "../env.ts";
import type { Sentiment } from "../types.ts";

// Finnhub — company news + sentiment for US stocks (spec §3.2).
// Endpoints: /company-news, /news-sentiment.

export interface NewsItem {
  headline: string;
  url: string;
  datetime: string;
  source: string;
  summary?: string;
}

export interface NewsSentiment {
  score: number;
  sentiment: Sentiment;
}

export interface NewsSource {
  getNews(ticker: string, from: string, to: string): Promise<NewsItem[]>;
  getSentiment(ticker: string): Promise<NewsSentiment>;
}

// ── Mock ──────────────────────────────────────────────────────────────────
const MOCK_NEWS: Record<string, NewsItem[]> = {
  AAPL: [
    {
      headline: "Apple Vision Pro sales surge as enterprise adoption grows",
      url: "https://example.com/aapl-1",
      datetime: "2026-06-15T08:00:00.000Z",
      source: "Reuters",
      summary: "Enterprise customers are driving Vision Pro adoption beyond consumer expectations.",
    },
    {
      headline: "WWDC 2026: Apple announces AI-native iOS features",
      url: "https://example.com/aapl-2",
      datetime: "2026-06-14T14:00:00.000Z",
      source: "Bloomberg",
      summary: "Apple's developer conference reveals deep AI integration across all products.",
    },
  ],
  NVDA: [
    {
      headline: "Nvidia data center revenue hits new record in Q2",
      url: "https://example.com/nvda-1",
      datetime: "2026-06-15T09:30:00.000Z",
      source: "CNBC",
      summary: "Blackwell GPU demand continues to outpace supply across hyperscalers.",
    },
    {
      headline: "Nvidia expands partnership with leading cloud providers",
      url: "https://example.com/nvda-2",
      datetime: "2026-06-13T11:00:00.000Z",
      source: "WSJ",
    },
  ],
  MSFT: [
    {
      headline: "Microsoft Copilot adoption accelerates across enterprise customers",
      url: "https://example.com/msft-1",
      datetime: "2026-06-15T07:00:00.000Z",
      source: "FT",
      summary: "Azure OpenAI Service revenue growing at triple-digit rate.",
    },
  ],
  SOFI: [
    {
      headline: "SoFi beats member growth estimates with 850k new accounts",
      url: "https://example.com/sofi-1",
      datetime: "2026-06-15T10:00:00.000Z",
      source: "MarketWatch",
      summary: "The fintech bank continues its transition toward profitability.",
    },
  ],
  RKLB: [
    {
      headline: "Rocket Lab wins NASA contract for lunar mission support",
      url: "https://example.com/rklb-1",
      datetime: "2026-06-14T16:00:00.000Z",
      source: "Space News",
      summary: "Electron rocket selected for high-cadence small-satellite deployment.",
    },
  ],
};

const DEFAULT_NEWS: NewsItem[] = [
  {
    headline: "Markets mixed amid macro uncertainty",
    url: "https://example.com/market-1",
    datetime: "2026-06-15T08:00:00.000Z",
    source: "Reuters",
    summary: "Broad indices trade sideways as investors await Fed commentary.",
  },
];

const MOCK_SENTIMENT: Record<string, NewsSentiment> = {
  AAPL: { score: 0.72, sentiment: "bullish" },
  NVDA: { score: 0.85, sentiment: "bullish" },
  MSFT: { score: 0.61, sentiment: "bullish" },
  SOFI: { score: 0.58, sentiment: "bullish" },
  RKLB: { score: 0.52, sentiment: "neutral" },
  "BTC/USD": { score: 0.50, sentiment: "neutral" },
  TEVA: { score: 0.38, sentiment: "bearish" },
};

const DEFAULT_SENTIMENT: NewsSentiment = { score: 0.5, sentiment: "neutral" };

export class MockNews implements NewsSource {
  async getNews(ticker: string, _from: string, _to: string): Promise<NewsItem[]> {
    return MOCK_NEWS[ticker] ?? DEFAULT_NEWS;
  }
  async getSentiment(ticker: string): Promise<NewsSentiment> {
    return MOCK_SENTIMENT[ticker] ?? DEFAULT_SENTIMENT;
  }
}

// ── Live ──────────────────────────────────────────────────────────────────
const BASE = "https://finnhub.io/api/v1";

interface FinnhubNewsItem {
  headline?: string;
  url?: string;
  datetime?: number;
  source?: string;
  summary?: string;
}

interface FinnhubSentiment {
  sentiment?: { bearishPercent?: number; bullishPercent?: number };
  companyNewsScore?: number;
}

export class LiveNews implements NewsSource {
  constructor(private readonly apiKey: string) {}

  private url(path: string, params: Record<string, string>): string {
    const usp = new URLSearchParams({ ...params, token: this.apiKey });
    return `${BASE}${path}?${usp.toString()}`;
  }

  async getNews(ticker: string, from: string, to: string): Promise<NewsItem[]> {
    const res = await fetch(this.url("/company-news", { symbol: ticker, from, to }));
    if (!res.ok) throw new Error(`Finnhub company-news ${ticker}: HTTP ${res.status}`);
    const items = (await res.json()) as FinnhubNewsItem[];
    return items.map((i) => ({
      headline: i.headline ?? "",
      url: i.url ?? "",
      datetime: i.datetime != null ? new Date(i.datetime * 1000).toISOString() : "",
      source: i.source ?? "",
      summary: i.summary,
    }));
  }

  async getSentiment(ticker: string): Promise<NewsSentiment> {
    const res = await fetch(this.url("/news-sentiment", { symbol: ticker }));
    if (!res.ok) throw new Error(`Finnhub news-sentiment ${ticker}: HTTP ${res.status}`);
    const data = (await res.json()) as FinnhubSentiment;
    const score = data.companyNewsScore ?? 0.5;
    const bullish = data.sentiment?.bullishPercent ?? 0;
    const bearish = data.sentiment?.bearishPercent ?? 0;
    const sentiment: Sentiment =
      bullish > bearish + 0.1 ? "bullish" :
      bearish > bullish + 0.1 ? "bearish" : "neutral";
    return { score, sentiment };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: NewsSource | null = null;

export function getNews(): NewsSource {
  if (instance) return instance;
  instance = isLive("FINNHUB_API_KEY")
    ? new LiveNews(getEnv().FINNHUB_API_KEY!)
    : new MockNews();
  return instance;
}
