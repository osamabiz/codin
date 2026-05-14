# Page: Inline diff view

## Purpose

When the agent proposes a file edit, users see a standard VS Code diff editor showing exactly what will change before approving. This is the core safety UX — no file is ever silently overwritten.

## How it appears

Triggered automatically when the agent calls `write_file` or `create_file` on an existing file. VS Code's native diff editor opens as a new tab.

## Layout

Uses VS Code's built-in `vscode.diff` command — no custom UI needed.

```
┌─────────────────────────────────────────────────────────────────┐
│  src/auth.ts (original)          src/auth.ts (proposed)         │
├─────────────────────────────────────────────────────────────────┤
│   1   import express from ...  │   1   import express from ...  │
│   2   import jwt from ...      │   2   import jwt from ...      │
│   3                            │   3   import bcrypt from ...   │  ← added (green)
│   4   export function login(   │   4                            │
│   5     req: Request,          │   5   export function login(   │
│   6     res: Response          │   6     req: Request,          │
│  [7]    ) {                    │   7     res: Response          │  ← removed (red)
│   8     res.send('ok')         │   8   ) {                      │
│                                │   9     const hash = await ... │  ← added (green)
│                                │  10     res.json({ token })    │
├─────────────────────────────────────────────────────────────────┤
│  [Approve and continue ✓]    [Reject ✗]    [Edit manually ✏]   │
└─────────────────────────────────────────────────────────────────┘
```

## Buttons (shown in a notification / input bar below the diff)

| Button | Behaviour |
|---|---|
| `Approve and continue` | Writes the file, closes diff tab, agent loop continues |
| `Reject` | Discards the change, agent is told "edit rejected, re-plan" |
| `Edit manually` | Opens the proposed content in a regular editor tab for manual editing before approving |

## For new files (create_file)

- Left pane is empty (labeled "New file")
- Right pane shows the full proposed content
- Same three buttons

## For delete_file

- No diff view (nothing to show)
- Instead: a VS Code warning modal: `"The agent wants to delete src/auth.ts. This cannot be undone (unless git is available). Confirm?"` with `[Delete]` and `[Cancel]` buttons

## Auto-checkpoint before approval

If `autoCommitBeforeEdit` is enabled in settings, a git commit is created silently before the file is written:

```
git add -A && git commit -m "agent: checkpoint before editing src/auth.ts"
```

This gives users a guaranteed rollback point regardless of their approval decision.
