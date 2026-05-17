# Prompt: Onboarding wizard implementation

## When to use this prompt

After Phase 5 is complete and the rename to Codin is done.
Run this as a standalone prompt — it touches onboarding only.

---

## Prompt (paste this to your coding agent)

```
Read .agent/AGENT.md, docs/pages/onboarding.md, 
docs/components/llm-providers.md, and docs/pages/settings.md 
before starting.

Implement the Codin onboarding wizard as specified in 
docs/pages/onboarding.md.

─── OnboardingPanel (src/ui/OnboardingPanel.ts) ───────────────

Create a VS Code webview panel following the same pattern as 
ChatPanel.ts and SettingsPanel.ts.

Three-screen wizard:

Screen 1 — Welcome
- Three path options as radio buttons:
  "Local" / "Free cloud API" / "I have an API key"
- Next button (disabled until a path is selected)
- Skip setup link → sets onboardingComplete, opens settings panel

Screen 2a — Local path
- Ollama status indicator (pings http://localhost:11434/api/tags 
  on load and on "Check again" click, 2 second timeout)
- If Ollama detected: populate model dropdown from /api/tags response
- If not detected: show "Install Ollama" button 
  → opens https://ollama.com/download in system browser
- Base URL field (default: http://localhost:11434)
- Model text input (default: qwen2.5-coder:7b)
- Test connection button → calls ollama provider testConnection()
- Next enabled only after successful connection test

Screen 2b — Free cloud API path  
- "Open Google AI Studio" button 
  → opens https://aistudio.google.com/app/apikey in system browser
- API key input field
- Test connection button → calls gemini provider testConnection()
- Three secondary links: Groq, OpenRouter (open in browser)
- Next enabled only after successful connection test

Screen 2c — I have a key path
- Provider dropdown: full list from provider registry
  (Claude, OpenAI, Gemini, Mistral, DeepSeek, Kimi, Qwen, 
   MiniMax, Groq, OpenRouter, Ollama, LM Studio, Jan, Custom)
- API key input (SecretStorage on save)
- Model dropdown (populated per provider)
- For local providers (Ollama, LM Studio, Jan): show base URL 
  field instead of API key field
- Test connection button
- Links to provider signup pages
- Next enabled only after successful connection test

Screen 3 — Ready
- Show which provider/model is connected
- Three example task suggestions (as in spec)
- Capability checklist (files, terminal, search, planning)
- "Start coding →" button:
  → posts setup_complete message to extension host
  → extension saves key to SecretStorage
  → sets onboardingComplete: true in globalState
  → opens ChatPanel

─── Trigger logic (update src/extension.ts) ───────────────────

In activate(), after initializing settings:

  const hasKey = await settings.hasAnyApiKey();
  if (!settings.onboardingComplete || !hasKey) {
    OnboardingPanel.createOrShow(context.extensionUri, settings, 
      () => ChatPanel.createOrShow(context.extensionUri, agent, settings)
    );
  }

Add to SettingsManager:
  async hasAnyApiKey(): Promise<boolean>
    → checks SecretStorage for any non-empty key across all providers

Add command: codin.setupWizard → OnboardingPanel.createOrShow(...)
Register in package.json contributes.commands as "Codin: Setup Wizard"

─── Webview message protocol additions ────────────────────────

Webview → Extension:
  { type: 'setup_complete', provider, apiKey, model, baseUrl }
  { type: 'test_connection_onboard', provider, apiKey, baseUrl }
  { type: 'detect_ollama', baseUrl }
  { type: 'open_url', url }   ← extension calls vscode.env.openExternal

Extension → Webview:
  { type: 'ollama_status', running: boolean, models: string[] }
  { type: 'connection_result', ok: boolean, error?: string }

─── Styling ────────────────────────────────────────────────────

Follow docs/components/webview-ui.md styling rules exactly:
- All colours via VS Code CSS variables
- Works in both light and dark themes
- No external fonts or icon CDNs
- The wizard should feel clean and calm — not flashy
- Use generous whitespace, large readable text
- Path option cards: border + subtle background on hover/selected

─── data-testid attributes ─────────────────────────────────────

Add every data-testid from the table in docs/pages/onboarding.md.

─── README.md update ───────────────────────────────────────────

Add the "Get started free" table from docs/pages/onboarding.md 
directly after the features list in README.md.

─── Unit tests ─────────────────────────────────────────────────

Write test/ui/onboarding.test.ts covering:
- detectOllama(): returns running:true when server responds 200
- detectOllama(): returns running:false on network error
- detectOllama(): returns running:false on 2s timeout
- setup_complete message saves key to SecretStorage mock
- hasAnyApiKey(): returns true when at least one key exists
- hasAnyApiKey(): returns false when no keys exist
- onboardingComplete flag set after setup_complete handled

─── E2E test ───────────────────────────────────────────────────

Add test/e2e/specs/onboarding.spec.ts:

test('fresh install shows onboarding wizard', async () => {
  launch VS Code with no API keys set, onboardingComplete: false
  expect onboard-path-local to be visible
  expect onboard-next to be disabled
  click onboard-path-free
  expect onboard-next to be enabled
})

test('local path: ollama not running shows install button', async () => {
  mock detectOllama to return { running: false }
  select onboard-path-local, click next
  expect onboard-ollama-status text to contain 'Not detected'
  expect page to have link to ollama.com/download
})

test('completing setup opens chat panel', async () => {
  go through wizard with mock successful connection
  click onboard-start
  expect chat panel to be visible
  expect onboarding wizard to be closed
})

─── Verify after implementation ────────────────────────────────

  npm test                    → all green including onboarding tests
  npm run test:integration    → green
  
  Manual:
  F5 → clear all API keys from SecretStorage → reload window
  → onboarding wizard appears automatically (not the chat panel)
  
  Path 1: choose Local → Ollama not running → 
    Install Ollama button opens browser
  
  Path 2: choose Free cloud API → 
    Open Google AI Studio button opens browser →
    paste a real Gemini key → Test connection → green → 
    Next → Screen 3 → Start coding → chat panel opens
  
  Path 3: choose I have a key → 
    pick Claude → paste key → test → next → start → chat opens
  
  Command palette: "Codin: Setup Wizard" → wizard opens again
  (even after onboarding is complete — useful for changing provider)
```
