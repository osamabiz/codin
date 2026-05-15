import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from '../../src/providers/openai-compatible';

function makeOkStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { c.close(); } });
}

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    provider = new OpenAICompatibleProvider();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('yields error when no base URL configured (chat)', async () => {
    const chunks: unknown[] = [];
    for await (const chunk of provider.chat([], {
      model: 'my-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }
    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect((chunks[0] as { error: string }).error).toContain('base URL');
  });

  it('testConnection returns ok:false when no base URL', async () => {
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('base URL');
  });

  it('forwards requests to configured base URL', async () => {
    provider.setBaseUrl('http://my-server.local/v1');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: makeOkStream(),
      text: async () => '',
    } as unknown as Response);

    for await (const _ of provider.chat([], {
      model: 'llama3',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://my-server.local/v1/chat/completions');
  });

  it('setModel updates the model used for synthetic availableModels', () => {
    provider.setModel('my-custom-model');
    expect(provider.availableModels[0].id).toBe('my-custom-model');
    expect(provider.availableModels[0].name).toBe('my-custom-model');
  });

  it('does not require an API key (requiresApiKey=false)', async () => {
    provider.setBaseUrl('http://my-server.local/v1');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: makeOkStream(),
      text: async () => '',
    } as unknown as Response);

    // Should not yield an error even with no key configured
    const chunks: unknown[] = [];
    for await (const chunk of provider.chat([], {
      model: 'llama3',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }
    const hasError = chunks.some((c) => (c as { type: string }).type === 'error');
    expect(hasError).toBe(false);
  });
});
