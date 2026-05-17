import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../../src/providers/openrouter';

/** Helper to create a mock response from the OpenRouter /models endpoint */
function makeMockModelsResponse(models: Array<{
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: models }),
    text: async () => JSON.stringify({ data: models }),
  } as unknown as Response;
}

const SAMPLE_MODELS = [
  { id: 'paid/model-a', name: 'Paid Model A', context_length: 4096, pricing: { prompt: '0.01', completion: '0.02' } },
  { id: 'free/model-b', name: 'Free Model B', context_length: 8192, pricing: { prompt: '0', completion: '0' } },
  { id: 'paid/model-c', name: 'Paid Model C', context_length: 32768, pricing: { prompt: '0.005', completion: '0.01' } },
  { id: 'free/model-d', name: 'Free Model D', context_length: 2048, pricing: { prompt: '0', completion: '0' } },
];

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider();
    provider.configure('or-test-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Extra headers ────────────────────────────────────────────

  it('extraHeaders() returns HTTP-Referer: https://codin.my', () => {
    // extraHeaders is protected, but we can check via _buildHeaders or a chat call
    // We use a subclass trick or call chat and inspect headers
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    void provider.testConnection();
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['HTTP-Referer']).toBe('https://codin.my');
  });

  it('extraHeaders() returns X-Title: Codin', () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      text: async () => '',
    } as unknown as Response);

    void provider.testConnection();
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Title']).toBe('Codin');
  });

  // ── fetchAvailableModels ─────────────────────────────────────

  it('fetchAvailableModels: free models (pricing.prompt==="0") appear before paid models', async () => {
    vi.mocked(fetch).mockResolvedValue(makeMockModelsResponse(SAMPLE_MODELS));

    const models = await provider.fetchAvailableModels();
    // Free models should come first
    const firstPaidIndex = models.findIndex(m => !m.name.includes('(free)'));
    const lastFreeIndex = models.length - 1 - [...models].reverse().findIndex(m => m.name.includes('(free)'));

    if (firstPaidIndex !== -1 && lastFreeIndex !== -1) {
      expect(lastFreeIndex).toBeLessThan(firstPaidIndex);
    }
  });

  it('fetchAvailableModels: free model names end with " (free)"', async () => {
    vi.mocked(fetch).mockResolvedValue(makeMockModelsResponse(SAMPLE_MODELS));

    const models = await provider.fetchAvailableModels();
    const freeModels = models.filter(m => m.name.includes('(free)'));
    expect(freeModels.length).toBe(2); // free/model-b and free/model-d

    for (const m of freeModels) {
      expect(m.name).toMatch(/\(free\)$/);
    }
  });

  it('fetchAvailableModels: result capped at 50 items', async () => {
    // Generate 60 models
    const manyModels = Array.from({ length: 60 }, (_, i) => ({
      id: `model-${i}`,
      name: `Model ${i}`,
      context_length: 4096 + i * 100,
      pricing: { prompt: i % 3 === 0 ? '0' : '0.01', completion: '0.01' },
    }));
    vi.mocked(fetch).mockResolvedValue(makeMockModelsResponse(manyModels));

    const models = await provider.fetchAvailableModels();
    expect(models.length).toBeLessThanOrEqual(50);
  });

  it('fetchAvailableModels: result cached (fetch called once even if method called twice)', async () => {
    // Need a fresh provider to clear any prior cache
    const freshProvider = new OpenRouterProvider();
    freshProvider.configure('or-cache-key');

    vi.mocked(fetch).mockResolvedValue(makeMockModelsResponse(SAMPLE_MODELS));

    await freshProvider.fetchAvailableModels();
    await freshProvider.fetchAvailableModels();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('fetchAvailableModels: sorts free models first, then by context_length descending', async () => {
    vi.mocked(fetch).mockResolvedValue(makeMockModelsResponse(SAMPLE_MODELS));

    // Create fresh provider to avoid cache
    const p = new OpenRouterProvider();
    p.configure('test-key');
    const models = await p.fetchAvailableModels();

    // First two should be free
    expect(models[0].name).toContain('(free)');
    expect(models[1].name).toContain('(free)');

    // Free models sorted by context_length desc: model-b (8192) before model-d (2048)
    expect(models[0].id).toBe('free/model-b');
    expect(models[1].id).toBe('free/model-d');

    // Paid models sorted by context_length desc: model-c (32768) before model-a (4096)
    expect(models[2].id).toBe('paid/model-c');
    expect(models[3].id).toBe('paid/model-a');
  });

  // ── testConnection ───────────────────────────────────────────

  it('testConnection 200 → { ok: true }', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      text: async () => '',
    } as unknown as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
  });

  it('testConnection 401 → { ok: false } with error string', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as unknown as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid OpenRouter API key');
  });

  it('testConnection other status → { ok: false } with status code', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    } as unknown as Response);

    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('OpenRouter error: 503');
  });

  it('testConnection returns error when no API key configured', async () => {
    const blank = new OpenRouterProvider();
    const result = await blank.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No API key');
  });

  // ── Provider identity ────────────────────────────────────────

  it('has correct id and name', () => {
    expect(provider.id).toBe('openrouter');
    expect(provider.name).toBe('OpenRouter (free models available)');
  });

  it('freetier property is true', () => {
    expect(provider.freetier).toBe(true);
  });

  it('has 4 default free models before key is entered', () => {
    const blank = new OpenRouterProvider();
    expect(blank.availableModels).toHaveLength(4);
    for (const m of blank.availableModels) {
      expect(m.name).toContain('(free)');
    }
  });

  it('uses correct base URL for chat endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      text: async () => '',
    } as unknown as Response);

    for await (const _ of provider.chat([], {
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
});
