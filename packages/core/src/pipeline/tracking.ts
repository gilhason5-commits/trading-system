import { blendConviction, fundamentalScore, socialScore, technicalScore } from "../scoring.ts";
import type { RunContext } from "./context.ts";

// Recommendation tracking (7-day follow). After the research stage, today's
// verified recommendations are upserted into tracked_recommendations: a brand-new
// ticker is added with its entry price; one that reappears on a later day is
// reinforced and its sentiment trend (strengthened/weakened/stable) recorded.
// Entries are dropped once their 7-day window passes. Finally a conviction pass
// recomputes technical+fundamental+social → blended buy-conviction for each.

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function runTrackingStage(ctx: RunContext): Promise<void> {
  const recs = (await ctx.repo.listRecommendations(ctx.date)).filter(
    (r) => (r.verified_sources ?? []).length > 0 && !r.manipulation_flag,
  );
  const existing = new Map(
    (await ctx.repo.listTracked()).map((t) => [t.ticker.toUpperCase(), t]),
  );
  // Use each lead's real market so crypto isn't priced as a US equity.
  const marketByTicker = new Map(
    (await ctx.repo.listLeads()).map((l) => [l.ticker.toUpperCase(), l.market]),
  );

  for (const r of recs) {
    const cur = existing.get(r.ticker.toUpperCase());
    if (!cur) {
      // New ticker — capture entry price for performance tracking.
      let entryPrice: number | null = null;
      let entryCurrency: "USD" | "ILS" | null = null;
      try {
        const q = await ctx.md.getQuote(r.ticker, marketByTicker.get(r.ticker.toUpperCase()) ?? "US");
        entryPrice = q.price;
        entryCurrency = q.currency;
      } catch {
        // leave entry price null; performance just won't be shown
      }
      await ctx.repo.upsertTracked({
        ticker: r.ticker,
        first_date: ctx.date,
        last_seen_date: ctx.date,
        entry_price: entryPrice,
        entry_currency: entryCurrency,
        initial_social_score: r.social_score,
        last_social_score: r.social_score,
        reinforce_count: 0,
        sentiment_trend: "new",
        expires_date: addDays(ctx.date, 7),
      });
    } else if (cur.last_seen_date !== ctx.date) {
      // Reappeared on a new day → reinforce and record sentiment trend.
      const delta = r.social_score - cur.last_social_score;
      const trend = delta > 2 ? "strengthened" : delta < -2 ? "weakened" : "stable";
      await ctx.repo.upsertTracked({
        ticker: cur.ticker,
        first_date: cur.first_date,
        last_seen_date: ctx.date,
        entry_price: cur.entry_price,
        entry_currency: cur.entry_currency,
        initial_social_score: cur.initial_social_score,
        last_social_score: r.social_score,
        reinforce_count: cur.reinforce_count + 1,
        sentiment_trend: trend,
        expires_date: cur.expires_date,
      });
    }
  }

  // Drop entries whose 7-day window has passed.
  for (const t of existing.values()) {
    if (t.expires_date < ctx.date) await ctx.repo.deleteTracked(t.id);
  }

  // ── Conviction pass: technical + fundamental + social → blended buy-conviction,
  // recomputed daily so a name strengthens toward >80 buy / <20 (i.e. >80 sell).
  const signals = await ctx.repo.listSignals();
  const bullBear = new Map<string, { bull: number; bear: number }>();
  for (const s of signals) {
    const k = s.ticker.toUpperCase();
    const e = bullBear.get(k) ?? { bull: 0, bear: 0 };
    if (s.sentiment === "bullish") e.bull++;
    else if (s.sentiment === "bearish") e.bear++;
    bullBear.set(k, e);
  }
  const priceByTicker = new Map(
    (await ctx.repo.listCachedQuotes()).map((c) => [c.ticker.toUpperCase(), c.price]),
  );

  for (const t of await ctx.repo.listTracked()) {
    if (t.expires_date < ctx.date) continue;
    const market = marketByTicker.get(t.ticker.toUpperCase()) ?? "US";

    let technical = 50;
    try {
      const tech = await ctx.md.getTechnicals(t.ticker, market);
      technical = technicalScore(tech, priceByTicker.get(t.ticker.toUpperCase()) ?? null);
    } catch {
      // no technicals (e.g. crypto/ETF on this provider) → stay neutral
    }
    let fundamental = 50;
    try {
      fundamental = fundamentalScore(await ctx.fundamentals.getFundamentals(t.ticker));
    } catch {
      // no fundamentals → stay neutral
    }
    const bb = bullBear.get(t.ticker.toUpperCase()) ?? { bull: 0, bear: 0 };
    const social = socialScore(bb.bull, bb.bear);
    const conviction = blendConviction(technical, fundamental, social);

    await ctx.repo.upsertTracked({
      ticker: t.ticker,
      first_date: t.first_date,
      last_seen_date: t.last_seen_date,
      entry_price: t.entry_price,
      entry_currency: t.entry_currency,
      initial_social_score: t.initial_social_score,
      last_social_score: t.last_social_score,
      reinforce_count: t.reinforce_count,
      sentiment_trend: t.sentiment_trend,
      expires_date: t.expires_date,
      technical_score: technical,
      fundamental_score: fundamental,
      social_score: social,
      conviction,
    });
  }
}
