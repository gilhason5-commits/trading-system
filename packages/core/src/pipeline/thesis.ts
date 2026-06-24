import { fetchAnalystData } from "../datasources/analysts.ts";
import { researchThesisOnline } from "../datasources/thesisresearch.ts";
import { blendConviction, fundamentalScore, MIN_CONVICTION, socialScore, technicalScore, technicalSummary } from "../scoring.ts";
import type { PaperThesis, ThesisStep, TrackedRecommendation } from "../types.ts";
import type { RunContext } from "./context.ts";

// Thesis-building stage (runs daily, after tracking — does NOT trade). For each
// recommended candidate it accumulates a multi-day LONG thesis: the system's
// conviction, its own independent web/X research, fresh mentions and the chart,
// all logged as dated steps with a running strength. For each held paper position
// it builds an EXIT thesis from deteriorating signals. The auto-trade stage (in
// market hours) then acts the moment a thesis crosses its bar.

export const INTEREST_CONVICTION = 60; // start building once mildly convincing
export const BUY_BAR = 70; // long-thesis strength needed to buy
export const EXIT_BAR = 60; // exit-thesis strength needed to sell (soft exit)
const MAX_RESEARCH = 25; // re-research every active thesis daily (web fundamental + check)
const MAX_STEPS = 40;
const STALE_DROP_DAYS = 2; // release a building thesis after this many trading days w/o improvement

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Whole days from `date` to `to` (positive if `to` is later). */
function daysSince(date: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

/** US trading day (Mon–Fri), so Fri→Mon count as consecutive (weekend skipped). */
function isTradingDay(date: string): boolean {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
}

/** Most recent step.detail for a stage, to detect day-over-day change. */
function lastDetail(steps: ThesisStep[], stage: string): string | null {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]!.stage === stage) return steps[i]!.detail;
  return null;
}

