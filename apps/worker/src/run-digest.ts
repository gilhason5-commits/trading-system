import { createRunContext, runDigestStage, runPaperReflectionStage, today } from "@trading/core";

// One-shot daily digest, for the GitHub Actions schedule (runs ~23:00 Israel,
// after US close). Idempotent guard: skip if today's digest already exists. After
// the digest, the paper trader reflects on the day's trades/positions — lessons it
// reads back at the next 14:30 prep run.

const ctx = createRunContext(today());
const digests = await ctx.repo.listDigests();
if (digests.some((d) => d.date === ctx.date)) {
  console.log(`[digest] already exists for ${ctx.date}; skipping`);
} else {
  const d = await runDigestStage(ctx);
  console.log(`[digest] done — ${d.key_insights.length} insights`);
}

try {
  const reflection = await runPaperReflectionStage(ctx);
  console.log(reflection ? "[reflection] paper-trader lessons written" : "[reflection] nothing to reflect on yet");
} catch (err) {
  console.error("[reflection] failed:", (err as Error).message);
}
