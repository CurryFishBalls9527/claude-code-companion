import { describe, it, expect } from 'vitest';
import { calculateCost, sumUsage } from './cost-calculator.js';

describe('calculateCost', () => {
  it('calculates cost for claude-sonnet-4-5 with input+output tokens', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
    const cost = calculateCost(usage, 'claude-sonnet-4-5');
    expect(cost).toBe(18); // $3/M input + $15/M output
  });

  it('includes cache read tokens in cost calculation', () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 0,
    };
    const cost = calculateCost(usage, 'claude-sonnet-4-5');
    expect(cost).toBeCloseTo(0.3); // $0.3/M cache read
  });

  it('includes cache creation tokens in cost calculation', () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    };
    const cost = calculateCost(usage, 'claude-sonnet-4-5');
    expect(cost).toBeCloseTo(3.75); // $3.75/M cache write
  });

  it('falls back to default pricing for unknown model', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 };
    const cost = calculateCost(usage, 'some-unknown-model');
    expect(cost).toBe(3); // default input: $3/M
  });

  it('handles zero usage without error', () => {
    const usage = { input_tokens: 0, output_tokens: 0 };
    expect(calculateCost(usage, 'claude-sonnet-4-5')).toBe(0);
  });

  it('strips date suffix from model name', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 };
    const withDate = calculateCost(usage, 'claude-sonnet-4-5-20251022');
    const withoutDate = calculateCost(usage, 'claude-sonnet-4-5');
    expect(withDate).toBe(withoutDate);
  });

  it('uses higher pricing for opus models', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 };
    const opusCost = calculateCost(usage, 'claude-opus-4-5');
    const sonnetCost = calculateCost(usage, 'claude-sonnet-4-5');
    expect(opusCost).toBeGreaterThan(sonnetCost);
  });
});

describe('sumUsage', () => {
  it('sums multiple usage objects correctly', () => {
    const a = { input_tokens: 100, output_tokens: 50 };
    const b = { input_tokens: 200, output_tokens: 75 };
    const result = sumUsage(a, b);
    expect(result.input_tokens).toBe(300);
    expect(result.output_tokens).toBe(125);
  });

  it('handles undefined values gracefully', () => {
    const result = sumUsage(undefined, { input_tokens: 10, output_tokens: 5 });
    expect(result.input_tokens).toBe(10);
    expect(result.output_tokens).toBe(5);
  });

  it('sums cache tokens when present', () => {
    const a = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 100 };
    const b = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 200 };
    const result = sumUsage(a, b);
    expect(result.cache_read_input_tokens).toBe(300);
  });
});
