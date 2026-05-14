# AGENT.md — Instructions for AI coding agents

> This file is the first thing any coding agent (Claude Code, Codex, Kiro, etc.)
> should read when working on this project. It tells you what the project is,
> how it's structured, what the rules are, and how to work effectively.

---

## What is this project?

An open-source VS Code extension that gives users a fully autonomous AI coding
agent powered by their own LLM subscription (Claude, OpenAI, Gemini, or local
Ollama). Free, MIT-licensed, no backend required.

Read `docs/overview.md` for the full product description.

---

## Read these docs before writing any code

Always read the relevant spec files before starting a task. They are the
source of truth. Do not invent architecture or component designs that
contradict them.

```
docs/
├── overview.md              ← what the product is and why
├── architecture.md          ← full system diagram and data flow
├── pages/
│   ├── chat-panel.md        ← main UI spec
│   ├── sidebar-view.md      ← activity bar panel spec
│   ├── settings.md          ← settings page spec
│   └── inline-diff-view.md  ← diff confirmation UX spec
├── components/
│   ├── agent-core.md        ← agent loop, planner, memory, executor
│   ├── llm-providers.md     ← provider interface + all implementations
│   ├── tools.md             ← all built-in tools spec
│   └── mcp-integration.md   ← MCP server support (Phase 6+)
└── phases/
    ├── phase-0-setup.md
    ├── phase-1-llm-connection.md
    ├── phase-2-code-context.md
    ├── phase-3-edit-tools.md
    ├── phase-4-planning.md
    └── phase-5-6-polish-launch.md
```

**Minimum reads for any task:**
1. `docs/overview.md`
2. `docs/architecture.md`
3. The specific component or page spec for what you're working on
4. The current phase spec from `docs/phases/`

---

## Project structure

```
vscode-agent/
├── .agent/
│   └── AGENT.md              ← you are here
├── docs/                     ← spec files (read before coding)
├── src/
│   ├── extension.ts          ← VS Code entry point (activate/deactivate)
│   ├── agent/                ← agent core (loop, planner, memory, executor)
│   ├── providers/            ← LLM provider adapters
│   ├── tools/                ← built-in tools
│   ├── ui/                   ← VS Code panels and views
│   └── utils/                ← shared utilities (logger, token counter, etc.)
├── webview-ui/               ← chat panel frontend (HTML/CSS/TS)
├── test/                     ← Vitest unit tests
├── .github/
│   └── workflows/            ← CI and release pipelines
├── package.json
└── tsconfig.json
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | VS Code Extension Host (Node.js) |
| Webview | Vanilla TypeScript + CSS (no React) |
| Test framework | Vitest |
| Linter | ESLint |
| Formatter | Prettier |
| CI | GitHub Actions |
| Package manager | npm |

---

## Coding rules

### General

1. **Read the spec first.** If a spec file exists for what you're building, follow it exactly. If something in the spec is unclear or contradictory, note it in a comment — don't silently diverge.

2. **TypeScript strict mode is ON.** No `any`, no `// @ts-ignore`, no implicit returns. Every function must have a return type annotation.

3. **No external runtime dependencies without a reason.** The extension bundle should be small. Before adding an npm package, ask: can this be done with VS Code's built-in APIs or a few lines of code?

4. **Accepted dependencies:**
   - `marked` — markdown rendering in webview (CDN, not bundled)
   - `vscode` — VS Code API (peer dependency, not bundled)
   - Dev deps: `vitest`, `@types/vscode`, `eslint`, `prettier`, `@vscode/test-electron`

5. **No React in the webview.** Vanilla TypeScript + DOM APIs only. Keeps the bundle under 50 KB.

### Security (non-negotiable)

6. **Path traversal protection is mandatory** on every file tool. Always:
   ```typescript
   const resolved = path.resolve(workspaceRoot, userInput);
   if (!resolved.startsWith(workspaceRoot)) {
     throw new Error('Path outside workspace is not allowed');
   }
   ```

