# Master prompt sequence — Codin

Complete ordered list of every prompt to run from start to finish.
Phases 0-5 are already done. Start from "Rename to Codin" below.

---

## Current status checkpoint

Before running any remaining prompts, verify your baseline:

```bash
npm test                 # all green
npm run lint             # zero errors
npm run test:integration # all green
F5 → Ctrl+Shift+A       # chat panel opens and works
```

If anything is red, fix it before continuing.

---

## PROMPT R — Rename to Codin

```
Read .agent/AGENT.md before starting.

Rename the extension to "Codin" across the entire codebase.
Change names only — do not touch any logic.

Update every occurrence of the old name in:

package.json:
  "name": "codin"
  "displayName": "Codin"
  "description": "Your AI coding agent, powered by your own subscription"
  publisher: leave as-is (your publisher ID)

All command IDs:
  agentPlugin.* → codin.*
  e.g. agentPlugin.openChat → codin.openChat

All configuration namespace:
  agentPlugin.* → codin.*
  e.g. agentPlugin.provider → codin.provider

All view and container IDs:
  agentPlugin.* → codin.*

All string literals in src/ and webview-ui/ that say:
  "AI Agent" → "Codin"
  "Agent Plugin" → "Codin"
  "agentPlugin" → "codin" (where used as display text)

Update these files specifically:
  package.json
  src/extension.ts
  src/utils/SettingsManager.ts
  src/ui/ChatPanel.ts
  src/ui/SidebarProvider.ts
  src/ui/SettingsPanel.ts
  src/ui/StatusBar.ts
  webview-ui/index.html (title tag, any "AI Agent" text)
  webview-ui/settings.html
  .vscode-test.mjs (if extension ID referenced)
  .github/workflows/ci.yml (if extension name referenced)
  README.md
  CONTRIBUTING.md
  CHANGELOG.md

Do NOT change:
  data-testid attribute values (internal, not user-facing)
  File names in src/ (keep as-is)
  The docs/ folder content (already uses "Codin")

After renaming:
  npm test          → all green
  npm run lint      → zero errors
  F5 → Command Palette → type "Codin" → all 5 commands appear
  Activity bar icon tooltip shows "Codin" not old name
```

**Commit:** `git commit -m "chore: rename extension to Codin"`

---

## PROMPT P — Extended provider support

