import { getEnv, isLive } from "../env.ts";
import type { SocialPost } from "./apify.ts";

// Instagram Stories — requires an authenticated session (stories are not visible
// logged-out). Uses a dedicated throwaway account's session cookie (IG_SESSION)
// against Instagram's private web API. Stories are ephemeral (24h) — only active
// ones at run time are returned. Returns SocialPost[] (same shape as posts) so the
// scraping pipeline can transcribe video stories + extract signals uniformly.

const APP_ID = "936619743392459";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface InstagramStoriesSource {
  fetchStories(handle: string): Promise<SocialPost[]>;
}

// ── Mock ──────────────────────────────────────────────────────────────────
export class MockInstagramStories implements InstagramStoriesSource {
  async fetchStories(handle: string): Promise<SocialPost[]> {
    return [
      {
        externalId: `story_${handle}_001`,
        url: `https://instagram.com/stories/${handle}/001`,
        title: "story",
        text: "סטורי (mock): מסתכלים על מניות שבבים היום, NVDA במומנטום.",
        publishedAt: new Date().toISOString(),
      },
    ];
  }
}

// ── Live ──────────────────────────────────────────────────────────────────
interface IgStoryItem {
  pk?: string;
  id?: string;
  taken_at?: number;
  media_type?: number; // 1 image, 2 video
  accessibility_caption?: string;
  video_versions?: Array<{ url?: string }>;
  image_versions2?: { candidates?: Array<{ url?: string }> };
  story_link_stickers?: Array<{ story_link?: { url?: string } }>;
}

export class LiveInstagramStories implements InstagramStoriesSource {
  constructor(private readonly session: string) {}

  private headers(): Record<string, string> {
    // Pull the csrf token out of the session cookie — IG flags requests whose
    // x-csrftoken header doesn't match the csrftoken cookie. Send full browser-XHR
    // headers so the request isn't trivially fingerprinted as a bot.
    const csrf = /csrftoken=([^;]+)/.exec(this.session)?.[1] ?? "";
    return {
      "x-ig-app-id": APP_ID,
      "x-csrftoken": csrf,
      "x-requested-with": "XMLHttpRequest",
      "x-ig-www-claim": "0",
      "user-agent": UA,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      referer: "https://www.instagram.com/",
      cookie: this.session,
    };
  }

  // Fetch with retry/backoff on the soft rate-limit codes (429/403). The hard
  // block we see from datacenter IPs (e.g. CI runners) won't clear on retry — for
  // that, set IG_PROXY_URL to a residential proxy and the request egresses through
  // it (Instagram serves residential IPs the same content our local runs get).
  private async igFetch(url: string, label: string): Promise<Response> {
    const proxy = getEnv().IG_PROXY_URL;
    let dispatcher: unknown;
    if (proxy) {
      try {
        // Computed specifier so TS doesn't hard-require `undici` at build time —
        // it's an optional runtime dep, only needed when IG_PROXY_URL is set.
        const mod = "undici";
        const { ProxyAgent } = (await import(mod)) as { ProxyAgent: new (u: string) => unknown };
        dispatcher = new ProxyAgent(proxy);
      } catch {
        // undici not installed — fall back to a direct request
      }
    }
    let last = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        // exponential backoff with jitter: ~1.5s, then ~3s
        const wait = 1500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 800);
        await new Promise((r) => setTimeout(r, wait));
      }
      const res = await fetch(url, {
        headers: this.headers(),
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit);
      if (res.ok) return res;
      last = res.status;
      if (res.status !== 429 && res.status !== 403) break; // only soft limits are worth a retry
    }
    throw new Error(`${label}: HTTP ${last}`);
  }

  private async resolveUserId(username: string): Promise<string> {
    const u = username.replace(/^@/, "");
    const res = await this.igFetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`,
      `IG profile ${u}`,
    );
    const j = (await res.json()) as { data?: { user?: { id?: string } } };
    const id = j.data?.user?.id;
    if (!id) throw new Error(`IG profile ${u}: no user id (session expired?)`);
    return id;
  }

  async fetchStories(handle: string): Promise<SocialPost[]> {
    const id = await this.resolveUserId(handle);
    const res = await this.igFetch(
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${id}`,
      `IG stories ${handle}`,
    );
    const j = (await res.json()) as {
      reels_media?: Array<{ items?: IgStoryItem[] }>;
      reels?: Record<string, { items?: IgStoryItem[] }>;
    };
    const reel = j.reels_media?.[0] ?? j.reels?.[id];
    const items = reel?.items ?? [];

    return items.map((it) => {
      const link = it.story_link_stickers?.[0]?.story_link?.url;
      const text = [it.accessibility_caption, link ? `link: ${link}` : ""].filter(Boolean).join(" · ");
      return {
        externalId: `story_${it.pk ?? it.id ?? ""}`,
        url:
          it.video_versions?.[0]?.url ??
          it.image_versions2?.candidates?.[0]?.url ??
          `https://instagram.com/stories/${handle}/`,
        title: "story",
        text: text || undefined,
        publishedAt: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : new Date().toISOString(),
      } satisfies SocialPost;
    });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: InstagramStoriesSource | null = null;

export function getInstagramStories(): InstagramStoriesSource {
  if (instance) return instance;
  instance = isLive("IG_SESSION")
    ? new LiveInstagramStories(getEnv().IG_SESSION!)
    : new MockInstagramStories();
  return instance;
}
