import { getEnv, runDailyPipeline } from "@trading/core";

// `npm run pipeline:dry` — runs analysis → scraping → research → digest end-to-end
// on the current DATA_MODE (mock by default) and prints the computed run cost and
// the would-send digest. No DB or keys required in mock mode.

const date = process.argv[2] ?? undefined;
console.log(`[pipeline:dry] DATA_MODE=${getEnv().DATA_MODE} date=${date ?? "today"}`);

const result = await runDailyPipeline(date);

console.log("\n── pipeline result ──────────────────────────────");
console.log(`analyses        : ${result.analyses}`);
console.log(`posts scraped   : ${result.posts}`);
console.log(`signals         : ${result.signals}`);
console.log(`new leads       : ${result.leads}`);
console.log(`recommendations : ${result.recommendations}`);
console.log("\nkey insights:");
for (const k of result.digestKeyInsights) console.log(`  • ${k}`);
console.log("\nrun cost:");
console.log(`  tokens in/out : ${result.run.tokens_in} / ${result.run.tokens_out}`);
console.log(`  claude        : $${result.run.claude_cost}`);
console.log(`  scraping      : $${result.run.scraping_cost}`);
console.log(`  total         : $${result.run.total_cost}`);
console.log(`  status        : ${result.run.status}`);
