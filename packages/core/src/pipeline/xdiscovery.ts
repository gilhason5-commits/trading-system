import { searchXForTickers } from "../datasources/xsearch.ts";
import type { Source } from "../types.ts";
import type { RunContext } from "./context.ts";

// X-discovery stage: pull bullish stock chatter off X (via Grok live search) and
// turn the credible names into leads that flow through the normal research gate
// (which requires real price/chart data and flags manipulation). Names Grok
// reads as coordinated pumps, or with no independent corroboration, are dropped
// here and never become leads.

// Indices / macro instruments are never actionable single-stock leads.
const NON_STOCK = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "SPX", "NDX", "RUT", "IXIC",
  "DXY", "VIX", "TLT", "GLD", "SLV", "UVXY", "SQQQ", "TQQQ", "BTC", "ETH",
]);

const SOURCE_HANDLE = "🔍 חיפוש X (Grok)";

/** Get (or create) the inactive pseudo-source that owns Grok-discovered X posts. */
async function getDiscoverySource(ctx: RunContext): Promise<Source> {
  const existing = (await ctx.repo.listSources()).find(
    (s) => s.platform === "x" && s.handle === SOURCE_HANDLE,
  );
  if (existing) return existing;
  // Inactive so the scraping stage's per-handle fetch never tries to call it.
  return ctx.repo.addSource({ platform: "x", handle: SOURCE_HANDLE, active: false });
}

export async function runXDiscoveryStage(ctx: RunContext): Promise<void> {
  const candidates = await searchXForTickers();
  if (candidates.length === 0) return;

  const heldTickers = new Set((await ctx.repo.listPositions()).map((p) => p.ticker.toUpperCase()));
  const source = await getDiscoverySource(ctx);

  for (const c of candidates) {
    const T = c.ticker;
    if (NON_STOCK.has(T) || heldTickers.has(T)) continue;

    // Anti-manipulation gate (verification of the post itself):
    //  • drop names Grok reads as a coordinated pump,
    //  • require corroboration from ≥2 distinct accounts.
    if (c.suspected_pump) {
      await ctx.repo.addAlert({
        kind: "manipulation",
        ticker: T,
        message: `דילגתי על ${T} מ-X — נראה כמו פאמפ מתואם/מניה דלת סחירות`,
      });
      continue;
    }
    if (c.accounts < 2) continue;

    // One post+signal per ticker per day (idempotent on re-runs).
    const externalId = `xgrok:${T}:${ctx.date}`;
    if (await ctx.repo.hasPost(source.id, externalId)) continue;

    const post = await ctx.repo.addPost({
      source_id: source.id,
      external_id: externalId,
      url: c.url || "https://x.com/search?q=%24" + T,
      title: `X: ${T}`,
      text: c.claim || `דיון חיובי על ${T} ב-X (${c.accounts} חשבונות)`,
      published_at: new Date().toISOString(),
    });
    await ctx.repo.addSignal({
      post_id: post.id,
      ticker: T,
      sentiment: "bullish",
      claim: c.claim || `אזכור חיובי ב-X (${c.accounts} חשבונות${c.handle ? `, למשל ${c.handle}` : ""})`,
    });

    const existing = await ctx.repo.getLeadByTicker(T);
    await ctx.repo.upsertLead({
      ticker: T,
      market: "US",
      status: existing?.status ?? "new",
      // Seed corroboration from the distinct-account count so research's
      // independent-source logic treats well-discussed names as stronger.
      mention_count: (existing?.mention_count ?? 0) + Math.max(1, Math.min(c.accounts, 5)),
    });
  }
}
