import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqProvider } from '../../src/providers/groq';

describe('GroqProvider', () => {
  let provider: GroqProvider;

  beforeEach(() => {
    provider = new GroqProvider();
    provider.configure('groq-test-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses correct baseUrl', () => {
    // Access via the protected _baseUrl through the endpoint
    expect(provider.id).toBe('groq');
    // Verify by triggering a chat and checking the URL
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    // We can check via testConnection which uses the endpoint
    void provider.testConnection();
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('freetier property is true', () => {
    expect(provider.freetier).toBe(true);
  });

  it('supportsToolUse is true', () => {
    expect(provider.supportsToolUse).toBe(true);
  });

  it('supportsStreaming is true', () => {
    expect(provider.supportsStreaming).toBe(true);
  });

  it('has at least 5 models in availableModels', () => {
    expect(provider.availableModels.length).toBeGreaterThanOrEqual(5);
  });

  it('has the signupUrl set', () => {
    expect(provider.signupUrl).toBe('https://console.groq.com');
  });

  it('testConnection maps 401 to "Invalid API key" message', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"unauthorized"}',
    } as unknown as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid API key');
  });

  it('testConnection maps 429 to "Rate limit hit" message', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":"rate_limit_exceeded"}',
    } as unknown as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Rate limit hit');
  });

  it('testConnection maps 500 to "Groq server error" message', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    } as unknown as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Groq server error');
  });

  it('testConnection returns ok:true on 200', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
  });

  it('testConnection returns error when no API key configured', async () => {
    const blank = new GroqProvider();
    const result = await blank.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No API key');
  });

  it('message format conversion: canonical → OpenAI wire format (inherited from base)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    const messages = [
      { role: 'user' as const, content: 'Hello Groq' },
      { role: 'assistant' as const, content: 'Hi there' },
    ];

    for await (const _ of provider.chat(messages, {
      model: 'llama-3.3-70b-versatile',
      maxTokens: 100,
      temperature: 0.7,
    })) {
      // consume
    }

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['model']).toBe('llama-3.3-70b-versatile');
    expect(body['stream']).toBe(true);

    const wireMessages = body['messages'] as Array<{ role: string; content: string }>;
    expect(wireMessages).toHaveLength(2);
    expect(wireMessages[0]).toEqual({ role: 'user', content: 'Hello Groq' });
    expect(wireMessages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
  });
});
