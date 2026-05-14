import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai';

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

const tokenChunk = (content: string) =>
  `data: {"choices":[{"index":0,"delta":{"content":${JSON.stringify(content)}},"finish_reason":null}]}`;

const doneChunk = (promptTokens: number, completionTokens: number) =>
  `data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":${promptTokens},"completion_tokens":${completionTokens},"total_tokens":${promptTokens + completionTokens}}}`;

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
    provider.configure('sk-openai-test');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Message format ────────────────────────────────────────────────────────

  it('prepends system prompt as a system role message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: [DONE]']));

    for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'gpt-4o-mini',
      maxTokens: 10,
      temperature: 0,
      systemPrompt: 'You are helpful.',
    })) {
      // consume
    }

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('sends to correct endpoint with Bearer auth', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: [DONE]']));

    for await (const _ of provider.chat([], {
      model: 'gpt-4o',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headers['authorization']).toBe('Bearer sk-openai-test');
    expect(init.body).toContain('"stream":true');
    expect(init.body).toContain('"include_usage":true');
  });

  // ── SSE parsing ────────────────────────────────────────────────────────────

  it('yields token chunks from SSE delta events', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        tokenChunk('How'),
        tokenChunk(' can'),
        tokenChunk(' I help?'),
        doneChunk(5, 3),
        'data: [DONE]',
      ])
    );

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hello' }], {
      model: 'gpt-4o-mini',
      maxTokens: 100,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    const tokens = chunks.filter(c => c.type === 'token');
    expect(tokens).toHaveLength(3);
    expect((tokens[0] as { content: string }).content).toBe('How');
  });

  it('yields done chunk with usage from stream_options', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([tokenChunk('Hi'), doneChunk(7, 4), 'data: [DONE]'])
    );

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'gpt-4o-mini',
      maxTokens: 100,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    const done = chunks.find(c => c.type === 'done');
    expect(done).toBeDefined();
    expect((done as { usage: { inputTokens: number; outputTokens: number } }).usage).toEqual({
      inputTokens: 7,
      outputTokens: 4,
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('yields error chunk when API returns 4xx', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(401, '{"error":{"message":"invalid key"}}'));

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'gpt-4o-mini',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    expect(chunks[0].type).toBe('error');
    expect((chunks[0] as { error: string }).error).toContain('401');
  });

  it('yields error chunk when no API key configured', async () => {
    const blank = new OpenAIProvider();
    const chunks = [];
    for await (const chunk of blank.chat([], {
      model: 'gpt-4o-mini',
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

  it('testConnection returns ok:false for 401', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, text: async () => '' } as Response);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid API key');
  });

  it('testConnection returns ok:false when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
  });
});
