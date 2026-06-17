import { pollPrices } from "@trading/core";

// One-shot price refresh (FX + quote cache + snapshot), for the GitHub Actions
// market-hours schedule. Safe to run repeatedly.

await pollPrices();
console.log("[poll] prices refreshed");
