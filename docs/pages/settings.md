# Page: Settings

## Purpose

Lets users configure their LLM provider, API keys, agent behaviour, and safety preferences. Accessible from the chat panel top bar or VS Code's native Settings UI.

## How to open

- Command palette: `Agent: Open Settings`
- Gear icon in the chat panel top bar
- VS Code Settings → search "agent"

## Sections

### 1. LLM provider

```
Provider         [Claude (Anthropic)     ▾]

API Key          [••••••••••••••••••••] [Show] [Test connection]
                 Stored securely in VS Code SecretStorage

Model            [claude-sonnet-4        ▾]
Max tokens       [4096          ]
Temperature      [0.2           ]  (0 = deterministic, 1 = creative)

[ ] Use custom base URL
    Base URL     [https://api.anthropic.com]
```

**Supported providers:**
- Claude (Anthropic) — `api.anthropic.com`
- OpenAI — `api.openai.com`
- Azure OpenAI — custom base URL + deployment name
- Google Gemini — `generativelanguage.googleapis.com`
- Ollama (local) — `http://localhost:11434` (no key required)
- Any OpenAI-compatible API — custom base URL

**"Test connection" button:** sends a minimal ping message to the provider and shows success/failure inline.

---

### 2. Agent behaviour

```
[ ] Auto-approve read-only tools (read_file, grep, git_status)
    Skips the confirmation card for non-destructive operations.

[ ] Auto-commit before destructive edits
    Creates a git commit with message "agent: checkpoint before edit"
    before any write_file or delete_file operation.

Max steps per task     [25    ]
    Agent stops and asks for confirmation if it exceeds this.

Max retries on error   [3     ]
    How many times the agent re-plans after a tool failure.

[ ] Show token usage after each message
```

---

### 3. Context & memory

```
[ ] Include git status in every prompt
[ ] Include open editor tabs in context
[ ] Include active file automatically

Max context files      [10    ]
    Maximum number of @file attachments per message.

[ ] Persist conversation history across sessions
    Saves to .agent-history.json in workspace root.

[ ] Add .agent-history.json to .gitignore automatically
```

---

### 4. Safety

```
[ ] Require confirmation for ALL tool calls (override auto-approve)

Blocked commands
    Commands matching these patterns will be refused by the agent:
    [ rm -rf /    ]  [×]
    [ sudo        ]  [×]
    [ + Add pattern ]

Allowed directories for file writes
    Agent can only write files within these paths (leave empty = whole workspace):
    [ src/         ]  [×]
    [ + Add path   ]
```

---

### 5. UI preferences

```
Theme            [Follow VS Code     ▾]
Font size        [14                 ]
Show timestamps  [ ]
Show token count [ ]
Compact messages [ ]
```

---

### 6. MCP servers (advanced)

```
Model Context Protocol servers extend the agent with custom tools.

[ + Add MCP server ]

Name        URL / command            Status
─────────────────────────────────────────────
(none configured)
```

See `docs/components/mcp-integration.md` for the MCP spec.

---

## Storage

| Setting | Storage location |
|---|---|
| API keys | `vscode.SecretStorage` |
| Provider / model choice | `workspace.getConfiguration` |
| All other preferences | `workspace.getConfiguration` |
| Conversation history | `.agent-history.json` in workspace root |

## Validation rules

- API key: must be non-empty if provider is not Ollama
- Max steps: integer 1–100
- Max retries: integer 0–10
- Temperature: float 0.0–1.0
- Custom base URL: must start with `http://` or `https://`

## VS Code native settings (package.json contributes.configuration)

All settings are also editable via VS Code's Settings UI and `settings.json` under the namespace `codin.*`, e.g.:

```json
{
  "codin.provider": "claude",
  "codin.model": "claude-sonnet-4",
  "codin.maxSteps": 25,
  "codin.autoApproveReadOnly": true
}
```