```
Read .agent/AGENT.md, docs/components/llm-providers.md,
docs/components/groq-openrouter-providers.md,
and docs/pages/settings.md before starting.

Implement extended provider support. The ILLMProvider interface
and base providers (Claude, OpenAI, Gemini, Ollama) are already
in place from Phase 1.

── Step 1: Create base adapter classes ─────────────────────────

src/providers/base/openai-base.ts
  Abstract class implementing ILLMProvider for any
  OpenAI-compatible endpoint.
  Constructor: { baseUrl, apiKey, name, id, models }
  Implements: chat() with SSE streaming, testConnection(),
  message format conversion (canonical ↔ OpenAI wire format)
  Protected method extraHeaders(): Record<string,string> = {}
  (subclasses override to add custom headers)

src/providers/base/local-base.ts
  Extends OpenAIBaseProvider.
  No API key required (empty string accepted).
  fetchModels(): hits /v1/models, returns model list.
  supportsToolUse: heuristic — true if model name contains
  "instruct", "tool", "coder", or "chat"; false otherwise.

── Step 2: Implement all new providers ─────────────────────────

All OpenAI-compatible (extend openai-base.ts):

src/providers/mistral.ts
  baseUrl: https://api.mistral.ai/v1/chat/completions
  models: mistral-large-latest, mistral-small-latest,
          codestral-latest (mark as recommended for code)
  supportsToolUse: true

src/providers/deepseek.ts
  baseUrl: https://api.deepseek.com/v1/chat/completions
  models: deepseek-chat, deepseek-coder
  supportsToolUse: true

src/providers/moonshot.ts
  baseUrl: https://api.moonshot.cn/v1/chat/completions
  models: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k
  supportsToolUse: true

src/providers/kimi.ts
  Thin alias of moonshot.ts
  id: 'kimi', name: 'Kimi (Moonshot AI)'
  Same endpoint, same models
  (Kimi is Moonshot's consumer brand — same API)

src/providers/qwen.ts
  baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1
  models: qwen-max, qwen-plus, qwen-turbo, qwen-coder-plus
  supportsToolUse: true

src/providers/groq.ts
  baseUrl: https://api.groq.com/openai/v1
  models: llama-3.3-70b-versatile, llama-3.1-8b-instant,
          mixtral-8x7b-32768, gemma2-9b-it,
          llama3-groq-70b-8192-tool-use-preview
  supportsToolUse: true
  freetier: true
  signupUrl: https://console.groq.com

src/providers/openrouter.ts
  baseUrl: https://openrouter.ai/api/v1
  extraHeaders: { HTTP-Referer: https://codin.my, X-Title: Codin }
  fetchAvailableModels(): hits /v1/models, sorts free models first,
    appends " (free)" to model names where pricing.prompt === "0"
  freetier: true
  signupUrl: https://openrouter.ai

MiniMax (non-OpenAI format — implement directly):
src/providers/minimax.ts
  baseUrl: https://api.minimax.chat/v1/text/chatcompletion_v2
  Response format: choices[0].messages array (not choices[0].message)
  models: abab6.5s-chat, abab5.5-chat
  supportsToolUse: true

Local providers (extend local-base.ts):

src/providers/lmstudio.ts
  Default baseUrl: http://localhost:1234
  Models: fetched from /v1/models
  Auth: none
  name: 'LM Studio (local)'

src/providers/jan.ts
  Default baseUrl: http://localhost:1337
  Models: fetched from /v1/models
  Auth: none
  name: 'Jan.ai (local)'

Universal adapter:
src/providers/openai-compatible.ts
  All fields user-configurable: baseUrl, apiKey, modelName
  name: 'Custom (OpenAI-compatible)'
  Useful for self-hosted models, private endpoints, future providers

── Step 3: Update provider registry ────────────────────────────

src/providers/index.ts — register all new providers:

export const ALL_PROVIDERS: ILLMProvider[] = [
  // Cloud
  new ClaudeProvider(),
  new OpenAIProvider(),
  new GeminiProvider(),
  new GroqProvider(),        // free tier ✦
  new OpenRouterProvider(),  // free models ✦
  new MistralProvider(),
  new DeepSeekProvider(),
  new KimiProvider(),
  new QwenProvider(),
  new MiniMaxProvider(),
  // Local
  new OllamaProvider(),
  new LMStudioProvider(),
  new JanProvider(),
  // Advanced
  new OpenAICompatibleProvider(),
];

── Step 4: Settings panel updates ──────────────────────────────

Update provider dropdown in webview-ui/settings.html and
src/ui/SettingsPanel.ts:

Group providers with <optgroup> labels:
  "── Cloud providers ──"
  "── Free tier available ──" (Gemini, Groq, OpenRouter)
  "── Local (always free) ──" (Ollama, LM Studio, Jan)
  "── Advanced ──" (Custom)

Add freetier badge "✦ free" next to Gemini, Groq, OpenRouter
in the dropdown and in the provider info text below it.

For local providers: show Base URL field instead of API key field.
For Custom provider: show both Base URL and free-text model input.
For OpenRouter: after key is entered, fetch model list and
  populate dropdown (with loading spinner while fetching).

── Step 5: Update package.json configuration schema ────────────

Add all new provider IDs to the enum in contributes.configuration
for the codin.provider setting.

── Step 6: Unit tests ──────────────────────────────────────────

Write tests for:

test/providers/openai-base.test.ts
  - message format conversion canonical → OpenAI wire format
  - streaming SSE chunk parsing → ChatChunk tokens
  - tool_call parsing from delta chunks
  - testConnection 200 → ok:true
  - testConnection 401 → ok:false with error message

test/providers/groq.test.ts
  - correct baseUrl
  - freetier: true
  - supportsToolUse: true

test/providers/openrouter.test.ts
  - extra headers include HTTP-Referer and X-Title
  - free model detection (pricing.prompt === "0")
  - free models sorted before paid models

test/providers/minimax.test.ts
  - parses choices[0].messages array format correctly
  - does not crash on empty messages array

test/providers/lmstudio.test.ts
  - model list fetched from /v1/models endpoint
  - testConnection hits base URL not api.openai.com

test/providers/openai-compatible.test.ts
  - custom baseUrl passed through to fetch
  - works with empty apiKey (local server)

── Verify ──────────────────────────────────────────────────────

npm test → all green
npm run lint → zero errors
F5 → Settings → provider dropdown shows all providers grouped
     correctly with ✦ free badges
   → switch to Groq → enter key → Test connection → works
   → switch to Ollama → base URL shown instead of key field
   → switch to Custom → both base URL and model name shown
```

