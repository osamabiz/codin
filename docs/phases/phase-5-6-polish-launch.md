# Phase 5 — UX polish & safety

**Duration:** Weeks 12–14  
**Goal:** Something you'd confidently show a developer who's never used an agent before. Smooth UI, clear safety controls, no rough edges.

---

## Deliverables

- [ ] Checkpoint system: auto git-commit before destructive edits
- [ ] Dry-run mode: shows what agent WOULD do without executing
- [ ] Improved error UX: friendly messages + retry button
- [ ] Keyboard shortcuts documented and working
- [ ] Status bar item showing agent state (idle / running / waiting)
- [ ] Conversation history pruning (max 50 messages)
- [ ] Settings: blocked commands list UI
- [ ] Settings: allowed write directories UI
- [ ] Onboarding flow: first-run wizard to set API key
- [ ] "New chat" confirmation dialog if mid-task
- [ ] Proper loading/skeleton states in webview

---

## Coding agent prompt

```
Read docs/overview.md, docs/pages/chat-panel.md, docs/pages/settings.md,
and docs/pages/inline-diff-view.md before starting.

Implement Phase 5 polish (builds on Phase 4):

1. Status bar item (src/ui/StatusBar.ts):
   - Shows: "Agent: Idle" | "Agent: Running..." | "Agent: Waiting"
   - Click opens the chat panel
   - Uses vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)

2. Dry-run mode:
   - Toggle in chat panel top bar (or command: "Agent: Toggle Dry Run")
   - When active: agent runs the full loop BUT skips execute() on tools that requiresConfirmation
   - Instead, emits a 'dry_run_would_call' event rendered as a grey info card in chat
   - Useful for previewing what the agent would do on a complex task

3. First-run onboarding:
   - On first activation (no API key set), show a welcome webview with:
     - "Welcome to AI Coding Agent"
     - Provider choice + API key input inline
     - "Test connection" button
     - "Get started" button that opens the chat panel
   - Store "onboardingComplete" flag in globalState

4. Improved error messages:
   - Map common API errors to friendly messages:
     - 401 → "API key is invalid. Check your key in Settings."
     - 429 → "Rate limit hit. Try again in a few seconds."
     - 500 → "The AI provider had an error. Try again."
   - All error states in chat show a [Retry] button

5. "New chat" guard:
   - If agent is mid-task (loop running or plan active), show vscode.window.showWarningMessage
     "An agent task is in progress. Start a new chat?" with [Start new chat] [Cancel]

6. Blocked commands UI in settings:
   - Render current blocked patterns as a list with × remove buttons
   - Text input + "Add pattern" button
   - Persist to codin.blockedCommands setting

7. Allowed write directories UI in settings:
   - Same pattern as blocked commands
   - Persist to codin.allowedWriteDirectories

Tests to write:
- Status bar transitions: idle → running → waiting → idle
- Dry run: tool.execute() is NOT called in dry-run mode
- Onboarding: shown on first activation, hidden after key is set
- Error message mapping: 401/429/500 → correct strings
```

---

## Status bar states

```
⬤ Agent: Idle         (grey)
⬤ Agent: Running...   (blue, animated dot)
⬤ Agent: Waiting      (amber — waiting for user approval)
⬤ Agent: Error        (red — click to see error in chat)
```

---

## Definition of done

- Fresh install: onboarding wizard appears, user sets API key, immediately starts chatting
- Status bar reflects agent state accurately
- Dry run mode shows a full plan preview without touching any files
- All API errors show friendly messages with retry
- Stop mid-task → "New chat" → confirmation dialog appears
- Blocked commands list can be edited from settings UI

---
---

# Phase 6 — Open source launch

**Duration:** Weeks 15–16  
**Goal:** Ship it. Publish to the VS Code Marketplace, make it easy to contribute to, and start the community.

---

## Deliverables

- [ ] VS Code Marketplace listing (free)
- [ ] README with animated demo GIF
- [ ] Full contributor guide (`CONTRIBUTING.md`)
- [ ] Issue templates (bug report, feature request)
- [ ] PR template
- [ ] `good first issue` backlog with 10+ labelled issues
- [ ] GitHub Discussions enabled (Q&A, ideas, show-and-tell categories)
- [ ] Release workflow: GitHub Actions publishes to Marketplace on tag push
- [ ] Changelog (`CHANGELOG.md`)
- [ ] Extension icon (512×512 PNG)

---

## Coding agent prompt

```
Read docs/overview.md and docs/phases/ for all completed phases.

Help prepare the open-source launch:

1. README.md — write a complete README with:
   - Hero section: name, one-liner, badges (CI, marketplace version, license)
   - Animated GIF placeholder section (note: GIF to be recorded manually)
   - Features list
   - Quick start (install from marketplace, set API key, first task)
   - Supported providers table
   - Configuration reference (link to docs/pages/settings.md)
   - Contributing section (link to CONTRIBUTING.md)
   - License section

2. CONTRIBUTING.md — full contributor guide:
   - Prerequisites (Node 18+, VS Code, git)
   - Dev setup (clone, npm install, F5 to run)
   - Project structure walkthrough (link to docs/)
   - How to add a new LLM provider (step by step)
   - How to add a new tool (step by step)
   - Testing guide (npm test, how to write tests)
   - PR process (one feature per PR, spec update required, tests required)

3. GitHub issue templates (.github/ISSUE_TEMPLATE/):
   - bug_report.yml
   - feature_request.yml

4. GitHub PR template (.github/pull_request_template.md)

5. Release workflow (.github/workflows/release.yml):
   - Trigger: push of tag matching v*.*.*
   - Steps: npm install → npm run build → vsce publish
   - Uses VSCE_PAT secret for marketplace auth

6. CHANGELOG.md — initial entry for v0.1.0

7. Suggest 10 "good first issue" titles appropriate for this codebase
   (UI improvements, new tools, provider additions, test coverage, docs)
```

---

## Marketplace listing details

```
Name:         AI Coding Agent
Publisher:    (your publisher ID)
Display name: AI Coding Agent
Description:  Open-source VS Code agent powered by your own Claude, OpenAI,
              or Gemini subscription. Plans, writes, edits, and tests code
              autonomously. Free forever.
Categories:   [Other, Machine Learning]
Tags:         ai, agent, claude, openai, coding, automation, llm
```

---

## Post-launch roadmap (Phase 7+)

These are intentionally out of scope for launch but good to track as GitHub issues:

- MCP server support (see `docs/components/mcp-integration.md`)
- Multi-file diff view (show all proposed changes at once before any approval)
- Voice input (Web Speech API in webview)
- Spec-driven mode (Kiro-style: user writes requirements `.md`, agent implements)
- GitHub integration (create PRs, comment on issues)
- Team settings sync (shared blocked commands, allowed tools)
- Telemetry opt-in (anonymous usage stats to improve defaults)

---

## Definition of done for Phase 6

- Extension published and installable from VS Code Marketplace search
- README renders correctly on GitHub and Marketplace
- CI publishes to Marketplace automatically on version tag push
- First 10 issues filed and labelled
- GitHub Discussions has a pinned "Welcome" post
