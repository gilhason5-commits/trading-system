import { extractSignalsPrompt, parseJsonResponse } from "../claude/index.ts";
import type { Lead, Post, Sentiment, Signal } from "../types.ts";
import type { RunContext } from "./context.ts";

// Module 3 — social / RSS scraping + signal extraction (spec §7).
// For each active source: fetch new content, dedupe, persist posts, extract
// Claude signals, upsert leads for non-held tickers.

interface SignalJson {
  ticker: string;
  sentiment: Sentiment;
  claim: string;
}

// Broad indices / macro instruments — recorded as signals but not turned into
// stock "recommendations" (they're market commentary, not actionable picks).
const NON_STOCK = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "SPX", "NDX", "RUT", "IXIC",
  "DXY", "VIX", "TLT", "CL", "WTI", "GLD", "SLV", "UVXY", "SQQQ", "TQQQ",
]);

// Only consider content published in the last 24h (fresh content per daily run).
const RECENCY_MS = 24 * 60 * 60 * 1000;
function isRecent(publishedAt: string): boolean {
  const t = Date.parse(publishedAt);
  return Number.isNaN(t) ? false : t >= Date.now() - RECENCY_MS;
}

/** Run the scraping + signal-extraction stage. Returns only the items created this run. */
export async function runScrapingStage(
  ctx: RunContext,
): Promise<{ posts: Post[]; signals: Signal[]; leads: Lead[] }> {
  const sources = await ctx.repo.listSources(true);

  // Load held tickers once — signals for these become analysis inputs, not new leads.
  const positions = await ctx.repo.listPositions();
  const heldTickers = new Set(positions.map((p) => p.ticker.toUpperCase()));

  const newPosts: Post[] = [];
  const newSignals: Signal[] = [];
  const newLeads: Lead[] = [];

  for (const source of sources) {
    try {
      const freshPosts = await fetchSourcePosts(ctx, source.id, source.platform, source.handle);
      newPosts.push(...freshPosts);

      for (const post of freshPosts) {
        try {
          const content = post.transcript ?? post.text ?? "";
          if (!content.trim()) continue;

          // Signal extraction
          const prompt = extractSignalsPrompt(content);
          const res = await ctx.claude.complete({
            kind: "signals",
            system: prompt.system,
            user: prompt.user,
            effort: "low",
            maxTokens: 800,
          });
          ctx.cost.addClaude(res.usage, res.model);

          let extracted: SignalJson[] = [];
          try {
            extracted = parseJsonResponse<SignalJson[]>(res.text);
          } catch {
            // Malformed JSON — skip this post's signals
          }

          for (const { ticker, sentiment, claim } of extracted) {
            const T = ticker.toUpperCase();
            // Record the signal (positive/negative/neutral) so the trail/warnings exist.
            const signal = await ctx.repo.addSignal({ post_id: post.id, ticker, sentiment, claim });
            newSignals.push(signal);

            const held = heldTickers.has(T);

            // ── Decision per stock (made BEFORE any verification) ──
            // RECOMMEND: positive discourse on a non-held real stock → lead → verification.
            // WARN:      negative discourse (esp. on a holding) → surfaced in the UI from
            //            this recorded signal; no buy lead created.
            // IGNORE:    neutral mentions, indices/macro, and already-held names.
            if (held || NON_STOCK.has(T) || sentiment !== "bullish") continue;

            const existing = await ctx.repo.getLeadByTicker(ticker);
            const lead = await ctx.repo.upsertLead({
              ticker,
              market: "US",
              status: existing?.status ?? "new",
              mention_count: (existing?.mention_count ?? 0) + 1,
            });
            newLeads.push(lead);
          }
        } catch (err) {
          await ctx.repo.addAlert({
            kind: "error",
            message: `Signal extraction failed for post ${post.id}: ${(err as Error).message}`,
          });
        }
      }
    } catch (err) {
      await ctx.repo.addAlert({
        kind: "error",
        message: `Scraping failed for source ${source.id} (${source.platform}:${source.handle}): ${(err as Error).message}`,
      });
    }
  }

  return { posts: newPosts, signals: newSignals, leads: newLeads };
}

// ── Per-platform fetching ─────────────────────────────────────────────────────

