import { createRunContext, runDigestStage, today } from "@trading/core";

// One-shot daily digest, for the GitHub Actions schedule (runs ~23:00 Israel,
// after US close). Idempotent guard: skip if today's digest already exists.

const ctx = createRunContext(today());
const digests = await ctx.repo.listDigests();
if (digests.some((d) => d.date === ctx.date)) {
  console.log(`[digest] already exists for ${ctx.date}; skipping`);
} else {
  const d = await runDigestStage(ctx);
  console.log(`[digest] done — ${d.key_insights.length} insights`);
}
