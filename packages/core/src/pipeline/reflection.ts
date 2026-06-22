import type { RunContext } from "./context.ts";

// End-of-day self-reflection for the autonomous paper trader (runs in the 23:00
// digest job). It reviews the day's trades + open positions (with P&L) and asks
// Claude for honest, concrete lessons on where its analysis can improve. The note
// is stored and shown under the trade log, and read back at the next 14:30 prep
// run (injected into the thesis research) so the book learns from its own calls.

const SYSTEM =
  "You are an autonomous paper trader reviewing your OWN trading day to improve. " +
  "Be honest and specific. Identify concrete patterns to fix (e.g. chasing momentum above analyst targets, " +
  "exiting winners early, over-weighting a single social mention, ignoring valuation). " +
  "Output 3–6 short actionable lessons in Hebrew as plain '- ' bullet lines. No preamble, no JSON.";

export async function runPaperReflectionStage(ctx: RunContext): Promise<string | null> {
  const [trades, positions, quotes, fx] = await Promise.all([
    ctx.repo.listPaperTrades(),
    ctx.repo.listPaperPositions(),
    ctx.repo.listCachedQuotes(),
    ctx.repo.latestFx(),
  ]);
  if (trades.length === 0 && positions.length === 0) return null; // nothing to reflect on yet

  const priceByTicker = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));
  const openPositions = positions.map((p) => {
    const q = priceByTicker.get(p.ticker.toUpperCase());
    const cur = q?.price ?? p.avg_cost;
    const plPct = p.avg_cost > 0 ? ((cur - p.avg_cost) / p.avg_cost) * 100 : 0;
    return { ticker: p.ticker, entry: p.avg_cost, current: cur, pl_pct: Math.round(plPct * 10) / 10, stop: p.stop_price ?? null, target: p.target_price ?? null };
  });
  const recentTrades = trades.slice(0, 30).map((t) => ({
    date: t.date, action: t.action, ticker: t.ticker, price: t.price, conviction: t.conviction ?? null, reason: t.reason,
  }));

  const summary = JSON.stringify({ as_of: ctx.date, open_positions: openPositions, recent_trades: recentTrades, usd_ils: fx?.rate ?? null });
  const res = await ctx.claude.complete({
    kind: "generic",
    system: SYSTEM,
    user: `הנה הפעולות והפוזיציות שלי. הפק מסקנות ולקחים לשיפור הניתוח שלי מחר:\n${summary}`,
    effort: "medium",
    maxTokens: 1200,
  });
  ctx.cost.addClaude(res.usage, res.model);

  const reflection = res.text.trim();
  if (!reflection) return null;
  await ctx.repo.upsertPaperReflection({ date: ctx.date, reflection });
  return reflection;
}
