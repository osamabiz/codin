import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MoonshotProvider } from '../../src/providers/moonshot';
import { KimiProvider } from '../../src/providers/kimi';

describe('MoonshotProvider and KimiProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Moonshot uses the correct base URL', async () => {
    const provider = new MoonshotProvider();
    provider.configure('ms-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    for await (const _ of provider.chat([], {
      model: 'moonshot-v1-8k',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.moonshot.cn/v1/chat/completions');
  });

  it('Kimi uses the same endpoint as Moonshot', async () => {
    const kimi = new KimiProvider();
    kimi.configure('km-key');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    for await (const _ of kimi.chat([], {
      model: 'moonshot-v1-8k',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.moonshot.cn/v1/chat/completions');
  });

  it('Kimi has a distinct id and name from Moonshot', () => {
    const moonshot = new MoonshotProvider();
    const kimi = new KimiProvider();
    expect(kimi.id).toBe('kimi');
    expect(kimi.name).toBe('Kimi (Moonshot AI)');
    expect(moonshot.id).toBe('moonshot');
    expect(moonshot.id).not.toBe(kimi.id);
  });
});
