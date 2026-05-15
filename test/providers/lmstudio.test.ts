import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LMStudioProvider } from '../../src/providers/lmstudio';

describe('LMStudioProvider', () => {
  let provider: LMStudioProvider;

  beforeEach(() => {
    provider = new LMStudioProvider();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses localhost:1234 by default', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    for await (const _ of provider.chat([], {
      model: 'local-model',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
  });

  it('does not require an API key', () => {
    // configure is a no-op for local providers
    expect(() => provider.configure('any-key')).not.toThrow();
  });

  it('starts with supportsToolUse=false', () => {
    expect(provider.supportsToolUse).toBe(false);
  });

  it('updateModelHeuristic sets supportsToolUse=true for instruct models', () => {
    provider.updateModelHeuristic('llama-3-8b-instruct');
    expect(provider.supportsToolUse).toBe(true);
  });

  it('updateModelHeuristic keeps supportsToolUse=false for non-instruct models', () => {
    provider.updateModelHeuristic('llama-3-8b');
    expect(provider.supportsToolUse).toBe(false);
  });

  it('updateModelHeuristic sets supportsToolUse=true for tool models', () => {
    provider.updateModelHeuristic('hermes-3-tool-use');
    expect(provider.supportsToolUse).toBe(true);
  });

  it('fetchAvailableModels returns models from /v1/models', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'llama-3-8b-instruct' }, { id: 'mistral-7b' }],
      }),
    } as Response);

    const models = await provider.fetchAvailableModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('llama-3-8b-instruct');
    expect(models[1].id).toBe('mistral-7b');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe('http://localhost:1234/v1/models');
  });

  it('fetchAvailableModels falls back to static list on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const models = await provider.fetchAvailableModels();
    expect(models.length).toBeGreaterThan(0); // static fallback
  });

  it('testConnection pings /v1/models', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(true);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe('http://localhost:1234/v1/models');
  });

  it('testConnection returns ok:false when server unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('LM Studio');
  });
});
