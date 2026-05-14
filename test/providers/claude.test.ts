import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from '../../src/providers/claude';

// Build a ReadableStream that emits each string on its own line.
function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < lines.length) {
        controller.enqueue(encoder.encode(lines[i++] + '\n'));
      } else {
        controller.close();
      }
    },
  });
}

function makeOkResponse(lines: string[]): Response {
  return {
    ok: true,
    status: 200,
    body: makeSSEStream(lines),
    text: async () => '',
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    body: null,
    text: async () => body,
  } as unknown as Response;
}

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    provider = new ClaudeProvider();
    provider.configure('sk-test-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Message format ────────────────────────────────────────────────────────

  it('sends messages in Claude wire format — filters system, maps tool→user', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}',
        'data: {"type":"message_stop"}',
      ])
    );

    const messages = [
      { role: 'system' as const, content: 'You are helpful.' },
      { role: 'user' as const, content: 'Hello' },
      { role: 'tool' as const, content: 'result', toolCallId: 'c1' },
    ];

    for await (const _ of provider.chat(messages, {
      model: 'claude-haiku-4-5',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    // system messages must be absent from the messages array
    expect(body.messages.every((m: { role: string }) => m.role !== 'system')).toBe(true);
    // tool role mapped to user
    expect(body.messages.find((m: { role: string }) => m.role === 'tool')).toBeUndefined();
    // user message present
    expect(body.messages.find((m: { role: string; content: string }) => m.content === 'Hello')).toBeDefined();
  });

  it('passes the system prompt as a top-level field', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: {"type":"message_stop"}']));

    for await (const _ of provider.chat([], {
      model: 'claude-haiku-4-5',
      maxTokens: 10,
      temperature: 0,
      systemPrompt: 'Be concise.',
    })) {
      // consume
    }

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('Be concise.');
  });

  it('sets correct auth headers', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: {"type":"message_stop"}']));

    for await (const _ of provider.chat([], {
      model: 'claude-haiku-4-5',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('sk-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(init.body).toContain('"stream":true');
  });

  // ── SSE parsing ────────────────────────────────────────────────────────────

  it('yields token chunks from content_block_delta events', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0}}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
        'data: {"type":"message_delta","usage":{"output_tokens":2}}',
        'data: {"type":"message_stop"}',
      ])
    );

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'claude-haiku-4-5',
      maxTokens: 100,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    const tokens = chunks.filter(c => c.type === 'token');
    expect(tokens).toHaveLength(2);
    expect((tokens[0] as { content: string }).content).toBe('Hello');
    expect((tokens[1] as { content: string }).content).toBe(' world');
  });

  it('yields a done chunk with usage from message_start and message_delta', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":8,"output_tokens":0}}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
        'data: {"type":"message_delta","usage":{"output_tokens":3}}',
        'data: {"type":"message_stop"}',
      ])
    );

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'claude-haiku-4-5',
      maxTokens: 100,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    const done = chunks.find(c => c.type === 'done');
    expect(done).toBeDefined();
    expect((done as { usage: { inputTokens: number; outputTokens: number } }).usage).toEqual({
      inputTokens: 8,
      outputTokens: 3,
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('yields error chunk when API returns 4xx', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(401, '{"error":"invalid key"}'));

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'claude-haiku-4-5',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    expect(chunks[0].type).toBe('error');
    expect((chunks[0] as { error: string }).error).toContain('401');
  });

  it('yields error chunk when no API key is configured', async () => {
    const blank = new ClaudeProvider();
    const chunks = [];
    for await (const chunk of blank.chat([], {
      model: 'claude-haiku-4-5',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }
    expect(chunks[0].type).toBe('error');
  });

  // ── testConnection ─────────────────────────────────────────────────────────

  it('testConnection returns ok:true for 200', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);
    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
  });

  it('testConnection returns ok:false with message for 401', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, text: async () => '' } as Response);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid API key');
  });

  it('testConnection returns ok:false when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
