import { getEnv, isLive } from "../env.ts";

// Apify — Instagram/TikTok scraping (logged-out public only) + Whisper transcription.
// Flow: POST run → poll until SUCCEEDED → GET dataset items.

// Actor IDs
const ACTOR_INSTAGRAM = "apify/instagram-scraper";
const ACTOR_TIKTOK = "clockworks/tiktok-scraper";
const ACTOR_WHISPER = "openai/whisper-transcription"; // placeholder

const BASE = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // ~2 minutes max

export interface SocialPost {
  externalId: string;
  url: string;
  title?: string;
  text?: string;
  publishedAt: string;
}

export interface SocialSource {
  fetchInstagram(handle: string): Promise<SocialPost[]>;
  fetchTikTok(handle: string): Promise<SocialPost[]>;
  transcribe(mediaUrl: string): Promise<string>;
}

// ── Mock ──────────────────────────────────────────────────────────────────
const MOCK_INSTAGRAM: Record<string, SocialPost[]> = {
  "@wallstbets": [
    {
      externalId: "ig_wb001",
      url: "https://instagram.com/p/ig_wb001",
      title: "SOFI is setting up for a massive breakout",
      text: "This fintech play has been consolidating for weeks. The banking charter is the moat. Load up below $14. $SOFI #stocks #investing",
      publishedAt: "2026-06-15T09:00:00.000Z",
    },
    {
      externalId: "ig_wb002",
      url: "https://instagram.com/p/ig_wb002",
      title: "RKLB to the moon 🚀",
      text: "Rocket Lab just landed another contract. Space is the next frontier and RKLB is your ticket. $RKLB #spacestocks",
      publishedAt: "2026-06-14T18:00:00.000Z",
    },
  ],
};

const DEFAULT_INSTAGRAM: SocialPost[] = [
  {
    externalId: "ig_default001",
    url: "https://instagram.com/p/ig_default001",
    title: "Market update",
    text: "Big week ahead for earnings. Stay positioned in quality names.",
    publishedAt: "2026-06-15T08:00:00.000Z",
  },
];

const MOCK_TIKTOK: Record<string, SocialPost[]> = {
  "@stockmarketguy": [
    {
      externalId: "tt_smg001",
      url: "https://tiktok.com/@stockmarketguy/video/tt_smg001",
      title: "This small cap is about to explode 🚀",
      text: "You guys need to look at PLTR-like names, also $SOFI. The chart pattern is textbook. Drop a 🚀 if you're in.",
      publishedAt: "2026-06-15T12:00:00.000Z",
    },
    {
      externalId: "tt_smg002",
      url: "https://tiktok.com/@stockmarketguy/video/tt_smg002",
      title: "NVDA still the king of AI chips",
      text: "Every AI company needs Nvidia chips. That's the simple thesis. $NVDA #trading",
      publishedAt: "2026-06-14T20:00:00.000Z",
    },
  ],
};

const DEFAULT_TIKTOK: SocialPost[] = [
  {
    externalId: "tt_default001",
    url: "https://tiktok.com/@default/video/tt_default001",
    title: "Stock market tips",
    text: "Always DYOR. Never invest more than you can afford to lose.",
    publishedAt: "2026-06-15T08:00:00.000Z",
  },
];

export class MockSocial implements SocialSource {
  async fetchInstagram(handle: string): Promise<SocialPost[]> {
    return MOCK_INSTAGRAM[handle] ?? DEFAULT_INSTAGRAM;
  }
  async fetchTikTok(handle: string): Promise<SocialPost[]> {
    return MOCK_TIKTOK[handle] ?? DEFAULT_TIKTOK;
  }
  async transcribe(_mediaUrl: string): Promise<string> {
    return "Mock transcription: the speaker discusses stock market opportunities, highlighting NVDA and SOFI as strong conviction plays for the quarter ahead.";
  }
}

// ── Live ──────────────────────────────────────────────────────────────────

interface ApifyRunResponse {
  data?: { id?: string; status?: string; defaultDatasetId?: string };
}

interface ApifyRunStatus {
  data?: { status?: string; defaultDatasetId?: string };
}

interface ApifyDatasetItem {
  id?: string;
  shortCode?: string;
  url?: string;
  permalink?: string;
  webVideoUrl?: string;
  caption?: string;
  description?: string;
  text?: string;
  title?: string;
  timestamp?: string;
  takenAt?: string;
  createTime?: number;
}

