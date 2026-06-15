import { digestPrompt, parseJsonResponse } from "../claude/index.ts";
import { getEmailSender } from "../email.ts";
import { computeStats, enrichPositions } from "../portfolio.ts";
import type { Quote } from "../datasources/twelvedata.ts";
import type { DailyDigest } from "../types.ts";
import type { RunContext } from "./context.ts";

// Module 5 — daily Hebrew RTL email digest (spec §9). Aggregates every stage's
// output + the run cost so far, has Claude write the email, persists it, and sends
// via Resend (mock no-ops). The digest call's own cost is added after composition.

interface DigestJson {
  html: string;
  key_insights: string[];
}

async function buildAggregation(ctx: RunContext) {
  const [positions, fxRow, snapshots, analyses, recommendations, leads, settings] = await Promise.all([
    ctx.repo.listPositions(),
    ctx.repo.latestFx(),
    ctx.repo.listSnapshots(),
    ctx.repo.listAnalyses(ctx.date),
    ctx.repo.listRecommendations(ctx.date),
    ctx.repo.listLeads(),
    ctx.repo.getSettings(),
  ]);

  const usdIls = fxRow?.rate ?? 3.62;
  const quotes = new Map<string, Quote>(
    await Promise.all(
      positions.map(async (p): Promise<[string, Quote]> => [p.ticker, await ctx.md.getQuote(p.ticker, p.market)]),
    ),
  );
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
    cost: ctx.cost.summary(),
  };

  return { aggregation, settings };
}

/** Compose, persist and send the daily digest. */
export async function runDigestStage(ctx: RunContext): Promise<DailyDigest> {
  const { aggregation, settings } = await buildAggregation(ctx);

  const prompt = digestPrompt(JSON.stringify(aggregation));
  const res = await ctx.claude.complete({
    kind: "digest",
    system: prompt.system,
    user: prompt.user,
    effort: "high",
    maxTokens: 4000,
  });
  ctx.cost.addClaude(res.usage, res.model);

  const parsed = parseJsonResponse<DigestJson>(res.text);
  const digest = await ctx.repo.addDigest({
    date: ctx.date,
    html: parsed.html,
    key_insights: parsed.key_insights ?? [],
  });

  await getEmailSender().send({
    to: settings.digest_email,
    subject: `סיכום יומי — ${ctx.date}`,
    html: parsed.html,
  });

  return digest;
}
