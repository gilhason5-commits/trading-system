import { digestPrompt } from "../claude/index.ts";
import { computeStats, enrichPositions } from "../portfolio.ts";
import type { Quote } from "../datasources/twelvedata.ts";
import type { DailyDigest } from "../types.ts";
import type { RunContext } from "./context.ts";

// Module 5 — daily Hebrew RTL digest (spec §9). Aggregates every stage's output +
// the run cost so far, has Claude write the HTML, and persists it (shown on the
// /digests page; no email). The digest call's own cost is added after composition.

/**
 * Parse the digest model's delimited response: raw HTML, then `===KEY_INSIGHTS===`,
 * then bullet lines. Avoids JSON escaping fragility with the large embedded HTML.
 */
function parseDigest(text: string): { html: string; key_insights: string[] } {
  // Expected order: ===KEY_INSIGHTS=== … ===HTML=== … . Tolerate the model
  // emitting only HTML, or the reverse order, so we never lose the digest.
  let insightsPart = "";
  let htmlPart = text;
  if (/===\s*HTML\s*===/i.test(text)) {
    [insightsPart = "", htmlPart = ""] = text.split(/===\s*HTML\s*===/i);
  } else if (/===\s*KEY_INSIGHTS\s*===/i.test(text)) {
    [htmlPart = "", insightsPart = ""] = text.split(/===\s*KEY_INSIGHTS\s*===/i);
  }
  // Strip the KEY_INSIGHTS header and any accidental ``` fences.
  let html = htmlPart.replace(/===\s*KEY_INSIGHTS\s*===/i, "").trim();
  html = html.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = html.indexOf("<div");
  if (start > 0) html = html.slice(start);
  const key_insights = insightsPart
    .replace(/===\s*KEY_INSIGHTS\s*===/i, "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((l) => l.length > 0 && !/^===/.test(l));
  return { html, key_insights };
}

async function buildAggregation(ctx: RunContext) {
  const [positions, fxRow, snapshots, analyses, recommendations, leads] = await Promise.all([
    ctx.repo.listPositions(),
    ctx.repo.latestFx(),
    ctx.repo.listSnapshots(),
    ctx.repo.listAnalyses(ctx.date),
    ctx.repo.listRecommendations(ctx.date),
    ctx.repo.listLeads(),
  ]);

  const usdIls = fxRow?.rate ?? 3.62;
  const quotePairs = await Promise.all(
    positions.map(async (p): Promise<[string, Quote] | null> => {
      try {
        return [p.ticker, await ctx.md.getQuote(p.ticker, p.market)];
      } catch {
        return null; // missing quote → enrichPositions falls back to avg_cost
      }
    }),
  );
  const quotes = new Map<string, Quote>(quotePairs.filter((x): x is [string, Quote] => x !== null));
  const views = enrichPositions(positions, quotes, usdIls);
  const stats = computeStats(views, usdIls, snapshots);

  const aggregation = {
    portfolio: {
      total_value: stats.total_value,
      day_pl: stats.day_pl,
      day_pl_pct: stats.day_pl_pct,
      total_pl: stats.total_pl,
      movers: views
        .slice()
        .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct))
        .slice(0, 3)
        .map((v) => ({ ticker: v.ticker, day_change_pct: v.day_change_pct })),
    },
    positions: views.map((v) => ({ ticker: v.ticker, weight_pct: v.weight_pct, pl_pct: v.unrealized_pl_pct })),
    analyses: analyses.map((a) => ({
      ticker: a.ticker, stance: a.stance, confidence: a.confidence,
      technical: a.technical_summary, fundamental: a.fundamental_summary,
      key_events: a.key_events, risk_flags: a.risk_flags,
    })),
    leads: leads.map((l) => ({ ticker: l.ticker, status: l.status, mentions: l.mention_count })),
    recommendations: recommendations.map((r) => ({
      ticker: r.ticker, system_score: r.system_score, social_score: r.social_score,
      manipulation_flag: r.manipulation_flag, rationale: r.rationale,
    })),
  };

  return { aggregation };
}

/** Compose and persist the daily digest (shown on /digests; no email). */
export async function runDigestStage(ctx: RunContext): Promise<DailyDigest> {
  const { aggregation } = await buildAggregation(ctx);

  const prompt = digestPrompt(JSON.stringify(aggregation));
  const res = await ctx.claude.complete({
    kind: "digest",
    system: prompt.system,
    user: prompt.user,
    effort: "high",
    maxTokens: 16000, // rich HTML digest can be long; avoid mid-string truncation
  });
  ctx.cost.addClaude(res.usage, res.model);

  const parsed = parseDigest(res.text);
  const digest = await ctx.repo.addDigest({
    date: ctx.date,
    html: parsed.html,
    key_insights: parsed.key_insights ?? [],
  });

  return digest;
}
