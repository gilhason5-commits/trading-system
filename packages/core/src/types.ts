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

/**
 * Cash side of the autonomous paper-trading book. One row. The engine buys with
 * `cash` and sells back into it; total account value = cash + holdings value.
 */
export interface PaperAccount {
  id: string;
  /** Initial cash the book started with (USD). */
  starting_cash: number;
  /** Cash currently available to deploy (USD). */
  cash: number;
  currency: "USD";
  updated_at: string;
}

export type PaperAction = "buy" | "sell";

/** A source quote that fed a trade decision (from the social/RSS scan). */
export interface TradeQuote {
  platform: string;
  handle: string;
  claim: string;
  url: string;
}

/**
 * The full due-diligence snapshot captured at trade time, so /paper can show the
 * complete thinking + verification visually (chart by ticker, score table,
 * analyst targets, market backdrop, and the source quotes that drove it).
 */
export interface TradeDossier {
  market: { regime: string; summary: string };
  scores: {
    technical: number | null;
    fundamental: number | null;
    social: number | null;
    conviction: number | null;
    delta: number | null;
    reinforce: number;
  };
  analyst: {
    target_mean: number | null;
    target_low: number | null;
    target_high: number | null;
    upside_pct: number | null;
    recommendation: string | null;
    big_banks: string[];
  } | null;
  quotes: TradeQuote[];
  /** The multi-day thesis behind the trade: strength, days, and the decision flow. */
  thesis?: { strength: number; days: number; steps: ThesisStep[] };
  /** The exit plan set at entry (buys): stop-loss + take-profit levels + rule. */
  plan?: {
    stop_price: number;
    stop_pct: number;
    target_price: number;
    target_pct: number;
    exit_rule: string;
  };
  /** Return % at exit (sells only). */
  ret_pct?: number;
}

export type ThesisDirection = "long" | "exit";
export type ThesisStatus = "building" | "acted" | "dropped";

/** One dated node in a thesis's research/decision flow (rendered as a flow chart). */
export interface ThesisStep {
  date: string;
  /** Where it looked (e.g. "המלצת המערכת", "סריקת X", "חדשות ואינטרנט", "ניתוח טכני"). */
  stage: string;
  /** What it found. */
  detail: string;
  /** Contribution to the thesis strength (+ strengthens, − weakens). */
  weight: number;
}

/**
 * A multi-day thesis the paper trader builds before acting. A `long` thesis
 * accumulates confirmations toward a buy; an `exit` thesis accumulates warning
 * signs toward a sell. `steps` is the full audit trail shown as a flow chart.
 */
export interface PaperThesis {
  id: string;
  ticker: string;
  direction: ThesisDirection;
  status: ThesisStatus;
  /** Current strength 0–100; the engine acts when it crosses the bar. */
  strength: number;
  /** Days the thesis has been building. */
  days: number;
  first_date: string;
  steps: ThesisStep[];
  updated_at: string;
  created_at: string;
}

/** A single autonomous paper trade, logged with the reason it was taken. */
export interface PaperTrade {
  id: string;
  /** YYYY-MM-DD the trade was executed. */
  date: string;
  ticker: string;
  action: PaperAction;
  qty: number;
  /** Execution price in the instrument's native currency. */
  price: number;
  currency: Currency;
  /** Cash impact in USD (always positive; sign implied by `action`). */
  value_usd: number;
  /** Blended buy-conviction at the time of the trade (0–100), if known. */
  conviction: number | null;
  /** Hebrew explanation of why the engine made this trade. */
  reason: string;
  /** JSON-encoded TradeDossier — the full visual due-diligence at trade time. */
  analysis: string | null;
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
  /** Change in conviction vs the previous run (points; + improved, − worsened). */
  conviction_delta?: number | null;
  created_at: string;
}

/** One piece of raw social evidence captured at observation time. */
export interface SocialEvidenceItem {
  platform: string;
  handle: string;
  claim: string;
  url: string;
  sentiment: Sentiment;
}

/**
 * Immutable point-in-time record of a recommended ticker's factor scores + the
 * raw social evidence behind them, with forward returns filled in as days pass.
 * The validation dataset (see runValidationStage): append-only, never mutated
 * except the forward-return columns. Lets us measure whether the score actually
 * predicts returns (IC / quantiles), including per-source social analysis.
 */
export interface ScoreObservation {
  id: string;
  ticker: string;
  market: Market;
  /** YYYY-MM-DD the ticker was first recommended (point-in-time). */
  obs_date: string;
  /** Price when first observed (entry), native currency. */
  entry_price: number | null;
  entry_currency: Currency | null;
  technical_score: number | null;
  fundamental_score: number | null;
  social_score: number | null;
  conviction: number | null;
  bull_count: number;
  bear_count: number;
  mention_count: number;
  social_evidence: SocialEvidenceItem[];
  /** Forward return (%) vs entry_price at +1/+3/+5/+7 days; null until it elapses. */
  ret_1d: number | null;
  ret_3d: number | null;
  ret_5d: number | null;
  ret_7d: number | null;
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
  /** Today's gain/loss in money (qty × (price − previous close)). */
  day_pl: Dual;
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
  /** General capital-market headlines (Israel + US), rendered as a wide section. */
  market_news?: { headline: string; source: string; region: string }[] | null;
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
  /** Which LLM provider(s) served this run: "Claude", "Grok", or "Claude+Grok". */
  providers?: string | null;
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
