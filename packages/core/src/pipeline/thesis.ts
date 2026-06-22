import { researchThesisOnline } from "../datasources/thesisresearch.ts";
import { MIN_CONVICTION } from "../scoring.ts";
import type { PaperThesis, ThesisStep, TrackedRecommendation } from "../types.ts";
import type { RunContext } from "./context.ts";

// Thesis-building stage (runs daily, after tracking — does NOT trade). For each
// recommended candidate it accumulates a multi-day LONG thesis: the system's
// conviction, its own independent web/X research, fresh mentions and the chart,
// all logged as dated steps with a running strength. For each held paper position
// it builds an EXIT thesis from deteriorating signals. The auto-trade stage (in
// market hours) then acts the moment a thesis crosses its bar.

export const INTEREST_CONVICTION = 60; // start building once mildly convincing
export const BUY_BAR = 80; // long-thesis strength needed to buy (high bar — few, strong names)
export const EXIT_BAR = 60; // exit-thesis strength needed to sell (soft exit)
const MAX_RESEARCH = 6; // independent web/X research calls per run (cost cap)
const MAX_STEPS = 30;
const FRESH_MENTION_DAYS = 2; // a buy needs a mention within this many days (no stale single-mention buys)

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function daysSince(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

function buildLongStrength(
  t: TrackedRecommendation,
  days: number,
  corro: number,
  bearishToday: number,
  staleDays: number,
): { strength: number; allAngles: boolean } {
  const conviction = t.conviction ?? 0;
  const tech = t.technical_score ?? 0;
  const fund = t.fundamental_score ?? 0;
  const soc = t.social_score ?? 0;
  const allAngles = tech >= 60 && fund >= 60 && soc >= 60;
  const daysBonus = Math.min(15, (days - 1) * 5); // conviction compounds as it holds up over days
  let s = conviction + corro + daysBonus - bearishToday * 6;
  // Only an all-angles name may cross the buy bar; a weak leg keeps it "building".
  if (!allAngles) s = Math.min(s, BUY_BAR - 5);
  // A name with no fresh mention in the last few days can keep building but isn't
  // "ready" — never buy on a single stale mention from days ago.
  if (staleDays > FRESH_MENTION_DAYS) s = Math.min(s, BUY_BAR - 1);
  return { strength: clamp(s), allAngles };
}

export async function runThesisStage(ctx: RunContext): Promise<void> {
  const [tracked, paper, theses, signals] = await Promise.all([
    ctx.repo.listTracked(),
    ctx.repo.listPaperPositions(),
    ctx.repo.listPaperTheses(),
    ctx.repo.listSignals(),
  ]);
  const held = new Set(paper.map((p) => p.ticker.toUpperCase()));
  const thesisByKey = new Map(theses.map((t) => [`${t.ticker.toUpperCase()}:${t.direction}`, t]));

  // Today's fresh bullish / bearish mention counts per ticker.
  const today = ctx.date;
  const bull = new Map<string, number>();
  const bear = new Map<string, number>();
  for (const s of signals) {
    if ((s.created_at ?? "").slice(0, 10) !== today) continue;
    const k = s.ticker.toUpperCase();
    if (s.sentiment === "bullish") bull.set(k, (bull.get(k) ?? 0) + 1);
    else if (s.sentiment === "bearish") bear.set(k, (bear.get(k) ?? 0) + 1);
  }

  // ── LONG theses for recommended, not-yet-held candidates ─────────────────
  const candidates = tracked
    .filter((t) => (t.conviction ?? 0) >= INTEREST_CONVICTION && !held.has(t.ticker.toUpperCase()))
    .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));

  let researchBudget = MAX_RESEARCH;
  for (const t of candidates) {
    const key = t.ticker.toUpperCase();
    const existing = thesisByKey.get(`${key}:long`);
    if (existing?.status === "acted") continue; // already bought — managed as a holding now
    const days = existing ? existing.days + (existing.updated_at.slice(0, 10) !== today ? 1 : 0) : 1;

    const steps: ThesisStep[] = existing ? [...existing.steps] : [];
    steps.push({
      date: today,
      stage: "המלצת המערכת",
      detail: `קונביקשן ${t.conviction}% · ט ${t.technical_score ?? "—"}/פ ${t.fundamental_score ?? "—"}/ח ${t.social_score ?? "—"}` +
        (t.reinforce_count ? ` · חוזק ×${t.reinforce_count}` : ""),
      weight: Math.round((t.conviction ?? 0) - 50),
    });

    // Technical read of the chart (RSI/MACD/SMA/trend) that validates the thesis.
    if (t.technical_summary) {
      steps.push({
        date: today,
        stage: "ניתוח טכני",
        detail: t.technical_summary,
        weight: Math.round((t.technical_score ?? 50) - 50),
      });
    }

    // Independent verification (top candidates only, to cap cost).
    let corro = 0;
    if (researchBudget > 0) {
      researchBudget -= 1;
      const r = await researchThesisOnline(t.ticker, "long");
      corro = r.ok ? (r.verdict === "confirm" ? 12 : r.verdict === "refute" ? -20 : 0) : 0;
      steps.push({
        date: today,
        stage: "מחקר עצמאי (אינטרנט + X)",
        detail: !r.ok
          ? `⚠️ החיפוש לא רץ (${r.note || "לא זמין"}) — התזה נבנית ללא אימות חיצוני`
          : (r.verdict === "confirm" ? "אימות: " : r.verdict === "refute" ? "סתירה/חשד מניפולציה: " : "ניטרלי: ") +
            (r.note || "אין ממצא מובהק") +
            (r.found.length ? ` — ${r.found.join("; ")}` : ""),
        weight: corro,
      });
    }

    const bearishToday = bear.get(key) ?? 0;
    if ((bull.get(key) ?? 0) > 0 || bearishToday > 0) {
      steps.push({
        date: today,
        stage: "אזכורים היום",
        detail: `חיוביים ${bull.get(key) ?? 0} · שליליים ${bearishToday}`,
        weight: (bull.get(key) ?? 0) * 2 - bearishToday * 6,
      });
    }

    const staleDays = daysSince(t.last_seen_date, today);
    const { strength } = buildLongStrength(t, days, corro, bearishToday, staleDays);
    const dropped = (t.conviction ?? 0) < MIN_CONVICTION;
    await ctx.repo.upsertPaperThesis({
      ticker: t.ticker,
      direction: "long",
      status: dropped ? "dropped" : "building",
      strength: dropped ? Math.min(strength, EXIT_BAR - 1) : strength,
      days,
      first_date: existing?.first_date ?? today,
      steps: steps.slice(-MAX_STEPS),
    });
  }

  // ── EXIT theses for held paper positions ─────────────────────────────────
  const convByTicker = new Map(tracked.map((t) => [t.ticker.toUpperCase(), t]));
  for (const p of paper) {
    const key = p.ticker.toUpperCase();
    const existing = thesisByKey.get(`${key}:exit`);
    const days = existing ? existing.days + (existing.updated_at.slice(0, 10) !== today ? 1 : 0) : 1;
    const tr = convByTicker.get(key);
    const steps: ThesisStep[] = existing ? [...existing.steps] : [];

    let s = 0;
    const conviction = tr?.conviction ?? null;
    if (conviction == null) {
      s += 35;
      steps.push({ date: today, stage: "מעקב", detail: "יצאה מההמלצות הפעילות (אין קונביקשן)", weight: 35 });
    } else if (conviction < MIN_CONVICTION) {
      s += 40;
      steps.push({ date: today, stage: "קונביקשן", detail: `ירד ל-${conviction}% (מתחת ל-${MIN_CONVICTION}%)`, weight: 40 });
    }
    const tech = tr?.technical_score ?? 50;
    if (tech < 40) {
      s += 20;
      steps.push({ date: today, stage: "ניתוח טכני", detail: `הגרף נכנס לאזור דובי (טכני ${tech})`, weight: 20 });
    }
    const bearishToday = bear.get(key) ?? 0;
    if (bearishToday > 0) {
      s += Math.min(25, bearishToday * 12);
      steps.push({ date: today, stage: "אזכורים שליליים", detail: `${bearishToday} אזכורים שליליים היום`, weight: Math.min(25, bearishToday * 12) });
    }

    // Independent deterioration check (only when there's already some concern).
    if (s >= 20 && researchBudget > 0) {
      researchBudget -= 1;
      const r = await researchThesisOnline(p.ticker, "exit");
      const w = r.ok ? (r.verdict === "confirm" ? 20 : r.verdict === "refute" ? -15 : 0) : 0;
      s += w;
      steps.push({
        date: today,
        stage: "מחקר עצמאי (אינטרנט + X)",
        detail: !r.ok
          ? `⚠️ החיפוש לא רץ (${r.note || "לא זמין"})`
          : (r.verdict === "confirm" ? "מאשר הרעה: " : r.verdict === "refute" ? "התזה עדיין בריאה: " : "ניטרלי: ") + (r.note || "אין ממצא מובהק"),
        weight: w,
      });
    }

    await ctx.repo.upsertPaperThesis({
      ticker: p.ticker,
      direction: "exit",
      status: "building",
      strength: clamp(s),
      days,
      first_date: existing?.first_date ?? today,
      steps: steps.slice(-MAX_STEPS),
    });
  }
}
