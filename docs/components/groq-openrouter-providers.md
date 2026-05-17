# Providers: Groq and OpenRouter

## Why these two matter for Codin

Both are free-tier API providers that require no credit card. They are
the fastest path for a new user to get started with a cloud provider.
Groq in particular is significantly faster than OpenAI or Claude for
inference — useful for quick coding tasks.

---

## Groq (`src/providers/groq.ts`)

**What it is:** Cloud inference API running open-source models
(Llama 3, Mistral, Gemma) at very high speed via custom hardware.

**Free tier:** ~100 requests/minute, no credit card required.
Signup at: https://console.groq.com

**API details:**
- Endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Auth: `Authorization: Bearer {key}`
- Format: OpenAI-compatible — extend `openai-base.ts`
- Streaming: SSE, same as OpenAI
- Tool use: supported on llama3-groq-70b-8192-tool-use-preview

**Models to offer:**
```
llama-3.3-70b-versatile     ← best quality, recommended default
llama-3.1-8b-instant        ← fastest, good for simple tasks
mixtral-8x7b-32768          ← long context tasks
gemma2-9b-it                ← lightweight
llama3-groq-70b-8192-tool-use-preview  ← best for agent tool use
```

**Implementation:**
```typescript
// src/providers/groq.ts
import { OpenAIBaseProvider } from './base/openai-base';

export class GroqProvider extends OpenAIBaseProvider {
  readonly id = 'groq';
  readonly name = 'Groq (free tier available)';
  readonly baseUrl = 'https://api.groq.com/openai/v1';
  readonly availableModels = [
    { id: 'llama-3.3-70b-versatile',   name: 'Llama 3.3 70B (recommended)' },
    { id: 'llama-3.1-8b-instant',      name: 'Llama 3.1 8B (fastest)' },
    { id: 'mixtral-8x7b-32768',        name: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it',              name: 'Gemma 2 9B' },
    { id: 'llama3-groq-70b-8192-tool-use-preview', name: 'Llama 3 70B (tool use)' },
  ];
  readonly supportsToolUse = true;
  readonly signupUrl = 'https://console.groq.com';
  readonly freetier = true;
}
```

---

## OpenRouter (`src/providers/openrouter.ts`)

**What it is:** API gateway that routes to 100+ models from many
providers (OpenAI, Anthropic, Google, Meta, Mistral, etc.) through
a single API key. Some models are free.

**Free tier:** Several models permanently free (marked with $0/token
in their model list). No credit card for free models.
Signup at: https://openrouter.ai

**API details:**
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Authorization: Bearer {key}`
- Format: OpenAI-compatible — extend `openai-base.ts`
- Extra headers required:
  ```
  HTTP-Referer: https://codin.my
  X-Title: Codin
  ```
- Models: fetched dynamically from `https://openrouter.ai/api/v1/models`

**Free models to highlight (as defaults in dropdown):**
```
meta-llama/llama-3.1-8b-instruct:free
mistralai/mistral-7b-instruct:free
google/gemma-2-9b-it:free
microsoft/phi-3-mini-128k-instruct:free
```

**Implementation:**
```typescript
// src/providers/openrouter.ts
import { OpenAIBaseProvider } from './base/openai-base';

export class OpenRouterProvider extends OpenAIBaseProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter (free models available)';
  readonly baseUrl = 'https://openrouter.ai/api/v1';
  readonly freetier = true;
  readonly signupUrl = 'https://openrouter.ai';

  // OpenRouter requires these extra headers
  protected extraHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://codin.my',
      'X-Title': 'Codin',
    };
  }

  // Models fetched dynamically — filter to show free ones first
  async fetchAvailableModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    const data = await res.json();
    const models = data.data as OpenRouterModel[];

    // Sort: free models first, then by context length
    return models
      .sort((a, b) => {
        const aFree = a.pricing.prompt === '0';
        const bFree = b.pricing.prompt === '0';
        if (aFree && !bFree) return -1;
        if (!aFree && bFree) return 1;
        return b.context_length - a.context_length;
      })
      .map(m => ({
        id: m.id,
        name: `${m.name}${m.pricing.prompt === '0' ? ' (free)' : ''}`,
      }));
  }
}
```

---

## Settings panel updates for free providers

In the provider dropdown, add a visual indicator for free-tier providers:

```
── Cloud providers ──────────────
  Claude (Anthropic)
  OpenAI
  Google Gemini  ✦ free tier
  Groq           ✦ free tier
  OpenRouter     ✦ free models
  Mistral AI
  DeepSeek
  Kimi (Moonshot AI)
  Qwen (Alibaba Cloud)
  MiniMax
── Local (always free) ──────────
  Ollama
  LM Studio
  Jan.ai
── Advanced ─────────────────────
  Custom (OpenAI-compatible)
```

The `✦ free tier` label makes it immediately obvious to new users
which providers cost nothing to try.

---

## Unit tests

```typescript
// test/providers/groq.test.ts
describe('GroqProvider', () => {
  it('uses correct base URL', () => {
    expect(new GroqProvider().baseUrl)
      .toBe('https://api.groq.com/openai/v1');
  });
  it('marks freetier as true', () => {
    expect(new GroqProvider().freetier).toBe(true);
  });
  it('supports tool use', () => {
    expect(new GroqProvider().supportsToolUse).toBe(true);
  });
});

// test/providers/openrouter.test.ts
describe('OpenRouterProvider', () => {
  it('includes HTTP-Referer in extra headers', () => {
    const headers = new OpenRouterProvider().extraHeaders();
    expect(headers['HTTP-Referer']).toBe('https://codin.my');
    expect(headers['X-Title']).toBe('Codin');
  });
  it('marks free models with (free) suffix', async () => {
    // mock fetch to return model list with one free model
    const models = await new OpenRouterProvider().fetchAvailableModels();
    const freeModel = models.find(m => m.name.includes('(free)'));
    expect(freeModel).toBeDefined();
  });
});
```
