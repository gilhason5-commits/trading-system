import { getEnv, isLive } from "../env.ts";

// YouTube Data API v3 — resolve channel handles, list uploads, fetch captions (spec §3.2).
// Endpoints: /channels (resolve handle → uploads playlist), /playlistItems (list videos),
//            timedtext captions (informal endpoint, best-effort).

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

// ── Live ──────────────────────────────────────────────────────────────────
const BASE = "https://www.googleapis.com/youtube/v3";

interface YTChannelResponse {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
}

interface YTPlaylistResponse {
  items?: Array<{
    snippet?: {
      resourceId?: { videoId?: string };
      title?: string;
      publishedAt?: string;
    };
  }>;
}

export class LiveYouTube implements YouTubeSource {
  constructor(private readonly apiKey: string) {}

  private url(path: string, params: Record<string, string>): string {
    const usp = new URLSearchParams({ ...params, key: this.apiKey });
    return `${BASE}${path}?${usp.toString()}`;
  }

  private async resolveUploadsPlaylist(handle: string): Promise<string> {
    // Strip the leading @ if present; forHandle expects the bare handle WITH @
    const forHandle = handle.startsWith("@") ? handle : `@${handle}`;
    const res = await fetch(
      this.url("/channels", { part: "contentDetails", forHandle })
    );
    if (!res.ok) throw new Error(`YouTube channels ${handle}: HTTP ${res.status}`);
    const data = (await res.json()) as YTChannelResponse;
    const playlistId = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) throw new Error(`YouTube: could not resolve uploads playlist for ${handle}`);
    return playlistId;
  }

  async listNewVideos(handle: string): Promise<VideoRef[]> {
    const playlistId = await this.resolveUploadsPlaylist(handle);
    const res = await fetch(
      this.url("/playlistItems", { part: "snippet", playlistId, maxResults: "10" })
    );
    if (!res.ok) throw new Error(`YouTube playlistItems ${handle}: HTTP ${res.status}`);
    const data = (await res.json()) as YTPlaylistResponse;
    return (data.items ?? []).map((item) => {
      const videoId = item.snippet?.resourceId?.videoId ?? "";
      return {
        externalId: videoId,
        url: `https://youtube.com/watch?v=${videoId}`,
        title: item.snippet?.title ?? "",
        publishedAt: item.snippet?.publishedAt ?? "",
      };
    });
  }

  async getCaptions(videoId: string): Promise<string | null> {
    // Use the unofficial timedtext endpoint — returns null when captions are absent
    // so the caller can fall back to Apify/Whisper transcription.
    try {
      const url = `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=vtt`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text || text.trim().length === 0) return null;
      // Strip VTT cue headers and timing lines, return plain text
      const lines = text.split("\n").filter((line) => {
        if (line.startsWith("WEBVTT")) return false;
        if (/^\d{2}:\d{2}/.test(line)) return false;
        if (/^-->/.test(line)) return false;
        if (line.trim() === "") return false;
        return true;
      });
      const plain = lines.join(" ").trim();
      return plain.length > 0 ? plain : null;
    } catch {
      return null;
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: YouTubeSource | null = null;

export function getYouTube(): YouTubeSource {
  if (instance) return instance;
  instance = isLive("YOUTUBE_API_KEY")
    ? new LiveYouTube(getEnv().YOUTUBE_API_KEY!)
    : new MockYouTube();
  return instance;
}