// Strength = current conviction, adjusted by independent research (corro) and real
// repeated mentions — NOT by mere time alive (no day bonus, which inflated minor
// names). Negative mentions subtract. Staleness is handled by the lifecycle (drop
// after STALE_DROP_DAYS without improvement), not a continuous decay.
function buildLongStrength(
  t: TrackedRecommendation,
  corro: number,
  bearishToday: number,
  analystWeight: number,
): { strength: number; allAngles: boolean } {
  const conviction = t.conviction ?? 0;
  const tech = t.technical_score ?? 0;
  const fund = t.fundamental_score ?? 0;
  const soc = t.social_score ?? 0;
  const allAngles = tech >= 60 && fund >= 60 && soc >= 60;
  const reinforceBonus = Math.min(15, t.reinforce_count * 5); // reward real repeated mentions
  let s = conviction + corro + reinforceBonus + analystWeight - bearishToday * 6;
  if (!allAngles) s = Math.min(s, BUY_BAR - 5); // a weak leg keeps it "building"
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
  // Yesterday's self-reflection — fed into the research so the book learns from its own calls.
  const lessons = (await ctx.repo.listPaperReflections())[0]?.reflection ?? null;

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
  const tradingDay = isTradingDay(today);
  for (const t of candidates) {
    const key = t.ticker.toUpperCase();
    const existing = thesisByKey.get(`${key}:long`);
    if (existing?.status === "acted") continue; // already bought — managed as a holding now
    const isNew = !existing;
    const newDay = !existing || existing.updated_at.slice(0, 10) !== today;
    const days = existing ? existing.days + (newDay ? 1 : 0) : 1;
    const steps: ThesisStep[] = existing ? [...existing.steps] : [];

    const bullToday = bull.get(key) ?? 0;
    const bearishToday = bear.get(key) ?? 0;
    const mentionedToday = bullToday > 0 || bearishToday > 0;

    // System recommendation — only on a fresh mention (or day 1), not repeated daily.
    if (isNew || mentionedToday) {
      steps.push({
        date: today,
        stage: "המלצת המערכת",
        detail: `קונביקשן ${t.conviction}% · ט ${t.technical_score ?? "—"}/פ ${t.fundamental_score ?? "—"}/ח ${t.social_score ?? "—"}` +
          (t.reinforce_count ? ` · חוזק ×${t.reinforce_count}` : ""),
        weight: Math.round((t.conviction ?? 0) - 50),
      });
    }
    if (mentionedToday) {
      steps.push({
        date: today,
        stage: "אזכורים היום",
        detail: `חיוביים ${bullToday} · שליליים ${bearishToday}`,
        weight: bullToday * 2 - bearishToday * 6,
      });
    }

    // Daily technical re-check on the chart — flag whether it improved / worsened.
    if (t.technical_summary) {
      const curTech = t.technical_score ?? 50;
      const prevDetail = lastDetail(steps, "ניתוח טכני");
      const prevTech = prevDetail ? Number(prevDetail.match(/\(ט (\d+)\)/)?.[1]) : NaN;
      const change = !Number.isFinite(prevTech) ? "" :
        curTech > prevTech ? ` · השתפר ${prevTech}→${curTech}` :
        curTech < prevTech ? ` · הורע ${prevTech}→${curTech}` : " · ללא שינוי";
      steps.push({ date: today, stage: "ניתוח טכני", detail: t.technical_summary + change, weight: Math.round(curTech - 50) });
    }

    // Daily independent research (web fundamental/news + X) — confirms or weakens.
    let corro = 0;
    if (researchBudget > 0) {
      researchBudget -= 1;
      const r = await researchThesisOnline(t.ticker, "long", lessons);
      corro = r.ok ? (r.verdict === "confirm" ? 12 : r.verdict === "refute" ? -20 : 0) : 0;
      steps.push({
        date: today,
        stage: "מחקר עצמאי (אינטרנט + X)",
        detail: !r.ok
          ? `⚠️ החיפוש לא רץ (${r.note || "לא זמין"}) — ללא אימות חיצוני`
          : (r.verdict === "confirm" ? "אימות: " : r.verdict === "refute" ? "סתירה/חשד מניפולציה: " : "ניטרלי: ") +
            (r.note || "אין ממצא מובהק") +
            (r.found.length ? ` — ${r.found.join("; ")}` : ""),
        weight: corro,
      });
    }

    // Analyst valuation as a negative reinforcement (NOT a hard block): the further
    // the price has run above the consensus target, the more we fade the thesis —
    // less upside left, more risk. An extra hit if it's above even the highest
    // (freshest-bull) target. Best-effort.
    let analystWeight = 0;
    try {
      const a = await fetchAnalystData(t.ticker);
      const px = a.current;
      if (px && a.target_mean && px > a.target_mean) {
        const overMeanPct = (px / a.target_mean - 1) * 100;
        const aboveHigh = !!(a.target_high && px > a.target_high);
        analystWeight = Math.max(-25, -Math.min(20, Math.round(overMeanPct * 0.5)) - (aboveHigh ? 5 : 0));
        steps.push({
          date: today,
          stage: "הערכת שווי (אנליסטים)",
          detail: aboveHigh
            ? `מחיר ~$${Math.round(px)} מעל היעד הגבוה $${Math.round(a.target_high!)} (+${overMeanPct.toFixed(0)}% מעל הקונצנזוס) — אף אנליסט לא רואה upside`
            : `מחיר ~$${Math.round(px)} כ-${overMeanPct.toFixed(0)}% מעל יעד הקונצנזוס $${Math.round(a.target_mean)} (יעד גבוה $${Math.round(a.target_high ?? 0)}) — upside מוגבל`,
          weight: analystWeight,
        });
      } else if (px && a.target_mean) {
        steps.push({ date: today, stage: "הערכת שווי (אנליסטים)", detail: `מחיר ~$${Math.round(px)} מתחת ליעד הקונצנזוס $${Math.round(a.target_mean)} — יש upside`, weight: 0 });
      }
    } catch {
      // no analyst data → no valuation adjustment
    }

    const { strength } = buildLongStrength(t, corro, bearishToday, analystWeight);

    // Improvement tracking → release after STALE_DROP_DAYS trading days with no rise.
    const improved = isNew || strength > (existing?.strength ?? 0);
    let stale = existing?.stale_days ?? 0;
    if (newDay) stale = improved ? 0 : tradingDay ? stale + 1 : stale;

    const dropByConviction = (t.conviction ?? 0) < MIN_CONVICTION;
    const dropByStale = stale >= STALE_DROP_DAYS && strength < BUY_BAR; // ready names wait for the poll
    if (dropByStale) {
      steps.push({ date: today, stage: "שחרור", detail: `אין שיפור ${stale} ימי מסחר רצופים — משוחרר מהתזות`, weight: -30 });
    }
    const dropped = dropByConviction || dropByStale;
    await ctx.repo.upsertPaperThesis({
      ticker: t.ticker,
      direction: "long",
      status: dropped ? "dropped" : "building",
      strength: dropped ? Math.min(strength, EXIT_BAR - 1) : strength,
      days,
      first_date: existing?.first_date ?? today,
      steps: steps.slice(-MAX_STEPS),
      stale_days: dropped ? 0 : stale,
    });
  }

  // ── EXIT theses for held paper positions ─────────────────────────────────
  // All-time bull/bear per ticker for the social re-score of held names.
  const bbAll = new Map<string, { bull: number; bear: number }>();
  for (const sig of signals) {
    const k = sig.ticker.toUpperCase();
    const e2 = bbAll.get(k) ?? { bull: 0, bear: 0 };
    if (sig.sentiment === "bullish") e2.bull++;
    else if (sig.sentiment === "bearish") e2.bear++;
    bbAll.set(k, e2);
  }
  const priceByTicker = new Map((await ctx.repo.listCachedQuotes()).map((c) => [c.ticker.toUpperCase(), c.price]));

  for (const p of paper) {
    const key = p.ticker.toUpperCase();
    const existing = thesisByKey.get(`${key}:exit`);
    const days = existing ? existing.days + (existing.updated_at.slice(0, 10) !== today ? 1 : 0) : 1;
    const steps: ThesisStep[] = existing ? [...existing.steps] : [];
    const market = p.market;
    const price = priceByTicker.get(key) ?? null;

    // Fresh re-analysis of the HELD position every run (technical + fundamental +
    // social), even after it dropped out of the daily recommendations — so a name
    // like a chip stock in a sector selloff is re-scored, not left stale since entry.
    let technical = 50;
    let techSummary: string | null = null;
    try {
      const tech = await ctx.md.getTechnicals(p.ticker, market);
      technical = technicalScore(tech, price);
      techSummary = technicalSummary(tech, price, technical);
    } catch { /* no technicals */ }
    let fundamental = 50;
    let earningsInDays: number | null = null;
    try {
      const f = await ctx.fundamentals.getFundamentals(p.ticker);
      fundamental = fundamentalScore(f);
      if (f.next_earnings_date) earningsInDays = daysSince(today, f.next_earnings_date);
    } catch { /* no fundamentals */ }
    const bb = bbAll.get(key) ?? { bull: 0, bear: 0 };
    const social = socialScore(bb.bull, bb.bear);
    const reConviction = blendConviction(technical, fundamental, social);

    let s = 0;
    steps.push({
      date: today,
      stage: "ניתוח מחדש (אחזקה)",
      detail: `קונביקשן מעודכן ${reConviction}% · ט ${technical}/פ ${fundamental}/ח ${social}` + (techSummary ? ` · ${techSummary.split(" → ")[0]}` : ""),
      weight: Math.round(50 - reConviction),
    });

    // Weakening conviction → exit pressure.
    if (reConviction < 45) {
      s += 40;
      steps.push({ date: today, stage: "קונביקשן", detail: `חלש מאוד (${reConviction}%) — שקול יציאה`, weight: 40 });
    } else if (reConviction < MIN_CONVICTION) {
      s += 25;
      steps.push({ date: today, stage: "קונביקשן", detail: `נחלש ל-${reConviction}% (מתחת ל-${MIN_CONVICTION}%) — שקול צמצום`, weight: 25 });
    }
    if (technical < 40) {
      s += 20;
      steps.push({ date: today, stage: "ניתוח טכני", detail: `גרף דובי (טכני ${technical})`, weight: 20 });
    }
    // Earnings = binary event → de-risk into it.
    if (earningsInDays != null && earningsInDays >= 0 && earningsInDays <= 1) {
      s += 18;
      steps.push({ date: today, stage: "דוחות מתקרבים", detail: `דוחות ${earningsInDays === 0 ? "היום" : "מחר"} — סיכון בינארי, שקול צמצום לפני הדוח`, weight: 18 });
    }
    const bearishToday = bear.get(key) ?? 0;
    if (bearishToday > 0) {
      s += Math.min(25, bearishToday * 12);
      steps.push({ date: today, stage: "אזכורים שליליים", detail: `${bearishToday} אזכורים שליליים היום`, weight: Math.min(25, bearishToday * 12) });
    }

    // Independent deterioration check (when there's already some concern).
    if (s >= 20 && researchBudget > 0) {
      researchBudget -= 1;
      const r = await researchThesisOnline(p.ticker, "exit", lessons);
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

    // Recommended stance from the re-analysis.
    const sc = clamp(s);
    const stance = sc >= EXIT_BAR ? "יציאה מלאה" : sc >= 35 ? "צמצום (TRIM)" : "החזקה";
    steps.push({ date: today, stage: "המלצה", detail: `${stance} · עוצמת יציאה ${sc}/${EXIT_BAR}`, weight: 0 });

    await ctx.repo.upsertPaperThesis({
      ticker: p.ticker,
      direction: "exit",
      status: "building",
      strength: sc,
      days,
      first_date: existing?.first_date ?? today,
      steps: steps.slice(-MAX_STEPS),
    });
  }
}
