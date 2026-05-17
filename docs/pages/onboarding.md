# Page: Onboarding wizard

## Purpose

The first thing a brand new user sees when they install Codin. Removes the
biggest adoption barrier — most developers assume they need a paid subscription
before they can try it. The wizard makes it clear that Codin is usable for
free in under 2 minutes.

## When it appears

- First activation only (no API key configured, `onboardingComplete` flag not set in globalState)
- Can be re-triggered via Command Palette: `Codin: Setup Wizard`

## Layout

Three screens. User moves forward with Next, can go Back, can skip to manual
settings at any time.

---

## Screen 1 — Welcome

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                    👾 Codin                         │
│                                                     │
│        Your AI coding agent, your own key.          │
│                                                     │
│   Free. Open source. Works with the AI tools       │
│   you already know — or none at all.                │
│                                                     │
│   ─────────────────────────────────────────────    │
│                                                     │
│   How do you want to power Codin?                   │
│                                                     │
│   ○  Local — 100% free, runs on your machine       │
│      No account. No key. No cost. Ever.             │
│                                                     │
│   ○  Free cloud API — free quota, no credit card   │
│      Google Gemini gives you a free API key         │
│      in under 2 minutes.                            │
│                                                     │
│   ○  I have an API key already                     │
│      Claude, OpenAI, Groq, DeepSeek, or others.    │
│                                                     │
│                        [Next →]  [Skip setup]       │
└─────────────────────────────────────────────────────┘
```

---

## Screen 2a — Local path (user chose "Local")

```
┌─────────────────────────────────────────────────────┐
│  ← Back                              Step 2 of 3   │
│                                                     │
│  🖥  Run AI locally — completely free              │
│                                                     │
│  Ollama runs open-source AI models on your          │
│  machine. No account, no internet required          │
│  after setup, no usage limits.                      │
│                                                     │
│  Recommended models for coding:                     │
│  • Qwen2.5-Coder 7B  (4 GB) — best small coder    │
│  • DeepSeek-Coder 6.7B (4 GB) — strong at code    │
│  • Llama 3.1 8B (5 GB) — fast, general purpose    │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  Ollama status:  ● Not detected             │   │
│  │                                             │   │
│  │  [Install Ollama]   [Check again]           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Already installed?                                 │
│  Base URL  [http://localhost:11434        ]         │
│  Model     [qwen2.5-coder:7b             ]         │
│                                                     │
│  [Test connection]                                  │
│                                                     │
│                        [← Back]  [Next →]           │
└─────────────────────────────────────────────────────┘
```

**"Install Ollama" button** opens `https://ollama.com/download` in the
system browser. After user installs, they click "Check again" — extension
pings `http://localhost:11434/api/tags` to detect it.

**Once detected:**
```
│  Ollama status:  ✅ Running (3 models available)   │
│  Model  [qwen2.5-coder:7b  ▾]  ← populated from   │
│                                   /api/tags         │
```

---

## Screen 2b — Free cloud API path (user chose "Free cloud API")

```
┌─────────────────────────────────────────────────────┐
│  ← Back                              Step 2 of 3   │
│                                                     │
│  ☁  Free API key — no credit card needed          │
│                                                     │
│  Google Gemini offers a free API tier:             │
│  • 15 requests / minute                            │
│  • 1 million tokens / minute                       │
│  • No credit card required                         │
│                                                     │
│  Get your free key in 2 minutes:                   │
│                                                     │
│  1. Click the button below                         │
│  2. Sign in with your Google account               │
│  3. Click "Create API key"                         │
│  4. Paste it here                                  │
│                                                     │
│  [Open Google AI Studio →]                         │
│                                                     │
│  API Key  [Paste your key here...          ]       │
│                                                     │
│  [Test connection]                                  │
│  ✅ Connected — gemini-2.0-flash ready             │
│                                                     │
│  ── Other free options ──────────────────────────  │
│  Groq (Llama 3, ultra fast)  [Get free key →]     │
│  OpenRouter (many models)    [Get free key →]      │
│                                                     │
│                        [← Back]  [Next →]           │
└─────────────────────────────────────────────────────┘
```

**"Open Google AI Studio" button** opens
`https://aistudio.google.com/app/apikey` in system browser.

---

## Screen 2c — I have a key (user chose "I have an API key")

```
┌─────────────────────────────────────────────────────┐
│  ← Back                              Step 2 of 3   │
│                                                     │
│  🔑  Connect your API key                          │
│                                                     │
│  Provider  [Claude (Anthropic)          ▾]         │
│                                                     │
│  API Key   [••••••••••••••••••••••••••  ]  [Show]  │
│            Stored securely. Never leaves            │
│            your machine except to call              │
│            the provider you chose.                  │
│                                                     │
│  Model     [claude-sonnet-4             ▾]         │
│                                                     │
│  [Test connection]                                  │
│  ✅ Connected                                       │
│                                                     │
│  ── Don't have a key? ───────────────────────────  │
│  Claude API   [anthropic.com/api →]                │
│  OpenAI API   [platform.openai.com →]              │
│  Groq (free)  [console.groq.com →]                 │
│  Gemini (free)[aistudio.google.com →]              │
│                                                     │
│                        [← Back]  [Next →]           │
└─────────────────────────────────────────────────────┘
```

Provider dropdown includes the full list from the provider expansion:
Claude, OpenAI, Gemini, Mistral, DeepSeek, Kimi, Qwen, MiniMax,
Groq, OpenRouter, Ollama, LM Studio, Jan, Custom.

---

## Screen 3 — Ready (all paths converge here)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                    ✅ You're ready                  │
│                                                     │
│  Connected to: Gemini (gemini-2.0-flash)           │
│                                                     │
│  ── Try your first task ──────────────────────────  │
│                                                     │
│  💡 "Create a TypeScript function that             │
│      validates an email address and write           │
│      a test for it"                                 │
│                                                     │
│  💡 "Read my package.json and suggest              │
│      which dependencies are outdated"               │
│                                                     │
│  💡 "Find all TODO comments in this                │
│      project and create a summary"                  │
│                                                     │
│  ── What Codin can do ────────────────────────────  │
│  ✓ Read and write files (with your approval)       │
│  ✓ Run terminal commands (with your approval)      │
│  ✓ Search your codebase                            │
│  ✓ Plan multi-step tasks automatically             │
│  ✓ Switch AI provider anytime in Settings          │
│                                                     │
│                    [Start coding →]                 │
│                                                     │
│         Settings  ·  Docs  ·  GitHub               │
└─────────────────────────────────────────────────────┘
```

"Start coding →" closes the wizard, sets `onboardingComplete: true` in
globalState, and opens the chat panel.

---

## Free provider reference (shown on Screen 2b and README)

| Provider | Free tier | Speed | Best for |
|---|---|---|---|
| Google Gemini | 15 req/min, no card | Fast | General + code |
| Groq | ~100 req/min, no card | Very fast | Quick tasks |
| OpenRouter | Mixed by model | Varies | Trying many models |
| Ollama | Unlimited (local) | Depends on GPU | Privacy, no limits |
| LM Studio | Unlimited (local) | Depends on GPU | GUI model manager |

---

## Implementation notes

### File location
`src/ui/OnboardingPanel.ts` — webview panel, same pattern as ChatPanel
and SettingsPanel.

### Trigger logic in `extension.ts`

```typescript
if (!settings.onboardingComplete && !await settings.getApiKey('any')) {
  OnboardingPanel.createOrShow(context.extensionUri, settings, () => {
    settings.onboardingComplete = true;
    ChatPanel.createOrShow(context.extensionUri, agent, settings);
  });
}
```

### Ollama detection

```typescript
async function detectOllama(baseUrl: string): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { running: false };
    const data = await res.json();
    return { running: true, models: data.models.map((m: any) => m.name) };
  } catch {
    return { running: false };
  }
}
```

### State across screens

Wizard state is kept in-memory in the webview. On completion, a single
`setup_complete` message is posted to the extension host with the chosen
provider config and API key.

```typescript
// Webview → Extension (on "Start coding →" click)
{
  type: 'setup_complete',
  provider: 'gemini',
  apiKey: 'AIza...',
  model: 'gemini-2.0-flash',
  baseUrl: null   // only for local providers
}
```

### data-testid attributes

| Element | data-testid |
|---|---|
| Path selection: Local | `onboard-path-local` |
| Path selection: Free cloud | `onboard-path-free` |
| Path selection: Have key | `onboard-path-key` |
| Next button | `onboard-next` |
| Back button | `onboard-back` |
| Test connection button | `onboard-test-connection` |
| Connection status | `onboard-connection-status` |
| API key input | `onboard-api-key` |
| Start coding button | `onboard-start` |
| Ollama status indicator | `onboard-ollama-status` |
| Check again button | `onboard-ollama-check` |

---

## README addition

Add this section to README.md directly after the features list:

```markdown
## Get started free

No subscription required. Pick your path:

| Path | Cost | Setup time |
|---|---|---|
| **Ollama (local)** | Free forever | ~5 min |
| **Gemini free API** | Free (15 req/min) | ~2 min |
| **Groq free API** | Free (~100 req/min) | ~2 min |
| **Your API key** | Pay per use (cents) | ~1 min |

Codin never charges you anything. You only pay the AI provider
directly, and only if you choose a paid tier.
```
