import type {
  Alert,
  Analysis,
  CachedQuote,
  DailyDigest,
  FxRate,
  Lead,
  PaperPosition,
  PortfolioSnapshot,
  Position,
  Post,
  Recommendation,
  Run,
  Settings,
  Signal,
  Source,
  TrackedRecommendation,
  Transaction,
} from "../types.ts";

// Typed persistence boundary. Two implementations: `mock.ts` (in-memory, seeded)
// and `supabase.ts` (Postgres). A factory picks supabase when SUPABASE_URL is set.

export interface Repository {
  // transactions / positions
  listTransactions(): Promise<Transaction[]>;
  addTransaction(tx: Omit<Transaction, "id" | "created_at">): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  /** Positions are derived from transactions; stored copy used for enrichment. */
  listPositions(): Promise<Position[]>;
  upsertPositions(positions: Position[]): Promise<void>;

  // paper (demo) portfolio — isolated, never affects real positions/pages
  listPaperPositions(): Promise<PaperPosition[]>;
  addPaperPosition(p: Omit<PaperPosition, "id" | "created_at">): Promise<PaperPosition>;
  deletePaperPosition(id: string): Promise<void>;

  // fx + snapshots
  latestFx(): Promise<FxRate | null>;
  saveFx(rate: FxRate): Promise<void>;
  /** Background-refreshed price cache so pages read quotes instantly. */
  listCachedQuotes(): Promise<CachedQuote[]>;
  upsertCachedQuotes(quotes: Omit<CachedQuote, "updated_at">[]): Promise<void>;
  listSnapshots(): Promise<PortfolioSnapshot[]>;
  addSnapshot(s: Omit<PortfolioSnapshot, "id">): Promise<PortfolioSnapshot>;

  // analyses
  listAnalyses(date?: string): Promise<Analysis[]>;
  getAnalysis(ticker: string, date?: string): Promise<Analysis | null>;
  addAnalysis(a: Omit<Analysis, "id" | "created_at">): Promise<Analysis>;

  // scraping
  listSources(activeOnly?: boolean): Promise<Source[]>;
  addSource(s: Omit<Source, "id" | "created_at">): Promise<Source>;
  setSourceActive(id: string, active: boolean): Promise<void>;
  listPosts(sourceId?: string): Promise<Post[]>;
  addPost(p: Omit<Post, "id" | "fetched_at">): Promise<Post>;
  hasPost(sourceId: string, externalId: string): Promise<boolean>;
  addSignal(s: Omit<Signal, "id" | "created_at">): Promise<Signal>;
  listSignals(ticker?: string): Promise<Signal[]>;

  // leads / recommendations
  listLeads(status?: Lead["status"]): Promise<Lead[]>;
  getLeadByTicker(ticker: string): Promise<Lead | null>;
  upsertLead(l: Omit<Lead, "id" | "first_seen" | "updated_at">): Promise<Lead>;
  setLeadStatus(id: string, status: Lead["status"]): Promise<void>;
  listRecommendations(date?: string): Promise<Recommendation[]>;
  addRecommendation(r: Omit<Recommendation, "id" | "created_at">): Promise<Recommendation>;

  // recommendation tracking (7-day follow)
  listTracked(): Promise<TrackedRecommendation[]>;
  upsertTracked(t: Omit<TrackedRecommendation, "id" | "created_at">): Promise<void>;
  deleteTracked(id: string): Promise<void>;
  /** Dismiss a ticker: remove its recommendations, lead and tracking so it can
   *  re-enter fresh if it's recommended again. */
  dismissTicker(ticker: string): Promise<void>;

  // digests + runs + alerts + settings
  listDigests(): Promise<DailyDigest[]>;
  addDigest(d: Omit<DailyDigest, "id" | "created_at">): Promise<DailyDigest>;
  deleteDigest(id: string): Promise<void>;
  listRuns(): Promise<Run[]>;
  startRun(date: string): Promise<Run>;
  finishRun(id: string, patch: Partial<Run>): Promise<void>;
  listAlerts(unreadOnly?: boolean): Promise<Alert[]>;
  addAlert(a: Omit<Alert, "id" | "created_at" | "read">): Promise<Alert>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
}
