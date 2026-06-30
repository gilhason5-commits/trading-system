import { fetchAnalystData } from "../datasources/analysts.ts";
import { assessMarketContext } from "../datasources/marketcontext.ts";
import { isUsMarketOpen } from "../datasources/yahoo.ts";
import { MIN_CONVICTION } from "../scoring.ts";
import type {
  Currency,
  Market,
  PaperAccount,
  PaperThesis,
  Post,
  Source,
  TradeDossier,
  TradeQuote,
  TrackedRecommendation,
} from "../types.ts";
import { BUY_BAR, EXIT_BAR } from "./thesis.ts";
import type { RunContext } from "./context.ts";

// Autonomous paper-trading engine. Once a day it manages the isolated paper book
// like a medium-term algo trader: it buys high-conviction tracked names with
// available cash and exits on a conviction drop, a stop-loss, a take-profit, or
// when a name leaves the active recommendations. Every action is logged to
// paper_trades with the reason, so the /paper decision log explains each trade.

// ── Strategy: "aggressive", but disciplined ─────────────────────────────────
const STARTING_CASH = 10_000; // USD
const STRATEGY = {
  buyConviction: 65, // blended buy-conviction floor
  componentFloor: 60, // every leg (technical/fundamental/social) must clear this —
  //                      only buy when the thesis holds up from ALL angles
  maxPositions: 12,
  maxNewBuysPerDay: 3, // scale in gradually — never deploy the whole book at once
  minCashReservePct: 0.25, // always keep ≥25% in cash
  targetWeightPct: 0.12, // size each new buy at ~12% of total account value
  stopLossPct: -15, // exit a loser at −15%
  takeProfitPct: 40, // realise a winner at +40%
  // ── Anti-extension entry gate ────────────────────────────────────────────
  // A thesis matures exactly when a name is already extended (social peak +
  // technical confirmation + uptrend) — so the engine was buying local tops
  // (MU at strength 100 → −4.8% in 2 days; GLW after a +17% week). Refuse to
  // chase: cap thesis strength, RSI, and distance above the 20-EMA (in ATRs),
  // and require price to actually sit above the 20-EMA (trend confirmed, not yet
  // stretched). Tighten the volatility stop too — real ATR is now populated.
  // strength above this = crowded/overextended, likely a top. Calibrated to 85:
  // blocks the week's high-strength losers (MU 100, AMAT 89, CRDO 87) while
  // letting a genuinely healthy 84 (UNH: RSI 59, above SMA50, ~1.7 ATR ext) pass.
  // Finer extension is then judged on real RSI / ATR-distance below, not strength.
  maxBuyStrength: 85,
  maxBuyRsi: 78, // classic overbought — don't enter
  maxAtrExtension: 4, // price > 4 ATRs above the 20-EMA = chasing
  atrStopMult: 2.0, // stop = 2.0×ATR below entry (was 2.5 — sat through big losers)
};

function toUsd(priceNative: number, currency: Currency, usdIls: number): number {
  return currency === "ILS" ? priceNative / usdIls : priceNative;
}

/**
 * The buy legs clear when the case is convincing — mirrors the thesis maturation
 * (see buildLongStrength): full momentum confirmation (technical ≥ 60), OR a
 * not-broken chart (technical ≥ 45) backed by a genuinely strong fundamental +
 * social story. Lets the engine actually execute the base entries the thesis now
 * matures, instead of demanding active momentum (which only confirms late).
 */
