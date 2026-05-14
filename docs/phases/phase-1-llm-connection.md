# Phase 1 — LLM connection & streaming chat

**Duration:** Weeks 2–3  
**Goal:** Type a message in the chat panel, get a streaming response from a real LLM. No agent logic yet — just a working chat interface connected to the user's API key.

---

## Deliverables

- [ ] Settings page with provider + API key input (stored in SecretStorage)
- [ ] Provider abstraction layer (`ILLMProvider` interface + Claude + OpenAI implementations)
- [ ] Streaming response displayed token-by-token in chat panel
- [ ] Markdown rendering in assistant messages (code blocks, bold, etc.)
- [ ] "Test connection" button in settings
- [ ] Token usage shown after each response
- [ ] Ollama provider (local, no key needed — good for testing)

---

## Coding agent prompt

```
Read docs/overview.md, docs/architecture.md, docs/components/llm-providers.md,
and docs/pages/settings.md before starting.

Implement Phase 1 of the VS Code extension:

1. LLM provider interface and implementations:
   - Create src/providers/types.ts with ILLMProvider interface (as specified in docs)
   - Implement src/providers/claude.ts (Anthropic API, streaming SSE)
   - Implement src/providers/openai.ts (OpenAI API, streaming SSE)
   - Implement src/providers/ollama.ts (local Ollama, no key)
   - Create src/providers/index.ts registry

2. Settings storage:
   - API key stored via vscode.SecretStorage
   - Provider choice + model stored via workspace.getConfiguration
   - Settings page webview at src/ui/SettingsPanel.ts

3. Chat panel (upgrade from Phase 0 placeholder):
   - User input textarea with Enter-to-send
   - Streaming token display (tokens appear as they arrive)
   - User message bubbles (right) and assistant bubbles (left)
   - Basic markdown rendering (use marked.js from CDN)
   - Token usage display after each response

4. Wire everything together in extension.ts

Do NOT implement tool use or agent planning yet. This is chat-only.

Tests to write:
- Unit test for each provider's message format conversion
- Unit test for SecretStorage key save/retrieve mock
```

---

## Architecture in this phase

```
ChatPanel (webview) 
  ↕ postMessage
extension.ts
  → ProviderRegistry.getProvider(settings.provider)
    → provider.chat(messages, options)   ← streaming
      ← yields ChatChunk tokens
    → extension posts each token back to webview
```

---

## Settings fields to implement in Phase 1

- Provider dropdown (Claude / OpenAI / Ollama)
- API key (SecretStorage)
- Model dropdown (populated dynamically per provider)
- Temperature slider
- Test connection button

---

## Definition of done

- User enters Claude API key in settings
- Types "Hello, what is 2+2?" in chat panel
- Sees streaming response appear token by token
- Token count shown after response
- Switching to Ollama (local) works without API key
- All unit tests pass
