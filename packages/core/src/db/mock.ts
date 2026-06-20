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
import { buildSeed } from "./seed.ts";

// In-memory repository seeded with deterministic data so the whole app runs
// with no database and no API keys (the "build now, wire keys later" anchor).

// Unique ids that never collide with the hardcoded seed ids (tx_1, an_2, …).
const nextId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

export class MockRepository implements Repository {
  private transactions: Transaction[];
  private positions: Position[];
  private paperPositions: PaperPosition[] = [];
  private cachedQuotes: CachedQuote[] = [];
  private tracked: TrackedRecommendation[] = [];
  private fx: FxRate;
  private snapshots: PortfolioSnapshot[];
  private analyses: Analysis[];
  private sources: Source[];
  private posts: Post[];
  private signals: Signal[];
  private leads: Lead[];
  private recommendations: Recommendation[];
  private digests: DailyDigest[];
  private runs: Run[];
  private alerts: Alert[];
  private settings: Settings;

  constructor() {
    const seed = buildSeed();
    this.transactions = seed.transactions;
    this.positions = seed.positions;
    this.fx = seed.fx;
    this.snapshots = seed.snapshots;
    this.analyses = seed.analyses;
    this.sources = seed.sources;
    this.posts = seed.posts;
    this.signals = seed.signals;
    this.leads = seed.leads;
    this.recommendations = seed.recommendations;
    this.digests = seed.digests;
    this.runs = seed.runs;
    this.alerts = seed.alerts;
    this.settings = seed.settings;
  }

  async listTransactions() {
    return [...this.transactions].sort((a, b) => b.date.localeCompare(a.date));
  }
  async addTransaction(tx: Omit<Transaction, "id" | "created_at">) {
    const full: Transaction = { ...tx, id: nextId("tx"), created_at: now() };
    this.transactions.push(full);
    return full;
  }
  async deleteTransaction(txId: string) {
    this.transactions = this.transactions.filter((t) => t.id !== txId);
  }
  async listPositions() {
    return [...this.positions];
  }
  async upsertPositions(positions: Position[]) {
    this.positions = positions;
  }

  async listPaperPositions() {
    return [...this.paperPositions];
  }
  async addPaperPosition(p: Omit<PaperPosition, "id" | "created_at">) {
    const full: PaperPosition = { ...p, id: nextId("paper"), created_at: now() };
    this.paperPositions.push(full);
    return full;
  }
  async deletePaperPosition(id: string) {
    this.paperPositions = this.paperPositions.filter((p) => p.id !== id);
  }

