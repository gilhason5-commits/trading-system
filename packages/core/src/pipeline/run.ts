import { enrichPositions } from "../portfolio.ts";
import type { Quote } from "../datasources/twelvedata.ts";
import type { Run } from "../types.ts";
import { createRunContext, type RunContext } from "./context.ts";
import { runAnalysisStage } from "./analysis.ts";
import { runScrapingStage } from "./scraping.ts";
import { runResearchStage } from "./research.ts";
import { runDigestStage } from "./digest.ts";

// The daily pipeline (spec §4): analysis → scraping → research → digest, run as one
// unit that logs total cost to `runs`. Vercel Cron enqueues a trigger; the Worker
// invokes this (spec §2). Also a price-poll that snapshots portfolio value.

export interface DailyRunResult {
  run: Run;
  analyses: number;
  posts: number;
  signals: number;
  leads: number;
  recommendations: number;
  digestKeyInsights: string[];
}

export async function runDailyPipeline(date?: string): Promise<DailyRunResult> {
  const ctx = createRunContext(date);
  const run = await ctx.repo.startRun(ctx.date);

  try {
    const analyses = await runAnalysisStage(ctx);
    const scrape = await runScrapingStage(ctx);
    const recommendations = await runResearchStage(ctx);
    const digest = await runDigestStage(ctx);

    const cost = ctx.cost.summary();
    await ctx.repo.finishRun(run.id, {
      ...cost,
      finished_at: new Date().toISOString(),
      status: "ok",
    });
    await pollPrices(ctx);

    return {
      run: { ...run, ...cost, status: "ok" },
      analyses: analyses.length,
      posts: scrape.posts.length,
      signals: scrape.signals.length,
      leads: scrape.leads.length,
      recommendations: recommendations.length,
      digestKeyInsights: digest.key_insights,
    };
  } catch (err) {
    await ctx.repo.finishRun(run.id, {
      ...ctx.cost.summary(),
      finished_at: new Date().toISOString(),
      status: "error",
    });
    await ctx.repo.addAlert({ kind: "error", message: `ריצה יומית נכשלה: ${(err as Error).message}` });
    throw err;
  }
}

/**
 * Continuous price poll (spec §4): refresh FX, recompute portfolio value, and
 * write a daily snapshot. Safe to call on an interval through the trading day.
 */
export async function pollPrices(ctx: RunContext = createRunContext()): Promise<void> {
  const positions = await ctx.repo.listPositions();
  const usdIls = await ctx.md.getUsdIls();
  await ctx.repo.saveFx({ pair: "USD/ILS", rate: usdIls, as_of: new Date().toISOString() });

  const quotes = new Map<string, Quote>(
    await Promise.all(
      positions.map(async (p): Promise<[string, Quote]> => [p.ticker, await ctx.md.getQuote(p.ticker, p.market)]),
    ),
  );
  const views = enrichPositions(positions, quotes, usdIls);
  const totalUsd = views.reduce((s, v) => s + v.market_value.usd, 0);
  const totalIls = views.reduce((s, v) => s + v.market_value.ils, 0);
  const totalPl = views.reduce((s, v) => s + v.unrealized_pl.usd, 0);

  const snapshots = await ctx.repo.listSnapshots();
  if (snapshots.at(-1)?.date !== ctx.date) {
    await ctx.repo.addSnapshot({
      date: ctx.date,
      total_value_usd: round(totalUsd),
      total_value_ils: round(totalIls),
      total_pl_usd: round(totalPl),
    });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
