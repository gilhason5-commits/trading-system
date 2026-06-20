import Anthropic from "@anthropic-ai/sdk";
import { getEnv, isLive } from "../env.ts";
import { DEFAULT_MODEL, type ClaudeUsage } from "./cost.ts";

// Claude client behind an interface: Mock returns deterministic canned JSON so the
// whole pipeline runs with no key; Live calls the Anthropic Messages API and reports
// real token usage for cost accounting (spec §5/§3.8).

export type ClaudeKind = "analysis" | "signals" | "lead" | "digest" | "generic";

export interface CompleteOptions {
  system: string;
  user: string;
  /** Drives the mock's canned response; ignored when live. */
  kind?: ClaudeKind;
  maxTokens?: number;
  /** Thinking/effort depth vs cost (spec is cost-sensitive). */
  effort?: "low" | "medium" | "high" | "max";
  model?: string;
}

export interface ClaudeResult {
  text: string;
  usage: ClaudeUsage;
  model: string;
}

export interface ClaudeClient {
  complete(opts: CompleteOptions): Promise<ClaudeResult>;
}

const emptyCacheUsage = { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

// ── Mock ────────────────────────────────────────────────────────────────────
const CANNED: Record<ClaudeKind, string> = {
  analysis: JSON.stringify({
    stance: "hold",
    technical_summary: "מעל ממוצעים נעים, מומנטום חיובי מתון (mock).",
    fundamental_summary: "רווחיות יציבה, תמחור סביר (mock).",
    key_events: ["דוח רבעוני קרוב"],
    risk_flags: ["תנודתיות שוק"],
    confidence: 0.7,
  }),
  signals: JSON.stringify([
    { ticker: "NVDA", sentiment: "bullish", claim: "ביקוש דאטה-סנטר חזק (mock)" },
  ]),
  lead: JSON.stringify({
    system_score: 62,
    social_score: 74,
    rationale: "צמיחה חזקה אך תמחור דורש זהירות (mock).",
    manipulation_flag: false,
  }),
  digest: JSON.stringify({
    html: '<div dir="rtl"><h1>סיכום יומי (mock)</h1><p>התיק יציב היום.</p></div>',
    key_insights: ["NVDA במומנטום חיובי", "TEVA נחלשת"],
  }),
  generic: "OK (mock)",
};

export class MockClaude implements ClaudeClient {
  async complete(opts: CompleteOptions): Promise<ClaudeResult> {
    const text = CANNED[opts.kind ?? "generic"];
    // Deterministic-ish token figures so dry-run cost reports are non-zero.
    const input_tokens = 800 + opts.user.length % 600;
    const output_tokens = 120 + text.length % 200;
    return {
      text,
      model: opts.model ?? DEFAULT_MODEL,
      usage: { input_tokens, output_tokens, ...emptyCacheUsage },
    };
  }
}

// ── Live ─────────────────────────────────────────────────────────────────────
export class LiveClaude implements ClaudeClient {
  private sdk: Anthropic;
  constructor(apiKey: string) {
    this.sdk = new Anthropic({ apiKey });
  }

  async complete(opts: CompleteOptions): Promise<ClaudeResult> {
    const model = opts.model ?? getEnv().CLAUDE_MODEL ?? DEFAULT_MODEL;
    // Build params loosely so newer fields (output_config.effort) pass through
    // regardless of the pinned SDK's typings; the API consumes them.
    const params: Record<string, unknown> = {
      model,
      max_tokens: opts.maxTokens ?? 2048,
      // Stable system prompt → cache hits across the many per-position calls.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
    };
    // `effort` is only supported on Opus 4.5+, Sonnet 4.6, Fable 5 (not Haiku/older).
    if (opts.effort && /opus-4-[5-9]|sonnet-4-6|fable-5/.test(model)) {
      params.output_config = { effort: opts.effort };
    }

    // The SDK requires streaming for large max_tokens (it may exceed the 10-min
    // non-streaming budget) — used for the big digest call; small calls stay direct.
    const res = (
      (opts.maxTokens ?? 2048) > 8000
        ? await this.sdk.messages
            .stream(params as unknown as Anthropic.MessageCreateParamsStreaming)
            .finalMessage()
        : await this.sdk.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming)
    ) as Anthropic.Message;

    if ((res.stop_reason as string) === "refusal") {
      throw new Error(`Claude refused request (model ${model})`);
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Cache token fields may be absent in the pinned SDK's Usage type; read loosely.
    const u = res.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    return {
      text,
      model,
      usage: {
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

// ── Grok (xAI, OpenAI-compatible) — used as a fallback for Claude ──────────────
const DEFAULT_GROK_MODEL = "grok-4.20-0309-non-reasoning";

export class LiveGrok implements ClaudeClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_GROK_MODEL,
  ) {}

  async complete(opts: CompleteOptions): Promise<ClaudeResult> {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: Math.max(opts.maxTokens ?? 2048, 4096), // headroom for reasoning models
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`xAI ${this.model}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const text = j.choices?.[0]?.message?.content ?? "";
    const u = j.usage ?? {};
    return {
      text,
      model: this.model,
      usage: {
        input_tokens: u.prompt_tokens ?? 0,
        output_tokens: u.completion_tokens ?? 0,
        cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens ?? 0,
        cache_creation_input_tokens: 0,
      },
    };
  }
}

/** Tries the primary LLM; on any failure (e.g. Claude out of credits) uses the fallback. */
export class FallbackClaude implements ClaudeClient {
  constructor(
    private readonly primary: ClaudeClient,
    private readonly fallback: ClaudeClient,
  ) {}

  async complete(opts: CompleteOptions): Promise<ClaudeResult> {
    try {
      return await this.primary.complete(opts);
    } catch (err) {
      console.warn(`[llm] primary failed (${(err as Error).message.slice(0, 140)}) — falling back to Grok`);
      return await this.fallback.complete(opts);
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────
let instance: ClaudeClient | null = null;

export function getClaude(): ClaudeClient {
  if (instance) return instance;
  const env = getEnv();
  const live = env.DATA_MODE === "live";
  const claude = live && env.ANTHROPIC_API_KEY ? new LiveClaude(env.ANTHROPIC_API_KEY) : null;
  const grok = live && env.XAI_API_KEY ? new LiveGrok(env.XAI_API_KEY, env.XAI_MODEL) : null;

  // Claude primary + Grok fallback when both are configured; otherwise whichever
  // exists; else the mock.
  if (claude && grok) instance = new FallbackClaude(claude, grok);
  else instance = claude ?? grok ?? new MockClaude();
  return instance;
}

/** Parse a JSON response defensively: strip ```fences, else extract the JSON span. */
export function parseJsonResponse<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Model wrapped JSON in prose — extract the outermost { } or [ ] span.
    const starts = ["{", "["].map((c) => cleaned.indexOf(c)).filter((i) => i >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new SyntaxError("No JSON found in Claude response");
  }
}