export class LiveSocial implements SocialSource {
  constructor(private readonly token: string) {}

  private tokenParam(): string {
    return new URLSearchParams({ token: this.token }).toString();
  }

  private async runActor(actorId: string, input: Record<string, unknown>): Promise<string> {
    const url = `${BASE}/acts/${encodeURIComponent(actorId)}/runs?${this.tokenParam()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Apify run actor ${actorId}: HTTP ${res.status}`);
    const json = (await res.json()) as ApifyRunResponse;
    const runId = json.data?.id;
    if (!runId) throw new Error(`Apify: no runId returned for actor ${actorId}`);
    return runId;
  }

  private async pollRun(runId: string): Promise<string> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const res = await fetch(`${BASE}/actor-runs/${runId}?${this.tokenParam()}`);
      if (!res.ok) throw new Error(`Apify poll run ${runId}: HTTP ${res.status}`);
      const json = (await res.json()) as ApifyRunStatus;
      const status = json.data?.status;
      if (status === "SUCCEEDED") {
        const datasetId = json.data?.defaultDatasetId;
        if (!datasetId) throw new Error(`Apify: no datasetId for run ${runId}`);
        return datasetId;
      }
      if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        throw new Error(`Apify run ${runId} ended with status: ${status}`);
      }
    }
    throw new Error(`Apify run ${runId}: polling timed out after ${POLL_MAX_ATTEMPTS} attempts`);
  }

  private async fetchDataset(datasetId: string): Promise<ApifyDatasetItem[]> {
    const res = await fetch(`${BASE}/datasets/${datasetId}/items?${this.tokenParam()}`);
    if (!res.ok) throw new Error(`Apify dataset ${datasetId}: HTTP ${res.status}`);
    return (await res.json()) as ApifyDatasetItem[];
  }

  async fetchInstagram(handle: string): Promise<SocialPost[]> {
    // Public logged-out scraping only — username without @
    const username = handle.startsWith("@") ? handle.slice(1) : handle;
    const runId = await this.runActor(ACTOR_INSTAGRAM, {
      usernames: [username],
      resultsLimit: 10,
    });
    const datasetId = await this.pollRun(runId);
    const items = await this.fetchDataset(datasetId);
    return items.map((item) => ({
      externalId: item.shortCode ?? item.id ?? "",
      url: item.url ?? item.permalink ?? `https://instagram.com/p/${item.shortCode ?? ""}`,
      title: item.title,
      text: item.caption ?? item.text,
      publishedAt: item.timestamp ?? item.takenAt ?? new Date().toISOString(),
    }));
  }

  async fetchTikTok(handle: string): Promise<SocialPost[]> {
    // Public logged-out scraping only
    const profileUrl = handle.startsWith("@")
      ? `https://www.tiktok.com/${handle}`
      : `https://www.tiktok.com/@${handle}`;
    const runId = await this.runActor(ACTOR_TIKTOK, {
      profiles: [profileUrl],
      resultsPerPage: 10,
    });
    const datasetId = await this.pollRun(runId);
    const items = await this.fetchDataset(datasetId);
    return items.map((item) => ({
      externalId: item.id ?? "",
      url: item.webVideoUrl ?? item.url ?? "",
      title: item.title,
      text: item.description ?? item.text,
      publishedAt: item.createTime
        ? new Date(item.createTime * 1000).toISOString()
        : (item.timestamp ?? new Date().toISOString()),
    }));
  }

  async transcribe(mediaUrl: string): Promise<string> {
    const runId = await this.runActor(ACTOR_WHISPER, { mediaUrl, language: "en" });
    const datasetId = await this.pollRun(runId);
    const items = await this.fetchDataset(datasetId);
    const first = items[0] as Record<string, unknown> | undefined;
    if (!first) throw new Error(`Apify Whisper: no transcription items for ${mediaUrl}`);
    return String(first.text ?? first.transcript ?? "");
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: SocialSource | null = null;

export function getSocial(): SocialSource {
  if (instance) return instance;
  instance = isLive("APIFY_TOKEN")
    ? new LiveSocial(getEnv().APIFY_TOKEN!)
    : new MockSocial();
  return instance;
}
