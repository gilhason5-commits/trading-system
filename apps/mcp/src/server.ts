import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getRepository,
  getYouTube,
  getSocial,
  getRss,
  getClaude,
  extractSignalsPrompt,
  parseJsonResponse,
} from "@trading/core";
import type { Sentiment } from "@trading/core";

// MCP server — exposes the trading system's scraping pipeline as callable tools
// over stdio (spec §7 Module 3). Clients connect via the MCP protocol.

const server = new McpServer({
  name: "trading-system",
  version: "0.1.0",
});

// ── list_sources ─────────────────────────────────────────────────────────────

server.tool(
  "list_sources",
  "List all content sources (YouTube channels, Instagram/TikTok handles, RSS feeds)",
  async () => {
    const repo = getRepository();
    const sources = await repo.listSources();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(sources) }],
    };
  },
);

// ── add_source ───────────────────────────────────────────────────────────────

server.tool(
  "add_source",
  "Add a new content source to scrape",
  {
    platform: z.enum(["youtube", "tiktok", "instagram", "rss"]).describe("Platform type"),
    handle: z.string().min(1).describe("Channel handle, @username, or RSS feed URL"),
  },
  async ({ platform, handle }) => {
    const repo = getRepository();
    const source = await repo.addSource({ platform, handle, active: true });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(source) }],
    };
  },
);

// ── fetch_new_posts ───────────────────────────────────────────────────────────

server.tool(
  "fetch_new_posts",
  "Fetch and persist new posts for a given source, returning only newly added posts",
  {
    source_id: z.string().min(1).describe("The source ID to fetch new posts for"),
  },
  async ({ source_id }) => {
    const repo = getRepository();
    const sources = await repo.listSources();
    const source = sources.find((s) => s.id === source_id);
    if (!source) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Source not found: ${source_id}` }),
          },
        ],
      };
    }

    const youtube = getYouTube();
    const social = getSocial();
    const rss = getRss();
    const newPosts: unknown[] = [];

    try {
      switch (source.platform) {
        case "youtube": {
          const videos = await youtube.listNewVideos(source.handle);
          for (const video of videos) {
            if (await repo.hasPost(source.id, video.externalId)) continue;
            let transcript = await youtube.getCaptions(video.externalId);
            if (!transcript) {
              transcript = await social.transcribe(video.url);
            }
            const post = await repo.addPost({
              source_id: source.id,
              external_id: video.externalId,
              url: video.url,
              title: video.title,
              transcript: transcript ?? undefined,
              published_at: video.publishedAt,
            });
            newPosts.push(post);
          }
          break;
        }
        case "instagram": {
          const items = await social.fetchInstagram(source.handle);
          for (const item of items) {
            if (await repo.hasPost(source.id, item.externalId)) continue;
            let text = item.text;
            if (!text && item.url) text = await social.transcribe(item.url);
            const post = await repo.addPost({
              source_id: source.id,
              external_id: item.externalId,
              url: item.url,
              title: item.title,
              text: text ?? undefined,
              published_at: item.publishedAt,
            });
            newPosts.push(post);
          }
          break;
        }
        case "tiktok": {
          const items = await social.fetchTikTok(source.handle);
          for (const item of items) {
            if (await repo.hasPost(source.id, item.externalId)) continue;
            let text = item.text;
            if (!text && item.url) text = await social.transcribe(item.url);
            const post = await repo.addPost({
              source_id: source.id,
              external_id: item.externalId,
              url: item.url,
              title: item.title,
              text: text ?? undefined,
              published_at: item.publishedAt,
            });
            newPosts.push(post);
          }
          break;
        }
        case "rss": {
          const items = await rss.fetchFeed(source.handle);
          for (const item of items) {
            const externalId = item.link || `rss:${item.title.slice(0, 80)}`;
            if (await repo.hasPost(source.id, externalId)) continue;
            const post = await repo.addPost({
              source_id: source.id,
              external_id: externalId,
              url: item.link,
              title: item.title,
              text: item.summary,
              published_at: item.publishedAt,
            });
            newPosts.push(post);
          }
          break;
        }
      }
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: (err as Error).message }),
          },
        ],
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(newPosts) }],
    };
  },
);

// ── get_transcript ────────────────────────────────────────────────────────────

server.tool(
  "get_transcript",
  "Return the transcript or text of a specific post by its ID",
  {
    post_id: z.string().min(1).describe("The post ID to retrieve"),
  },
  async ({ post_id }) => {
    const repo = getRepository();
    const posts = await repo.listPosts();
    const post = posts.find((p) => p.id === post_id);
    if (!post) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Post not found: ${post_id}` }),
          },
        ],
      };
    }
    const result = {
      id: post.id,
      title: post.title,
      transcript: post.transcript ?? null,
      text: post.text ?? null,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  },
);

// ── extract_signals ───────────────────────────────────────────────────────────

server.tool(
  "extract_signals",
  "Run Claude signal extraction on a post and return the parsed signals",
  {
    post_id: z.string().min(1).describe("The post ID to extract signals from"),
  },
  async ({ post_id }) => {
    const repo = getRepository();
    const posts = await repo.listPosts();
    const post = posts.find((p) => p.id === post_id);
    if (!post) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Post not found: ${post_id}` }),
          },
        ],
      };
    }

    const content = post.transcript ?? post.text ?? "";
    if (!content.trim()) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ signals: [], note: "Post has no text or transcript" }),
          },
        ],
      };
    }

    const claude = getClaude();
    const prompt = extractSignalsPrompt(content);
    const res = await claude.complete({
      kind: "signals",
      system: prompt.system,
      user: prompt.user,
      effort: "low",
      maxTokens: 800,
    });

    let signals: Array<{ ticker: string; sentiment: Sentiment; claim: string }> = [];
    try {
      signals = parseJsonResponse(res.text);
    } catch {
      // Return raw text if parsing fails
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ raw: res.text, parse_error: "Could not parse JSON" }),
          },
        ],
      };
    }

    // Persist the extracted signals
    const saved = await Promise.all(
      signals.map(({ ticker, sentiment, claim }) =>
        repo.addSignal({ post_id, ticker, sentiment, claim }),
      ),
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(saved) }],
    };
  },
);

// ── Start the server ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
