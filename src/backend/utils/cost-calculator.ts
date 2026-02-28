import { MODEL_PRICING } from '../../shared/constants.js';
import type { TokenUsage } from '../../shared/types.js';

/**
 * Calculate estimated cost in USD for a given token usage and model.
 */
export function calculateCost(usage: TokenUsage, model: string): number {
  // Normalize model name: strip version suffix patterns like -20241022
  const normalizedModel = normalizeModelName(model);
  const pricing = MODEL_PRICING[normalizedModel] ?? MODEL_PRICING['default'];

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;

  let cacheReadCost = 0;
  let cacheWriteCost = 0;

  if (usage.cache_read_input_tokens && pricing.cacheRead) {
    cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * pricing.cacheRead;
  }
  if (usage.cache_creation_input_tokens && pricing.cacheWrite) {
    cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * pricing.cacheWrite;
  }

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

/**
 * Normalize model names to match our pricing keys.
 * e.g. "claude-sonnet-4-5-20251022" -> "claude-sonnet-4-5"
 */
function normalizeModelName(model: string): string {
  if (!model) return 'default';

  // Strip date suffixes like -20241022
  const withoutDate = model.replace(/-\d{8}$/, '');

  if (MODEL_PRICING[withoutDate]) return withoutDate;
  if (MODEL_PRICING[model]) return model;

  // Try prefix matching
  for (const key of Object.keys(MODEL_PRICING)) {
    if (key === 'default') continue;
    if (withoutDate.startsWith(key) || key.startsWith(withoutDate)) {
      return key;
    }
  }

  return 'default';
}

/**
 * Sum multiple TokenUsage objects.
 */
export function sumUsage(...usages: (TokenUsage | undefined)[]): TokenUsage {
  return usages.reduce<TokenUsage>(
    (acc, u) => {
      if (!u) return acc;
      return {
        input_tokens: acc.input_tokens + (u.input_tokens ?? 0),
        output_tokens: acc.output_tokens + (u.output_tokens ?? 0),
        cache_read_input_tokens: (acc.cache_read_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        cache_creation_input_tokens: (acc.cache_creation_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      };
    },
    { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  );
}