async function fetchSourcePosts(
  ctx: RunContext,
  sourceId: string,
  platform: string,
  handle: string,
): Promise<Post[]> {
  switch (platform) {
    case "youtube":
      return fetchYouTubePosts(ctx, sourceId, handle);
    case "instagram":
      return fetchInstagramPosts(ctx, sourceId, handle);
    case "tiktok":
      return fetchTikTokPosts(ctx, sourceId, handle);
    case "rss":
      return fetchRssPosts(ctx, sourceId, handle);
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

async function fetchYouTubePosts(
  ctx: RunContext,
  sourceId: string,
  handle: string,
): Promise<Post[]> {
  const videos = (await ctx.youtube.listNewVideos(handle)).filter((v) => isRecent(v.publishedAt));
  const fresh: Post[] = [];

  for (const video of videos) {
    if (await ctx.repo.hasPost(sourceId, video.externalId)) continue;

    // Captions when available; otherwise the title is the content for signal
    // extraction (no auto-Whisper — that would cost an Apify run per video).
    const captions = await ctx.youtube.getCaptions(video.externalId).catch(() => null);

    const post = await ctx.repo.addPost({
      source_id: sourceId,
      external_id: video.externalId,
      url: video.url,
      title: video.title,
      text: video.title,
      transcript: captions ?? undefined,
      published_at: video.publishedAt,
    });
    fresh.push(post);
  }

  return fresh;
}

async function fetchInstagramPosts(
  ctx: RunContext,
  sourceId: string,
  handle: string,
): Promise<Post[]> {
  const items = (await ctx.social.fetchInstagram(handle)).filter((i) => isRecent(i.publishedAt));
  ctx.cost.addScraping(0.001 * items.length);
  const fresh: Post[] = [];

  for (const item of items) {
    if (await ctx.repo.hasPost(sourceId, item.externalId)) continue;

    // For media-only posts with no text, transcribe the media URL
    let text = item.text;
    if (!text && item.url) {
      text = await ctx.social.transcribe(item.url);
    }

    const post = await ctx.repo.addPost({
      source_id: sourceId,
      external_id: item.externalId,
      url: item.url,
      title: item.title,
      text: text ?? undefined,
      published_at: item.publishedAt,
    });
    fresh.push(post);
  }

  // Active stories (ephemeral, require the dedicated IG session). Captured with
  // whatever text they carry (caption / link sticker); video-story transcription
  // is intentionally NOT auto-run here to avoid runaway Whisper cost.
  try {
    const stories = (await ctx.instagramStories.fetchStories(handle)).filter((s) => isRecent(s.publishedAt));
    for (const s of stories) {
      if (await ctx.repo.hasPost(sourceId, s.externalId)) continue;
      const post = await ctx.repo.addPost({
        source_id: sourceId,
        external_id: s.externalId,
        url: s.url,
        title: s.title,
        text: s.text ?? undefined,
        published_at: s.publishedAt,
      });
      fresh.push(post);
    }
  } catch (err) {
    await ctx.repo.addAlert({
      kind: "error",
      message: `IG stories failed for ${handle}: ${(err as Error).message}`,
    });
  }

  return fresh;
}

async function fetchTikTokPosts(
  ctx: RunContext,
  sourceId: string,
  handle: string,
): Promise<Post[]> {
  const items = (await ctx.social.fetchTikTok(handle)).filter((i) => isRecent(i.publishedAt));
  ctx.cost.addScraping(0.001 * items.length);
  const fresh: Post[] = [];

  for (const item of items) {
    if (await ctx.repo.hasPost(sourceId, item.externalId)) continue;

    let text = item.text;
    if (!text && item.url) {
      text = await ctx.social.transcribe(item.url);
    }

    const post = await ctx.repo.addPost({
      source_id: sourceId,
      external_id: item.externalId,
      url: item.url,
      title: item.title,
      text: text ?? undefined,
      published_at: item.publishedAt,
    });
    fresh.push(post);
  }

  return fresh;
}

async function fetchRssPosts(
  ctx: RunContext,
  sourceId: string,
  feedUrl: string,
): Promise<Post[]> {
  const items = (await ctx.rss.fetchFeed(feedUrl)).filter((i) => isRecent(i.publishedAt));
  const fresh: Post[] = [];

  for (const item of items) {
    // Use the link as the stable external_id for RSS items
    const externalId = item.link || `rss:${item.title.slice(0, 80)}`;
    if (await ctx.repo.hasPost(sourceId, externalId)) continue;

    const post = await ctx.repo.addPost({
      source_id: sourceId,
      external_id: externalId,
      url: item.link,
      title: item.title,
      text: item.summary,
      published_at: item.publishedAt,
    });
    fresh.push(post);
  }

  return fresh;
}
