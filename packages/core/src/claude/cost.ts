// Usage → USD cost accounting (spec §5). Prices are per 1M tokens.
// Source: Claude API pricing (claude-api skill, cached 2026-06).

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

interface ModelPrice {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
}

// Cache reads bill at ~0.1× input; 5-minute cache writes at ~1.25× input.
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

export const MODEL_PRICING: Record<string, ModelPrice> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
  // xAI Grok (fallback) — approximate per-1M pricing.
  "grok-4.3": { input: 3, output: 15 },
  "grok-4.20-0309-reasoning": { input: 3, output: 15 },
  "grok-4.20-0309-non-reasoning": { input: 3, output: 15 },
  "grok-4.20-multi-agent-0309": { input: 5, output: 25 },
};

export const DEFAULT_MODEL = "claude-opus-4-8";

/** Cost in USD of a single Claude response's token usage. */
export function usageCostUsd(usage: ClaudeUsage, model: string): number {
  const price = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]!;
  const m = 1_000_000;
  return (
    (usage.input_tokens * price.input) / m +
    (usage.output_tokens * price.output) / m +
    (usage.cache_read_input_tokens * price.input * CACHE_READ_MULT) / m +
    (usage.cache_creation_input_tokens * price.input * CACHE_WRITE_MULT) / m
  );
}

/**
 * Accumulates cost across all calls in one daily pipeline run.
 * total = Claude (from token usage) + Apify (pay-per-result), per spec §5.
 */
export class CostAccumulator {
  tokensIn = 0;
  tokensOut = 0;
  claudeCost = 0;
  scrapingCost = 0;

  addClaude(usage: ClaudeUsage, model: string): void {
    this.tokensIn += usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
    this.tokensOut += usage.output_tokens;
    this.claudeCost += usageCostUsd(usage, model);
  }

  /** Apify is pay-per-result; add the marginal cost of items pulled. */
  addScraping(usd: number): void {
    this.scrapingCost += usd;
  }

  get totalCost(): number {
    return this.claudeCost + this.scrapingCost;
  }

  summary() {
    return {
      tokens_in: this.tokensIn,
      tokens_out: this.tokensOut,
      claude_cost: round(this.claudeCost),
      scraping_cost: round(this.scrapingCost),
      total_cost: round(this.totalCost),
    };
  }
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
