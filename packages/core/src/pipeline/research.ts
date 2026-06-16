import { leadScoringPrompt, parseJsonResponse } from "../claude/index.ts";
import type { Lead, Market, Recommendation } from "../types.ts";
import type { RunContext } from "./context.ts";

// Module 4 — deep research on new leads (spec §8). Each new/researching lead is
// dedup'd + cross-checked (independent-source count), gets a full TA+FA pass plus
// web/news context, and Claude emits separate system_score + social_score with a
// manipulation flag for low-cap mention spikes.

interface ScoreJson {
  system_score: number;
  social_score: number;
  rationale: string;
  manipulation_flag: boolean;
}

/** Count distinct sources that mentioned a ticker (independent corroboration). */
async function independentSourceCount(ctx: RunContext, ticker: string): Promise<number> {
  const [signals, posts] = await Promise.all([
    ctx.repo.listSignals(ticker),
    ctx.repo.listPosts(),
  ]);
  const sourceByPost = new Map(posts.map((p) => [p.id, p.source_id]));
  const sources = new Set<string>();
  for (const s of signals) {
    const src = sourceByPost.get(s.post_id);
    if (src) sources.add(src);
  }
  return sources.size;
}

async function buildContext(ctx: RunContext, ticker: string, market: Market) {
  const isUs = market === "US";
  const [technicals, fundamentals, news] = await Promise.all([
    ctx.md.getTechnicals(ticker, market).catch(() => null),
    isUs ? ctx.fundamentals.getFundamentals(ticker).catch(() => null) : Promise.resolve(null),
    isUs
      ? ctx.news.getNews(ticker, ctx.date, ctx.date).catch(() => [])
      : Promise.resolve([]),
  ]);

  const analysisText = [
    technicals
      ? `Technicals: RSI ${technicals.rsi}, MACD ${technicals.macd}/${technicals.macd_signal}, trend ${technicals.trend}`
      : "Technicals: n/a",
    fundamentals
      ? `Fundamentals: sector ${fundamentals.sector}, net margin ${(fundamentals.net_margin * 100).toFixed(1)}%, ` +
        `rev growth ${(fundamentals.revenue_growth * 100).toFixed(1)}%, P/E ${fundamentals.pe_ratio}, ` +
        `D/E ${fundamentals.debt_to_equity}`
      : "Fundamentals: n/a (non-US or unavailable)",
  ].join("\n");

  const webContextText = news.length
    ? news.map((n) => `- ${n.headline}${n.summary ? `: ${n.summary}` : ""}`).join("\n")
    : "n/a";

  // Audit trail: only sources that actually returned data (e.g. FMP 403 → excluded).
  const verifiedSources: string[] = [];
  if (technicals) verifiedSources.push("ניתוח טכני (Twelve Data)");
  if (fundamentals) verifiedSources.push("פונדמנטלי (FMP)");
  if (news.length) verifiedSources.push("חדשות (Finnhub)");

  return { analysisText, webContextText, verifiedSources };
}

async function researchOne(ctx: RunContext, lead: Lead): Promise<Recommendation> {
  await ctx.repo.setLeadStatus(lead.id, "researching");

  const mentionCount = Math.max(lead.mention_count, await independentSourceCount(ctx, lead.ticker));
  const { analysisText, webContextText, verifiedSources } = await buildContext(ctx, lead.ticker, lead.market);

  const prompt = leadScoringPrompt(lead.ticker, mentionCount, analysisText, webContextText);
  const res = await ctx.claude.complete({
    kind: "lead",
    system: prompt.system,
    user: prompt.user,
    effort: "medium",
    maxTokens: 1500,
  });
  ctx.cost.addClaude(res.usage, res.model);

  const parsed = parseJsonResponse<ScoreJson>(res.text);

  const rec = await ctx.repo.addRecommendation({
    lead_id: lead.id,
    ticker: lead.ticker,
    date: ctx.date,
    system_score: parsed.system_score,
    social_score: parsed.social_score,
    rationale: parsed.rationale,
    manipulation_flag: Boolean(parsed.manipulation_flag),
    verified_sources: verifiedSources,
  });

  await ctx.repo.setLeadStatus(lead.id, "recommended");
  if (parsed.manipulation_flag) {
    await ctx.repo.addAlert({
      kind: "manipulation",
      ticker: lead.ticker,
      message: `חשד למניפולציה: ${lead.ticker} — קפיצת אזכורים ללא בסיס`,
    });
  }
  return rec;
}

/** Research every lead that hasn't been recommended/dismissed yet. */
export async function runResearchStage(ctx: RunContext): Promise<Recommendation[]> {
  const [fresh, researching] = await Promise.all([
    ctx.repo.listLeads("new"),
    ctx.repo.listLeads("researching"),
  ]);
  const leads = [...fresh, ...researching];
  const out: Recommendation[] = [];
  for (const lead of leads) {
    try {
      out.push(await researchOne(ctx, lead));
    } catch (err) {
      await ctx.repo.addAlert({
        kind: "error",
        ticker: lead.ticker,
        message: `מחקר ליד נכשל עבור ${lead.ticker}: ${(err as Error).message}`,
      });
    }
  }
  return out;
}