function legsClear(tr: TrackedRecommendation): boolean {
  const tech = tr.technical_score ?? 0;
  const fund = tr.fundamental_score ?? 0;
  const soc = tr.social_score ?? 0;
  if (fund < 60 || soc < 60) return false;
  const strongStory = (fund + soc) / 2 >= 70;
  return tech >= 60 || (tech >= 45 && strongStory);
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

  // Only trade during the US regular session — never when the market is closed
  // or in pre/post (the book is a daytime medium-term trader).
  if (!(await isUsMarketOpen())) return;

  // Research the market backdrop before deploying capital. In a clearly risk-off
  // tape we still manage exits but hold off on new buys.
  const mkt = await assessMarketContext();
  const marketTag = mkt.summary ? `מצב שוק (${regimeHe(mkt.regime)}): ${mkt.summary} · ` : "";

  const account = await ensureAccount(ctx);
  let cash = account.cash;

  const usdIls = (await ctx.repo.latestFx())?.rate ?? 3.62;
  const tracked = await ctx.repo.listTracked();
  const convByTicker = new Map<string, TrackedRecommendation>(
    tracked.map((t) => [t.ticker.toUpperCase(), t]),
  );
  // Theses drive the decisions: buy a matured LONG thesis, sell on a matured EXIT
  // thesis (plus the always-on hard risk rules below).
  const theses = await ctx.repo.listPaperTheses();
  const longThesis = new Map<string, PaperThesis>();
  const exitThesis = new Map<string, PaperThesis>();
  for (const th of theses) {
    (th.direction === "long" ? longThesis : exitThesis).set(th.ticker.toUpperCase(), th);
  }
  const marketByTicker = new Map<string, Market>(
    (await ctx.repo.listLeads()).map((l) => [l.ticker.toUpperCase(), l.market]),
  );
  const priceCache = new Map((await ctx.repo.listCachedQuotes()).map((c) => [c.ticker.toUpperCase(), c]));

  // Preload the social/RSS scan so each trade can attach the source quotes that
  // drove it (the "data found on the web / networks").
  const posts = new Map<string, Post>((await ctx.repo.listPosts()).map((p) => [p.id, p]));
  const sources = new Map<string, Source>((await ctx.repo.listSources()).map((s) => [s.id, s]));
  const signals = await ctx.repo.listSignals();
  function quotesFor(ticker: string): TradeQuote[] {
    const out: TradeQuote[] = [];
    for (const s of signals) {
      if (s.ticker.toUpperCase() !== ticker.toUpperCase()) continue;
      const post = posts.get(s.post_id);
      const src = post ? sources.get(post.source_id) : undefined;
      out.push({
        platform: src?.platform ?? "מקור",
        handle: src?.handle ?? "—",
        claim: s.claim,
        url: post?.url ?? "",
      });
    }
    return out.slice(0, 8);
  }

  async function dossier(
    tr: TrackedRecommendation | undefined,
    ticker: string,
    extra?: { ret_pct?: number; plan?: TradeDossier["plan"]; thesis?: PaperThesis },
  ): Promise<string> {
    let analyst: TradeDossier["analyst"] = null;
    try {
      const a = await fetchAnalystData(ticker);
      analyst = {
        target_mean: a.target_mean,
        target_low: a.target_low,
        target_high: a.target_high,
        upside_pct: a.upside_pct,
        recommendation: a.recommendation,
        big_banks: a.big_bank_ratings.map((r) => `${r.firm}: ${r.grade} (${r.date})`),
      };
    } catch {
      // analyst data unavailable — leave null
    }
    const d: TradeDossier = {
      market: { regime: mkt.regime, summary: mkt.summary },
      scores: {
        technical: tr?.technical_score ?? null,
        fundamental: tr?.fundamental_score ?? null,
        social: tr?.social_score ?? null,
        conviction: tr?.conviction ?? null,
        delta: tr?.conviction_delta ?? null,
        reinforce: tr?.reinforce_count ?? 0,
      },
      analyst,
      quotes: quotesFor(ticker),
      ...(extra?.thesis
        ? { thesis: { strength: extra.thesis.strength, days: extra.thesis.days, steps: extra.thesis.steps } }
        : {}),
      ...(extra?.plan ? { plan: extra.plan } : {}),
      ...(extra?.ret_pct != null ? { ret_pct: extra.ret_pct } : {}),
    };
    return JSON.stringify(d);
  }

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

    const exitTh = exitThesis.get(key);
    let reason: string | null = null;
    // Hard, always-on risk rules — each position's own chart/fundamental/analyst
    // plan (falls back to the global ±% band for legacy positions without a plan).
    if (p.stop_price != null && ep.price <= p.stop_price) {
      reason = `סטופ-לוס: ${round2(ep.price)} ≤ סטופ ${p.stop_price} (${retPct.toFixed(1)}%)`;
    } else if (p.target_price != null && ep.price >= p.target_price) {
      reason = `מימוש רווח: ${round2(ep.price)} ≥ יעד ${p.target_price} (+${retPct.toFixed(1)}%)`;
    } else if (p.stop_price == null && retPct <= STRATEGY.stopLossPct) {
      reason = `סטופ-לוס: תשואה ${retPct.toFixed(1)}% (מתחת ל-${STRATEGY.stopLossPct}%)`;
    } else if (p.target_price == null && retPct >= STRATEGY.takeProfitPct) {
      reason = `מימוש רווח: תשואה +${retPct.toFixed(1)}% (מעל ${STRATEGY.takeProfitPct}%)`;
    } else if (conviction != null && conviction < MIN_CONVICTION) {
      reason = `הקונביקשן ירד ל-${conviction}% (מתחת ל-${MIN_CONVICTION}%) — סוגר פוזיציה`;
    } else if (exitTh && exitTh.strength >= EXIT_BAR) {
      // Soft exit: the multi-day exit thesis matured (deteriorating signals/chart).
      reason = `תזת יציאה הבשילה (עוצמה ${exitTh.strength}/${EXIT_BAR}) — סימני היחלשות מצטברים`;
    }
    // TRIM — exit thesis is in the warning band (de-risk, e.g. into earnings or on
    // weakening technicals) but not a full exit yet: sell ~half, keep the rest.
    if (!reason && exitTh && exitTh.strength >= 35 && exitTh.strength < EXIT_BAR) {
      const trimQty = Math.floor(p.qty / 2);
      if (trimQty >= 1) {
        const proceeds = toUsd(ep.price, ep.currency, usdIls) * trimQty;
        cash += proceeds;
        await ctx.repo.deletePaperPosition(p.id);
        await ctx.repo.addPaperPosition({
          ticker: p.ticker, market: p.market, qty: p.qty - trimQty, avg_cost: p.avg_cost,
          currency: p.currency, stop_price: p.stop_price ?? null, target_price: p.target_price ?? null,
        });
        await ctx.repo.addPaperTrade({
          date: ctx.date, ticker: p.ticker, action: "sell", qty: trimQty, price: ep.price, currency: ep.currency,
          value_usd: round2(proceeds), conviction,
          reason: marketTag + `צמצום (TRIM): תזת יציאה ${exitTh.strength}/${EXIT_BAR} — מקטין סיכון, מחזיק ${p.qty - trimQty}/${p.qty}`,
          analysis: await dossier(tr, p.ticker, { ret_pct: retPct, thesis: exitTh }),
        });
        continue; // keep the (smaller) position + its exit thesis
      }
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
      reason: marketTag + reason,
      analysis: await dossier(tr, p.ticker, { ret_pct: retPct, thesis: exitTh }),
    });
    // Reset both theses so the name can be reconsidered fresh later.
    for (const th of [exitTh, longThesis.get(key)]) if (th) await ctx.repo.deletePaperThesis(th.id);
  }

  // ── 2) ENTRIES — deploy cash into the best tracked names not yet held ─────
  // In a risk-off backdrop the research step holds new buys; exits above still run.
  if (!mkt.tradeable) {
    await ctx.repo.savePaperAccount({ starting_cash: account.starting_cash, cash: round2(cash), currency: "USD" });
    return;
  }

  positions = await ctx.repo.listPaperPositions();
  const heldNow = new Set(positions.map((p) => p.ticker.toUpperCase()));
  let slots = STRATEGY.maxPositions - heldNow.size;
  // Scale in gradually — don't deploy the whole book at once, and keep a cash buffer.
  let buysLeft = STRATEGY.maxNewBuysPerDay;

  // Buy only names whose multi-day LONG thesis has matured past the bar. The
  // thesis matures via momentum confirmation or a strong-story base (the leg logic
  // lives in the thesis stage and in legsClear), so this already encodes "sure".
  const candidates = theses
    .filter((th) => th.direction === "long" && th.status === "building" && th.strength >= BUY_BAR)
    .filter((th) => !heldNow.has(th.ticker.toUpperCase()))
    .sort((a, b) => b.strength - a.strength);

  // ── ROTATION — if a clearly stronger idea is ready but there's no deployable cash,
  // sell the weakest (low-conviction) holding to free capital. This only SELLS; the
  // entry loop below then deploys the freed cash into the best ideas. One benchmark:
  // the strongest ready candidate, vs the weakest weak holding.
  const holdingsUsdOf = async () =>
    (await ctx.repo.listPaperPositions()).reduce((sum, p) => {
      const c = priceCache.get(p.ticker.toUpperCase());
      return sum + toUsd(c?.price ?? p.avg_cost, (c?.currency ?? p.currency) as Currency, usdIls) * p.qty;
    }, 0);
  const ROTATE_MARGIN = 15;
  const best = candidates[0];
  const bt = best ? convByTicker.get(best.ticker.toUpperCase()) : undefined;
  const bestLegsOk = !!bt && legsClear(bt);
  const bestConv = bt?.conviction ?? best?.strength ?? 0;
  while (best && bestLegsOk && buysLeft > 0) {
    const accountValue = cash + (await holdingsUsdOf());
    if (cash - accountValue * STRATEGY.minCashReservePct >= accountValue * STRATEGY.targetWeightPct) break; // enough cash for a buy
    const cur = await ctx.repo.listPaperPositions();
    let weakest = cur[0];
    let weakScore = Infinity;
    for (const p of cur) {
      const pc = convByTicker.get(p.ticker.toUpperCase())?.conviction ?? 35; // out of recs ⇒ weak
      if (pc < weakScore) { weakScore = pc; weakest = p; }
    }
    if (!weakest || weakScore >= MIN_CONVICTION || bestConv < weakScore + ROTATE_MARGIN) break;
    const wq = priceCache.get(weakest.ticker.toUpperCase());
    const wpx = wq?.price ?? weakest.avg_cost;
    const proceeds = toUsd(wpx, (wq?.currency ?? weakest.currency) as Currency, usdIls) * weakest.qty;
    const wRet = weakest.avg_cost > 0 ? ((wpx - weakest.avg_cost) / weakest.avg_cost) * 100 : 0;
    cash += proceeds;
    await ctx.repo.deletePaperPosition(weakest.id);
    await ctx.repo.addPaperTrade({
      date: ctx.date, ticker: weakest.ticker, action: "sell", qty: weakest.qty, price: wpx, currency: weakest.currency,
      value_usd: round2(proceeds), conviction: convByTicker.get(weakest.ticker.toUpperCase())?.conviction ?? null,
      reason: marketTag + `רוטציה: מוכר ${weakest.ticker} (קונביקשן ${Math.round(weakScore)}) לפנות הון לרעיון חזק יותר — ${best.ticker} (קונביקשן ${bestConv}, עוצמה ${best.strength})`,
      analysis: await dossier(convByTicker.get(weakest.ticker.toUpperCase()), weakest.ticker, { ret_pct: wRet }),
    });
    for (const th2 of [exitThesis.get(weakest.ticker.toUpperCase()), longThesis.get(weakest.ticker.toUpperCase())]) if (th2) await ctx.repo.deletePaperThesis(th2.id);
    heldNow.delete(weakest.ticker.toUpperCase());
    slots += 1;
  }

  for (const th of candidates) {
    if (slots <= 0 || buysLeft <= 0) break;
    const key = th.ticker.toUpperCase();
    const t = convByTicker.get(key);
    // Final approval gate: legs must clear (momentum confirmation, or a strong-story
    // base) at execution time.
    if (!t) continue;
    if (!legsClear(t)) continue; // legs don't clear (momentum or strong-story base) → no trade
    const market = marketByTicker.get(key) ?? "US";
    const ep = await execPrice(t.ticker, market);
    if (!ep) continue;

    // ── Entry-quality gate — a healthy band: not extended, not broken ────────
    // Fetch the chart read once (reused below for the stop). Skip (and log why,
    // so the decision is auditable) when the entry is either a late-momentum top
    // (overbought / stretched far above the 20-EMA) OR a broken downtrend (below
    // the 50-day). The middle — a base above the 50-day — is exactly what we want.
    const tech = await ctx.md.getTechnicals(t.ticker, market).catch(() => null);
    const rsiNow = tech?.rsi ?? 50;
    const atr = tech?.atr ?? 0;
    const ema20 = tech?.ema20 ?? 0;
    const sma50 = tech?.sma50 ?? 0;
    const atrExt = atr > 0 && ema20 > 0 ? (ep.price - ema20) / atr : 0;
    let skip: string | null = null;
    if (th.strength > STRATEGY.maxBuyStrength)
      skip = `עוצמה ${th.strength} > ${STRATEGY.maxBuyStrength} (מתוח/overextended)`;
    else if (rsiNow > STRATEGY.maxBuyRsi) skip = `RSI ${Math.round(rsiNow)} > ${STRATEGY.maxBuyRsi} (קנוי-יתר)`;
    else if (sma50 > 0 && ep.price < sma50)
      skip = `מתחת ל-SMA50 (${round2(ep.price)} < ${round2(sma50)}) — מגמת ירידה שבורה`;
    else if (atrExt > STRATEGY.maxAtrExtension)
      skip = `מתוח ${atrExt.toFixed(1)} ATR מעל EMA20 (> ${STRATEGY.maxAtrExtension}) — רודף מומנטום`;
    if (skip) {
      // Auditable in the run log (no DB alert — the alerts table constrains kind).
      console.log(`[autotrade] דילוג קנייה ${t.ticker}: ${skip}`);
      continue;
    }

    // Total account value drives sizing; keep a cash reserve (don't deploy it all).
    const holdingsUsd = (await ctx.repo.listPaperPositions()).reduce((s, p) => {
      const c = priceCache.get(p.ticker.toUpperCase());
      const px = c?.price ?? p.avg_cost;
      return s + toUsd(px, (c?.currency ?? p.currency) as Currency, usdIls) * p.qty;
    }, 0);
    const accountValue = cash + holdingsUsd;
    const deployable = cash - accountValue * STRATEGY.minCashReservePct; // keep the reserve untouched
    const targetUsd = Math.min(deployable, accountValue * STRATEGY.targetWeightPct);
    if (targetUsd <= 0) break; // reserve reached — stop buying
    const priceUsd = toUsd(ep.price, ep.currency, usdIls);
    const qty = sizeQty(targetUsd, priceUsd);
    if (qty < 1) continue; // a single share would breach the reserve / sizing

    const costUsd = priceUsd * qty;
    cash -= costUsd;
    slots -= 1;
    buysLeft -= 1;

    // Exit plan derived per name (not flat ±%): stop from chart volatility (ATR,
    // fetched once above), target from reward:risk scaled by fundamentals and
    // capped by analyst targets.
    const entry = ep.price;
    // Stop = 2.0×ATR below entry, clamped to a tighter −6%..−12% band (was −20%,
    // which sat through big losers — see end-of-day reflections).
    const atrStop = atr > 0 ? entry - STRATEGY.atrStopMult * atr : entry * 0.91;
    const stopPrice = round2(Math.min(entry * 0.94, Math.max(entry * 0.88, atrStop)));
    const risk = entry - stopPrice;
    // Reward:risk scales with fundamentals (stronger → let it run): R 1.5..4.
    const rr = Math.max(1.5, Math.min(4, 2 + ((t.fundamental_score ?? 50) - 50) / 25));
    let aHigh: number | null = null;
    try { aHigh = (await fetchAnalystData(t.ticker)).target_high; } catch { /* no analyst data */ }
    let targetPrice = entry + rr * risk;
    if (aHigh && targetPrice > aHigh) targetPrice = Math.max(aHigh, entry + 1.5 * risk); // don't expect beyond the bulls
    targetPrice = round2(targetPrice);
    const stopPct = round2((stopPrice / entry - 1) * 100);
    const targetPct = round2((targetPrice / entry - 1) * 100);
    const plan = {
      stop_price: stopPrice,
      stop_pct: stopPct,
      target_price: targetPrice,
      target_pct: targetPct,
      exit_rule: `סטופ ${stopPrice} ${ep.currency} (${stopPct}%, ${atr > 0 ? `${STRATEGY.atrStopMult}×ATR` : "ברירת מחדל"}) · יעד ${targetPrice} ${ep.currency} (+${targetPct}%, R/R ${rr.toFixed(1)} לפי פונדמנטל${aHigh ? " · תקרת יעד אנליסט" : ""}) · יציאה גם אם קונביקשן<${MIN_CONVICTION}%`,
    };

    await ctx.repo.addPaperPosition({
      ticker: t.ticker,
      market,
      qty,
      avg_cost: ep.price,
      currency: ep.currency,
      stop_price: stopPrice,
      target_price: targetPrice,
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
        marketTag +
        `קנייה: תזה הבשילה (עוצמה ${th.strength}/${BUY_BAR}, ${th.days} ימי בנייה) · קונביקשן ${t.conviction}% · ${(t.technical_score ?? 0) >= 60 ? "אישור מומנטום" : "כניסת בסיס (פונדמנטל+חברתי חזקים)"}` +
        ` · ט ${t.technical_score ?? "—"}/פ ${t.fundamental_score ?? "—"}/ח ${t.social_score ?? "—"}` +
        (t.reinforce_count ? ` · חוזק ×${t.reinforce_count}` : "") +
        ` · כניסה לא מתוחה (RSI ${Math.round(rsiNow)}${atr > 0 && ema20 > 0 ? `, ${atrExt.toFixed(1)} ATR מעל EMA20` : ""})` +
        ` · ${plan.exit_rule}`,
      analysis: await dossier(t, t.ticker, { plan, thesis: th }),
    });
    // Mark the thesis acted so it isn't re-bought; it's now managed as a holding.
    await ctx.repo.upsertPaperThesis({
      ticker: th.ticker,
      direction: "long",
      status: "acted",
      strength: th.strength,
      days: th.days,
      first_date: th.first_date,
      steps: th.steps,
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

function regimeHe(regime: "risk_on" | "neutral" | "risk_off"): string {
  return regime === "risk_on" ? "סיכון-און" : regime === "risk_off" ? "סיכון-אוף" : "ניטרלי";
}
