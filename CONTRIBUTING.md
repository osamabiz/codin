# Contributing to AI Coding Agent

Thanks for your interest in contributing! This guide walks you from a fresh clone to a merged pull request.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Dev setup](#dev-setup)
3. [Project structure](#project-structure)
4. [Running and debugging](#running-and-debugging)
5. [How to add a new LLM provider](#how-to-add-a-new-llm-provider)
6. [How to add a new tool](#how-to-add-a-new-tool)
7. [Testing guide](#testing-guide)
8. [PR process](#pr-process)
9. [Coding rules](#coding-rules)

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| [Node.js](https://nodejs.org/) | 18 or later | Extension runtime and build toolchain |
| [VS Code](https://code.visualstudio.com/) | 1.85 or later | Extension host and debugging |
| Git | any recent | Version control |
| An LLM API key | any supported provider | For manual testing (unit tests don't need one) |

---

## Dev setup

```bash
# Clone the repo
git clone https://github.com/open-source/vscode-agent.git
cd vscode-agent

# Install dependencies
npm install

# Check everything is green before you start
npm run lint
npm test
```

---

## Running and debugging

Press **F5** in VS Code to open an **Extension Development Host** — a fresh VS Code window with your local build of the extension installed.

Useful keyboard shortcuts in the dev host:
- `Ctrl+Shift+Alt+A` — open the chat panel
- `Ctrl+Shift+P` → **Agent: Open Settings** — configure your API key

To recompile after changes without restarting:
```bash
npm run watch   # incremental TypeScript compile in watch mode
```

Then in the Extension Development Host press `Ctrl+Shift+P` → **Developer: Reload Window**.

---

## Project structure

```
.agent/
└── AGENT.md                 ← instructions for AI coding agents — read this first
docs/
├── overview.md              ← what the product is and why
├── architecture.md          ← system diagram and data flow
├── pages/                   ← UI page specs (chat-panel, settings, …)
├── components/              ← component specs (agent-core, tools, llm-providers, …)
└── phases/                  ← build phase plans (phases 0–6)
src/
├── extension.ts             ← VS Code entry point (activate / deactivate)
├── agent/
│   ├── agent.ts             ← Agent class: run, stop, approveTool, rejectTool
│   ├── loop.ts              ← async generator driving the tool-use loop
│   ├── planner.ts           ← LLM-based task decomposition into steps
│   ├── memory.ts            ← conversation history + context-window summarization
│   └── types.ts             ← AgentEvent, AgentContext, AgentOptions, PlanStep
├── providers/
│   ├── types.ts             ← ILLMProvider interface
│   ├── index.ts             ← provider registry (getProvider, configureProvider)
│   ├── claude.ts            ← Anthropic Claude adapter
│   ├── openai.ts            ← OpenAI adapter
│   └── ollama.ts            ← Ollama (local) adapter
├── tools/
│   ├── types.ts             ← ITool interface
│   ├── index.ts             ← allTools export
│   ├── read-file.ts
│   ├── write-file.ts
│   ├── create-file.ts
│   ├── delete-file.ts
│   ├── list-files.ts
│   ├── grep-codebase.ts
│   ├── run-command.ts
│   ├── git-status.ts
│   ├── git-commit.ts
│   └── open-browser.ts
├── ui/
│   ├── ChatPanel.ts         ← main webview panel (agent events → DOM messages)
│   ├── SettingsPanel.ts     ← settings webview
│   ├── SidebarProvider.ts   ← activity bar tree view (plan steps, history)
│   ├── StatusBar.ts         ← status bar item (Idle / Running / Waiting / Error)
│   └── OnboardingPanel.ts   ← first-run wizard
└── utils/
    ├── logger.ts
    ├── SettingsManager.ts   ← reads config + SecretStorage
    ├── context-builder.ts   ← builds messages from @file/@selection/@symbol items
    └── token-counter.ts     ← approximate token counting per model
webview-ui/
├── index.html               ← served from ChatPanel._getHtml() — not a standalone file
├── main.ts                  ← stub; webview JS is inlined in ChatPanel._getHtml()
└── style.css
test/
├── __mocks__/vscode.ts      ← hand-written VS Code API mock for Vitest
├── agent/                   ← unit tests for agent loop, planner, memory
├── providers/               ← unit tests for each provider adapter
├── tools/                   ← unit tests for each tool
├── ui/                      ← unit tests for UI components (StatusBar, …)
├── utils/                   ← unit tests for utilities
├── integration/             ← @vscode/test-electron integration tests
├── e2e/                     ← Playwright E2E tests + mock LLM server
└── fixtures/workspace/      ← test workspace for integration and E2E tests
```

The `docs/` directory is the **source of truth** for every component. Read the relevant spec before writing or reviewing code.

---

## How to add a new LLM provider

Say you want to add support for Mistral AI.

### 1. Implement `ILLMProvider`

Create `src/providers/mistral.ts`:

```typescript
import type { ILLMProvider, ChatOptions, ChatChunk } from './types';

export class MistralProvider implements ILLMProvider {
  readonly supportsToolUse = true;

  constructor(private _apiKey: string) {}

  async *chat(messages: Message[], options: ChatOptions): AsyncGenerator<ChatChunk> {
    // Convert canonical messages → Mistral wire format
    // Stream the response and yield chunks
    // Map tool_use chunks to { type: 'tool_call', call: ToolCall }
    // Map text chunks to { type: 'token', content: string }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    // Send a minimal ping message and return { ok: true } or { ok: false, error }
  }
}
```

### 2. Register in `src/providers/index.ts`

Add it to `PROVIDERS` and the `configure` / `get` switch statements.

### 3. Add to `package.json`

In `contributes.configuration.properties.agentPlugin.provider.enum`, add `"mistral"` and a description.

### 4. Document it

Add a row to the provider table in `docs/components/llm-providers.md`.

### 5. Write tests

Create `test/providers/mistral.test.ts` covering:
- Message format conversion (canonical → Mistral wire format)
- Streaming chunk parsing (text token + tool_call)
- `testConnection()` success and failure (401, network error)

---

## How to add a new tool

Say you want to add `search_web`.

### 1. Implement `ITool`

Create `src/tools/search-web.ts`:

```typescript
import type { ITool, ToolContext, ToolResult } from './types';

export const searchWeb: ITool = {
  name: 'search_web',
  description: 'Search the web and return a summary of results.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query.' },
    },
    required: ['query'],
  },
  requiresConfirmation: false,

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { query } = input as { query: string };
    // Implementation here
    return { ok: true, output: '...' };
  },
};
```

> **Security note:** Tools must not make network requests. `search_web` would be an exception requiring explicit justification and a `requiresConfirmation: true` flag — see `.agent/AGENT.md` rule 8.

### 2. Export from `src/tools/index.ts`

Add `searchWeb` to the `allTools` array.

### 3. Document it

Add a row to the tool table in `docs/components/tools.md`.

### 4. Write tests

Create `test/tools/search-web.test.ts` covering at minimum:
- **Happy path** — correct input produces expected output
- **Input validation** — missing required fields handled gracefully
- **Error handling** — network failure returns `{ ok: false, error: ... }`

---

## Testing guide

The project has three test tiers. Run them in order:

```bash
# Tier 1 — Unit tests (Vitest, ~3 seconds, no VS Code needed)
npm test
npm run test:coverage    # with coverage report

# Tier 2 — Integration tests (@vscode/test-electron, ~30 seconds)
npm run build            # must build first
npm run test:integration

# Tier 3 — E2E tests (Playwright, ~2 minutes, main branch only in CI)
npm run build
node test/e2e/mock-llm-server/server.js &   # start mock server
npm run test:e2e

# All tiers at once
npm run test:all
```

### Writing unit tests

- Unit tests live alongside the source in `test/` and use Vitest.
- The VS Code API is mocked via `test/__mocks__/vscode.ts` — do not import the real `vscode` module.
- Coverage thresholds (enforced in CI): lines 80%, functions 80%, branches 75%.

### Writing integration tests

- Integration tests run inside a real headless VS Code via `@vscode/test-electron`.
- They use Mocha (not Vitest) and live in `test/integration/suite/`.
- Use `vscode.workspace.workspaceFolders![0].uri.fsPath` for the workspace root.

### Writing E2E tests

- E2E tests use Playwright and drive a real VS Code window.
- The mock LLM server at `test/e2e/mock-llm-server/server.ts` returns scripted responses — add a JSON script in `test/e2e/mock-llm-server/scripts/` for each new scenario.
- Use the `ChatPanel` and `SidebarPanel` page objects from `test/e2e/helpers/`.
- All webview elements that E2E tests interact with must have `data-testid` attributes — see the full list in `docs/testing-automation.md`.

---

## PR process

1. **One concern per PR** — a bug fix, a new provider, a new tool, a refactor. Mixed PRs are harder to review.
2. **Spec first** — if your change adds or modifies behaviour described in `docs/`, update the spec in the same PR.
3. **Tests required** — new tools need tool tests, new providers need provider tests. No exceptions.
4. **All checks must pass** — `npm run lint`, `npm test` (unit), `npm run test:integration`.
5. **Keep the diff readable** — avoid unrelated whitespace or style changes in the same commit.
6. **PR title format:** `<type>: <short description>` — e.g. `feat: add Mistral provider`, `fix: path traversal in grep_codebase`, `docs: update settings spec`.

---

## Coding rules

The full rules are in `.agent/AGENT.md`. Key points:

| Rule | Why |
|---|---|
| TypeScript strict mode — no `any`, explicit return types | Prevents silent runtime bugs |
| Path traversal protection on every file tool | Security: users should not be able to escape the workspace |
| API keys in `SecretStorage` only | Keys must never be logged or synced |
| No React in the webview | Keeps the bundle under 50 KB, no dependency churn |
| VS Code CSS variables (`var(--vscode-*)`) — no hardcoded colours | Works in all themes, light and dark |
| `requiresConfirmation: true` for any write or execute tool | User stays in control |
| Check `stopped` flag between every tool call in the loop | Stop command must take effect within one tool boundary |
