import { parseJsonResponse } from "../claude/client.ts";
import { getEnv } from "../env.ts";

// Independent thesis research via Grok live search (web + X). After the system
// recommends a name, the paper trader goes and looks for its OWN corroboration:
// does fresh web/X chatter confirm the bullish thesis (long) or show deterioration
// (exit)? Manipulation-aware. Best-effort: returns a neutral verdict if Grok is
// unavailable, so thesis-building still proceeds on the system's own signals.

export type ThesisVerdict = "confirm" | "neutral" | "refute";

export interface ThesisResearch {
  verdict: ThesisVerdict;
  /** One-line Hebrew note on what the search found. */
  note: string;
  /** A few concrete corroborating/contradicting findings. */
  found: string[];
}

const NEUTRAL: ThesisResearch = { verdict: "neutral", note: "", found: [] };

const SYSTEM = "You are an equity analyst verifying a thesis with live web + X search. Output ONLY a valid JSON object, no prose, no code fences.";

function userPrompt(ticker: string, direction: "long" | "exit"): string {
  const goal =
    direction === "long"
      ? `Does fresh web + X chatter CONFIRM a bullish/buy thesis on $${ticker}? Watch for coordinated pumps / low-float manipulation — those do NOT count as confirmation.`
      : `Does fresh web + X chatter show DETERIORATION / a bearish turn for $${ticker} (bad news, broken thesis, negative sentiment)?`;
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

export async function researchThesisOnline(
  ticker: string,
  direction: "long" | "exit",
): Promise<ThesisResearch> {
  const env = getEnv();
  const apiKey = env.XAI_API_KEY;
  if (!apiKey) return NEUTRAL;
  const model = env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning";

  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 3);

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        search_parameters: {
          mode: "on",
          return_citations: false,
          from_date: from.toISOString().slice(0, 10),
          to_date: today.toISOString().slice(0, 10),
          max_search_results: 15,
          sources: [{ type: "news" }, { type: "web" }, { type: "x" }],
        },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(ticker, direction) },
        ],
      }),
    });
    if (!res.ok) return NEUTRAL;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content ?? "";
    if (!text) return NEUTRAL;
    const o = parseJsonResponse<Partial<ThesisResearch>>(text);
    const verdict: ThesisVerdict =
      o.verdict === "confirm" || o.verdict === "refute" ? o.verdict : "neutral";
    return {
      verdict,
      note: typeof o.note === "string" ? o.note.trim() : "",
      found: Array.isArray(o.found) ? o.found.filter((s) => typeof s === "string").slice(0, 5) : [],
    };
  } catch {
    return NEUTRAL;
  }
}
