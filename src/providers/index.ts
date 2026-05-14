import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';
import type { ILLMProvider } from './types';

const _providers: Record<string, ILLMProvider> = {
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
  ollama: new OllamaProvider(),
};

export function getProvider(id: string): ILLMProvider {
  const p = _providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function configureProvider(id: string, apiKey: string): void {
  _providers[id]?.configure(apiKey);
}

export function allProviders(): ILLMProvider[] {
  return Object.values(_providers);
}
