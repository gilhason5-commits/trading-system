import {
  createRunContext,
  getEnv,
  pollPrices,
  runDailyPipeline,
  runDigestStage,
  today,
} from "@trading/core";

// Dedicated Worker (spec §2): polls prices through the trading day and runs two
// scheduled jobs in Israel time — the recommendation pipeline (analysis +
// scraping + research) at 14:30, and the daily digest at 22:35. Long jobs run
// here, not in time-limited Vercel functions.

const POLL_MS = 5 * 60 * 1000; // 5 minutes
const SCRAPE_TIME = "14:30"; // recommendations / scraping run (Israel time)
const DIGEST_TIME = "22:35"; // daily digest (Israel time)

function israelHm(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Analysis + scraping + research → leads/recommendations. Once per day, from 14:30. */
async function maybeRunScrape(): Promise<void> {
  if (israelHm() < SCRAPE_TIME) return;
  const ctx = createRunContext(today());
  const runs = await ctx.repo.listRuns();
  if (runs.some((r) => r.date === ctx.date && r.status !== "error")) return; // already ran today

  console.log(`[worker] starting recommendation run for ${ctx.date}`);
  const result = await runDailyPipeline(ctx.date, { skipDigest: true });
  console.log(`[worker] recommendation run done — cost $${result.run.total_cost}, ${result.recommendations} recommendations`);
}

/** Daily digest. Once per day, from 22:35. */
async function maybeRunDigest(): Promise<void> {
  if (israelHm() < DIGEST_TIME) return;
  const ctx = createRunContext(today());
  const digests = await ctx.repo.listDigests();
  if (digests.some((d) => d.date === ctx.date)) return; // already generated today

  console.log(`[worker] generating daily digest for ${ctx.date}`);
  const digest = await runDigestStage(ctx);
  console.log(`[worker] digest done — ${digest.key_insights.length} insights`);
}

async function tick(): Promise<void> {
  try {
    await pollPrices();
    await maybeRunScrape();
    await maybeRunDigest();
  } catch (err) {
    console.error("[worker] tick error:", (err as Error).message);
  }
}

console.log(
  `[worker] starting (DATA_MODE=${getEnv().DATA_MODE}); polling every ${POLL_MS / 60000}m · scrape ${SCRAPE_TIME} · digest ${DIGEST_TIME} (Israel)`,
);
await tick();
setInterval(tick, POLL_MS);
