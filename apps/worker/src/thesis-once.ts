import { createRunContext, runThesisStage, today } from "@trading/core";

// One-shot thesis-building pass: refresh the paper trader's multi-day theses
// (independent web/X research + accumulation). Runs in the daily pipeline too;
// this entry lets it run/backfill on demand.

const ctx = createRunContext(today());
await runThesisStage(ctx);
console.log("[thesis] theses refreshed");
