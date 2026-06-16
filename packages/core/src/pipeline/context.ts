import { getClaude, type ClaudeClient } from "../claude/index.ts";
import { CostAccumulator } from "../claude/cost.ts";
import { getMarketData, type MarketDataSource } from "../datasources/twelvedata.ts";
import { getFundamentals, type FundamentalsSource } from "../datasources/fmp.ts";
import { getNews, type NewsSource } from "../datasources/finnhub.ts";
import { getYouTube, type YouTubeSource } from "../datasources/youtube.ts";
import { getSocial, type SocialSource } from "../datasources/apify.ts";
import { getInstagramStories, type InstagramStoriesSource } from "../datasources/instagram_stories.ts";
import { getRss, type RssSource } from "../datasources/rss.ts";
import { getRepository, type Repository } from "../db/index.ts";

// Shared context threaded through every daily-pipeline stage (spec §4). Holds the
// repo, datasources, Claude client, and the per-run cost accumulator so cost is
// tallied across analysis → scraping → research → digest in one place.

export interface RunContext {
  date: string;
  repo: Repository;
  md: MarketDataSource;
  fundamentals: FundamentalsSource;
  news: NewsSource;
  youtube: YouTubeSource;
  social: SocialSource;
  instagramStories: InstagramStoriesSource;
  rss: RssSource;
  claude: ClaudeClient;
  cost: CostAccumulator;
}

export function createRunContext(date = today()): RunContext {
  return {
    date,
    repo: getRepository(),
    md: getMarketData(),
    fundamentals: getFundamentals(),
    news: getNews(),
    youtube: getYouTube(),
    social: getSocial(),
    instagramStories: getInstagramStories(),
    rss: getRss(),
    claude: getClaude(),
    cost: new CostAccumulator(),
  };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
