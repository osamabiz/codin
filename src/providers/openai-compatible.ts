import type { ModelInfo } from './types';
import { OpenAIBaseProvider } from './base/openai-base';

/**
 * Generic adapter for any OpenAI-compatible API.
 * The user configures the base URL (and optional API key) in Settings.
 * Model name is a free-text field — no fixed dropdown.
 */
export class OpenAICompatibleProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'openai-compatible',
      name: 'Custom (OpenAI-compatible)',
      baseUrl: '',
      requiresApiKey: false,  // key is optional for local/custom servers
      models: [],             // model list is user-managed (free text in settings)
      defaultTestModel: '',
    });
  }

  /** Returns a synthetic single-item list so the UI always has something to show. */
  override get availableModels(): ModelInfo[] {
    return [{ id: this._defaultTestModel || 'model', name: this._defaultTestModel || 'Custom model' }];
  }

  /** Allow the settings panel to set the free-text model used for testConnection. */
  setModel(modelId: string): void {
    this._defaultTestModel = modelId;
  }

  async *chat(
    ...args: Parameters<OpenAIBaseProvider['chat']>
  ): ReturnType<OpenAIBaseProvider['chat']> {
    if (!this._baseUrl) {
      yield { type: 'error', error: 'No base URL configured. Open Settings and set a base URL.' };
      return;
    }
    yield* super.chat(...args);
  }

  override async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this._baseUrl) return { ok: false, error: 'No base URL configured' };
    return super.testConnection();
  }
}
