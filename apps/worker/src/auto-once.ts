import { createRunContext, runAutoTradeStage, today } from "@trading/core";

// One-shot autonomous paper-trading pass (opens the book on first run, then
// buys/sells once per day). Safe to run repeatedly — it no-ops if it already
// traded today.

const ctx = createRunContext(today());
await runAutoTradeStage(ctx);
console.log("[auto] paper trading pass complete");