  async latestFx() {
    return this.fx;
  }
  async saveFx(rate: FxRate) {
    this.fx = rate;
  }
  async listCachedQuotes() {
    return [...this.cachedQuotes];
  }
  async upsertCachedQuotes(quotes: Omit<CachedQuote, "updated_at">[]) {
    for (const q of quotes) {
      const row: CachedQuote = { ...q, updated_at: now() };
      const i = this.cachedQuotes.findIndex((c) => c.ticker === q.ticker);
      if (i >= 0) this.cachedQuotes[i] = row;
      else this.cachedQuotes.push(row);
    }
  }
  async listSnapshots() {
    return [...this.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  }
  async addSnapshot(s: Omit<PortfolioSnapshot, "id">) {
    const full: PortfolioSnapshot = { ...s, id: nextId("snap") };
    this.snapshots.push(full);
    return full;
  }

  async listAnalyses(date?: string) {
    return this.analyses.filter((a) => !date || a.date === date);
  }
  async getAnalysis(ticker: string, date?: string) {
    const matches = this.analyses
      .filter((a) => a.ticker === ticker && (!date || a.date === date))
      .sort((a, b) => b.date.localeCompare(a.date));
    return matches[0] ?? null;
  }
  async addAnalysis(a: Omit<Analysis, "id" | "created_at">) {
    const full: Analysis = { ...a, id: nextId("an"), created_at: now() };
    this.analyses.push(full);
    return full;
  }

  async listSources(activeOnly?: boolean) {
    return this.sources.filter((s) => !activeOnly || s.active);
  }
  async addSource(s: Omit<Source, "id" | "created_at">) {
    const full: Source = { ...s, id: nextId("src"), created_at: now() };
    this.sources.push(full);
    return full;
  }
  async setSourceActive(srcId: string, active: boolean) {
    const s = this.sources.find((x) => x.id === srcId);
    if (s) s.active = active;
  }
  async listPosts(sourceId?: string) {
    return this.posts.filter((p) => !sourceId || p.source_id === sourceId);
  }
  async addPost(p: Omit<Post, "id" | "fetched_at">) {
    const full: Post = { ...p, id: nextId("post"), fetched_at: now() };
    this.posts.push(full);
    return full;
  }
  async hasPost(sourceId: string, externalId: string) {
    return this.posts.some(
      (p) => p.source_id === sourceId && p.external_id === externalId,
    );
  }
  async addSignal(s: Omit<Signal, "id" | "created_at">) {
    const full: Signal = { ...s, id: nextId("sig"), created_at: now() };
    this.signals.push(full);
    return full;
  }
  async listSignals(ticker?: string) {
    return this.signals.filter((s) => !ticker || s.ticker === ticker);
  }

  async listLeads(status?: Lead["status"]) {
    return this.leads.filter((l) => !status || l.status === status);
  }
  async getLeadByTicker(ticker: string) {
    return this.leads.find((l) => l.ticker === ticker) ?? null;
  }
  async upsertLead(l: Omit<Lead, "id" | "first_seen" | "updated_at">) {
    const existing = this.leads.find((x) => x.ticker === l.ticker);
    if (existing) {
      existing.mention_count = l.mention_count;
      existing.status = l.status;
      existing.updated_at = now();
      return existing;
    }
    const full: Lead = { ...l, id: nextId("lead"), first_seen: now(), updated_at: now() };
    this.leads.push(full);
    return full;
  }
  async setLeadStatus(leadId: string, status: Lead["status"]) {
    const l = this.leads.find((x) => x.id === leadId);
    if (l) {
      l.status = status;
      l.updated_at = now();
    }
  }
  async listRecommendations(date?: string) {
    return this.recommendations.filter((r) => !date || r.date === date);
  }
  async addRecommendation(r: Omit<Recommendation, "id" | "created_at">) {
    const full: Recommendation = { ...r, id: nextId("rec"), created_at: now() };
    this.recommendations.push(full);
    return full;
  }

  async listTracked() {
    return [...this.tracked];
  }
  async upsertTracked(t: Omit<TrackedRecommendation, "id" | "created_at">) {
    const i = this.tracked.findIndex((x) => x.ticker.toUpperCase() === t.ticker.toUpperCase());
    if (i >= 0) this.tracked[i] = { ...this.tracked[i]!, ...t };
    else this.tracked.push({ ...t, id: nextId("trk"), created_at: now() });
  }
  async deleteTracked(id: string) {
    this.tracked = this.tracked.filter((x) => x.id !== id);
  }
  async dismissTicker(ticker: string) {
    const t = ticker.toUpperCase();
    this.recommendations = this.recommendations.filter((r) => r.ticker.toUpperCase() !== t);
    this.leads = this.leads.filter((l) => l.ticker.toUpperCase() !== t);
    this.tracked = this.tracked.filter((x) => x.ticker.toUpperCase() !== t);
  }

  async listDigests() {
    return [...this.digests].sort((a, b) => b.date.localeCompare(a.date));
  }
  async addDigest(d: Omit<DailyDigest, "id" | "created_at">) {
    const full: DailyDigest = { ...d, id: nextId("dig"), created_at: now() };
    this.digests.push(full);
    return full;
  }
  async deleteDigest(id: string) {
    this.digests = this.digests.filter((x) => x.id !== id);
  }
  async listRuns() {
    return [...this.runs].sort((a, b) => b.date.localeCompare(a.date));
  }
  async startRun(date: string) {
    const full: Run = {
      id: nextId("run"),
      date,
      tokens_in: 0,
      tokens_out: 0,
      claude_cost: 0,
      scraping_cost: 0,
      total_cost: 0,
      started_at: now(),
      status: "running",
    };
    this.runs.push(full);
    return full;
  }
  async finishRun(runId: string, patch: Partial<Run>) {
    const r = this.runs.find((x) => x.id === runId);
    if (r) Object.assign(r, patch);
  }
  async listAlerts(unreadOnly?: boolean) {
    return this.alerts.filter((a) => !unreadOnly || !a.read);
  }
  async addAlert(a: Omit<Alert, "id" | "created_at" | "read">) {
    const full: Alert = { ...a, id: nextId("alert"), created_at: now(), read: false };
    this.alerts.push(full);
    return full;
  }
  async getSettings() {
    return this.settings;
  }
  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    return this.settings;
  }
}
