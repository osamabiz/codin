import { describe, it, expect, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { AgentMemory } from '../../src/agent/memory';
import type { ILLMProvider, ChatChunk, Message, ChatOptions } from '../../src/providers/types';

describe('AgentMemory', () => {
  it('starts with empty messages', () => {
    const mem = new AgentMemory();
    expect(mem.messages).toHaveLength(0);
  });

  it('append adds messages in order', () => {
    const mem = new AgentMemory();
    const m1: Message = { role: 'user', content: 'hello' };
    const m2: Message = { role: 'assistant', content: 'world' };
    mem.append(m1);
    mem.append(m2);
    expect(mem.messages).toHaveLength(2);
    expect(mem.messages[0]).toBe(m1);
    expect(mem.messages[1]).toBe(m2);
  });

  it('toJSON / fromJSON round-trips messages and workspace snapshot', () => {
    const mem = new AgentMemory();
    mem.workspaceSnapshot = {
      name: 'my-project',
      root: '/projects/my-project',
      languages: ['TypeScript'],
      frameworks: ['React'],
      gitBranch: 'main',
    };
    mem.append({ role: 'user', content: 'task' });
    mem.append({ role: 'assistant', content: 'done' });

    const restored = AgentMemory.fromJSON(mem.toJSON());
    expect(restored.messages).toHaveLength(2);
    expect(restored.messages[0].content).toBe('task');
    expect(restored.workspaceSnapshot.name).toBe('my-project');
    expect(restored.workspaceSnapshot.languages).toEqual(['TypeScript']);
  });

  it('trim removes oldest messages until under the token limit', () => {
    const mem = new AgentMemory();
    // Each message ~100 chars → ~25 tokens. Add 10 messages = 250 tokens.
    for (let i = 0; i < 10; i++) {
      mem.append({ role: 'user', content: 'x'.repeat(100) });
    }
    expect(mem.messages).toHaveLength(10);

    // Trim to 50 tokens → 200 chars target → should remove most messages
    mem.trim(50);
    expect(mem.messages.length).toBeLessThan(10);
  });

  it('trim keeps at least 2 messages', () => {
    const mem = new AgentMemory();
    mem.append({ role: 'user', content: 'x'.repeat(5000) });
    mem.append({ role: 'assistant', content: 'y'.repeat(5000) });

    mem.trim(1); // impossibly small limit
    expect(mem.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('fromJSON handles missing fields gracefully', () => {
    const mem = AgentMemory.fromJSON('{}');
    expect(mem.messages).toEqual([]);
    expect(mem.workspaceSnapshot.name).toBe('');
  });
});

// ── Token count ────────────────────────────────────────────────────────────

describe('AgentMemory.tokenCount', () => {
  it('returns 0 for empty messages', () => {
    const mem = new AgentMemory();
    expect(mem.tokenCount).toBe(0);
  });

  it('approximates token count from message content length', () => {
    const mem = new AgentMemory();
    // 400 chars ÷ 4 = 100 tokens
    mem.append({ role: 'user', content: 'a'.repeat(400) });
    expect(mem.tokenCount).toBe(100);
  });
});

describe('AgentMemory.shouldSummarize', () => {
  it('returns false when token count is below 80% of model limit', () => {
    const mem = new AgentMemory();
    // 200 chars → 50 tokens; 80% of 32000 = 25600 — far below
    mem.append({ role: 'user', content: 'a'.repeat(200) });
    expect(mem.shouldSummarize('llama3.2')).toBe(false);
  });

  it('returns true when token count exceeds 80% of model limit', () => {
    const mem = new AgentMemory();
    // Need > 80% of 32000 = 25600 tokens → > 102400 chars
    mem.append({ role: 'user', content: 'x'.repeat(104000) });
    expect(mem.shouldSummarize('llama3.2')).toBe(true);
  });
});

// ── Summarization ──────────────────────────────────────────────────────────

function makeSummarizingProvider(summary: string): ILLMProvider {
  return {
    name: 'mock',
    id: 'mock',
    supportsToolUse: false,
    supportsStreaming: true,
    availableModels: [],
    configure: vi.fn(),
    async *chat(_messages: Message[], _options: ChatOptions): AsyncIterable<ChatChunk> {
      yield { type: 'token', content: summary };
      yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } };
    },
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe('AgentMemory.summarizeOldest', () => {
  it('token count drops after summarization', async () => {
    const mem = new AgentMemory();
    // Add 20 large messages
    for (let i = 0; i < 20; i++) {
      mem.append({ role: 'user', content: 'x'.repeat(2000) });
    }
    const before = mem.tokenCount;
    const beforeCount = mem.messages.length;

    const provider = makeSummarizingProvider('Summary of the earlier messages.');
    await mem.summarizeOldest(provider, 'gpt-4o');

    expect(mem.tokenCount).toBeLessThan(before);
    expect(mem.messages.length).toBeLessThan(beforeCount);
  });

  it('replaces oldest 30% with a single summary message', async () => {
    const mem = new AgentMemory();
    for (let i = 0; i < 10; i++) {
      mem.append({ role: 'user', content: `message ${i}` });
    }
    // 30% of 10 = 3 messages removed, replaced with 1 summary → net 8
    const provider = makeSummarizingProvider('Early messages summarized.');
    await mem.summarizeOldest(provider, 'gpt-4o');

    expect(mem.messages).toHaveLength(8);
    expect(typeof mem.messages[0].content).toBe('string');
    expect((mem.messages[0].content as string)).toContain('Context summary');
    expect((mem.messages[0].content as string)).toContain('Early messages summarized.');
  });

  it('is a no-op when the provider returns an empty summary', async () => {
    const mem = new AgentMemory();
    for (let i = 0; i < 6; i++) {
      mem.append({ role: 'user', content: `msg ${i}` });
    }
    const original = [...mem.messages];

    const silentProvider: ILLMProvider = {
      name: 'silent',
      id: 'silent',
      supportsToolUse: false,
      supportsStreaming: true,
      availableModels: [],
      configure: vi.fn(),
      async *chat(): AsyncIterable<ChatChunk> {
        // Yields nothing — empty summary
      },
      testConnection: vi.fn().mockResolvedValue({ ok: true }),
    };

    await mem.summarizeOldest(silentProvider, 'gpt-4o');

    // Messages should remain unchanged when summary is empty
    expect(mem.messages).toHaveLength(original.length);
  });
});

// ── File persistence ───────────────────────────────────────────────────────

describe('AgentMemory file persistence', () => {
  it('saveToFile and loadFromFile round-trip', async () => {
    const tmpFile = path.join(os.tmpdir(), `.agent-history-test-${Date.now()}.json`);

    const mem = new AgentMemory();
    mem.workspaceSnapshot = {
      name: 'test-project',
      root: '/tmp/test-project',
      languages: ['TypeScript'],
      frameworks: [],
    };
    mem.append({ role: 'user', content: 'hello world' });
    mem.append({ role: 'assistant', content: 'hi there' });

    await mem.saveToFile(tmpFile);

    const restored = await AgentMemory.loadFromFile(tmpFile);

    expect(restored).not.toBeNull();
    expect(restored!.messages).toHaveLength(2);
    expect(restored!.messages[0].content).toBe('hello world');
    expect(restored!.messages[1].content).toBe('hi there');
    expect(restored!.workspaceSnapshot.name).toBe('test-project');

    // Cleanup
    await fs.promises.unlink(tmpFile);
  });

  it('loadFromFile returns null when the file does not exist', async () => {
    const result = await AgentMemory.loadFromFile('/nonexistent/path/.agent-history.json');
    expect(result).toBeNull();
  });

  it('loadFromFile returns null when the file contains invalid JSON', async () => {
    const tmpFile = path.join(os.tmpdir(), `.agent-history-bad-${Date.now()}.json`);
    await fs.promises.writeFile(tmpFile, 'not valid json', 'utf-8');

    const result = await AgentMemory.loadFromFile(tmpFile);
    expect(result).toBeNull();

    await fs.promises.unlink(tmpFile);
  });
});
