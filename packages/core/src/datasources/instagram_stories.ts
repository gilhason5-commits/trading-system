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
    return {
      "x-ig-app-id": APP_ID,
      "user-agent": UA,
      referer: "https://www.instagram.com/",
      cookie: this.session,
    };
  }

  private async resolveUserId(username: string): Promise<string> {
    const u = username.replace(/^@/, "");
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`IG profile ${u}: HTTP ${res.status}`);
    const j = (await res.json()) as { data?: { user?: { id?: string } } };
    const id = j.data?.user?.id;
    if (!id) throw new Error(`IG profile ${u}: no user id (session expired?)`);
    return id;
  }

  async fetchStories(handle: string): Promise<SocialPost[]> {
    const id = await this.resolveUserId(handle);
    const res = await fetch(
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${id}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`IG stories ${handle}: HTTP ${res.status}`);
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
