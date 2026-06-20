import type { Currency, Market } from "../types.ts";
import type { Quote } from "./twelvedata.ts";

// Shared Yahoo Finance access (free, key-less) via a cookie+crumb handshake.
// Hosts the crumb cache used by both the analyst feed and the extended-hours
// quote. The v7 quote endpoint reports pre-market / post-market prices and the
// current marketState, so we can price US equities outside regular hours.

export const YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

let crumbCache: { cookie: string; crumb: string } | null = null;

export async function getCrumb(): Promise<{ cookie: string; crumb: string }> {
  if (crumbCache) return crumbCache;
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": YAHOO_UA } });
  const setCookies = r1.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YAHOO_UA, cookie },
  });
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.includes("<")) throw new Error("yahoo: could not obtain crumb");
  crumbCache = { cookie, crumb };
  return crumbCache;
}

function yahooSymbol(ticker: string, market: Market): string {
  const t = ticker.toUpperCase();
  if (market === "crypto") return `${t}-USD`;
  if (market === "TASE") return `${t}.TA`;
  return t;
}

interface YahooQuoteRow {
  symbol?: string;
  currency?: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  preMarketPrice?: number;
  postMarketPrice?: number;
}

/**
 * Extended-hours-aware quote: in pre-market it returns the pre-market price, in
 * post-market / after close the post-market price, otherwise the regular price.
 * `percent_change` and `previous_close` are always vs the regular previous close,
 * so the daily move reflects the full day including the extended session.
 */
export async function fetchYahooQuote(ticker: string, market: Market): Promise<Quote> {
  const sym = yahooSymbol(ticker, market);
  const { cookie, crumb } = await getCrumb();
  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}` +
    `&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, cookie } });
  if (!res.ok) throw new Error(`yahoo quote ${sym}: HTTP ${res.status}`);
  const j = (await res.json()) as { quoteResponse?: { result?: YahooQuoteRow[] } };
  const r = j.quoteResponse?.result?.[0];
  if (!r) throw new Error(`yahoo quote ${sym}: no data`);

  const prevClose = r.regularMarketPreviousClose;
  const regular = r.regularMarketPrice;
  const state = r.marketState ?? "";
  // Pick the freshest traded price for the current session.
  let price: number | undefined;
  if ((state === "PRE" || state === "PREPRE") && typeof r.preMarketPrice === "number") {
    price = r.preMarketPrice;
  } else if (
    (state === "POST" || state === "POSTPOST" || state === "CLOSED") &&
    typeof r.postMarketPrice === "number"
  ) {
    price = r.postMarketPrice;
  }
  if (typeof price !== "number") price = regular;
  if (typeof price !== "number") throw new Error(`yahoo quote ${sym}: no price`);

  const previous_close = typeof prevClose === "number" ? prevClose : price;
  const percent_change =
    previous_close > 0 ? ((price - previous_close) / previous_close) * 100 : 0;

  return {
    symbol: ticker,
    price,
    currency: (r.currency === "ILS" ? "ILS" : "USD") as Currency,
    percent_change,
    previous_close,
  };
}