7. **API keys go in SecretStorage only.** Never in `workspace.getConfiguration`, never logged, never sent anywhere except the configured LLM provider endpoint.

8. **No network calls from tools.** Tools interact with the local filesystem, terminal, and git only. Network goes through LLM providers exclusively.

9. **Blocked commands list is checked before every `run_command` execution.**

### File tools

10. `write_file` and `create_file` must always emit `waiting_for_approval` and wait for user confirmation before writing. There is no setting that bypasses this for write operations.

11. `delete_file` always requires confirmation. It uses VS Code trash (recoverable), never `fs.unlinkSync` directly.

12. `run_command` has a 30-second timeout enforced with `AbortController`.

### Agent loop

13. The agent loop (`loop.ts`) must check the `stopped` flag between every tool call. A `stop()` call must take effect within one tool-call boundary.

14. When a tool fails, inject the error into context with the `[TOOL FAILURE]` prefix and let the LLM re-plan. Do not crash the loop.

15. When `maxSteps` is exceeded, pause and emit `waiting_for_approval` — do not silently stop.

### UI / Webview

16. The webview communicates with the extension host only via `postMessage` / `onDidReceiveMessage`. No shared state, no global variables.

17. All user-visible strings must work without any external font or icon CDN. Use VS Code's built-in codicons (`$(robot)`, `$(check)`, etc.) for icons.

18. The webview must render correctly in both light and dark VS Code themes. Use CSS variables from the VS Code theme (`var(--vscode-editor-background)`, etc.) — never hardcoded hex colours.

### Testing

19. Every new tool must have a unit test covering:
    - Happy path
    - Path traversal rejection
    - Tool failure handling

20. Every new provider must have a unit test covering:
    - Message format conversion (canonical → wire format)
    - Streaming chunk parsing
    - `testConnection()` success and failure

21. Run `npm test` before considering any task done.

---

## Common patterns

### Adding a new tool

1. Create `src/tools/my-tool.ts` implementing `ITool`
2. Add it to `src/tools/index.ts` exports
3. Document it in `docs/components/tools.md`
4. Write tests in `test/tools/my-tool.test.ts`

### Adding a new LLM provider

1. Create `src/providers/my-provider.ts` implementing `ILLMProvider`
2. Register in `src/providers/index.ts`
3. Add to provider dropdown enum in `package.json` `contributes.configuration`
4. Document in `docs/components/llm-providers.md`
5. Write tests in `test/providers/my-provider.test.ts`

### Posting an event from agent to webview

```typescript
// In extension.ts (agent event handler):
agent.run(task, context).on('token', (event) => {
  panel.webview.postMessage({ type: 'token', content: event.content });
});

// In webview-ui/main.ts:
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'token') appendToken(msg.content);
});
```

---

## What NOT to do

- Do not add a backend server, database, or any hosted component
- Do not collect or transmit user data anywhere except the configured LLM endpoint
- Do not use `eval()` or `new Function()` in the webview
- Do not use `shell: true` in child_process calls
- Do not write files outside the workspace root
- Do not store API keys in plain configuration
- Do not add React, Vue, or any SPA framework to the webview
- Do not diverge from the spec without noting why in a comment

---

## Current phase

Check `docs/phases/` for the current build phase. Always implement only what
the current phase specifies. Features from later phases should be noted as
`// TODO(phase-N): description` comments, not implemented early.

---

## How to run the project locally

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint
npm run lint

# Launch extension in development
# Press F5 in VS Code (opens Extension Development Host)

# Build for packaging
npm run build
```

---

## Getting help

If a spec is ambiguous or incomplete, make the most reasonable assumption,
implement it, and leave a comment:

```typescript
// SPEC AMBIGUITY: docs/components/agent-core.md doesn't specify what happens
// when the planner returns an empty steps array. Treating it as a direct
// response (no planning needed) and falling through to single-step execution.
```

Do not silently make assumptions that affect security, data handling, or
user-facing behaviour.
