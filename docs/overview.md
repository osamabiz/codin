# VS Code AI Coding Agent Plugin — Project Overview

## What is this?

An open-source VS Code extension that turns any user's existing LLM subscription (Claude, OpenAI, Gemini, or local Ollama) into a fully autonomous coding agent — directly inside VS Code. No separate tool to install, no new subscription required, completely free and open-source.

## Core value proposition

- **Bring your own key** — users connect their existing Claude/OpenAI/Gemini API key or a local Ollama instance
- **Fully free** — published on VS Code Marketplace at no cost, MIT licensed
- **Agent-grade** — not just a chat assistant; it plans, edits files, runs terminal commands, and self-corrects
- **Open source** — community-driven, forkable, extensible

## Comparable products (inspiration)

| Product | What we learn from it |
|---|---|
| Claude Code | Agentic loop design, tool-use structure, system prompts |
| Kiro (Amazon) | Spec-driven development, requirement → plan → code flow |
| Codex CLI (OpenAI) | Lightweight tool invocation, sandboxed terminal execution |
| Cursor / Windsurf | Inline diff UX, multi-file context selection |
| Continue.dev | Open-source VS Code LLM integration patterns |

## What it is NOT

- Not a hosted service — no backend, no servers, no user data collection
- Not a locked-in product — users can switch LLM providers anytime
- Not a code completion tool (that's a different problem) — this is a task-level agent

## Tech stack

- **Extension language:** TypeScript
- **VS Code API version:** 1.85+
- **Webview framework:** Vanilla TS + minimal CSS (no React to keep bundle small)
- **LLM communication:** Fetch-based streaming (provider-agnostic)
- **Testing:** Vitest (unit) + VS Code Extension Test runner (integration)
- **CI:** GitHub Actions
- **Package manager:** npm
- **License:** MIT

## Repository structure

```
vscode-agent/
├── .agent/                  ← agent instruction files (this folder)
│   └── AGENT.md             ← root instructions for coding agents
├── docs/                    ← spec files (you are here)
│   ├── overview.md
│   ├── architecture.md
│   ├── pages/
│   ├── components/
│   └── phases/
├── src/
│   ├── extension.ts         ← entry point
│   ├── agent/               ← agent core logic
│   ├── providers/           ← LLM provider adapters
│   ├── tools/               ← built-in tools
│   ├── ui/                  ← webview panels and views
│   └── utils/
├── webview-ui/              ← chat panel frontend assets
├── test/
├── package.json
└── README.md
```

## Key design principles

1. **User approval before any destructive action** — the agent never deletes or overwrites without an explicit confirm step
2. **Transparency** — every tool call the agent makes is visible to the user in the task view
3. **Interruptible** — the user can pause or cancel an agent run at any step
4. **Provider-agnostic** — adding a new LLM provider should require touching only one file
5. **Lightweight** — the extension should not meaningfully slow down VS Code startup
