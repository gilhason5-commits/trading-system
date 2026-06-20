import { digestPrompt } from "../claude/index.ts";
import { fetchAnalystData } from "../datasources/analysts.ts";
import { fetchGeneralMarketNews } from "../datasources/marketnews.ts";
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
  const [positions, analyses, signals, posts] = await Promise.all([
    ctx.repo.listPositions(),
    ctx.repo.listAnalyses(ctx.date),
    ctx.repo.listSignals(),
    ctx.repo.listPosts(),
  ]);

  // Good/bad signal scan for the names we HOLD — so the digest can say buy-more /
  // sell / hold with the actual bullish/bearish evidence, not just the analysis.
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const held = new Set(positions.map((p) => p.ticker.toUpperCase()));
  const holdingSignals = new Map<string, { bullish: string[]; bearish: string[] }>();
  for (const s of signals) {
    const k = s.ticker.toUpperCase();
    if (!held.has(k)) continue;
    const bucket = holdingSignals.get(k) ?? { bullish: [], bearish: [] };
    const when = postsById.get(s.post_id)?.published_at ?? s.created_at ?? "";
    const line = `${s.claim}${when ? ` (${when.slice(0, 10)})` : ""}`;
    if (s.sentiment === "bullish") bucket.bullish.push(line);
    else if (s.sentiment === "bearish") bucket.bearish.push(line);
    holdingSignals.set(k, bucket);
  }

  // News window: last 4 days.
  const fromD = new Date(`${ctx.date}T00:00:00Z`);
  fromD.setUTCDate(fromD.getUTCDate() - 4);
  const from = fromD.toISOString().slice(0, 10);

  // Macro: general market headlines. Micro: per-held-position headlines.
  const marketNews = await ctx.news.getMarketNews().catch(() => []);
  const portfolioNews = await Promise.all(
    positions.map(async (p) => {
      try {
        const items = (await ctx.news.getNews(p.ticker, from, ctx.date)).slice(0, 4);
        return { ticker: p.ticker, headlines: items.map((i) => i.headline).filter(Boolean) };
      } catch {
        return { ticker: p.ticker, headlines: [] as string[] };
      }
    }),
  );

  // Bottom-of-digest general market news (Israel + US), independent of holdings.
  const generalMarketNews = await fetchGeneralMarketNews().catch(() => []);

  // Analyst forecasts (consensus target + big-bank ratings) per held position.
  const analysts = await Promise.all(
    positions.map(async (p) => {
      try {
        return await fetchAnalystData(p.ticker);
      } catch {
        return null;
      }
    }),
  );

  const aggregation = {
    analyses: analyses.map((a) => ({
      ticker: a.ticker, stance: a.stance, confidence: a.confidence,
      technical: a.technical_summary, fundamental: a.fundamental_summary,
      key_events: a.key_events, risk_flags: a.risk_flags,
      // Good/bad social-signal evidence for this holding (capped).
      bullish_signals: (holdingSignals.get(a.ticker.toUpperCase())?.bullish ?? []).slice(0, 5),
      bearish_signals: (holdingSignals.get(a.ticker.toUpperCase())?.bearish ?? []).slice(0, 5),
    })),
    market_news: marketNews.slice(0, 10).map((i) => `${i.headline} (${i.source})`),
    portfolio_news: portfolioNews.filter((p) => p.headlines.length > 0),
    analyst_forecasts: analysts
      .filter((a) => a !== null)
      .map((a) => ({
        ticker: a!.ticker,
        target_mean: a!.target_mean,
        target_low: a!.target_low,
        target_high: a!.target_high,
        upside_pct: a!.upside_pct,
        consensus: a!.recommendation,
        big_banks: a!.big_bank_ratings.map((r) => `${r.firm}: ${r.grade} (${r.date})`),
      })),
  };

  // General market news is rendered as its own wide section on /digests (not by the
  // model), so it's returned separately and stored structured on the digest.
  return { aggregation, generalMarketNews };
}

/** Compose and persist the daily digest (shown on /digests; no email). */
export async function runDigestStage(ctx: RunContext): Promise<DailyDigest> {
  const { aggregation, generalMarketNews } = await buildAggregation(ctx);

  const prompt = digestPrompt(JSON.stringify(aggregation));
  const res = await ctx.claude.complete({
    kind: "digest",
    system: prompt.system,
    user: prompt.user,
    effort: "high",
    maxTokens: 32000, // rich HTML digest (insights + news + analysts) — avoid mid-tag truncation
  });
  ctx.cost.addClaude(res.usage, res.model);

  const parsed = parseDigest(res.text);
  // Replace any existing digest for this date so re-runs don't duplicate.
  for (const d of await ctx.repo.listDigests()) {
    if (d.date === ctx.date) await ctx.repo.deleteDigest(d.id);
  }
  const digest = await ctx.repo.addDigest({
    date: ctx.date,
    html: parsed.html,
    key_insights: parsed.key_insights ?? [],
    market_news: generalMarketNews.map((n) => ({ headline: n.headline, source: n.source, region: n.region })),
  });

  return digest;
}
