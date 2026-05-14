import { describe, it, expect, vi } from 'vitest';
import type { ILLMProvider, ChatChunk, Message, ChatOptions } from '../../src/providers/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeProvider(chunks: ChatChunk[]): ILLMProvider {
  return {
    name: 'mock',
    id: 'mock',
    supportsToolUse: false,
    supportsStreaming: true,
    availableModels: [],
    configure: vi.fn(),
    async *chat(_messages: Message[], _options: ChatOptions): AsyncIterable<ChatChunk> {
      for (const chunk of chunks) yield chunk;
    },
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  };
}

function makeMultiCallProvider(responses: ChatChunk[][]): ILLMProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    id: 'mock',
    supportsToolUse: false,
    supportsStreaming: true,
    availableModels: [],
    configure: vi.fn(),
    async *chat(_messages: Message[], _options: ChatOptions): AsyncIterable<ChatChunk> {
      const chunks = responses[Math.min(callIndex, responses.length - 1)];
      callIndex++;
      for (const chunk of chunks) yield chunk;
    },
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  };
}

const { createPlan } = await import('../../src/agent/planner');

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createPlan — valid JSON plan', () => {
  it('parses a well-formed JSON plan and returns steps', async () => {
    const planJson = JSON.stringify({
      taskSummary: 'Add JWT authentication',
      steps: [
        { id: 1, description: 'Read existing auth files', toolHint: 'read_file' },
        { id: 2, description: 'Install jsonwebtoken', toolHint: 'run_command' },
        { id: 3, description: 'Update login handler', toolHint: 'write_file' },
      ],
    });

    const provider = makeProvider([
      { type: 'token', content: planJson },
      { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
    ]);

    const result = await createPlan('Add JWT auth', provider, 'claude-sonnet-4');

    expect(result).not.toBeNull();
    expect(result!.taskSummary).toBe('Add JWT authentication');
    expect(result!.steps).toHaveLength(3);
    expect(result!.steps[0].index).toBe(1);
    expect(result!.steps[0].description).toBe('Read existing auth files');
    expect(result!.steps[0].toolHint).toBe('read_file');
    expect(result!.steps[0].status).toBe('pending');
    expect(result!.steps[2].index).toBe(3);
  });

  it('strips markdown code fences before parsing', async () => {
    const planJson = JSON.stringify({
      taskSummary: 'Setup tests',
      steps: [{ id: 1, description: 'Run test suite', toolHint: 'run_command' }],
    });
    const fenced = `\`\`\`json\n${planJson}\n\`\`\``;

    const provider = makeProvider([
      { type: 'token', content: fenced },
      { type: 'done', usage: { inputTokens: 5, outputTokens: 10 } },
    ]);

    const result = await createPlan('Run tests', provider, 'gpt-4o');

    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0].description).toBe('Run test suite');
  });
});

describe('createPlan — malformed JSON falls back', () => {
  it('returns null after two failed attempts to parse JSON', async () => {
    // Both attempts return invalid JSON
    const provider = makeMultiCallProvider([
      [{ type: 'token', content: 'not valid json at all' }],
      [{ type: 'token', content: '{ broken: json }' }],
    ]);

    const result = await createPlan('Do something', provider, 'gpt-4o');

    expect(result).toBeNull();
  });

  it('returns null when the plan has an empty steps array', async () => {
    const emptyPlan = JSON.stringify({ taskSummary: 'Nothing to do', steps: [] });

    const provider = makeProvider([
      { type: 'token', content: emptyPlan },
      { type: 'done', usage: { inputTokens: 5, outputTokens: 5 } },
    ]);

    const result = await createPlan('Do nothing', provider, 'gpt-4o');

    expect(result).toBeNull();
  });

  it('returns null when LLM emits an error chunk', async () => {
    const provider = makeProvider([{ type: 'error', error: 'API rate limit exceeded' }]);

    const result = await createPlan('Do something', provider, 'gpt-4o');

    expect(result).toBeNull();
  });

  it('succeeds on the second attempt after an initial bad response', async () => {
    const goodPlan = JSON.stringify({
      taskSummary: 'Fix the bug',
      steps: [{ id: 1, description: 'Read error logs', toolHint: 'read_file' }],
    });

    const provider = makeMultiCallProvider([
      // First attempt: bad JSON
      [{ type: 'token', content: 'not json' }],
      // Second attempt: valid JSON
      [{ type: 'token', content: goodPlan }],
    ]);

    const result = await createPlan('Fix bug', provider, 'claude-sonnet-4');

    expect(result).not.toBeNull();
    expect(result!.taskSummary).toBe('Fix the bug');
    expect(result!.steps).toHaveLength(1);
  });
});
