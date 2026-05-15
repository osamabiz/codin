import type { ModelInfo } from '../types';
import { OpenAIBaseProvider } from './openai-base';

export interface LocalBaseConfig {
  id: string;
  name: string;
  baseUrl: string;
  /** Static fallback model list shown before detection runs */
  models: ModelInfo[];
  defaultTestModel?: string;
}

/** Heuristic: model name containing "instruct" or "tool" likely supports function calling. */
function supportsToolsByName(modelId: string): boolean {
  const l = modelId.toLowerCase();
  return l.includes('instruct') || l.includes('tool');
}

/**
 * Base class for locally-running OpenAI-compatible servers (LM Studio, Jan, etc.).
 * No API key required. Dynamic model detection via /v1/models.
 * supportsToolUse is initially false and updated after model detection.
 */
export class LocalBaseProvider extends OpenAIBaseProvider {
  constructor(cfg: LocalBaseConfig) {
    super({
      ...cfg,
      requiresApiKey: false,
      supportsToolUse: false,
    });
  }

  // Local servers need no API key.
  configure(_apiKey: string): void {}

  /** Update supportsToolUse based on the currently selected model name. */
  updateModelHeuristic(modelId: string): void {
    this.supportsToolUse = supportsToolsByName(modelId);
  }

  /** Fetch available models from the local server's /v1/models endpoint. */
  async fetchAvailableModels(): Promise<ModelInfo[]> {
    try {
      const resp = await fetch(`${this._baseUrl}/models`);
      if (!resp.ok) return this.availableModels;
      const json = (await resp.json()) as { data?: Array<{ id: string }> };
      const list = json.data ?? [];
      return list.length > 0 ? list.map((m) => ({ id: m.id, name: m.id })) : this.availableModels;
    } catch {
      return this.availableModels;
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await fetch(`${this._baseUrl}/models`);
      if (!resp.ok) return { ok: false, error: `Server returned ${resp.status}` };
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: `Cannot reach ${this.name}. Is it running? (${(err as Error).message})`,
      };
    }
  }
}
