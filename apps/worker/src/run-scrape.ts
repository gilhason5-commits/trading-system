import { createRunContext, runDailyPipeline, today } from "@trading/core";

// One-shot recommendation run (analysis + scraping + research), for the GitHub
// Actions schedule. Idempotent guard: skip if today already has a non-error run.

const ctx = createRunContext(today());
const runs = await ctx.repo.listRuns();
if (runs.some((r) => r.date === ctx.date && r.status !== "error")) {
  console.log(`[scrape] already ran for ${ctx.date}; skipping`);
} else {
  console.log(`[scrape] starting recommendation run for ${ctx.date}`);
  const res = await runDailyPipeline(ctx.date, { skipDigest: true });
  console.log(`[scrape] done — $${res.run.total_cost}, ${res.recommendations} recommendations`);
}
