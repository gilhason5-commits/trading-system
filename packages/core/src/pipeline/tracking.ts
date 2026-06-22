import { blendConviction, fundamentalScore, MIN_CONVICTION, socialScore, technicalScore } from "../scoring.ts";
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

  // Add brand-new tickers from today's recommendations (reinforcement of
  // already-tracked names is handled in the conviction pass below).
  for (const r of recs) {
    if (existing.has(r.ticker.toUpperCase())) continue;
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
  }

  // Drop entries whose 7-day window has passed.
  for (const t of existing.values()) {
    if (t.expires_date < ctx.date) await ctx.repo.deleteTracked(t.id);
  }

  // ── Conviction + reinforcement pass. Recompute technical+fundamental+social →
  // blended buy-conviction; and if a tracked ticker got a fresh bullish/bearish
  // mention today, reinforce it (count++, last-seen=today, trend vs prior social).
  const signals = await ctx.repo.listSignals();
  const bullBear = new Map<string, { bull: number; bear: number }>();
  const mentionedToday = new Set<string>();
  for (const s of signals) {
    const k = s.ticker.toUpperCase();
    const e = bullBear.get(k) ?? { bull: 0, bear: 0 };
    if (s.sentiment === "bullish") e.bull++;
    else if (s.sentiment === "bearish") e.bear++;
    bullBear.set(k, e);
    if ((s.created_at ?? "").slice(0, 10) === ctx.date && (s.sentiment === "bullish" || s.sentiment === "bearish")) {
      mentionedToday.add(k);
    }
  }
  const priceByTicker = new Map(
    (await ctx.repo.listCachedQuotes()).map((c) => [c.ticker.toUpperCase(), c.price]),
  );

  for (const t of await ctx.repo.listTracked()) {
    if (t.expires_date < ctx.date) continue;
    const key = t.ticker.toUpperCase();
    const market = marketByTicker.get(key) ?? "US";

    let technical = 50;
    try {
      const tech = await ctx.md.getTechnicals(t.ticker, market);
      technical = technicalScore(tech, priceByTicker.get(key) ?? null);
    } catch {
      // no technicals (e.g. crypto/ETF on this provider) → stay neutral
    }
    let fundamental = 50;
    try {
      fundamental = fundamentalScore(await ctx.fundamentals.getFundamentals(t.ticker));
    } catch {
      // no fundamentals → stay neutral
    }
    const bb = bullBear.get(key) ?? { bull: 0, bear: 0 };
    const social = socialScore(bb.bull, bb.bear);
    const conviction = blendConviction(technical, fundamental, social);
    const convictionDelta = t.conviction != null ? conviction - t.conviction : 0;

    // Buy-conviction fell under the relevance floor (incl. a name that slid from
    // ≥60 to <60 on a negative mention) → drop it from tracking AND the
    // recommendations grid. It can re-enter fresh if recommended again later.
    if (conviction < MIN_CONVICTION) {
      await ctx.repo.dismissTicker(t.ticker);
      continue;
    }

    // Reinforce on a fresh mention today (not for names first added today). A new
    // mention rolls the 7-day follow window forward (expires = today + 7) so a name
    // that keeps getting talked about stays tracked — the day counter (shown vs
    // last_seen_date) resets to 1/7. first_date stays put so the validation log
    // still records each name once at its true first appearance.
    let reinforce = t.reinforce_count;
    let lastSeen = t.last_seen_date;
    let trend = t.sentiment_trend;
    let expires = t.expires_date;
    if (mentionedToday.has(key) && t.last_seen_date < ctx.date) {
      reinforce += 1;
      lastSeen = ctx.date;
      expires = addDays(ctx.date, 7);
      const delta = social - (t.social_score ?? t.last_social_score);
      trend = delta > 2 ? "strengthened" : delta < -2 ? "weakened" : "stable";
    }

    await ctx.repo.upsertTracked({
      ticker: t.ticker,
      first_date: t.first_date,
      last_seen_date: lastSeen,
      entry_price: t.entry_price,
      entry_currency: t.entry_currency,
      initial_social_score: t.initial_social_score,
      last_social_score: social,
      reinforce_count: reinforce,
      sentiment_trend: trend,
      expires_date: expires,
      technical_score: technical,
      fundamental_score: fundamental,
      social_score: social,
      conviction,
      conviction_delta: convictionDelta,
    });
  }
}
