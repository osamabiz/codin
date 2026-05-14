// Context window sizes in tokens per model ID.
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-sonnet-4-5': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'llama3.2': 32_000,
  'mistral': 32_000,
  'qwen2.5-coder': 32_000,
  'deepseek-r1': 32_000,
};

const DEFAULT_LIMIT = 128_000;
const WARNING_THRESHOLD = 0.75;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateTokensForMessages(
  messages: Array<{ content: string | unknown[] }>
): number {
  return messages.reduce((total, msg) => {
    if (typeof msg.content === 'string') {
      return total + estimateTokens(msg.content);
    }
    if (Array.isArray(msg.content)) {
      const text = (msg.content as Array<{ type?: string; text?: string }>)
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('');
      return total + estimateTokens(text);
    }
    return total;
  }, 0);
}

export function getContextLimit(modelId: string): number {
  return MODEL_CONTEXT_LIMITS[modelId] ?? DEFAULT_LIMIT;
}

export function isNearLimit(tokens: number, modelId: string): boolean {
  return tokens / getContextLimit(modelId) >= WARNING_THRESHOLD;
}

export function formatTokenDisplay(
  tokens: number,
  modelId: string
): { text: string; warning: boolean } {
  const limit = getContextLimit(modelId);
  const warning = isNearLimit(tokens, modelId);
  const limitK = Math.round(limit / 1000);
  const pct = Math.round((tokens / limit) * 100);
  return {
    text: `~${tokens.toLocaleString()} / ${limitK}k tokens (${pct}%)`,
    warning,
  };
}
