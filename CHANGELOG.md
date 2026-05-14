# Changelog

All notable changes to AI Coding Agent are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2026-05-14

Initial public release.

### Added

**LLM providers**
- Claude (Anthropic) — streaming tool-use via `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5`
- OpenAI — streaming tool-use via `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
- Ollama — local models with no API key (`llama3.2`, `mistral`, `qwen2.5-coder`, `deepseek-r1`)
- Provider `testConnection()` with inline success/failure feedback in settings

**Agent core**
- Autonomous agent loop (`src/agent/loop.ts`) with tool-use, stop flag, and max-steps guard
- LLM-based task planner (`src/agent/planner.ts`) decomposes tasks into steps shown in the sidebar
- Conversation memory with context-window summarization
- History persistence to `.agent-history.json` with restore-on-open prompt

**Built-in tools (10)**
- `read_file` — reads any file in the workspace
- `write_file` — overwrites a file (requires approval + diff view)
- `create_file` — creates a new file (requires approval + diff view)
- `delete_file` — moves a file to VS Code trash (requires VS Code modal confirmation)
- `list_files` — lists workspace files with optional recursion
- `grep_codebase` — regex search across the workspace
- `run_command` — runs a shell command with 30 s timeout (requires approval)
- `git_status` — shows current git status
- `git_commit` — creates a git commit (requires approval)
- `open_browser` — opens a URL in the system browser

**UI**
- Chat panel with streaming token display, markdown rendering, and inline tool-call cards
- Diff view — VS Code native diff before every write approval
- Sidebar tree view showing current task, plan steps (pending / active / done / failed), and history
- Status bar item — Agent: Idle / Running… / Waiting / Error; click to open chat
- Settings panel — provider, model, temperature, API key, blocked commands, allowed write dirs
- Onboarding wizard — shown on first activation when no API key is configured
- Dry-run mode — full agent loop preview without executing any writes or commands
- New chat guard — confirmation dialog when agent is mid-task
- `@file`, `@selection`, `@symbol` context mentions with pill UI and token counter

**Safety**
- Path traversal protection on all file tools
- Blocked commands list (configurable)
- Allowed write directories (configurable)
- All destructive tools require explicit user approval

**Test automation**
- 170 Vitest unit tests across agent loop, providers, tools, and utilities
- `@vscode/test-electron` integration test suite (extension activation, settings, file tools)
- Playwright E2E suite with mock LLM server and 5 spec files covering all phases
- Three-job CI pipeline: unit → integration → E2E (main branch only)

[Unreleased]: https://github.com/open-source/vscode-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/open-source/vscode-agent/releases/tag/v0.1.0
