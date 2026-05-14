import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../../src/providers/ollama';

function makeNDJSONStream(objects: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < objects.length) {
        controller.enqueue(encoder.encode(JSON.stringify(objects[i++]) + '\n'));
      } else {
        controller.close();
      }
    },
  });
}

function makeOkNDJSON(objects: object[]): Response {
  return {
    ok: true,
    status: 200,
    body: makeNDJSONStream(objects),
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

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
    // configure() is a no-op for Ollama but must not throw
    provider.configure('ignored');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Message format ────────────────────────────────────────────────────────

  it('sends messages to /api/chat with no auth header', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkNDJSON([
        { message: { role: 'assistant', content: 'Hi' }, done: false },
        { done: true, prompt_eval_count: 3, eval_count: 1 },
      ])
    );

    for await (const _ of provider.chat([{ role: 'user', content: 'Hello' }], {
      model: 'llama3.2',
      maxTokens: 100,
      temperature: 0.5,
    })) {
      // consume
    }

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBeUndefined();
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('llama3.2');
  });

  it('prepends system prompt as a system message', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkNDJSON([{ done: true, prompt_eval_count: 0, eval_count: 0 }])
    );

    for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'mistral',
      maxTokens: 10,
      temperature: 0,
      systemPrompt: 'Be brief.',
    })) {
      // consume
    }

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be brief.' });
  });

  // ── NDJSON parsing ────────────────────────────────────────────────────────

  it('yields token chunks from NDJSON stream', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkNDJSON([
        { message: { role: 'assistant', content: 'The ' }, done: false },
        { message: { role: 'assistant', content: 'sky.' }, done: false },
        { done: true, prompt_eval_count: 4, eval_count: 2 },
      ])
    );

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'llama3.2',
      maxTokens: 100,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    const tokens = chunks.filter(c => c.type === 'token');
    expect(tokens).toHaveLength(2);
    expect((tokens[0] as { content: string }).content).toBe('The ');
    expect((tokens[1] as { content: string }).content).toBe('sky.');
  });

  it('yields done chunk with usage from final NDJSON object', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkNDJSON([
        { message: { role: 'assistant', content: 'Hi' }, done: false },
        { done: true, prompt_eval_count: 10, eval_count: 5 },
      ])
    );

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'llama3.2',
      maxTokens: 100,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    const done = chunks.find(c => c.type === 'done');
    expect(done).toBeDefined();
    expect((done as { usage: { inputTokens: number; outputTokens: number } }).usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('yields error chunk when Ollama returns 4xx', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404, 'model not found'));

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'unknown-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    expect(chunks[0].type).toBe('error');
    expect((chunks[0] as { error: string }).error).toContain('404');
  });

  it('yields error chunk when fetch throws (Ollama not running)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const chunks = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'llama3.2',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    expect(chunks[0].type).toBe('error');
    expect((chunks[0] as { error: string }).error).toContain('Ollama');
  });

  // ── testConnection ─────────────────────────────────────────────────────────

  it('testConnection hits /api/tags and returns ok:true', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
  });

  it('testConnection returns ok:false when Ollama is not running', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot reach Ollama');
  });
});
