# Phase 4 — Planning & multi-step tasks

**Duration:** Weeks 9–11  
**Goal:** Give the agent a high-level task ("add JWT authentication to this Express app") and have it plan, execute multiple steps autonomously, and self-correct when things go wrong.

---

## Deliverables

- [ ] Planner: LLM produces a numbered plan before executing
- [ ] Plan displayed in sidebar task view (with step status icons)
- [ ] Multi-step execution with feedback loop (re-plan on failure)
- [ ] "Max steps" guard with user continuation prompt
- [ ] Interrupt / pause at any step
- [ ] Task history in sidebar
- [ ] Conversation history persistence (`.agent-history.json`)
- [ ] Context window management (summarize old messages when approaching limit)
- [ ] `git_commit` tool

---

## Coding agent prompt

```
Read docs/overview.md, docs/architecture.md, docs/components/agent-core.md,
docs/pages/sidebar-view.md, and docs/phases/phase-3-edit-tools.md before starting.

Implement Phase 4 (builds on Phase 3):

1. Planner (src/agent/planner.ts):
   - Two-phase approach:
     Phase A: Send task to LLM with instruction to output ONLY a numbered JSON plan
     Phase B: Execute each step using the existing loop
   - Plan format:
     { steps: [{ id, description, toolHint }] }
   - Parse the JSON plan (strip markdown fences before parsing)
   - Emit 'plan' event with the parsed steps
   - If LLM cannot produce a valid plan after 2 retries, fall back to single-step execution

2. Sidebar plan view (src/ui/SidebarProvider.ts — upgrade):
   - Listen for 'plan' and 'step_start' / 'step_done' events from agent
   - Update TreeView items with status icons (✅ 🔄 ⬜ ❌)
   - Auto-reveal current step
   - Show task title in "Current task" section
   - Task history: append completed tasks to history list

3. Context window management (src/agent/memory.ts — upgrade):
   - Track approximate token count of messages[]
   - When > 80% of model's context limit:
     - Take the oldest 30% of messages (excluding system prompt)
     - Send them to LLM with: "Summarize these messages in 3-5 sentences, preserving key facts and decisions"
     - Replace the old messages with the summary as a single user message
   - Model context limits: claude-sonnet: 200k, gpt-4o: 128k, default: 32k

4. Conversation persistence:
   - On each message, serialize memory to .agent-history.json in workspace root
   - On ChatPanel open, offer to restore previous conversation
   - Auto-add .agent-history.json to .gitignore if not already there

5. git_commit tool (src/tools/git-commit.ts):
   - Params: { message: string, addAll?: boolean }
   - requiresConfirmation: true
   - Use child_process to run git add / git commit

6. Max steps guard in loop.ts:
   - When stepCount >= maxSteps setting:
     - Pause the loop
     - Emit 'waiting_for_approval' with message "Agent has taken {n} steps. Continue?"
     - Resume only on user approval

Tests to write:
- Planner: valid JSON plan parsed correctly
- Planner: malformed JSON falls back to single-step
- Memory trim: token count drops after summarization
- History persistence: save and restore round-trip
- Max steps guard fires at correct count
```

---

## Planner system prompt addition

```
Before taking any action, output a plan as a JSON object and nothing else:
{
  "taskSummary": "one-line description of what you will do",
  "steps": [
    { "id": 1, "description": "Read src/auth.ts to understand current state", "toolHint": "read_file" },
    { "id": 2, "description": "Install jsonwebtoken package", "toolHint": "run_command" },
    { "id": 3, "description": "Update login() to issue a JWT", "toolHint": "write_file" },
    { "id": 4, "description": "Run tests to verify", "toolHint": "run_command" }
  ]
}
After I confirm your plan, execute each step in order.
```

---

## Re-planning trigger

When a tool fails (exit code ≠ 0, or file not found, etc.), the agent injects into context:

```
[TOOL FAILURE] run_command("npm test") exited with code 1
stdout: ...
stderr: ...

Re-assess the situation and decide: fix the error, try an alternative approach,
or tell the user you need their input.
```

The LLM then either produces a corrective action or asks the user.

---

## Definition of done

- User says "Add JWT auth: install jsonwebtoken, update login to return a token, add a /me route that verifies it"
- Agent outputs a numbered plan — plan appears in sidebar
- Executes steps one by one, sidebar updates step status in real time
- If npm test fails, agent re-plans and fixes the error
- Task appears in sidebar history when done
- Restarting VS Code and reopening the extension offers to restore the conversation
