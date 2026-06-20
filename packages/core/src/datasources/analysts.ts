// Analyst forecasts from Yahoo Finance (free, key-less, via a cookie+crumb
// handshake): consensus price target + upside, and recent ratings from the major
// investment banks. Per-firm *price targets* aren't available on any free tier —
// Yahoo gives the consensus target plus per-firm rating grades.

import { getCrumb, YAHOO_UA as UA } from "./yahoo.ts";

// The big investment houses we surface (matched as case-insensitive substrings).
const BIG_BANKS = [
  "Goldman Sachs",
  "Morgan Stanley",
  "JPMorgan",
  "J.P. Morgan",
  "JP Morgan",
  "BofA",
  "B of A",
  "Bank of America",
  "Merrill",
  "Citigroup",
  "Citi",
  "Wells Fargo",
  "Barclays",
  "UBS",
];

export interface AnalystFirmRating {
  firm: string;
  grade: string;
  date: string;
}

export interface AnalystData {
  ticker: string;
  target_mean: number | null;
  target_high: number | null;
  target_low: number | null;
  current: number | null;
  upside_pct: number | null;
  recommendation: string | null;
  big_bank_ratings: AnalystFirmRating[];
}

function num(x: unknown): number | null {
  const v = (x as { raw?: number } | undefined)?.raw;
  return typeof v === "number" ? v : null;
}

export async function fetchAnalystData(ticker: string): Promise<AnalystData> {
  const { cookie, crumb } = await getCrumb();
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
    `?modules=financialData,upgradeDowngradeHistory&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, cookie } });
  if (!res.ok) throw new Error(`yahoo analysts ${ticker}: HTTP ${res.status}`);
  const j = (await res.json()) as {
    quoteSummary?: { result?: Array<Record<string, unknown>> };
  };
  const d = j.quoteSummary?.result?.[0];
  if (!d) throw new Error(`yahoo analysts ${ticker}: no data`);

  const fd = (d.financialData ?? {}) as Record<string, unknown>;
  const target_mean = num(fd.targetMeanPrice);
  const current = num(fd.currentPrice);
  const upside_pct = target_mean && current ? ((target_mean - current) / current) * 100 : null;

  const history = ((d.upgradeDowngradeHistory as { history?: unknown[] })?.history ?? []) as Array<{
    firm?: string;
    toGrade?: string;
    epochGradeDate?: number;
  }>;
  // Most recent rating per big bank.
  const seen = new Set<string>();
  const big_bank_ratings: AnalystFirmRating[] = [];
  for (const h of history.sort((a, b) => (b.epochGradeDate ?? 0) - (a.epochGradeDate ?? 0))) {
    const firm = h.firm ?? "";
    if (!BIG_BANKS.some((b) => firm.toLowerCase().includes(b.toLowerCase()))) continue;
    if (seen.has(firm) || !h.toGrade) continue;
    seen.add(firm);
    big_bank_ratings.push({
      firm,
      grade: h.toGrade,
      date: new Date((h.epochGradeDate ?? 0) * 1000).toISOString().slice(0, 10),
    });
    if (big_bank_ratings.length >= 5) break;
  }

  return {
    ticker,
    target_mean,
    target_high: num(fd.targetHighPrice),
    target_low: num(fd.targetLowPrice),
    current,
    upside_pct,
    recommendation: (fd.recommendationKey as string) ?? null,
    big_bank_ratings,
  };
}
