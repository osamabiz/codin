import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIBaseProvider } from '../../src/providers/base/openai-base';

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

const toolCallChunk = (idx: number, id: string, name: string, argsFragment: string) =>
  `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":${idx},"id":${JSON.stringify(id)},"function":{"name":${JSON.stringify(name)},"arguments":${JSON.stringify(argsFragment)}}}]},"finish_reason":null}]}`;

const toolDoneChunk = () =>
  `data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}`;

class TestProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'test',
      name: 'Test Provider',
      baseUrl: 'https://api.test.com/v1',
      defaultTestModel: 'test-model',
      models: [{ id: 'test-model', name: 'Test Model' }],
    });
  }
}

describe('OpenAIBaseProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
    provider.configure('test-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct default properties', () => {
    expect(provider.id).toBe('test');
    expect(provider.name).toBe('Test Provider');
    expect(provider.supportsToolUse).toBe(true);
    expect(provider.supportsStreaming).toBe(true);
    expect(provider.availableModels).toHaveLength(1);
  });

  it('setBaseUrl overrides the endpoint', async () => {
    provider.setBaseUrl('https://custom.server.io/v1');
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: [DONE]']));

    for await (const _ of provider.chat([], {
      model: 'test-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://custom.server.io/v1/chat/completions');
  });

  it('setBaseUrl ignores empty string', async () => {
    provider.setBaseUrl('');
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: [DONE]']));

    for await (const _ of provider.chat([], {
      model: 'test-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.com/v1/chat/completions');
  });

  it('sends Bearer auth header', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: [DONE]']));

    for await (const _ of provider.chat([], {
      model: 'test-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer test-key');
  });

  it('yields error when API key missing and requiresApiKey=true', async () => {
    const blank = new TestProvider();
    const chunks: unknown[] = [];
    for await (const chunk of blank.chat([], {
      model: 'test-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }
    expect(chunks[0]).toMatchObject({ type: 'error' });
  });

  it('yields token chunks from SSE', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([tokenChunk('Hello'), tokenChunk(' world'), 'data: [DONE]'])
    );

    const tokens: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'test-model',
      maxTokens: 100,
      temperature: 0,
    })) {
      if (chunk.type === 'token') tokens.push(chunk.content);
    }
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('accumulates and yields tool_call chunks', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        toolCallChunk(0, 'call-1', 'read_file', '{"path":'),
        toolCallChunk(0, '', '', '"src/index.ts"}'),
        toolDoneChunk(),
        'data: [DONE]',
      ])
    );

    const chunks: unknown[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'read it' }], {
      model: 'test-model',
      maxTokens: 100,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }

    const toolCall = chunks.find((c) => (c as { type: string }).type === 'tool_call') as
      | { type: string; call: { id: string; name: string; input: Record<string, string> } }
      | undefined;
    expect(toolCall).toBeDefined();
    expect(toolCall?.call.name).toBe('read_file');
    expect(toolCall?.call.input).toEqual({ path: 'src/index.ts' });
    expect(toolCall?.call.id).toBe('call-1');
  });

  it('yields error on HTTP 4xx', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(401, '{"error":"unauthorized"}'));

    const chunks: unknown[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'test-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }
    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect((chunks[0] as { error: string }).error).toContain('401');
  });

  it('testConnection returns ok:true on 200', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);
    expect((await provider.testConnection()).ok).toBe(true);
  });

  it('testConnection returns ok:false and "Invalid API key" on 401', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
    } as Response);
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid API key');
  });

  it('testConnection returns ok:false when API key missing', async () => {
    const blank = new TestProvider();
    const result = await blank.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No API key');
  });
});
