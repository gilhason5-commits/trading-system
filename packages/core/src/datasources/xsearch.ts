import { parseJsonResponse } from "../claude/client.ts";
import { getEnv } from "../env.ts";

// X (Twitter) stock-discovery via Grok live search. X carries a lot of early
// stock chatter, so we mine it for tickers being discussed bullishly — but it's
// also where pump-and-dumps live, so Grok is asked to estimate how many distinct
// accounts are behind each name and to flag anything that looks coordinated /
// low-float. Real verification (price/chart data, cross-source corroboration,
// manipulation flag) still happens downstream in the research stage.

export interface XCandidate {
  ticker: string;
  claim: string;
  handle: string;
  url: string;
  /** Approx number of distinct accounts discussing it (corroboration signal). */
  accounts: number;
  /** Grok's read on whether this looks like a coordinated pump / manipulation. */
  suspected_pump: boolean;
}

const SYSTEM = "You are a markets analyst mining X (Twitter). Output ONLY a valid JSON array, no prose, no code fences.";

function userPrompt(): string {
  return [
    "Search X (Twitter) for US-listed stocks being discussed BULLISHLY in the last 2 days with real traction.",
    "Return the 5–12 most-discussed tickers. For each, judge how organic the discussion is.",
    "Return a JSON array of objects with EXACTLY these fields:",
    '{"ticker":"AAPL","claim":"<one short sentence on the bullish thesis>","handle":"<a representative @handle>",',
    '"url":"<link to a representative post>","accounts":<approx number of DISTINCT accounts discussing it>,',
    '"suspected_pump":<true if it looks like a coordinated pump / low-float manipulation, else false>}.',
    "Be skeptical: small/low-float names hyped by a burst of similar posts from new accounts → suspected_pump=true.",
    "Only real, currently-listed US tickers. No indices/ETFs/crypto.",
  ].join("\n");
}

export async function searchXForTickers(): Promise<XCandidate[]> {
  const env = getEnv();
  const apiKey = env.XAI_API_KEY;
  if (!apiKey) return [];
  const model = env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning";

  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 2);

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        search_parameters: {
          mode: "on",
          return_citations: false,
          from_date: from.toISOString().slice(0, 10),
          to_date: today.toISOString().slice(0, 10),
          max_search_results: 30,
          sources: [{ type: "x" }],
        },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt() },
        ],
      }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content ?? "";
    if (!text) return [];
    const arr = parseJsonResponse<XCandidate[]>(text);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c.ticker === "string" && /^[A-Za-z]{1,5}$/.test(c.ticker.trim()))
      .map((c) => ({
        ticker: c.ticker.trim().toUpperCase(),
        claim: typeof c.claim === "string" ? c.claim.trim() : "",
        handle: typeof c.handle === "string" ? c.handle.trim() : "",
        url: typeof c.url === "string" ? c.url.trim() : "",
        accounts: Number.isFinite(c.accounts) ? Math.max(0, Math.floor(c.accounts as number)) : 0,
        suspected_pump: Boolean(c.suspected_pump),
      }));
  } catch {
    return [];
  }
}
