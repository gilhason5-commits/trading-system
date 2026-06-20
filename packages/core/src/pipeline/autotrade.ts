import { MIN_CONVICTION } from "../scoring.ts";
import type { Currency, Market, PaperAccount, PaperPosition, TrackedRecommendation } from "../types.ts";
import type { RunContext } from "./context.ts";

// Autonomous paper-trading engine. Once a day it manages the isolated paper book
// like a medium-term algo trader: it buys high-conviction tracked names with
// available cash and exits on a conviction drop, a stop-loss, a take-profit, or
// when a name leaves the active recommendations. Every action is logged to
// paper_trades with the reason, so the /paper decision log explains each trade.

// ── Strategy: "aggressive" ──────────────────────────────────────────────────
const STARTING_CASH = 10_000; // USD
const STRATEGY = {
  buyConviction: 65, // enter at ≥65 (earlier than a conservative ≥75)
  maxPositions: 12, // more names, higher turnover
  targetWeightPct: 0.15, // size each new buy at ~15% of total account value
  stopLossPct: -15, // exit a loser at −15%
  takeProfitPct: 40, // realise a winner at +40%
};

function toUsd(priceNative: number, currency: Currency, usdIls: number): number {
  return currency === "ILS" ? priceNative / usdIls : priceNative;
}

/** Round share quantity down; allow fractional only under 1 share isn't useful → whole shares. */
function sizeQty(targetUsd: number, priceUsd: number): number {
  if (priceUsd <= 0) return 0;
  return Math.floor(targetUsd / priceUsd);
}

async function ensureAccount(ctx: RunContext): Promise<PaperAccount> {
  const existing = await ctx.repo.getPaperAccount();
  if (existing) return existing;
  // First run: open a clean autonomous book. Liquidate any pre-existing
  // hand-added paper positions so the book truly starts from STARTING_CASH.
  for (const p of await ctx.repo.listPaperPositions()) {
    await ctx.repo.deletePaperPosition(p.id);
  }
  return ctx.repo.savePaperAccount({ starting_cash: STARTING_CASH, cash: STARTING_CASH, currency: "USD" });
}

