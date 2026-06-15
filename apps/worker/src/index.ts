import {
  createRunContext,
  getEnv,
  pollPrices,
  runDailyPipeline,
  today,
} from "@trading/core";

// Dedicated Worker (spec §2): polls prices through the trading day and runs the
// daily pipeline once, after the configured digest time (Israel tz). Long jobs run
// here, not in time-limited Vercel functions.

const POLL_MS = 5 * 60 * 1000; // 5 minutes

function israelHm(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function maybeRunDaily(): Promise<void> {
  const ctx = createRunContext(today());
  const settings = await ctx.repo.getSettings();
  if (israelHm() < settings.digest_time) return;

  const runs = await ctx.repo.listRuns();
  if (runs.some((r) => r.date === ctx.date && r.status !== "error")) return; // already ran today

  console.log(`[worker] starting daily pipeline for ${ctx.date}`);
  const result = await runDailyPipeline(ctx.date);
  console.log(`[worker] daily run done — cost $${result.run.total_cost}, ${result.recommendations} recommendations`);
}

async function tick(): Promise<void> {
  try {
    await pollPrices();
    await maybeRunDaily();
  } catch (err) {
    console.error("[worker] tick error:", (err as Error).message);
  }
}

console.log(`[worker] starting (DATA_MODE=${getEnv().DATA_MODE}); polling every ${POLL_MS / 60000}m`);
await tick();
setInterval(tick, POLL_MS);
