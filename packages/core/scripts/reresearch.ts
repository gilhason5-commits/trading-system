import { createClient } from "@supabase/supabase-js";
import { createRunContext, runResearchStage } from "../src/pipeline/index.ts";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// Remove old recommendations + reset all leads so research re-verifies them fresh.
console.log("resetting…");
console.log("del recs:", (await db.from("recommendations").delete().neq("id", "")).error?.message ?? "ok");
console.log(
  "reset leads:",
  (await db.from("leads").update({ status: "researching", updated_at: new Date().toISOString() }).neq("id", "")).error
    ?.message ?? "ok",
);

const ctx = createRunContext();
const recs = await runResearchStage(ctx);
console.log(`\nnew recommendations: ${recs.length}`);
for (const r of recs) {
  console.log(`${r.ticker}: sys ${r.system_score} / soc ${r.social_score} | verified: [${r.verified_sources.join(", ")}]`);
}
console.log("\ncost:", JSON.stringify(ctx.cost.summary()));
