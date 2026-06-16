import { createRunContext, getEnv, runNewsCheckStage } from "@trading/core";

// `npm run news:check` — token-frugal daily news scan over held positions.
// Only checks today's news; tickers with no news cost zero Claude tokens.

console.log(`[news:check] DATA_MODE=${getEnv().DATA_MODE}`);
const ctx = createRunContext();
const r = await runNewsCheckStage(ctx);

console.log(`\n── news check — ${r.date} ──`);
if (r.withNews.length === 0) {
  console.log("אין חדשות היום על המניות בתיק.");
} else {
  for (const s of r.withNews) {
    console.log(`${s.material ? "🔵" : "⚪"} ${s.ticker}: ${s.summary}`);
  }
}
if (r.noNews.length) console.log(`\nללא חדשות: ${r.noNews.join(", ")}`);
if (r.skipped.length) console.log(`לא נבדק (לא US): ${r.skipped.join(", ")}`);
console.log(`\ncost: $${r.cost.total_cost} (tokens ${r.cost.tokens_in}/${r.cost.tokens_out})`);
