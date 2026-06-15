import { getEnv } from "../env.ts";

// Financial news RSS — CNBC, Yahoo Finance, Globes, Calcalist.
// No API key required. Dependency-free XML parsing via regex/string operations.

export interface RssItem {
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
  sourceUrl: string;
}

export interface RssSource {
  fetchFeed(feedUrl: string): Promise<RssItem[]>;
}

// ── Helpers — dependency-free XML extraction ──────────────────────────────

/**
 * Extract all text content between the first matching open/close tag pair.
 * Handles both <tag>...</tag> and CDATA sections.
 */
function extractTag(xml: string, tag: string): string {
  // Try CDATA first
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i");
  const cdataMatch = cdataRe.exec(xml);
  if (cdataMatch?.[1] != null) return cdataMatch[1].trim();

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(xml);
  return match?.[1] != null ? match[1].trim() : "";
}

/**
 * Extract all item/entry blocks from an RSS 2.0 or Atom feed.
 */
function extractItems(xml: string): string[] {
  const items: string[] = [];
  // RSS 2.0 uses <item>; Atom uses <entry>
  const tagNames = ["item", "entry"];
  for (const tag of tagNames) {
    const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "gi");
    let match;
    while ((match = re.exec(xml)) !== null) {
      items.push(match[0]);
    }
    if (items.length > 0) break;
  }
  return items;
}

/**
 * Parse a date string to ISO format — handles RFC 822 and ISO 8601.
 */
function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString();
  try {
    return new Date(raw).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// ── Mock ──────────────────────────────────────────────────────────────────
const MOCK_ITEMS: RssItem[] = [
  {
    title: "Chip stocks lead market higher as AI demand accelerates",
    link: "https://cnbc.com/2026/06/15/markets.html",
    summary: "Semiconductor names rallied on strong demand signals from cloud providers.",
    publishedAt: "2026-06-15T08:00:00.000Z",
    sourceUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  },
  {
    title: "SoFi Financial beats revenue estimates as member count grows",
    link: "https://finance.yahoo.com/news/sofi-beats-estimates",
    summary: "The digital bank reported 850k new accounts in Q2, exceeding analyst forecasts.",
    publishedAt: "2026-06-15T09:30:00.000Z",
    sourceUrl: "https://finance.yahoo.com/news/rssindex",
  },
  {
    title: "Rocket Lab wins key NASA contract for upcoming lunar mission",
    link: "https://globes.co.il/news/article.aspx?did=1001234567",
    summary: "Rocket Lab's Electron rocket selected for small-satellite deployment ahead of lunar campaign.",
    publishedAt: "2026-06-14T16:00:00.000Z",
    sourceUrl: "https://www.globes.co.il/rss",
  },
];

export class MockRss implements RssSource {
  async fetchFeed(feedUrl: string): Promise<RssItem[]> {
    return MOCK_ITEMS.map((item) => ({ ...item, sourceUrl: feedUrl }));
  }
}

// ── Live ──────────────────────────────────────────────────────────────────
export class LiveRss implements RssSource {
  async fetchFeed(feedUrl: string): Promise<RssItem[]> {
    const res = await fetch(feedUrl, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) throw new Error(`RSS fetch ${feedUrl}: HTTP ${res.status}`);
    const xml = await res.text();
    const rawItems = extractItems(xml);
    return rawItems.map((block) => {
      const title = stripHtml(extractTag(block, "title"));
      // Atom uses <link href="..."/> or <link>...</link>; RSS uses <link>
      let link = extractTag(block, "link");
      if (!link) {
        const hrefMatch = /href="([^"]+)"/.exec(block);
        link = hrefMatch?.[1] ?? "";
      }
      // Summary: try description, then summary, then content
      const summary = stripHtml(
        extractTag(block, "description") ||
        extractTag(block, "summary") ||
        extractTag(block, "content")
      );
      const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
      return {
        title,
        link,
        summary,
        publishedAt: parseDate(pubDate),
        sourceUrl: feedUrl,
      };
    });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: RssSource | null = null;

export function getRss(): RssSource {
  if (instance) return instance;
  instance = getEnv().DATA_MODE === "live"
    ? new LiveRss()
    : new MockRss();
  return instance;
}