**Commit:** `git commit -m "feat: extended provider support (Groq, OpenRouter, Mistral, DeepSeek, Kimi, Qwen, MiniMax, LM Studio, Jan, Custom)"`

---

## PROMPT O — Onboarding wizard

```
Read .agent/AGENT.md, docs/pages/onboarding.md,
docs/components/llm-providers.md,
and docs/components/groq-openrouter-providers.md before starting.

Implement the Codin onboarding wizard as fully specified in
docs/pages/onboarding.md. Read that file completely before
writing any code.

Key implementation points:

1. src/ui/OnboardingPanel.ts — webview panel, same pattern as
   ChatPanel.ts. Three screens as specced.

2. Screen 1: radio path selection, Next disabled until chosen.

3. Screen 2a (Local): ping Ollama on load, populate model
   dropdown from /api/tags, Install Ollama opens browser,
   Check again re-pings.

4. Screen 2b (Free cloud): Open Google AI Studio button,
   API key input, Test connection, secondary links for
   Groq and OpenRouter with their signup URLs.

5. Screen 2c (Have key): full provider dropdown (all providers
   from registry), conditional fields (base URL vs API key
   based on provider type), model dropdown per provider.

6. Screen 3: connected provider summary, 3 example tasks,
   capability checklist, Start coding button.

7. Trigger in extension.ts:
   Show wizard if onboardingComplete is false OR no API key set.
   Register codin.setupWizard command for re-triggering.

8. Add hasAnyApiKey() to SettingsManager.

9. All data-testid attributes from docs/pages/onboarding.md table.

10. README.md: add "Get started free" table after features list.

11. Unit tests in test/ui/onboarding.test.ts:
    detectOllama success, failure, timeout cases.
    setup_complete saves key to SecretStorage.
    hasAnyApiKey true/false cases.

12. E2E test in test/e2e/specs/onboarding.spec.ts:
    fresh install shows wizard, local path shows install button,
    completing setup opens chat panel.

Verify:
  npm test → all green
  F5 → no API keys set → wizard appears automatically
  All three paths flow correctly to Screen 3
  "Codin: Setup Wizard" command re-opens wizard
  README "Get started free" table renders on GitHub
```

**Commit:** `git commit -m "feat: onboarding wizard with free tier paths"`

---

## PROMPT G — Good first issues

