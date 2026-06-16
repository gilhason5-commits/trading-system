import { getEnv } from "../env.ts";
import type { SocialPost } from "./apify.ts";

// X (Twitter) scraping via X's web GraphQL using a dedicated account's session
// (X_AUTH_TOKEN + X_CT0) — the public/free API is gone and logged-out reads are
// walled. Query IDs + feature flags are captured from the web app; if X rotates
// them the call errors (caught upstream) and they must be re-captured.

const BEARER =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const Q_USER = "681MIj51w00Aj6dY0GXnHw"; // UserByScreenName
const Q_TWEETS = "RyDU3I9VJtPF-Pnl6vrRlw"; // UserTweets
const FEATURES_USER =
  "%7B%22hidden_profile_subscriptions_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22subscriptions_verification_info_is_identity_verified_enabled%22%3Atrue%2C%22subscriptions_verification_info_verified_since_enabled%22%3Atrue%2C%22highlights_tweets_tab_ui_enabled%22%3Atrue%2C%22responsive_web_twitter_article_notes_tab_enabled%22%3Atrue%2C%22subscriptions_feature_can_gift_premium%22%3Atrue%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%7D";
const FT_USER = "%7B%22withPayments%22%3Afalse%2C%22withAuxiliaryUserLabels%22%3Atrue%7D";
const FEATURES_TWEETS =
  "%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22rweb_cashtags_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22rweb_cashtags_composer_attachment_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22rweb_conversational_replies_downvote_enabled%22%3Afalse%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22content_disclosure_indicator_enabled%22%3Atrue%2C%22content_disclosure_ai_generated_indicator_enabled%22%3Atrue%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Afalse%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Atrue%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D";
const FT_TWEETS = "%7B%22withArticlePlainText%22%3Afalse%7D";

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
        text: `$NVDA continues to lead the AI trade. (mock from ${handle})`,
        publishedAt: new Date().toISOString(),
      },
    ];
  }
}

// ── Live (authenticated web GraphQL) ────────────────────────────────────────
function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const userIdCache = new Map<string, string>();

export class LiveX implements XSource {
  constructor(
    private readonly authToken: string,
    private readonly ct0: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: BEARER,
      "x-csrf-token": this.ct0,
      cookie: `auth_token=${this.authToken}; ct0=${this.ct0}`,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "content-type": "application/json",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "accept-language": "en",
    };
  }

  private normalize(handle: string): string {
    return handle
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
      .replace(/[/?#].*$/, "");
  }

  private async resolveUserId(user: string): Promise<string> {
    const cached = userIdCache.get(user);
    if (cached) return cached;
    const variables = encodeURIComponent(JSON.stringify({ screen_name: user, withGrokTranslatedBio: true }));
    const url = `https://x.com/i/api/graphql/${Q_USER}/UserByScreenName?variables=${variables}&features=${FEATURES_USER}&fieldToggles=${FT_USER}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`X UserByScreenName ${user}: HTTP ${res.status}`);
    const j = (await res.json()) as { data?: { user?: { result?: { rest_id?: string } } } };
    const id = j.data?.user?.result?.rest_id;
    if (!id) throw new Error(`X: could not resolve user id for ${user} (session expired?)`);
    userIdCache.set(user, id);
    return id;
  }

  // Paginate until tweets fall outside ~36h (buffer for the pipeline's 24h filter),
  // so a full day's tweets are captured even for high-volume accounts. Page-capped.
  async fetchTweets(handle: string): Promise<SocialPost[]> {
    const user = this.normalize(handle);
    const userId = await this.resolveUserId(user);
    const cutoff = Date.now() - 36 * 60 * 60 * 1000;
    const MAX_PAGES = 6;

    const all: SocialPost[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { tweets, bottomCursor } = await this.fetchPage(user, userId, cursor);
      const fresh = tweets.filter((t) => t.externalId && !seen.has(t.externalId));
      for (const t of fresh) seen.add(t.externalId);
      all.push(...fresh);
      if (fresh.length === 0 || !bottomCursor) break;
      const oldest = Math.min(...tweets.map((t) => Date.parse(t.publishedAt)).filter((n) => !Number.isNaN(n)));
      if (oldest < cutoff) break; // reached far enough back
      cursor = bottomCursor;
    }
    return all;
  }

  private async fetchPage(
    user: string,
    userId: string,
    cursor?: string,
  ): Promise<{ tweets: SocialPost[]; bottomCursor?: string }> {
    const vars: Record<string, unknown> = {
      userId,
      count: 20,
      includePromotedContent: false,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
    };
    if (cursor) vars.cursor = cursor;
    const variables = encodeURIComponent(JSON.stringify(vars));
    const url = `https://x.com/i/api/graphql/${Q_TWEETS}/UserTweets?variables=${variables}&features=${FEATURES_TWEETS}&fieldToggles=${FT_TWEETS}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`X UserTweets ${user}: HTTP ${res.status}`);
    const j = (await res.json()) as Record<string, unknown>;

    const instructions =
      ((j as any)?.data?.user?.result?.timeline?.timeline?.instructions as any[]) ?? [];
    const tweets: SocialPost[] = [];
    let bottomCursor: string | undefined;
    for (const ins of instructions) {
      const entries = ins.entries ?? (ins.entry ? [ins.entry] : []);
      for (const e of entries) {
        if (e?.content?.entryType === "TimelineTimelineCursor" && e?.content?.cursorType === "Bottom") {
          bottomCursor = e.content.value;
          continue;
        }
        const r = e?.content?.itemContent?.tweet_results?.result;
        const core = r?.tweet ?? r;
        const legacy = core?.legacy;
        if (!legacy?.full_text) continue;
        const rt = legacy.retweeted_status_result?.result;
        const text = rt?.legacy?.full_text ?? legacy.full_text;
        const id = core?.rest_id ?? legacy.id_str ?? "";
        tweets.push({
          externalId: id,
          url: `https://x.com/${user}/status/${id}`,
          text: decode(text),
          publishedAt: legacy.created_at ? new Date(legacy.created_at).toISOString() : new Date().toISOString(),
        });
      }
    }
    return { tweets, bottomCursor };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────
let instance: XSource | null = null;

export function getX(): XSource {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.DATA_MODE === "live" && env.X_AUTH_TOKEN && env.X_CT0
      ? new LiveX(env.X_AUTH_TOKEN, env.X_CT0)
      : new MockX();
  return instance;
}
