import { parseJsonResponse } from "../claude/client.ts";
import { getEnv } from "../env.ts";

// Pre-trade market research. Before the autonomous book deploys capital, it reads
// the current market regime (via Grok live search) so it doesn't buy into a
// clearly risk-off / turbulent tape. Best-effort: if the research is unavailable
// it returns a neutral, tradeable verdict so trading still proceeds.

export type MarketRegime = "risk_on" | "neutral" | "risk_off";

export interface MarketContext {
  /** Whether conditions are calm enough to open NEW positions. */
  tradeable: boolean;
  regime: MarketRegime;
  /** One-line Hebrew summary of the current market backdrop. */
  summary: string;
}

const NEUTRAL: MarketContext = { tradeable: true, regime: "neutral", summary: "" };

const SYSTEM = "You are a risk manager for a US-equity trading book. Output ONLY a valid JSON object, no prose, no code fences.";

function userPrompt(): string {
  return [
    "Assess the CURRENT US stock-market backdrop for deploying fresh long capital today.",
    "Consider: S&P 500 / Nasdaq trend and breadth, VIX, today's macro/Fed events, major risk headlines.",
    'Return a JSON object: {"regime":"risk_on"|"neutral"|"risk_off",',
    '"tradeable":<true unless conditions are clearly risk-off / a major shock is unfolding>,',
    '"summary":"<one short sentence in Hebrew describing the backdrop>"}.',
  ].join("\n");
}

export async function assessMarketContext(): Promise<MarketContext> {
  const env = getEnv();
  const apiKey = env.XAI_API_KEY;
  if (!apiKey) return NEUTRAL;
  const model = env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning";

  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 1);

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
          sources: [{ type: "news" }, { type: "x" }],
        },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt() },
        ],
      }),
    });
    if (!res.ok) return NEUTRAL;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content ?? "";
    if (!text) return NEUTRAL;
    const o = parseJsonResponse<Partial<MarketContext>>(text);
    const regime: MarketRegime =
      o.regime === "risk_on" || o.regime === "risk_off" ? o.regime : "neutral";
    return {
      regime,
      tradeable: o.tradeable !== false && regime !== "risk_off",
      summary: typeof o.summary === "string" ? o.summary.trim() : "",
    };
  } catch {
    return NEUTRAL;
  }
}