export async function runAutoTradeStage(ctx: RunContext): Promise<void> {
  // Trade at most once per day.
  const trades = await ctx.repo.listPaperTrades();
  if (trades.some((t) => t.date === ctx.date)) return;

  const account = await ensureAccount(ctx);
  let cash = account.cash;

  const usdIls = (await ctx.repo.latestFx())?.rate ?? 3.62;
  const tracked = await ctx.repo.listTracked();
  const convByTicker = new Map<string, TrackedRecommendation>(
    tracked.map((t) => [t.ticker.toUpperCase(), t]),
  );
  const marketByTicker = new Map<string, Market>(
    (await ctx.repo.listLeads()).map((l) => [l.ticker.toUpperCase(), l.market]),
  );
  const priceCache = new Map((await ctx.repo.listCachedQuotes()).map((c) => [c.ticker.toUpperCase(), c]));

  // Live execution price (extended-hours aware); fall back to the cache.
  async function execPrice(ticker: string, market: Market): Promise<{ price: number; currency: Currency } | null> {
    try {
      const q = await ctx.md.getQuote(ticker, market);
      if (q.price > 0) return { price: q.price, currency: q.currency };
    } catch {
      // fall through to cache
    }
    const c = priceCache.get(ticker.toUpperCase());
    return c && c.price > 0 ? { price: c.price, currency: c.currency } : null;
  }

  // ── 1) EXITS — review every open position ────────────────────────────────
  let positions = await ctx.repo.listPaperPositions();
  for (const p of positions) {
    const key = p.ticker.toUpperCase();
    const market = p.market;
    const ep = await execPrice(p.ticker, market);
    if (!ep) continue;
    const retPct = p.avg_cost > 0 ? ((ep.price - p.avg_cost) / p.avg_cost) * 100 : 0;
    const tr = convByTicker.get(key);
    const conviction = tr?.conviction ?? null;

    let reason: string | null = null;
    if (!tr) {
      reason = "ירדה מההמלצות הפעילות (אין יותר מעקב/קונביקשן) — סוגר פוזיציה";
    } else if (conviction != null && conviction < MIN_CONVICTION) {
      reason = `הקונביקשן ירד ל-${conviction}% (מתחת ל-${MIN_CONVICTION}%) — סוגר פוזיציה`;
    } else if (retPct <= STRATEGY.stopLossPct) {
      reason = `סטופ-לוס: תשואה ${retPct.toFixed(1)}% (מתחת ל-${STRATEGY.stopLossPct}%)`;
    } else if (retPct >= STRATEGY.takeProfitPct) {
      reason = `מימוש רווח: תשואה +${retPct.toFixed(1)}% (מעל ${STRATEGY.takeProfitPct}%)`;
    }
    if (!reason) continue;

    const proceedsUsd = toUsd(ep.price, ep.currency, usdIls) * p.qty;
    cash += proceedsUsd;
    await ctx.repo.deletePaperPosition(p.id);
    await ctx.repo.addPaperTrade({
      date: ctx.date,
      ticker: p.ticker,
      action: "sell",
      qty: p.qty,
      price: ep.price,
      currency: ep.currency,
      value_usd: round2(proceedsUsd),
      conviction,
      reason,
    });
  }

  // ── 2) ENTRIES — deploy cash into the best tracked names not yet held ─────
  positions = await ctx.repo.listPaperPositions();
  const heldNow = new Set(positions.map((p) => p.ticker.toUpperCase()));
  let slots = STRATEGY.maxPositions - heldNow.size;

  const candidates = tracked
    .filter((t) => t.conviction != null && t.conviction >= STRATEGY.buyConviction)
    .filter((t) => !heldNow.has(t.ticker.toUpperCase()))
    .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0) || (b.conviction_delta ?? 0) - (a.conviction_delta ?? 0));

  for (const t of candidates) {
    if (slots <= 0) break;
    const key = t.ticker.toUpperCase();
    const market = marketByTicker.get(key) ?? "US";
    const ep = await execPrice(t.ticker, market);
    if (!ep) continue;

    // Total account value drives position sizing.
    const holdingsUsd = (await ctx.repo.listPaperPositions()).reduce((s, p) => {
      const c = priceCache.get(p.ticker.toUpperCase());
      const px = c?.price ?? p.avg_cost;
      return s + toUsd(px, (c?.currency ?? p.currency) as Currency, usdIls) * p.qty;
    }, 0);
    const accountValue = cash + holdingsUsd;
    const targetUsd = Math.min(cash, accountValue * STRATEGY.targetWeightPct);
    const priceUsd = toUsd(ep.price, ep.currency, usdIls);
    const qty = sizeQty(targetUsd, priceUsd);
    if (qty < 1) continue; // not enough cash for a meaningful position

    const costUsd = priceUsd * qty;
    cash -= costUsd;
    slots -= 1;
    await ctx.repo.addPaperPosition({
      ticker: t.ticker,
      market,
      qty,
      avg_cost: ep.price,
      currency: ep.currency,
    });
    await ctx.repo.addPaperTrade({
      date: ctx.date,
      ticker: t.ticker,
      action: "buy",
      qty,
      price: ep.price,
      currency: ep.currency,
      value_usd: round2(costUsd),
      conviction: t.conviction ?? null,
      reason:
        `קנייה: קונביקשן ${t.conviction}%` +
        (t.conviction_delta ? ` (${t.conviction_delta > 0 ? "+" : ""}${Math.round(t.conviction_delta)}% מהריצה הקודמת)` : "") +
        ` · ט ${t.technical_score ?? "—"}/פ ${t.fundamental_score ?? "—"}/ח ${t.social_score ?? "—"}` +
        (t.reinforce_count ? ` · חוזק ×${t.reinforce_count}` : ""),
    });
  }

  // Persist the updated cash balance.
  await ctx.repo.savePaperAccount({
    starting_cash: account.starting_cash,
    cash: round2(cash),
    currency: "USD",
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
