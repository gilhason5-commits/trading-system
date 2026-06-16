import { getEnv } from "../env.ts";

// YouTube channel videos via the public per-channel RSS feed — no API key, no
// quota (resolves @handle → channelId from the channel page, then parses
// feeds/videos.xml). Captions via the informal timedtext endpoint (best-effort).

export interface VideoRef {
  externalId: string;
  url: string;
  title: string;
  publishedAt: string;
}

export interface YouTubeSource {
  listNewVideos(handle: string): Promise<VideoRef[]>;
  getCaptions(videoId: string): Promise<string | null>;
}

// ── Mock ──────────────────────────────────────────────────────────────────
const MOCK_VIDEOS: Record<string, VideoRef[]> = {
  "@MeetKevin": [
    {
      externalId: "yt_mk001",
      url: "https://youtube.com/watch?v=yt_mk001",
      title: "Why NVDA is my biggest position right now | Meet Kevin",
      publishedAt: "2026-06-15T10:00:00.000Z",
    },
    {
      externalId: "yt_mk002",
      url: "https://youtube.com/watch?v=yt_mk002",
      title: "SOFI stock: the fintech bank that could 3x | Meet Kevin",
      publishedAt: "2026-06-14T11:00:00.000Z",
    },
  ],
  "@FinancialEducation": [
    {
      externalId: "yt_fe001",
      url: "https://youtube.com/watch?v=yt_fe001",
      title: "RKLB — Rocket Lab is the next SpaceX | Financial Education",
      publishedAt: "2026-06-15T08:30:00.000Z",
    },
  ],
};

const DEFAULT_VIDEOS: VideoRef[] = [
  {
    externalId: "yt_default001",
    url: "https://youtube.com/watch?v=yt_default001",
    title: "Top stock picks for 2026",
    publishedAt: "2026-06-15T09:00:00.000Z",
  },
];

const MOCK_CAPTIONS: Record<string, string> = {
  yt_mk001: "Today I want to talk about Nvidia. The data center business is absolutely on fire right now. Blackwell GPUs are sold out through next year. I think this stock still has significant room to run from here.",
  yt_mk002: "SoFi is one of those rare fintech companies that actually became a bank. They now have a banking charter which means they can hold deposits. That changes everything about their unit economics.",
  yt_fe001: "Rocket Lab is building the vertical integration playbook that SpaceX perfected. They have the Electron rocket for small payloads and Neutron coming for medium lift. This is a long-term compounder.",
};

export class MockYouTube implements YouTubeSource {
  async listNewVideos(handle: string): Promise<VideoRef[]> {
    return MOCK_VIDEOS[handle] ?? DEFAULT_VIDEOS;
  }
  async getCaptions(videoId: string): Promise<string | null> {
    return MOCK_CAPTIONS[videoId] ?? "Mock transcript: this video discusses stock market opportunities and investment strategies for the coming quarter.";
  }
}

// ── Live (free, no API key) ─────────────────────────────────────────────────
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const channelIdCache = new Map<string, string>();

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export class LiveYouTube implements YouTubeSource {
  private async resolveChannelId(handle: string): Promise<string> {
    const direct = handle.match(/UC[\w-]{22}/);
    if (direct) return direct[0];
    const cached = channelIdCache.get(handle);
    if (cached) return cached;

    const url = handle.startsWith("http")
      ? handle
      : `https://www.youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}`;
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" } });
    if (!res.ok) throw new Error(`YouTube channel ${handle}: HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/"channelId":"(UC[\w-]{22})"/) ?? html.match(/channel\/(UC[\w-]{22})/);
    if (!m) throw new Error(`YouTube: could not resolve channelId for ${handle}`);
    channelIdCache.set(handle, m[1]!);
    return m[1]!;
  }

  async listNewVideos(handle: string): Promise<VideoRef[]> {
    const channelId = await this.resolveChannelId(handle);
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!res.ok) throw new Error(`YouTube feed ${handle}: HTTP ${res.status}`);
    const xml = await res.text();
    const out: VideoRef[] = [];
    for (const e of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const b = e[1]!;
      const id = b.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
      if (!id) continue;
      out.push({
        externalId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: decodeXml(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
        publishedAt: b.match(/<published>(.*?)<\/published>/)?.[1] ?? new Date().toISOString(),
      });
    }
    return out;
  }

  async getCaptions(videoId: string): Promise<string | null> {
    // YouTube now signs caption URLs, so free fetches usually return empty.
    // Fall back to an Apify transcript actor (works for auto-captions incl. Hebrew).
    const token = getEnv().APIFY_TOKEN;
    if (!token) return null;
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items?token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: `https://www.youtube.com/watch?v=${videoId}` }),
        },
      );
      if (!res.ok) return null;
      const items = (await res.json()) as Array<{ data?: Array<{ text?: string }>; transcript?: string }>;
      const first = items?.[0];
      const text = Array.isArray(first?.data)
        ? first!.data.map((s) => s.text ?? "").join(" ").trim()
        : (first?.transcript ?? "").trim();
      return text ? text.slice(0, 12000) : null; // cap to bound signal-extraction cost
    } catch {
      return null;
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: YouTubeSource | null = null;

export function getYouTube(): YouTubeSource {
  if (instance) return instance;
  // The RSS-based live source needs no API key — use it whenever live.
  instance = getEnv().DATA_MODE === "live" ? new LiveYouTube() : new MockYouTube();
  return instance;
}
