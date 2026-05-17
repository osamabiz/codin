import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { GroqProvider } from './groq';
import { OpenRouterProvider } from './openrouter';
import { OllamaProvider } from './ollama';
import { MistralProvider } from './mistral';
import { DeepSeekProvider } from './deepseek';
import { MoonshotProvider } from './moonshot';
import { KimiProvider } from './kimi';
import { QwenProvider } from './qwen';
import { MiniMaxProvider } from './minimax';
import { LMStudioProvider } from './lmstudio';
import { JanProvider } from './jan';
import { OpenAICompatibleProvider } from './openai-compatible';
import { OpenAIBaseProvider } from './base/openai-base';
import type { ILLMProvider } from './types';

const _providers: Record<string, ILLMProvider> = {
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
  groq: new GroqProvider(),
  openrouter: new OpenRouterProvider(),
  mistral: new MistralProvider(),
  deepseek: new DeepSeekProvider(),
  moonshot: new MoonshotProvider(),
  kimi: new KimiProvider(),
  qwen: new QwenProvider(),
  minimax: new MiniMaxProvider(),
  ollama: new OllamaProvider(),
  lmstudio: new LMStudioProvider(),
  jan: new JanProvider(),
  'openai-compatible': new OpenAICompatibleProvider(),
};

export function getProvider(id: string): ILLMProvider {
  const p = _providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

/**
 * Configure a provider with an API key and optional base URL.
 * The base URL is applied when the provider extends OpenAIBaseProvider
 * (local and custom providers).
 */
export function configureProvider(id: string, apiKey: string, baseUrl?: string): void {
  const p = _providers[id];
  if (!p) return;
  p.configure(apiKey);
  if (baseUrl && p instanceof OpenAIBaseProvider) {
    p.setBaseUrl(baseUrl);
  }
}

export function allProviders(): ILLMProvider[] {
  return Object.values(_providers);
}
