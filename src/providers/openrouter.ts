import { OpenAIBaseProvider } from './base/openai-base';
import type { ModelInfo } from './types';

/** Shape of a model entry in the OpenRouter /api/v1/models response */
interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

/**
 * Default free models shown before the user enters an API key.
 * These are always-free models on OpenRouter requiring no credit card.
 */
const DEFAULT_FREE_MODELS: ModelInfo[] = [
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B Instruct (free)' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct (free)' },
  { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B IT (free)' },
  { id: 'microsoft/phi-3-mini-128k-instruct:free', name: 'Phi 3 Mini 128K Instruct (free)' },
];

/**
 * OpenRouter provider — API gateway routing to 100+ models from many
 * providers through a single API key. Some models are permanently free.
 *
 * Signup: https://openrouter.ai
 */
export class OpenRouterProvider extends OpenAIBaseProvider {
  readonly freetier = true;
  readonly signupUrl = 'https://openrouter.ai';

  /** In-memory cache for fetched models (avoids re-fetching on every panel open) */
  private _cachedModels: ModelInfo[] | null = null;

  constructor() {
    super({
      id: 'openrouter',
      name: 'OpenRouter (free models available)',
      baseUrl: 'https://openrouter.ai/api/v1',
      supportsToolUse: true,
      defaultTestModel: 'meta-llama/llama-3.1-8b-instruct:free',
      models: DEFAULT_FREE_MODELS,
    });
  }

  /**
   * OpenRouter requires these extra headers on every request.
   * We merge them into the standard auth headers.
   */
  protected extraHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://codin.my',
      'X-Title': 'Codin',
    };
  }

  /** Override _buildHeaders to inject OpenRouter-specific headers. */
  protected _buildHeaders(): Record<string, string> {
    return {
      ...super._buildHeaders(),
      ...this.extraHeaders(),
    };
  }

  /**
   * Fetch the full model catalogue from OpenRouter's /models endpoint.
   *
   * - Sorts: free models first (pricing.prompt === '0'), then by context_length desc
   * - Appends ' (free)' to free model names
   * - Caps at 50 models
   * - Caches result in memory for the session
   */
  async fetchAvailableModels(): Promise<ModelInfo[]> {
    if (this._cachedModels) return this._cachedModels;

    const res = await fetch(`${this._baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this._apiKey}` },
    });

    if (!res.ok) {
      return DEFAULT_FREE_MODELS;
    }

    const json = (await res.json()) as { data: OpenRouterModel[] };
    const models = json.data ?? [];

    const sorted = models
      .sort((a, b) => {
        const aFree = a.pricing.prompt === '0';
        const bFree = b.pricing.prompt === '0';
        if (aFree && !bFree) return -1;
        if (!aFree && bFree) return 1;
        return b.context_length - a.context_length;
      })
      .slice(0, 50)
      .map((m) => ({
        id: m.id,
        name: `${m.name}${m.pricing.prompt === '0' ? ' (free)' : ''}`,
      }));

    this._cachedModels = sorted;
    this._models = sorted;
    return sorted;
  }

  /**
   * Test connection by hitting the /models endpoint with the API key.
   * 200 → ok, 401 → invalid key, other → generic error.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this._apiKey) {
      return { ok: false, error: 'No API key configured' };
    }

    try {
      const resp = await fetch(`${this._baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this._apiKey}`,
          ...this.extraHeaders(),
        },
      });

      if (resp.status === 401) return { ok: false, error: 'Invalid OpenRouter API key' };
      if (!resp.ok) return { ok: false, error: `OpenRouter error: ${resp.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
