# Architecture

## Layer overview (top to bottom)

```
┌─────────────────────────────────────────────────────┐
│              VS Code Interface (user layer)          │
│   Chat panel · Inline diff · Command palette        │
└────────────────────┬────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────────────┐
│         Extension Host  (TypeScript / VS Code API)  │
│   Event listeners · Webview · Commands · FS access  │
└────────────────────┬────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────────────┐
│               Agent Core (orchestration)            │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ Planner  │→ │ Tool executor │→ │   Memory    │  │
│  │          │  │               │  │  / context  │  │
│  └──────────┘  └───────────────┘  └─────────────┘  │
│         ↑           Feedback loop            ↓      │
│         └──── observe → reflect → re-plan ──┘       │
└────────────────────┬────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────────────┐
│                   Built-in tools                    │
│  read_file · write_file · run_command · grep · git  │
└────────────────────┬────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────────────┐
│         LLM Provider  (user's own subscription)     │
│   Claude API · OpenAI · Gemini · local Ollama       │
└────────────────────┬────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────────────┐
│              External services (optional)           │
│      GitHub · npm/PyPI · Docs search · MCP servers  │
└─────────────────────────────────────────────────────┘
```

## Component responsibilities

### Extension host (`src/extension.ts`)
- Registers all VS Code commands, views, and providers
- Manages lifecycle: activate, deactivate, dispose
- Bridges the webview UI ↔ agent core via message passing
- Accesses the VS Code workspace, file system, and terminal APIs

### Agent core (`src/agent/`)

| File | Responsibility |
|---|---|
| `agent.ts` | Main loop: receives task → runs plan → executes → returns result |
| `planner.ts` | Sends task to LLM, parses the numbered plan output |
| `executor.ts` | Dispatches each plan step to the right tool |
| `memory.ts` | Maintains conversation history, workspace snapshot, tool results |
| `loop.ts` | Feedback loop: checks if goal is met, re-plans if not |

### LLM providers (`src/providers/`)

All providers implement a shared `ILLMProvider` interface:

```typescript
interface ILLMProvider {
  name: string;
  chat(messages: Message[], tools?: Tool[]): AsyncIterable<string>;
  supportsToolUse: boolean;
}
```

Concrete implementations:
- `claude.ts` — Anthropic API (preferred, best tool-use support)
- `openai.ts` — OpenAI / Azure OpenAI
- `gemini.ts` — Google Gemini
- `ollama.ts` — Local Ollama (no key required)

### Built-in tools (`src/tools/`)

Each tool implements `ITool`:

```typescript
interface ITool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: unknown): Promise<ToolResult>;
  requiresConfirmation: boolean;
}
```

| Tool | Description | Requires confirm? |
|---|---|---|
| `read_file` | Reads file content | No |
| `write_file` | Writes / overwrites a file | Yes (shows diff) |
| `create_file` | Creates a new file | Yes |
| `delete_file` | Deletes a file | Yes (always) |
| `run_command` | Runs a terminal command | Yes |
| `grep_codebase` | Searches for pattern across workspace | No |
| `list_files` | Lists directory contents | No |
| `git_status` | Returns current git status | No |
| `git_commit` | Creates a git commit | Yes |
| `open_browser` | Opens a URL in VS Code's simple browser | No |

### UI layer (`src/ui/` + `webview-ui/`)

See `docs/pages/` for detailed specs of each panel.

## Data flow: single agent turn

```
User types task in chat panel
  → Extension sends message to agent core
    → Planner calls LLM: "make a numbered plan"
      → LLM returns plan steps
        → Executor picks step 1
          → Dispatches to tool (e.g. read_file)
            → Tool result injected back into context
              → LLM decides: next tool OR final answer
                → Loop continues until done or user interrupts
                  → Final response streamed to chat panel
```

## State management

- **Conversation history** — stored in-memory per session, serialized to workspace `.agent-history.json` for persistence
- **Workspace snapshot** — list of files + git status, refreshed before each agent turn
- **Task state** — current plan, completed steps, pending steps — shown in sidebar task view
- **Settings** — API keys in VS Code `SecretStorage`, other preferences in `workspace.getConfiguration('codin')`

## Security model

- API keys stored exclusively in VS Code `SecretStorage` (encrypted, never in plain config)
- Terminal commands shown to user before execution; sandboxed to workspace folder
- No outbound network calls except to the configured LLM provider endpoint
- No telemetry, no analytics, no data leaving the machine (except LLM API calls)