```
Read docs/overview.md, docs/architecture.md,
docs/components/tools.md, docs/pages/chat-panel.md,
docs/pages/sidebar-view.md, docs/components/llm-providers.md,
and docs/testing.md before starting.

Write GitHub issue bodies for these 9 good first issues.
Each issue body must have these sections:
  ## Summary
  ## Why it matters
  ## Relevant spec file(s)
  ## Acceptance criteria (checkbox list)
  ## Files likely to change
  ## Estimated complexity: S / M / L

Issue 1: Add Google Gemini provider improvements
  Gemini was scaffolded in Phase 1. This issue improves it:
  add gemini-2.0-flash and gemini-1.5-pro to model list,
  verify tool use works end-to-end with a unit test,
  ensure streaming handles Gemini's SSE format correctly.
  Relevant: docs/components/llm-providers.md
  Complexity: M

Issue 2: Tool — search_files (find files by name/glob)
  New tool: simpler sibling to grep_codebase.
  Searches file names not contents.
  Params: { pattern: string, path?: string }
  Uses vscode.workspace.findFiles internally.
  requiresConfirmation: false.
  Needs unit test and entry in docs/components/tools.md.
  Relevant: docs/components/tools.md
  Complexity: S

Issue 3: Tool — get_diagnostics (language server errors)
  New tool: calls vscode.languages.getDiagnostics() and
  returns all errors and warnings as a formatted string.
  The agent can see TypeScript errors without running tsc.
  requiresConfirmation: false.
  Output format: "src/auth.ts:12 error TS2345: ..."
  Relevant: docs/components/tools.md
  Complexity: S

Issue 4: Settings — keyboard shortcut for dry-run toggle
  Command codin.toggleDryRun is already registered.
  Add a default keybinding in package.json:
    key: ctrl+shift+d / mac: cmd+shift+d
  One change in package.json contributes.keybindings.
  Relevant: docs/pages/settings.md
  Complexity: S (perfect first issue)

Issue 5: Chat panel — ↑ arrow recalls previous message
  Already specced in docs/pages/chat-panel.md keyboard shortcuts.
  Not yet implemented in webview-ui/main.ts.
  Store sent messages in an array, ↑ cycles back, ↓ cycles forward.
  Relevant: docs/pages/chat-panel.md
  Complexity: S

Issue 6: Chat panel — compact message mode
  Already specced in docs/pages/settings.md UI preferences.
  When codin.compactMessages is true, reduce padding on
  message bubbles and hide timestamps.
  Two parts: settings toggle + CSS class on message list.
  Relevant: docs/pages/settings.md, docs/components/webview-ui.md
  Complexity: S

Issue 7: Unit tests for delete_file tool
  test/tools/delete-file.test.ts is missing.
  Required tests per docs/testing.md:
  - happy path: file moved to VS Code trash
  - path traversal rejected
  - path outside workspace rejected
  - confirmation cancel: file not deleted
  Relevant: docs/testing.md, docs/components/tools.md
  Complexity: S (great for learning the test patterns)

Issue 8: Sidebar — collapse History section by default
  SidebarProvider.ts currently expands History on load.
  Change History root item from:
    TreeItemCollapsibleState.Expanded
  to:
    TreeItemCollapsibleState.Collapsed
  One line change. Verify History still expands on click.
  Relevant: docs/pages/sidebar-view.md
  Complexity: S (ideal true first issue)

Issue 9: Docs — Mermaid architecture diagram
  docs/architecture.md has an ASCII diagram.
  Add a Mermaid flowchart (```mermaid block) showing the same
  layers: UI → Extension Host → Agent Core → Tools →
  LLM Provider → External Services.
  Renders automatically on GitHub.
  No code changes — docs only.
  Relevant: docs/architecture.md
  Complexity: S

Save as:
  docs/good-first-issues/01-gemini-improvements.md
  docs/good-first-issues/02-search-files-tool.md
  docs/good-first-issues/03-get-diagnostics-tool.md
  docs/good-first-issues/04-dry-run-keybinding.md
  docs/good-first-issues/05-message-recall.md
  docs/good-first-issues/06-compact-mode.md
  docs/good-first-issues/07-delete-file-tests.md
  docs/good-first-issues/08-sidebar-collapse.md
  docs/good-first-issues/09-mermaid-diagram.md
