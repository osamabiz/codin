# AI Coding Agent

[![CI](https://github.com/open-source/vscode-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/open-source/vscode-agent/actions/workflows/ci.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/open-source.vscode-agent?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=open-source.vscode-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Open-source VS Code extension that turns your existing Claude, OpenAI, or Gemini subscription into a fully autonomous coding agent — directly inside VS Code. Free forever, no backend, no telemetry.

<!-- Demo GIF — add docs/demo.gif once recorded (npx vhs demo.tape) -->

---

## Features

- **Bring your own key** — connect your existing Claude / OpenAI / Gemini API key, or run fully local with Ollama
- **Autonomous agent loop** — plans multi-step tasks, reads and edits files, runs terminal commands, and self-corrects on failure
- **Always asks before writing** — every file edit shows an inline diff; nothing is written or deleted without your approval
- **Dry-run mode** — preview the full plan without touching a single file
- **Context mentions** — attach `@file`, `@selection`, or `@symbol` to any message for precise context
- **Status bar** — glanceable agent state (Idle / Running / Waiting / Error) in the VS Code status bar
- **Open source** — MIT licensed, no backend, no telemetry, self-hosted or Marketplace

---

## Quick start

### 1. Install

Search **AI Coding Agent** in the VS Code Extensions panel, or install from the Marketplace:

```
ext install open-source.vscode-agent
```

### 2. Open the chat panel

- Command palette → **Agent: Open Chat**
- Keyboard shortcut: `Ctrl+Shift+Alt+A` (Mac: `Cmd+Shift+Alt+A`)
- Click the robot icon in the Activity Bar

On first launch, the onboarding wizard guides you through entering your API key.

### 3. Set your API key

1. Open **Agent: Open Settings** (gear icon in the chat panel)
2. Choose your provider and paste your API key
3. Click **Test connection** to verify, then **Save**

Your key is stored in VS Code's [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — never logged, never synced.

### 4. Give the agent a task

Type a task in the chat panel and press `Enter`:

```
Add input validation to the login form in src/auth/LoginForm.tsx
```

The agent will plan the work, show you each file edit as a diff, and ask for approval before writing anything.

---

## Supported providers

| Provider | Key required | Recommended model | Notes |
|---|---|---|---|
| Claude (Anthropic) | Yes | `claude-sonnet-4-5` | Best tool-use support, recommended |
| OpenAI | Yes | `gpt-4o` | Full tool-use support |
| Google Gemini | Yes | `gemini-2.0-flash` | Streaming support |
| Ollama (local) | No | `llama3.2` | Runs entirely on your machine, no network |

---

## Configuration

All settings are under the `agentPlugin.*` namespace, editable via **Agent: Open Settings** or VS Code's native Settings UI.

| Setting | Default | Description |
|---|---|---|
| `agentPlugin.provider` | `claude` | Active LLM provider |
| `agentPlugin.model` | `claude-sonnet-4` | Model ID for the selected provider |
| `agentPlugin.maxSteps` | `25` | Steps before the agent pauses to ask permission |
| `agentPlugin.maxRetries` | `3` | Re-plan attempts after a tool failure |
| `agentPlugin.autoApproveReadOnly` | `false` | Skip confirmation for read-only tools |
| `agentPlugin.checkpointBeforeEdit` | `false` | Auto git-commit before any write/delete |
| `agentPlugin.temperature` | `0.7` | LLM temperature (0 = deterministic) |
| `agentPlugin.maxTokens` | `4096` | Max tokens per LLM response |
| `agentPlugin.blockedCommands` | `["rm -rf /", "sudo"]` | Shell patterns the agent may not run |
| `agentPlugin.allowedWriteDirectories` | `[]` | Restrict writes to these paths (empty = whole workspace) |

Full details: [docs/pages/settings.md](docs/pages/settings.md)

---

## Commands

| Command | Shortcut | Description |
|---|---|---|
| `Agent: Open Chat` | `Ctrl+Shift+Alt+A` | Open the chat panel |
| `Agent: New Chat` | — | Clear history and start fresh |
| `Agent: Open Settings` | — | Open the settings panel |
| `Agent: Stop` | `Escape` (in panel) | Stop the running agent task |
| `Agent: Toggle Dry Run` | — | Preview mode — no files are modified |

---

## Architecture

```
src/
├── extension.ts          ← activate / deactivate, command registration
├── agent/
│   ├── agent.ts          ← Agent class (run, stop, approve, reject)
│   ├── loop.ts           ← async generator driving the tool-use loop
│   ├── planner.ts        ← LLM-based task decomposition
│   └── memory.ts         ← conversation history + summarization
├── providers/            ← ILLMProvider implementations (Claude, OpenAI, Ollama)
├── tools/                ← ITool implementations (read_file, write_file, …)
├── ui/
│   ├── ChatPanel.ts      ← main webview panel
│   ├── SettingsPanel.ts  ← settings webview
│   ├── SidebarProvider.ts ← activity bar tree view
│   ├── StatusBar.ts      ← status bar item
│   └── OnboardingPanel.ts ← first-run wizard
└── utils/                ← logger, SettingsManager, token counter
```

Full architecture: [docs/architecture.md](docs/architecture.md)

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Dev environment setup
- How to add a new LLM provider
- How to add a new tool
- Testing guide
- PR process

For bugs and feature requests, open a [GitHub Issue](https://github.com/open-source/vscode-agent/issues).

---

## License

MIT — see [LICENSE](LICENSE).
