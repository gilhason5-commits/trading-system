import { parseJsonResponse } from "../claude/client.ts";
import { getEnv } from "../env.ts";

// General capital-market news for the digest's bottom section — big sector/market
// events, NOT tied to the user's holdings, focused on Israel + the US. Finnhub's
// general feed is US/global only and Israeli RSS feeds are blocked, so we use
// Grok's live search (xAI key) to pull fresh, Israel-aware headlines. Best-effort:
// any failure (no key, API error, bad JSON) returns [] and the section is skipped.

export interface MarketNewsItem {
  headline: string;
  source: string;
  region: "IL" | "US" | "global";
}

const SYSTEM = "You are a financial news editor. Output ONLY a valid JSON array, no prose, no code fences.";

function userPrompt(): string {
  return [
    "List the 8–12 biggest capital-market / economy news items from the last 2 days.",
    "Focus equally on:",
    "• ישראל — מדד ת״א-35/125, בנק ישראל, השקל, ני\"ע גדולים, אירועים מאקרו וגיאופוליטיים שמשפיעים על השוק הישראלי.",
    "• ארה״ב — הפד, S&P 500, נאסד״ק, סקטורים מובילים, נתוני מאקרו, אירועים גדולים.",
    "Include only genuinely market-moving / sector-level events (not single small-cap noise).",
    'Return a JSON array of objects: {"headline": "<כותרת בעברית>", "source": "<מקור>", "region": "IL" | "US" | "global"}.',
  ].join("\n");
}

export async function fetchGeneralMarketNews(): Promise<MarketNewsItem[]> {
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
          max_search_results: 20,
          sources: [{ type: "news" }, { type: "web" }],
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
    const arr = parseJsonResponse<MarketNewsItem[]>(text);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((i) => i && typeof i.headline === "string" && i.headline.trim().length > 0)
      .map((i) => ({
        headline: i.headline.trim(),
        source: typeof i.source === "string" ? i.source : "",
        region: (i.region === "IL" || i.region === "US" ? i.region : "global") as MarketNewsItem["region"],
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}