```

---

## PROMPT 6 — Phase 6 launch

```
Read .agent/AGENT.md, docs/overview.md, docs/decisions.md,
and docs/phases/phase-5-6-polish-launch.md (Phase 6 section).

Phases 0-5 are complete. Renaming, providers, and onboarding
are done. Implement Phase 6 launch preparation:

1. README.md — complete rewrite:
   - Badge row: CI status, Marketplace version, License (MIT)
   - Tagline: "Your AI coding agent, powered by your own subscription"
   - "Get started free" table (already in docs/pages/onboarding.md)
   - Features list (agent loop, 10 tools, 14 providers, etc.)
   - Quick start: install → wizard → first task
   - Supported providers table (all 14, mark free ones with ✦)
   - How it works (3 steps: connect provider, describe task, approve edits)
   - Configuration reference (link to docs/pages/settings.md)
   - Contributing section (link to CONTRIBUTING.md)
   - License (MIT)

2. CONTRIBUTING.md:
   - Prerequisites: Node 18+, VS Code 1.85+, git
   - Dev setup: clone → npm install → F5
   - Project structure (link to docs/ for each area)
   - How to add a new LLM provider (step by step, 5 steps)
   - How to add a new tool (step by step, 4 steps)
   - Testing guide: npm test, npm run test:integration,
     mock LLM server for E2E
   - PR process: one feature per PR, update relevant spec file,
     tests required, lint must pass

3. GitHub templates:
   .github/ISSUE_TEMPLATE/bug_report.yml
     Fields: VS Code version, Codin version, provider used,
     steps to reproduce, expected vs actual behaviour,
     relevant logs (from Output panel → Codin)

   .github/ISSUE_TEMPLATE/feature_request.yml
     Fields: problem description, proposed solution,
     which spec file would need updating, alternatives considered

   .github/pull_request_template.md
     Checklist: spec file updated, tests written,
     npm test passes, npm run lint passes,
     manual smoke test done, breaking changes noted

4. Release workflow (.github/workflows/release.yml):
   Trigger: push tag v*.*.*
   Steps:
     - actions/checkout@v4
     - actions/setup-node@v4 (node 20)
     - npm ci
     - npm run build
     - npx @vscode/vsce package
     - npx @vscode/vsce publish (uses secret VSCE_PAT)
     - Create GitHub Release with the .vsix as attachment

5. CHANGELOG.md:
   ## [0.1.0] — initial release
   ### Added
   - List every major feature from phases 0-5 + onboarding
   - List all 14 supported providers
   - List all 10 built-in tools

