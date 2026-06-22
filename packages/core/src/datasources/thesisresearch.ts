import { parseJsonResponse } from "../claude/client.ts";
import { getEnv } from "../env.ts";

// Independent thesis research via Grok's Agent Tools (web + X search) on the
// /v1/responses endpoint. After the system recommends a name, the paper trader
// goes and looks for its OWN corroboration: does fresh web/X chatter confirm the
// bullish thesis (long) or show deterioration (exit)? Manipulation-aware. If the
// search is unavailable it returns ok:false (a *visible* failure) rather than a
// silent neutral, so thesis-building proceeds on the system's own signals while
// the flow chart still shows the research didn't actually run.
//
// NOTE: xAI's old Live Search (`search_parameters` on /v1/chat/completions) was
// deprecated (HTTP 410) — this uses the Agent Tools API instead.

const RESPONSES_URL = "https://api.x.ai/v1/responses";
const SEARCH_MODEL = "grok-4.3"; // tools-capable model for web/x search

export type ThesisVerdict = "confirm" | "neutral" | "refute";

export interface ThesisResearch {
  /** false = the search itself failed (don't read the verdict as a real "neutral"). */
  ok: boolean;
  verdict: ThesisVerdict;
  /** One-line Hebrew note on what the search found (or why it failed). */
  note: string;
  /** A few concrete corroborating/contradicting findings. */
  found: string[];
}

const fail = (note: string): ThesisResearch => ({ ok: false, verdict: "neutral", note, found: [] });

const SYSTEM =
  "You are an equity analyst verifying a thesis with live web + X search. Use the search tools, then output ONLY a valid JSON object, no prose, no code fences.";

function userPrompt(ticker: string, direction: "long" | "exit"): string {
  const goal =
    direction === "long"
      ? `Does fresh web + X chatter from the last 3 days CONFIRM a bullish/buy thesis on $${ticker}? Watch for coordinated pumps / low-float manipulation — those do NOT count as confirmation.`
      : `Does fresh web + X chatter from the last 3 days show DETERIORATION / a bearish turn for $${ticker} (bad news, broken thesis, negative sentiment)?`;
  return [
    goal,
    'Return JSON: {"verdict":"confirm"|"neutral"|"refute",',
    '"note":"<one short sentence in Hebrew>",',
    '"found":["<short finding>", "<short finding>"]}.',
    direction === "long"
      ? '"confirm" = genuine independent corroboration; "refute" = contradicting evidence or it looks like a pump.'
      : '"confirm" = real signs of deterioration (supports exiting); "refute" = thesis still healthy.',
  ].join("\n");
}

/** Pull the assistant's final output_text out of a /v1/responses payload. */
function extractText(j: unknown): string {
  const out = (j as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> })?.output;
  if (!Array.isArray(out)) return "";
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") return c.text;
      }
    }
  }
  return "";
}

export async function researchThesisOnline(
  ticker: string,
  direction: "long" | "exit",
): Promise<ThesisResearch> {
  const apiKey = getEnv().XAI_API_KEY;
  if (!apiKey) return fail("מפתח XAI חסר");

  try {
    const res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: SEARCH_MODEL,
        stream: false,
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(ticker, direction) },
        ],
        tools: [{ type: "web_search" }, { type: "x_search" }],
      }),
    });
    if (!res.ok) return fail(`xAI ${res.status}`);
    const j = await res.json();
    const text = extractText(j);
    if (!text) return fail("אין תשובה מהחיפוש");
    const o = parseJsonResponse<Partial<ThesisResearch>>(text);
    const verdict: ThesisVerdict =
      o.verdict === "confirm" || o.verdict === "refute" ? o.verdict : "neutral";
    return {
      ok: true,
      verdict,
      note: typeof o.note === "string" ? o.note.trim() : "",
      found: Array.isArray(o.found) ? o.found.filter((s) => typeof s === "string").slice(0, 5) : [],
    };
  } catch (err) {
    return fail(`שגיאת רשת: ${(err as Error).message}`);
  }
}
