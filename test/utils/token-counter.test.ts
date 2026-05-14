import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateTokensForMessages,
  getContextLimit,
  isNearLimit,
  formatTokenDisplay,
  MODEL_CONTEXT_LIMITS,
} from '../../src/utils/token-counter';

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('uses ceiling(chars / 4) approximation', () => {
    expect(estimateTokens('abcd')).toBe(1);        // 4 / 4 = 1
    expect(estimateTokens('abcde')).toBe(2);       // ceil(5 / 4) = 2
    expect(estimateTokens('abcdefgh')).toBe(2);    // 8 / 4 = 2
    expect(estimateTokens('abcdefghi')).toBe(3);   // ceil(9 / 4) = 3
  });

  it('handles a single character', () => {
    expect(estimateTokens('a')).toBe(1); // ceil(1/4) = 1
  });

  it('returns exact value for multiples of 4', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('a'.repeat(1000))).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// estimateTokensForMessages
// ---------------------------------------------------------------------------

describe('estimateTokensForMessages', () => {
  it('returns 0 for an empty array', () => {
    expect(estimateTokensForMessages([])).toBe(0);
  });

  it('sums estimates for string-content messages', () => {
    const msgs = [
      { content: 'abcd' },     // 1
      { content: 'abcdefgh' }, // 2
    ];
    expect(estimateTokensForMessages(msgs)).toBe(3);
  });

  it('handles ContentBlock arrays by extracting text blocks', () => {
    const msgs = [
      { content: [{ type: 'text', text: 'abcd' }, { type: 'tool_use', input: {} }] },
    ];
    expect(estimateTokensForMessages(msgs)).toBe(1);
  });

  it('ignores non-text ContentBlocks', () => {
    const msgs = [{ content: [{ type: 'tool_result', content: 'ignored' }] }];
    expect(estimateTokensForMessages(msgs)).toBe(0);
  });

  it('accumulates across multiple messages', () => {
    const msgs = [
      { content: 'aaaa' },     // 1
      { content: [{ type: 'text', text: 'bbbbbbbb' }] }, // 2
      { content: 'cccc' },     // 1
    ];
    expect(estimateTokensForMessages(msgs)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getContextLimit
// ---------------------------------------------------------------------------

describe('getContextLimit', () => {
  it('returns 200 000 for claude-sonnet-4-5', () => {
    expect(getContextLimit('claude-sonnet-4-5')).toBe(200_000);
  });

  it('returns 200 000 for claude-opus-4-5', () => {
    expect(getContextLimit('claude-opus-4-5')).toBe(200_000);
  });

  it('returns 128 000 for gpt-4o', () => {
    expect(getContextLimit('gpt-4o')).toBe(128_000);
  });

  it('falls back to the default limit for unknown models', () => {
    expect(getContextLimit('unknown-model-xyz')).toBe(128_000);
  });

  it('covers all entries in MODEL_CONTEXT_LIMITS', () => {
    for (const [id, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      expect(getContextLimit(id)).toBe(limit);
    }
  });
});

// ---------------------------------------------------------------------------
// isNearLimit
// ---------------------------------------------------------------------------

describe('isNearLimit', () => {
  it('returns false when tokens are below 75 % of the limit', () => {
    // claude-sonnet-4-5 limit = 200 000; 74 % < 75 %
    expect(isNearLimit(Math.floor(200_000 * 0.74), 'claude-sonnet-4-5')).toBe(false);
  });

  it('returns true when tokens are exactly at 75 %', () => {
    expect(isNearLimit(200_000 * 0.75, 'claude-sonnet-4-5')).toBe(true);
  });

  it('returns true when tokens exceed 75 %', () => {
    expect(isNearLimit(160_000, 'claude-sonnet-4-5')).toBe(true);
  });

  it('uses the default limit for unknown models', () => {
    const limit = getContextLimit('mystery-model');
    expect(isNearLimit(Math.floor(limit * 0.74), 'mystery-model')).toBe(false);
    expect(isNearLimit(Math.ceil(limit * 0.75), 'mystery-model')).toBe(true);
  });

  it('returns false for 0 tokens', () => {
    expect(isNearLimit(0, 'gpt-4o')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatTokenDisplay
// ---------------------------------------------------------------------------

describe('formatTokenDisplay', () => {
  it('includes the token count in the text', () => {
    const { text } = formatTokenDisplay(1000, 'gpt-4o');
    expect(text).toContain('1,000');
  });

  it('includes the model limit in k notation', () => {
    const { text } = formatTokenDisplay(0, 'claude-sonnet-4-5');
    expect(text).toContain('200k');
  });

  it('includes a percentage', () => {
    const { text } = formatTokenDisplay(64_000, 'gpt-4o'); // 50 %
    expect(text).toContain('50%');
  });

  it('sets warning = false when under 75 %', () => {
    const { warning } = formatTokenDisplay(100, 'claude-sonnet-4-5');
    expect(warning).toBe(false);
  });

  it('sets warning = true when at or above 75 %', () => {
    const { warning } = formatTokenDisplay(160_000, 'claude-sonnet-4-5'); // 80 %
    expect(warning).toBe(true);
  });
});
