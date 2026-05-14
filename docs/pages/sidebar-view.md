# Page: Sidebar (Activity Bar) view

## Purpose

A persistent side panel in the VS Code activity bar. Shows the agent's current task plan, step-by-step progress, and quick access controls — without having to open the full chat panel.

## How to open

- Click the agent icon in the VS Code activity bar (left edge)
- Always visible when the extension is active

## Layout

The sidebar has three collapsible sections (VS Code TreeView):

```
AGENT                                          [+] [⚙]
├─ 📋 Current task
│   Current task title or "No active task"
│
├─ 📝 Plan
│   ✅  1. Read existing auth files
│   ✅  2. Scaffold auth module
│   🔄  3. Write login handler       ← in progress
│   ⬜  4. Write logout handler
│   ⬜  5. Add route registration
│   ⬜  6. Run tests
│
├─ 🗂 Context files
│   📄 src/auth.ts
│   📄 src/routes/index.ts
│   [+ Add file]
│
└─ 📜 History
    • Added auth module  (2 min ago)
    • Fixed null check   (10 min ago)
    • Scaffolded project (1 hr ago)
```

## Sections

### Current task
- One-line summary of the active task
- Shows "No active task" when idle
- Clicking opens the chat panel scrolled to the relevant message

### Plan
- Populated when the planner outputs a numbered list
- Each item has a status icon:
  - `✅` — completed
  - `🔄` — currently executing (animated spinner)
  - `⬜` — pending
  - `❌` — failed (with hover tooltip showing error)
- Clicking a completed step opens its tool call result in the chat panel
- The list auto-scrolls to keep the active step visible

### Context files
- Lists all files currently in the agent's active context
- `[+ Add file]` opens a quick pick to manually attach a file
- Clicking a file opens it in the editor
- Right-click → "Remove from context"

### History
- Last 10 completed tasks, timestamped
- Clicking a history item opens a read-only replay of that conversation
- `[Clear history]` at the bottom (with confirmation)

## Header actions

| Button | Action |
|---|---|
| `[+]` | Start a new task (opens chat panel with fresh input) |
| `[⚙]` | Opens settings page |

## Inline actions on plan steps (right-click context menu)

- `Copy step description`
- `Mark as skipped` — skips this step, agent continues to next
- `Re-run this step` — re-executes just this step

## Empty states

- No task active: shows a "Start a task →" button that opens the chat panel
- No history: shows "Your completed tasks will appear here"
