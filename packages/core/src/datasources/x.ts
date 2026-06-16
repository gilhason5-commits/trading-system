import { getEnv, isLive } from "../env.ts";
import type { SocialPost } from "./apify.ts";

// X (Twitter) scraping via an Apify actor (the free X API is gone). Logged-out
// public tweets only. Returns SocialPost[] so the scraping pipeline treats tweets
// like any other content (read → classify sentiment → recommend/warn/ignore).

const ACTOR = "apidojo~tweet-scraper";
const BASE = "https://api.apify.com/v2";

export interface XSource {
  fetchTweets(handle: string): Promise<SocialPost[]>;
}

// ── Mock ──────────────────────────────────────────────────────────────────
export class MockX implements XSource {
  async fetchTweets(handle: string): Promise<SocialPost[]> {
    return [
      {
        externalId: `x_${handle}_1`,
        url: `https://x.com/${handle.replace(/^@/, "")}/status/1`,
        text: `$NVDA continues to lead the AI trade. Strong setup. (mock from ${handle})`,
        publishedAt: new Date().toISOString(),
      },
    ];
  }
}

// ── Live ──────────────────────────────────────────────────────────────────
export class LiveX implements XSource {
  constructor(private readonly token: string) {}

  async fetchTweets(handle: string): Promise<SocialPost[]> {
    const user = handle.replace(/^@/, "");
    const res = await fetch(`${BASE}/acts/${ACTOR}/run-sync-get-dataset-items?token=${this.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `from:<user>` advanced-search returns that account's latest tweets.
      body: JSON.stringify({ searchTerms: [`from:${user}`], maxItems: 15, sort: "Latest" }),
    });
    if (!res.ok) throw new Error(`Apify X ${handle}: HTTP ${res.status}`);
    const items = (await res.json()) as Array<Record<string, unknown>>;
    const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
    return items
      .filter((it) => it.text || it.full_text)
      .map((it) => {
        const created = str(it.createdAt ?? it.created_at);
        const ts = Date.parse(created);
        return {
          externalId: str(it.id ?? it.id_str ?? it.url),
          url: str(it.url ?? it.twitterUrl) || `https://x.com/${user}`,
          text: str(it.text ?? it.full_text),
          publishedAt: Number.isNaN(ts) ? new Date().toISOString() : new Date(ts).toISOString(),
        } satisfies SocialPost;
      });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: XSource | null = null;

export function getX(): XSource {
  if (instance) return instance;
  instance = isLive("APIFY_TOKEN") ? new LiveX(getEnv().APIFY_TOKEN!) : new MockX();
  return instance;
}