6. Extension icon:
   Create a simple SVG icon at images/icon.svg:
   - 512x512 viewBox
   - Dark background (#1e1e2e)
   - White/accent robot or terminal symbol
   - Reference it in package.json as "icon": "images/icon.png"
   - Note: SVG needs converting to PNG for Marketplace —
     add a comment in icon.svg: "Convert to PNG before publishing:
     npx sharp-cli -i images/icon.svg -o images/icon.png"

7. Package and verify:
   npm install -g @vscode/vsce
   vsce package
   → .vsix file created with no errors
   → file size reasonable (under 5 MB)
   code --install-extension codin-0.1.0.vsix
   → installs cleanly from .vsix
   → F5 replacement: launch from installed extension
   → wizard appears on first run
   → all commands available

Verify:
  vsce package → success, no warnings
  README renders correctly in VS Code Markdown preview
  CHANGELOG.md has correct format (keepachangelog.com)
  All GitHub template files present and valid YAML
```

**Commit:** `git commit -m "feat: launch preparation — README, CONTRIBUTING, release workflow"`
**Tag:** `git tag v0.1.0 && git push origin v0.1.0`

---

## PROMPT L — Landing page (codin.my)

Run this after Phase 6. Creates a static landing page for codin.my.

```
Read docs/overview.md, docs/pages/onboarding.md,
and docs/decisions.md before starting.

Create a static landing page for codin.my.
Save it as landing/index.html (single self-contained file,
all CSS and JS inline — no build step needed).

Requirements:

Design:
- Dark theme matching VS Code dark+ colours
- Clean, minimal — developer audience, no marketing fluff
- Fully responsive (mobile + desktop)
- No external dependencies except a Google Font (JetBrains Mono
  for code snippets, loaded from fonts.googleapis.com)

Sections (in order):

1. Hero
   - "Codin" wordmark (large, monospace font)
   - Tagline: "Your AI coding agent, powered by your own subscription"
   - Two buttons: [Install for VS Code] [View on GitHub]
   - Install button links to Marketplace listing URL
   - GitHub button links to GitHub repo URL
   - Subtext: "Free forever · Open source · Your key, your data"

2. Get started free (three cards)
   Card 1 — Local (Ollama)
     Icon: 🖥
     Title: "Run locally — 100% free"
     Body: "No account. No key. No cost. Runs on your machine."
     Link: ollama.com/download

   Card 2 — Free API (Gemini / Groq)
     Icon: ✦
     Title: "Free cloud API"
     Body: "Gemini and Groq offer free API tiers. No credit card."
     Links: aistudio.google.com, console.groq.com

   Card 3 — Own key
     Icon: 🔑
     Title: "Bring your own key"
     Body: "Claude, OpenAI, DeepSeek, and 11 more providers."

3. Features (icon + text grid, 6 items)
   - Plans multi-step tasks automatically
   - Reads, writes, and diffs files (with your approval)
   - Runs terminal commands (with your approval)
   - Searches your entire codebase
   - Works with 14 LLM providers
   - Full conversation history per project

4. Providers (logos/names in a horizontal scroll row)
   Text-only list — no logo images (avoid licensing issues):
   Claude · OpenAI · Gemini · Groq · Mistral · DeepSeek ·
   Kimi · Qwen · OpenRouter · Ollama · LM Studio · Jan ·
   MiniMax · Custom

5. Footer
   MIT License · GitHub · VS Code Marketplace
   "Codin is not affiliated with Anthropic, OpenAI, or Google."

Deployment note (add as HTML comment at top of file):
  Deploy to GitHub Pages from the landing/ folder.
  Point codin.my DNS to GitHub Pages.
  No server required — fully static.

Save as: landing/index.html
```

**Commit:** `git commit -m "feat: codin.my landing page"`

---

## Final state after all prompts

```
✅ Phase 0    Scaffold
✅ Phase 1    LLM connection
✅ Phase 2    Code context
✅ Phase 3    Edit tools & agent loop
✅ Phase 4    Planning & multi-step
✅ Phase 5    Polish & test automation
✅ Prompt R   Renamed to Codin
✅ Prompt P   14 providers (Groq, OpenRouter, Mistral, etc.)
✅ Prompt O   Onboarding wizard (3 paths: local/free/own key)
✅ Prompt G   9 good first issue bodies generated
✅ Prompt 6   Phase 6 — launch (README, release workflow, .vsix)
✅ Prompt L   codin.my landing page
─────────────────────────────────────────────────────
🚀 File 9 issues on GitHub
🚀 Push v0.1.0 tag → CI auto-publishes to Marketplace
🚀 Deploy landing/index.html to GitHub Pages → codin.my
```

---

## Recovery prompt (works at any stage)

```
Stop. Read .agent/AGENT.md and [relevant spec file].
You have diverged from the spec at [describe the issue].
Revert the divergence and re-implement to match the spec exactly.
Do not add anything not in the spec.
Do not remove anything the spec requires.
Run npm test and npm run lint before finishing.
```

---

## Useful one-liners to check state any time

```bash
# Is the extension correctly named?
grep -r "Codin" package.json

# How many providers are registered?
grep "Provider()" src/providers/index.ts | wc -l

# Are all commands registered?
grep "codin\." package.json | grep "command"

# Test everything
npm run test:all

# Package without publishing
vsce package --no-dependencies
```
