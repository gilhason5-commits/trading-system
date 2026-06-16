import { analysisPrompt, parseJsonResponse } from "../claude/index.ts";
import type { Fundamentals } from "../datasources/fmp.ts";
import type { Analysis, Position, Stance } from "../types.ts";
import type { RunContext } from "./context.ts";

// Module 2 — daily per-position analysis (spec §6). For each held position gather
// technicals (Twelve Data) + fundamentals (FMP, US) + news (Finnhub, US), have
// Claude synthesise a stance, and persist to `analyses`.

interface AnalysisJson {
  stance: Stance;
  technical_summary: string;
  fundamental_summary: string;
  key_events: string[];
  risk_flags: string[];
  confidence: number;
}

function fundamentalsToText(f: Fundamentals): string {
  return [
    `sector: ${f.sector}`,
    `net margin: ${(f.net_margin * 100).toFixed(1)}%`,
    `revenue growth (YoY): ${(f.revenue_growth * 100).toFixed(1)}%`,
    `P/E: ${f.pe_ratio}`,
    `debt/equity: ${f.debt_to_equity}`,
    `next earnings: ${f.next_earnings_date}`,
    `last earnings surprise: ${(f.last_earnings_surprise * 100).toFixed(1)}%`,
    `analyst target: $${f.analyst_price_target}`,
  ].join("; ");
}

async function analyseOne(ctx: RunContext, position: Position): Promise<Analysis> {
  const { ticker, market } = position;
  const isUs = market === "US";

  const [quote, technicals, fundamentalsText, newsText] = await Promise.all([
    ctx.md.getQuote(ticker, market).catch(() => null),
    ctx.md.getTechnicals(ticker, market),
    isUs
      ? ctx.fundamentals.getFundamentals(ticker).then(fundamentalsToText).catch(() => "n/a")
      : Promise.resolve("n/a (non-US — fundamentals not pulled)"),
    isUs
      ? ctx.news
          .getNews(ticker, daysAgo(ctx.date, 3), ctx.date)
          .then((items) => items.map((n) => `- ${n.headline}${n.summary ? `: ${n.summary}` : ""}`).join("\n"))
          .catch(() => "")
      : Promise.resolve(""),
  ]);

  const prompt = analysisPrompt(position, quote, technicals, fundamentalsText, newsText);
  const res = await ctx.claude.complete({
    kind: "analysis",
    system: prompt.system,
    user: prompt.user,
    effort: "medium",
    maxTokens: 1200,
  });
  ctx.cost.addClaude(res.usage, res.model);

  const parsed = parseJsonResponse<AnalysisJson>(res.text);
  return ctx.repo.addAnalysis({
    ticker,
    date: ctx.date,
    stance: parsed.stance,
    technical_summary: parsed.technical_summary,
    fundamental_summary: parsed.fundamental_summary,
    key_events: parsed.key_events ?? [],
    risk_flags: parsed.risk_flags ?? [],
    confidence: parsed.confidence ?? 0,
  });
}

/** Run daily analysis for every held position. Returns the saved analyses. */
export async function runAnalysisStage(ctx: RunContext): Promise<Analysis[]> {
  const positions = await ctx.repo.listPositions();
  // Idempotent: skip positions already analysed today (so a retry only redoes failures).
  const done = new Set((await ctx.repo.listAnalyses(ctx.date)).map((a) => a.ticker.toUpperCase()));
  const out: Analysis[] = [];
  for (const p of positions) {
    if (done.has(p.ticker.toUpperCase())) continue;
    try {
      out.push(await analyseOne(ctx, p));
    } catch (err) {
      await ctx.repo.addAlert({
        kind: "error",
        ticker: p.ticker,
        message: `ניתוח נכשל עבור ${p.ticker}: ${(err as Error).message}`,
      });
    }
  }
  return out;
}

function daysAgo(isoDate: string, n: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
