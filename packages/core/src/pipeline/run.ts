import { enrichPositions } from "../portfolio.ts";
import type { Quote } from "../datasources/twelvedata.ts";
import type { Run } from "../types.ts";
import { createRunContext, type RunContext } from "./context.ts";
import { runAnalysisStage } from "./analysis.ts";
import { runScrapingStage } from "./scraping.ts";
import { runResearchStage } from "./research.ts";
import { runDigestStage } from "./digest.ts";
import { runTrackingStage } from "./tracking.ts";

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

export interface DailyRunOptions {
  /** Retry failed analysis/research this many times before the digest. */
  retries?: number;
  /** Delay before each retry (default 10 minutes). */
  retryDelayMs?: number;
  /** Skip the digest stage (the digest runs as a separate scheduled job). */
  skipDigest?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runDailyPipeline(
  date?: string,
  opts: DailyRunOptions = {},
): Promise<DailyRunResult> {
  const { retries = 1, retryDelayMs = 10 * 60 * 1000, skipDigest = false } = opts;
  const ctx = createRunContext(date);
  const run = await ctx.repo.startRun(ctx.date);

  try {
    const analyses = await runAnalysisStage(ctx);
    const scrape = await runScrapingStage(ctx);
    const recommendations = await runResearchStage(ctx);

    // Retry whatever failed (e.g. Twelve Data rate-limits) after a delay, before
    // the digest. Analysis is idempotent; research only re-runs new/researching leads.
    for (let attempt = 0; attempt < retries; attempt++) {
      const positions = await ctx.repo.listPositions();
      const analysed = new Set((await ctx.repo.listAnalyses(ctx.date)).map((a) => a.ticker.toUpperCase()));
      const missingAnalysis = positions.filter((p) => !analysed.has(p.ticker.toUpperCase()));
      const pendingLeads = [...(await ctx.repo.listLeads("new")), ...(await ctx.repo.listLeads("researching"))];
      if (missingAnalysis.length === 0 && pendingLeads.length === 0) break;

      await ctx.repo.addAlert({
        kind: "error",
        message: `ריטריי בעוד ${retryDelayMs / 60000} דק': ${missingAnalysis.length} ניתוחים + ${pendingLeads.length} לידים שנכשלו`,
      });
      await sleep(retryDelayMs);
      analyses.push(...(await runAnalysisStage(ctx)));
      recommendations.push(...(await runResearchStage(ctx)));
    }

    // Update the 7-day recommendation tracker from today's recommendations.
    await runTrackingStage(ctx);

    const digest = skipDigest ? null : await runDigestStage(ctx);

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
      digestKeyInsights: digest?.key_insights ?? [],
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
  const [positions, paper, tracked] = await Promise.all([
    ctx.repo.listPositions(),
    ctx.repo.listPaperPositions(),
    ctx.repo.listTracked(),
  ]);
  const usdIls = await ctx.md.getUsdIls();
  await ctx.repo.saveFx({ pair: "USD/ILS", rate: usdIls, as_of: new Date().toISOString() });

  // Refresh every ticker the pages care about (real holdings + paper book +
  // tracked recommendations) into the quote cache so page loads never block on a
  // live quote. Finnhub quotes are fast and not daily-capped.
  const wanted = new Map<string, (typeof positions)[number]["market"]>();
  for (const p of positions) wanted.set(p.ticker, p.market);
  for (const p of paper) wanted.set(p.ticker, p.market);
  for (const t of tracked) if (!wanted.has(t.ticker)) wanted.set(t.ticker, "US");

  const quotes = new Map<string, Quote>();
  const cacheRows: Omit<import("../types.ts").CachedQuote, "updated_at">[] = [];
  for (const [ticker, market] of wanted) {
    try {
      const q = await ctx.md.getQuote(ticker, market);
      quotes.set(ticker, q);
      cacheRows.push({
        ticker,
        market,
        price: q.price,
        percent_change: q.percent_change,
        currency: q.currency,
        previous_close: q.previous_close,
      });
    } catch {
      // skip a ticker the provider can't resolve; keep the rest of the poll alive
    }
  }
  if (cacheRows.length) await ctx.repo.upsertCachedQuotes(cacheRows);

  // Self-healing sector backfill: fill the sector for any position missing one
  // (one-time per ticker) so the dashboard's sector allocation is accurate.
  if (positions.some((p) => !p.sector)) {
    const withSectors = await Promise.all(
      positions.map(async (p) => {
        if (p.sector) return p;
        try {
          const f = await ctx.fundamentals.getFundamentals(p.ticker);
          return f.sector ? { ...p, sector: f.sector } : p;
        } catch {
          return p;
        }
      }),
    );
    if (withSectors.some((p, i) => p.sector !== positions[i]!.sector)) {
      await ctx.repo.upsertPositions(withSectors);
    }
  }

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
