// Domain types — mirror the Supabase data model (spec §10).
// Base currency for all computation is USD; ILS is a display concern (see money.ts).

export type Market = "US" | "TASE" | "crypto";
export type Currency = "USD" | "ILS";
export type Side = "buy" | "sell";
export type Stance = "hold" | "add" | "trim";
export type LeadStatus = "new" | "researching" | "recommended" | "dismissed";
export type Platform = "youtube" | "tiktok" | "instagram" | "rss" | "x";
export type Sentiment = "bullish" | "bearish" | "neutral";

/** A money amount carried in both base (USD) and display (ILS) currency. */
export interface Dual {
  usd: number;
  ils: number;
}

/** Manually-entered trade. Source of truth for holdings (spec §5). */
export interface Transaction {
  id: string;
  ticker: string;
  market: Market;
  side: Side;
  qty: number;
  /** Execution price in `currency`. */
  price: number;
  currency: Currency;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  note?: string;
  created_at: string;
}

/** Derived holding computed from transactions (avg cost basis). */
export interface Position {
  ticker: string;
  market: Market;
  qty: number;
  /** Average cost basis in the position's native `currency`. */
  avg_cost: number;
  currency: Currency;
  sector?: string;
}

/**
 * A holding in the isolated paper (demo) portfolio. Structurally a superset of
 * Position so it reuses enrichPositions/computeStats, but stored directly
 * (entry price = current price at add time) and kept apart from real positions.
 */
export interface PaperPosition extends Position {
  id: string;
  /** ISO timestamp when the position was opened (entry). */
  created_at: string;
}

/** A recommended ticker followed for 7 days after it's first recommended. */
export interface TrackedRecommendation {
  id: string;
  ticker: string;
  /** YYYY-MM-DD it was first recommended. */
  first_date: string;
  /** YYYY-MM-DD it most recently appeared in the daily recommendations. */
  last_seen_date: string;
  /** Price when first tracked (entry), native currency. */
  entry_price: number | null;
  entry_currency: Currency | null;
  initial_social_score: number;
  last_social_score: number;
  /** Times it reappeared in the daily recommendations after the first. */
  reinforce_count: number;
  sentiment_trend: "new" | "strengthened" | "weakened" | "stable";
  /** YYYY-MM-DD the 7-day follow window ends. */
  expires_date: string;
  /** Daily conviction breakdown (0–100, 50 neutral); blended buy-conviction. */
  technical_score?: number | null;
  fundamental_score?: number | null;
  social_score?: number | null;
  conviction?: number | null;
  created_at: string;
}

/** A position enriched with live price + P&L, ready for the dashboard. */
export interface PositionView extends Position {
  price_native: number;
  market_value: Dual;
  cost_basis: Dual;
  unrealized_pl: Dual;
  unrealized_pl_pct: number;
  day_change_pct: number;
  weight_pct: number;
}

export interface FxRate {
  pair: "USD/ILS";
  rate: number;
  as_of: string;
}

/** Latest cached price per ticker, refreshed in the background by pollPrices. */
export interface CachedQuote {
  ticker: string;
  market: Market;
  price: number;
  percent_change: number;
  currency: Currency;
  previous_close: number;
  updated_at: string;
}

export interface PortfolioSnapshot {
  id: string;
  date: string;
  total_value_usd: number;
  total_value_ils: number;
  total_pl_usd: number;
}

/** Claude's daily per-position analysis (spec §6). */
export interface Analysis {
  id: string;
  ticker: string;
  date: string;
  stance: Stance;
  technical_summary: string;
  fundamental_summary: string;
  key_events: string[];
  risk_flags: string[];
  /** 0.0–1.0 */
  confidence: number;
  created_at: string;
}

export interface Source {
  id: string;
  platform: Platform;
  /** @handle, channel id, or RSS feed URL. */
  handle: string;
  active: boolean;
  created_at: string;
}

export interface Post {
  id: string;
  source_id: string;
  external_id: string;
  url: string;
  title?: string;
  text?: string;
  transcript?: string;
  published_at: string;
  fetched_at: string;
}

export interface Signal {
  id: string;
  post_id: string;
  ticker: string;
  sentiment: Sentiment;
  claim: string;
  created_at: string;
}

export interface Lead {
  id: string;
  ticker: string;
  market: Market;
  status: LeadStatus;
  /** count of independent sources that mentioned the ticker */
  mention_count: number;
  first_seen: string;
  updated_at: string;
}

export interface Recommendation {
  id: string;
  lead_id: string;
  ticker: string;
  date: string;
  /** objective analysis score 0–100 (spec §8) */
  system_score: number;
  /** social signal strength 0–100 (spec §8) */
  social_score: number;
  rationale: string;
  manipulation_flag: boolean;
  /** Objective data sources that actually returned data during research (audit). */
  verified_sources: string[];
  created_at: string;
}

export interface DailyDigest {
  id: string;
  date: string;
  html: string;
  key_insights: string[];
  created_at: string;
}

/** Cost log for a daily pipeline run (spec §5). */
export interface Run {
  id: string;
  date: string;
  tokens_in: number;
  tokens_out: number;
  claude_cost: number;
  scraping_cost: number;
  total_cost: number;
  started_at: string;
  finished_at?: string;
  status: "running" | "ok" | "error";
}

export interface Alert {
  id: string;
  kind: "concentration" | "manipulation" | "error" | "earnings";
  ticker?: string;
  message: string;
  created_at: string;
  read: boolean;
}

export interface Settings {
  id: string;
  /** HH:MM in Israel time for the daily digest */
  digest_time: string;
  /** concentration warning threshold as a fraction (e.g. 0.25 = 25%) */
  concentration_threshold: number;
  digest_email: string;
}
