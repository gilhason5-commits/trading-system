import { z } from "zod";

// Zod-validated environment. Keys are optional so the app boots in mock mode
// with an empty .env.local; each datasource decides live-vs-mock from its own key.

const schema = z.object({
  DATA_MODE: z.enum(["mock", "live"]).default("mock"),
  /** Override the default Claude model for all pipeline calls (cost tuning). */
  CLAUDE_MODEL: z.string().optional(),

  TWELVEDATA_API_KEY: z.string().optional(),
  FMP_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  APIFY_TOKEN: z.string().optional(),
  /** Dedicated Instagram account session cookie string (for story scraping). */
  IG_SESSION: z.string().optional(),
  /** Dedicated X (Twitter) account session for tweet scraping. */
  X_AUTH_TOKEN: z.string().optional(),
  X_CT0: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Whether a given datasource should use its live implementation.
 * Global DATA_MODE must be "live" AND the specific key must be present.
 */
export function isLive(key: keyof Env): boolean {
  const env = getEnv();
  return env.DATA_MODE === "live" && Boolean(env[key]);
}
