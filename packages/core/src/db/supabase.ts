import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
import type { Repository } from "./repository.ts";

// ---------------------------------------------------------------------------
// SupabaseRepository — thin Postgres-backed implementation of Repository.
// Uses service-role key; no RLS. Session persistence disabled (server-side).
// ---------------------------------------------------------------------------

export class SupabaseRepository implements Repository {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private fail(error: { message: string }): never {
    throw new Error(error.message);
  }

  private now(): string {
    return new Date().toISOString();
  }

  // -------------------------------------------------------------------------
  // transactions / positions
  // -------------------------------------------------------------------------

  async listTransactions(): Promise<Transaction[]> {
    const { data, error } = await this.db
      .from("transactions")
      .select("*")
      .order("date", { ascending: false });
    if (error) this.fail(error);
    return (data ?? []) as Transaction[];
  }

  async addTransaction(tx: Omit<Transaction, "id" | "created_at">): Promise<Transaction> {
    const { data, error } = await this.db
      .from("transactions")
      .insert(tx)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Transaction;
  }

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await this.db
      .from("transactions")
      .delete()
      .eq("id", id);
    if (error) this.fail(error);
  }

  async listPositions(): Promise<Position[]> {
    const { data, error } = await this.db
      .from("positions")
      .select("*");
    if (error) this.fail(error);
    return (data ?? []) as Position[];
  }

  async upsertPositions(positions: Position[]): Promise<void> {
    // Upsert on the ticker unique constraint. If positions is empty, delete all.
    if (positions.length === 0) {
      const { error } = await this.db.from("positions").delete().neq("id", "");
      if (error) this.fail(error);
      return;
    }
    const { error } = await this.db
      .from("positions")
      .upsert(positions, { onConflict: "ticker" });
    if (error) this.fail(error);
  }

  async listPaperPositions(): Promise<PaperPosition[]> {
    const { data, error } = await this.db
      .from("paper_positions")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) this.fail(error);
    return (data ?? []) as PaperPosition[];
  }

  async addPaperPosition(p: Omit<PaperPosition, "id" | "created_at">): Promise<PaperPosition> {
    const { data, error } = await this.db
      .from("paper_positions")
      .insert(p)
      .select()
      .single();
    if (error) this.fail(error);
    return data as PaperPosition;
  }

  async deletePaperPosition(id: string): Promise<void> {
    const { error } = await this.db.from("paper_positions").delete().eq("id", id);
    if (error) this.fail(error);
  }

  // -------------------------------------------------------------------------
  // fx + snapshots
  // -------------------------------------------------------------------------

  async latestFx(): Promise<FxRate | null> {
    const { data, error } = await this.db
      .from("fx_rates")
      .select("*")
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail(error);
    return data as FxRate | null;
  }

  async saveFx(rate: FxRate): Promise<void> {
    const { error } = await this.db.from("fx_rates").insert(rate);
    if (error) this.fail(error);
  }

  async listCachedQuotes(): Promise<CachedQuote[]> {
    const { data, error } = await this.db.from("quote_cache").select("*");
    if (error) this.fail(error);
    return (data ?? []) as CachedQuote[];
  }

  async upsertCachedQuotes(quotes: Omit<CachedQuote, "updated_at">[]): Promise<void> {
    if (quotes.length === 0) return;
    const rows = quotes.map((q) => ({ ...q, updated_at: this.now() }));
    const { error } = await this.db.from("quote_cache").upsert(rows, { onConflict: "ticker" });
    if (error) this.fail(error);
  }

  async listSnapshots(): Promise<PortfolioSnapshot[]> {
    const { data, error } = await this.db
      .from("portfolio_snapshots")
      .select("*")
      .order("date", { ascending: true });
    if (error) this.fail(error);
    return (data ?? []) as PortfolioSnapshot[];
  }

  async addSnapshot(s: Omit<PortfolioSnapshot, "id">): Promise<PortfolioSnapshot> {
    const { data, error } = await this.db
      .from("portfolio_snapshots")
      .insert(s)
      .select()
      .single();
    if (error) this.fail(error);
    return data as PortfolioSnapshot;
  }

  // -------------------------------------------------------------------------
  // analyses
  // -------------------------------------------------------------------------

  async listAnalyses(date?: string): Promise<Analysis[]> {
    let q = this.db.from("analyses").select("*");
    if (date) q = q.eq("date", date);
    const { data, error } = await q;
    if (error) this.fail(error);
    return (data ?? []) as Analysis[];
  }

  async getAnalysis(ticker: string, date?: string): Promise<Analysis | null> {
    let q = this.db
      .from("analyses")
      .select("*")
      .eq("ticker", ticker);
    if (date) q = q.eq("date", date);
    const { data, error } = await q
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail(error);
    return data as Analysis | null;
  }

  async addAnalysis(a: Omit<Analysis, "id" | "created_at">): Promise<Analysis> {
    const { data, error } = await this.db
      .from("analyses")
      .insert(a)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Analysis;
  }

  // -------------------------------------------------------------------------
  // scraping
  // -------------------------------------------------------------------------

  async listSources(activeOnly?: boolean): Promise<Source[]> {
    let q = this.db.from("sources").select("*");
    if (activeOnly) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) this.fail(error);
    return (data ?? []) as Source[];
  }

  async addSource(s: Omit<Source, "id" | "created_at">): Promise<Source> {
    const { data, error } = await this.db
      .from("sources")
      .insert(s)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Source;
  }

  async setSourceActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.db
      .from("sources")
      .update({ active })
      .eq("id", id);
    if (error) this.fail(error);
  }

  async listPosts(sourceId?: string): Promise<Post[]> {
    let q = this.db.from("posts").select("*");
    if (sourceId) q = q.eq("source_id", sourceId);
    const { data, error } = await q;
    if (error) this.fail(error);
    return (data ?? []) as Post[];
  }

  async addPost(p: Omit<Post, "id" | "fetched_at">): Promise<Post> {
    // fetched_at has no DB default — we must supply it
    const row = { ...p, fetched_at: this.now() };
    const { data, error } = await this.db
      .from("posts")
      .insert(row)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Post;
  }

  async hasPost(sourceId: string, externalId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("posts")
      .select("id")
      .eq("source_id", sourceId)
      .eq("external_id", externalId)
      .limit(1)
      .maybeSingle();
    if (error) this.fail(error);
    return data !== null;
  }

  async addSignal(s: Omit<Signal, "id" | "created_at">): Promise<Signal> {
    const { data, error } = await this.db
      .from("signals")
      .insert(s)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Signal;
  }

  async listSignals(ticker?: string): Promise<Signal[]> {
    let q = this.db.from("signals").select("*");
    if (ticker) q = q.eq("ticker", ticker);
    const { data, error } = await q;
    if (error) this.fail(error);
    return (data ?? []) as Signal[];
  }

  // -------------------------------------------------------------------------
  // leads / recommendations
  // -------------------------------------------------------------------------

  async listLeads(status?: Lead["status"]): Promise<Lead[]> {
    let q = this.db.from("leads").select("*");
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) this.fail(error);
    return (data ?? []) as Lead[];
  }

  async getLeadByTicker(ticker: string): Promise<Lead | null> {
    const { data, error } = await this.db
      .from("leads")
      .select("*")
      .eq("ticker", ticker)
      .maybeSingle();
    if (error) this.fail(error);
    return data as Lead | null;
  }

  async upsertLead(l: Omit<Lead, "id" | "first_seen" | "updated_at">): Promise<Lead> {
    // leads.first_seen has no DB default — must be supplied on insert.
    // Strategy: get-then-insert-or-update so we can handle first_seen correctly.
    const existing = await this.getLeadByTicker(l.ticker);
    const ts = this.now();

    if (existing) {
      const { data, error } = await this.db
        .from("leads")
        .update({
          mention_count: l.mention_count,
          status: l.status,
          market: l.market,
          updated_at: ts,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) this.fail(error);
      return data as Lead;
    }

    const { data, error } = await this.db
      .from("leads")
      .insert({ ...l, first_seen: ts, updated_at: ts })
      .select()
      .single();
    if (error) this.fail(error);
    return data as Lead;
  }

  async setLeadStatus(id: string, status: Lead["status"]): Promise<void> {
    const { error } = await this.db
      .from("leads")
      .update({ status, updated_at: this.now() })
      .eq("id", id);
    if (error) this.fail(error);
  }

  async listRecommendations(date?: string): Promise<Recommendation[]> {
    let q = this.db.from("recommendations").select("*");
    if (date) q = q.eq("date", date);
    const { data, error } = await q;
    if (error) this.fail(error);
    return (data ?? []) as Recommendation[];
  }

  async addRecommendation(r: Omit<Recommendation, "id" | "created_at">): Promise<Recommendation> {
    const { data, error } = await this.db
      .from("recommendations")
      .insert(r)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Recommendation;
  }

  async listTracked(): Promise<TrackedRecommendation[]> {
    const { data, error } = await this.db
      .from("tracked_recommendations")
      .select("*")
      .order("last_seen_date", { ascending: false });
    if (error) this.fail(error);
    return (data ?? []) as TrackedRecommendation[];
  }

  async upsertTracked(t: Omit<TrackedRecommendation, "id" | "created_at">): Promise<void> {
    const { error } = await this.db
      .from("tracked_recommendations")
      .upsert(t, { onConflict: "ticker" });
    if (error) this.fail(error);
  }

  async deleteTracked(id: string): Promise<void> {
    const { error } = await this.db.from("tracked_recommendations").delete().eq("id", id);
    if (error) this.fail(error);
  }

  // -------------------------------------------------------------------------
  // digests + runs + alerts + settings
  // -------------------------------------------------------------------------

  async listDigests(): Promise<DailyDigest[]> {
    const { data, error } = await this.db
      .from("daily_digests")
      .select("*")
      .order("date", { ascending: false });
    if (error) this.fail(error);
    return (data ?? []) as DailyDigest[];
  }

  async addDigest(d: Omit<DailyDigest, "id" | "created_at">): Promise<DailyDigest> {
    const { data, error } = await this.db
      .from("daily_digests")
      .insert(d)
      .select()
      .single();
    if (error) this.fail(error);
    return data as DailyDigest;
  }

  async deleteDigest(id: string): Promise<void> {
    const { error } = await this.db.from("daily_digests").delete().eq("id", id);
    if (error) this.fail(error);
  }

  async listRuns(): Promise<Run[]> {
    const { data, error } = await this.db
      .from("runs")
      .select("*")
      .order("date", { ascending: false });
    if (error) this.fail(error);
    return (data ?? []) as Run[];
  }

  async startRun(date: string): Promise<Run> {
    const row = {
      date,
      tokens_in: 0,
      tokens_out: 0,
      claude_cost: 0,
      scraping_cost: 0,
      total_cost: 0,
      started_at: this.now(),
      status: "running" as const,
    };
    const { data, error } = await this.db
      .from("runs")
      .insert(row)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Run;
  }

  async finishRun(id: string, patch: Partial<Run>): Promise<void> {
    const { error } = await this.db
      .from("runs")
      .update(patch)
      .eq("id", id);
    if (error) this.fail(error);
  }

  async listAlerts(unreadOnly?: boolean): Promise<Alert[]> {
    let q = this.db.from("alerts").select("*");
    if (unreadOnly) q = q.eq("read", false);
    const { data, error } = await q;
    if (error) this.fail(error);
    return (data ?? []) as Alert[];
  }

  async addAlert(a: Omit<Alert, "id" | "created_at" | "read">): Promise<Alert> {
    const row = { ...a, read: false };
    const { data, error } = await this.db
      .from("alerts")
      .insert(row)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Alert;
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.db
      .from("settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) this.fail(error);
    if (!data) {
      // Return a sensible default if no settings row exists yet.
      return {
        id: "settings_1",
        digest_time: "23:30",
        concentration_threshold: 0.25,
        digest_email: "gilh207@gmail.com",
      };
    }
    return data as Settings;
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    // Fetch the current row to get its id (which may be a UUID, not 'settings_1').
    const current = await this.getSettings();
    const { data, error } = await this.db
      .from("settings")
      .update(patch)
      .eq("id", current.id)
      .select()
      .single();
    if (error) this.fail(error);
    return data as Settings;
  }
}
