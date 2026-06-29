import { createRunContext, hasBlockingRunToday, runDailyPipeline, today } from "@trading/core";

// One-shot recommendation run (analysis + scraping + research), for the GitHub
// Actions schedule. Idempotent guard: skip only if today already has a successful
// or fresh in-flight run — a crashed/stale `running` row never blocks a retry.

const ctx = createRunContext(today());
const runs = await ctx.repo.listRuns();
if (hasBlockingRunToday(runs, ctx.date)) {
  console.log(`[scrape] already ran for ${ctx.date}; skipping`);
} else {
  console.log(`[scrape] starting recommendation run for ${ctx.date}`);
  const res = await runDailyPipeline(ctx.date, { skipDigest: true });
  console.log(`[scrape] done — $${res.run.total_cost}, ${res.recommendations} recommendations`);
}
