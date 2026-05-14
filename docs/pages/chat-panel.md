# Page: Chat panel

## Purpose

The primary interface for interacting with the agent. Lives in a VS Code webview panel (tab). Users type tasks, see streamed responses, approve tool calls, and review results here.

## How to open

- Command palette: `Agent: Open Chat`
- Keyboard shortcut: `Ctrl+Shift+A` (Win/Linux), `Cmd+Shift+A` (Mac)
- Click the robot icon in the activity bar

## Layout

```
┌─────────────────────────────────────────────────────┐
│  [Provider: Claude ▾]  [Model: claude-sonnet ▾]  ⚙  │  ← top bar
├─────────────────────────────────────────────────────┤
│                                                     │
│  [User message bubble]                              │
│                                                     │
│     [Assistant response — streamed token by token]  │
│                                                     │
│  ┌─ Tool call card ──────────────────────────────┐  │
│  │  🔧 write_file  src/auth.ts                   │  │
│  │  [Show diff]  [Approve ✓]  [Reject ✗]         │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [Next assistant message after tool result]         │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [@file] [@symbol] [@selection]           [tokens]  │  ← context pills
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐    │
│  │  Type a task...                             │    │  ← input
│  └─────────────────────────────────────────────┘    │
│  [New chat]  [Stop ■]                    [Send →]   │
└─────────────────────────────────────────────────────┘
```

## Components

### Top bar
- Provider dropdown — switches active LLM provider
- Model dropdown — switches model within provider (e.g. sonnet vs opus)
- Settings gear — opens the settings page

### Message list
- Scrollable, newest message at bottom
- User messages: right-aligned, accent background
- Assistant messages: left-aligned, markdown rendered (code blocks with syntax highlighting)
- Streaming: tokens appear one by one; a blinking cursor shows while in-flight
- Tool call cards: appear inline when the agent invokes a tool (see below)

### Tool call card
Shown whenever the agent wants to use a tool that requires confirmation:
- Tool name and icon
- Parameters summary (e.g. filename, command string)
- "Show diff" button for file edits — opens VS Code's native diff viewer
- "Approve" button — executes the tool and continues the loop
- "Reject" button — cancels this tool call; agent re-plans
- Non-destructive tools (read_file, grep) auto-execute without a card

### Context pills
Shown above the input. Each pill represents context injected into the next message:
- `@file path/to/file.ts` — attaches full file content
- `@symbol MyClass` — attaches symbol definition from language server
- `@selection` — attaches the current editor selection
- Click a pill to remove it
- Type `@` in the input to trigger a picker

### Input area
- Multi-line textarea (grows up to 6 lines, then scrolls)
- `Enter` = send, `Shift+Enter` = newline
- Placeholder: `Type a task or ask a question...`
- Token counter (right side of context pills row) — shows approximate tokens in current context

### Bottom actions
- `New chat` — clears history, starts fresh (with confirmation if mid-task)
- `Stop` — interrupts an in-progress agent run after the current tool call completes
- `Send` — submits the message

## States

| State | UI behaviour |
|---|---|
| Idle | Input enabled, send button active |
| Streaming | Input disabled, stop button active, tokens appearing |
| Waiting for confirm | Input disabled, stop active, tool card shown |
| Error | Red error banner with message + retry button |

## Keyboard shortcuts (within panel)

| Key | Action |
|---|---|
| `Ctrl+L` | Clear chat |
| `Escape` | Stop current run |
| `↑` | Recall previous message in input |

## Persistence

- Conversation history serialized to `.agent-history.json` in workspace root
- Loaded on panel open; cleared on "New chat"
- Max 50 messages stored; older messages pruned (but summarized into system context)
