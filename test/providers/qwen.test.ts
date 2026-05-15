import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QwenProvider } from '../../src/providers/qwen';

describe('QwenProvider', () => {
  let provider: QwenProvider;

  beforeEach(() => {
    provider = new QwenProvider();
    provider.configure('qwen-test-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Alibaba DashScope compatible endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    for await (const _ of provider.chat([], {
      model: 'qwen-max',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    );
  });

  it('has the correct provider id', () => {
    expect(provider.id).toBe('qwen');
  });

  it('requires an API key', async () => {
    const blank = new QwenProvider();
    const chunks: unknown[] = [];
    for await (const chunk of blank.chat([], {
      model: 'qwen-max',
      maxTokens: 10,
      temperature: 0,
    })) {
      chunks.push(chunk);
    }
    expect(chunks[0]).toMatchObject({ type: 'error' });
  });
});
