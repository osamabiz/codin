import { OpenAIBaseProvider } from './base/openai-base';

/**
 * Groq provider — cloud inference API running open-source models
 * (Llama 3, Mistral, Gemma) at very high speed via custom hardware.
 *
 * Free tier: ~100 requests/minute, no credit card required.
 * Signup: https://console.groq.com
 */
export class GroqProvider extends OpenAIBaseProvider {
  readonly freetier = true;
  readonly signupUrl = 'https://console.groq.com';

  constructor() {
    super({
      id: 'groq',
      name: 'Groq (free tier available)',
      baseUrl: 'https://api.groq.com/openai/v1',
      supportsToolUse: true,
      defaultTestModel: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (recommended)' },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (fastest)' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (long context)' },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
        { id: 'llama3-groq-70b-8192-tool-use-preview', name: 'Llama 3 70B Tool Use (best for agent)' },
      ],
    });
  }

  /**
   * Override testConnection to provide Groq-specific error messages.
   * Maps 401 → 'Invalid API key', 429 → 'Rate limit hit', 500 → 'Groq server error'.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this._apiKey) {
      return { ok: false, error: 'No API key configured' };
    }

    try {
      const resp = await fetch(this._endpoint, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify({
          model: this._defaultTestModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      if (resp.status === 401) return { ok: false, error: 'Invalid API key' };
      if (resp.status === 429) return { ok: false, error: 'Rate limit hit' };
      if (resp.status === 500) return { ok: false, error: 'Groq server error' };
      if (!resp.ok) {
        const text = await resp.text();
        return { ok: false, error: `API error ${resp.status}: ${text}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
