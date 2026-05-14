# Phase 3 — Edit tools & basic agent loop

**Duration:** Weeks 6–8  
**Goal:** The LLM can now WRITE code, not just read it. This phase crosses the line from "assistant" to "agent" — the model calls tools, sees results, and continues until the task is done.

---

## Deliverables

- [ ] Full agent loop in `src/agent/` (planner, executor, memory, loop)
- [ ] Tool-use wired into the LLM providers (native function calling)
- [ ] `write_file` tool with inline diff confirmation UX
- [ ] `create_file` tool with diff confirmation
- [ ] `delete_file` tool with warning modal
- [ ] `run_command` tool with confirmation + output display
- [ ] `read_file`, `grep_codebase`, `list_files`, `git_status` auto-approved
- [ ] Tool call cards in the chat panel UI
- [ ] "Stop" button that interrupts the loop cleanly
- [ ] Auto-checkpoint (git commit) before destructive edits (if enabled)

---

## Coding agent prompt

```
Read docs/overview.md, docs/architecture.md, docs/components/agent-core.md,
docs/components/tools.md, docs/pages/chat-panel.md, and
docs/pages/inline-diff-view.md before starting.

Implement Phase 3 of the VS Code extension (builds on Phases 1 & 2):

1. Agent core (src/agent/):
   - agent.ts: public Agent class with run(), stop(), approveTool(), rejectTool()
   - memory.ts: AgentMemory with message history, trim(), toJSON(), fromJSON()
   - loop.ts: the observe→reflect→re-plan loop as described in docs
   - types.ts: all shared types (AgentEvent, Task, PlanStep, ToolCall, ToolResult, etc.)

2. Tool implementations (src/tools/):
   - write-file.ts (requiresConfirmation: true)
   - create-file.ts (requiresConfirmation: true)
   - delete-file.ts (requiresConfirmation: true — always, no override)
   - run-command.ts (requiresConfirmation: true, 30s timeout, blocked patterns check)
   - read-file.ts (requiresConfirmation: false)
   - grep-codebase.ts (already scaffolded, wire up properly)
   - list-files.ts (already scaffolded, wire up properly)
   - git-status.ts (requiresConfirmation: false)

3. Inline diff view (src/ui/DiffView.ts):
   - Takes proposed file content, uses vscode.diff() to show original vs proposed
   - Posts approve/reject messages back to extension host
   - Implement the three buttons: Approve, Reject, Edit manually

4. Tool call cards in webview:
   - When agent emits 'waiting_for_approval', render a tool call card in the chat
   - Card shows: tool name, icon, parameter summary
   - Approve button calls agent.approveTool(callId)
   - Reject button calls agent.rejectTool(callId)

5. Stop button:
   - Calls agent.stop() which sets a flag checked between tool calls
   - Cleanly finishes the current tool call before stopping

6. Wire agent into extension.ts:
   - Replace direct provider.chat() call with agent.run()
   - Map AgentEvents to webview messages

Security requirements (enforce in every file tool):
- Path.resolve check: path must start with workspaceRoot
- Blocked commands list from settings

Tests to write:
- Agent loop: mock provider returns tool call → tool executes → result injected → loop continues
- write-file: path traversal rejected
- run-command: blocked pattern rejected, timeout fires
- approveTool / rejectTool flow
```

---

## Tool call card HTML (for webview)

```html
<div class="tool-card">
  <div class="tool-card-header">
    <span class="tool-icon">🔧</span>
    <span class="tool-name">write_file</span>
    <span class="tool-path">src/auth.ts</span>
  </div>
  <div class="tool-card-actions">
    <button class="btn-diff">Show diff</button>
    <button class="btn-approve">Approve ✓</button>
    <button class="btn-reject">Reject ✗</button>
  </div>
</div>
```

---

## Loop mental model

```
user: "Add bcrypt password hashing to the login function"

agent:
  step 1: read_file("src/auth.ts")          ← auto-approved
  step 2: read_file("package.json")          ← auto-approved
  → sees bcrypt is not installed
  step 3: run_command("npm install bcrypt")  ← user approves
  step 4: write_file("src/auth.ts", ...)    ← user approves diff
  step 5: run_command("npm test")            ← user approves
  → tests pass
  done: "I've added bcrypt hashing to login(). Tests are passing."
```

---

## Definition of done

- User says "Add a hello world express route to src/routes/index.ts"
- Agent reads the file (auto), proposes an edit, shows diff
- User approves — file is written
- Agent runs `npm test` (with user approval) — shows output
- Agent summarizes what it did
- Stop button works mid-run
- All tests pass
