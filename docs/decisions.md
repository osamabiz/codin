# Decisions & FAQ

This document records key architectural decisions and answers common "why did we do it this way?" questions. Update this file whenever a significant decision is made or reversed.

---

## Architecture decisions

### ADR-001: No backend server
**Decision:** The extension communicates directly with LLM provider APIs. There is no relay server, no authentication proxy, no hosted component.

**Reason:** The goal is zero cost to run and zero data leaving the user's machine (except LLM API calls they explicitly configure). A backend would add hosting cost, a privacy surface, and a single point of failure.

**Trade-off:** We cannot add features that require server-side state (e.g. shared team history, usage analytics across users). This is acceptable for v1.

---

### ADR-002: Vanilla TypeScript in the webview, no React
**Decision:** The webview UI is built with vanilla TypeScript and DOM APIs, not React, Vue, or any SPA framework.

**Reason:**
- Keeps the extension bundle under 50 KB (React alone is ~140 KB minified)
- No build step needed for the webview (simpler contributor onboarding)
- VS Code webviews are simple single-page UIs — the complexity React solves doesn't exist here

**Trade-off:** More verbose DOM manipulation code. Acceptable given the UI's limited complexity.

---

### ADR-003: `ILLMProvider` interface as the only LLM abstraction
**Decision:** All LLM communication goes through one interface. The agent core never imports a provider directly.

**Reason:** Allows users to switch providers in settings without restarting, makes unit testing trivial (swap in a mock), and makes adding new providers a one-file change.

---

### ADR-004: All file tools use workspace-root enforcement
**Decision:** Every file tool resolves paths relative to the workspace root and rejects any path that escapes it.

**Reason:** The agent runs LLM-generated tool calls. Without this guard, a prompt injection attack could cause the agent to read `/etc/passwd` or overwrite system files. This is a hard security requirement, not configurable.

---

### ADR-005: Tool confirmation is per-tool, not per-call
**Decision:** `requiresConfirmation` is a static property on each tool, not decided at call time.

**Reason:** Users need to know upfront which tools are "safe" (auto-approved) and which always ask. Letting the agent decide at call time would make the safety model unpredictable.

**Exception:** `delete_file` always requires confirmation regardless of the `autoApproveReadOnly` setting (which only affects read tools anyway).

---

### ADR-006: Marked.js from CDN for markdown rendering
**Decision:** Load `marked.js` from `cdn.jsdelivr.net` rather than bundling it.

**Reason:** Keeps extension bundle size small. jsdelivr is reliable and fast. The CDN URL is pinned to a major version in the CSP.

**Trade-off:** Webview requires internet access to load. For offline environments, contributors can add a bundled fallback.

---

### ADR-007: Token counting by character approximation
**Decision:** Token counts are estimated as `characters / 4`, not computed with a real tokenizer.

**Reason:** Integrating a real tokenizer (tiktoken, claude-tokenizer) adds significant bundle size and complexity. The approximation is good enough for the warning threshold UX — we don't need exact counts.

**Accuracy:** Within ±20% for English prose and code, which is sufficient for "you're approaching the context limit" warnings.

---

### ADR-008: `.agent-history.json` in workspace root (not extension storage)
**Decision:** Conversation history is stored in the workspace folder, not VS Code's extension global storage.

**Reason:** History is per-project. Developers working on multiple projects want separate histories. Storing in the workspace also means it can be committed to git (or gitignored) — user's choice.

**Note:** The extension auto-adds `.agent-history.json` to `.gitignore` by default (configurable in settings).

---

## FAQ

**Q: Why not use Continue.dev as a base?**
A: Continue.dev is excellent but its architecture is optimized for a different use case (code completion + chat). Building from scratch lets us design the agent loop, tool system, and confirmation UX specifically for agentic tasks. We can draw inspiration from Continue's provider abstraction.

---

**Q: Can users use this with Claude.ai's subscription (not API)?**
A: No. Claude.ai subscriptions (Pro, Team, Enterprise) give access to the web interface, not the API. The API requires a separate Anthropic account with API credits. This is an Anthropic policy constraint, not a plugin limitation. Users need an Anthropic API key specifically.

This applies similarly to OpenAI — ChatGPT Plus does not include API access.

Ollama (local) is free and requires no subscription of any kind.

---

**Q: Why is MCP integration in Phase 6+ and not earlier?**
A: MCP adds significant complexity (process management, transport protocols, tool name collision handling). Getting the core agent loop right first is more important. The architecture is designed so MCP tools slot in as `ITool` implementations — the agent core doesn't know or care whether a tool is built-in or MCP-backed.

---

**Q: Will this work with GitHub Copilot's API?**
A: GitHub Copilot does not expose a public API for third-party extensions to call. It's not a supported provider. If Microsoft opens this up in the future, adding a Copilot provider would be a one-file addition.

---

**Q: What happens if the user's API key runs out of credits mid-task?**
A: The provider returns a 402 or 429 error. The agent loop catches it, maps it to a friendly error message ("Your API credits are exhausted. Top up at..."), and stops the loop cleanly. Any edits already approved and written are kept — the user can resume manually.

---

**Q: How do we handle very large codebases?**
A: The context window fills up quickly on large projects. Mitigations:
1. The `list_files` tool only returns 2 levels deep by default (not the full tree)
2. `grep_codebase` caps at 50 results
3. `read_file` caps at 500 lines and the agent is instructed to read specific line ranges
4. The memory trim system summarizes old messages when approaching the context limit
5. Users should use `@file` to attach only relevant files, not the entire codebase

---

**Q: Is this compliant with Anthropic's / OpenAI's terms of service?**
A: Yes. Users supply their own API keys and use the API under their own account agreements. We are not proxying, reselling, or aggregating API access. The plugin is a thin client — the same as any developer calling the API directly from their own app.

---

**Q: Can the extension be used in VS Code for the Web (vscode.dev)?**
A: Not in v1. `run_command` (terminal execution) and direct file system access require the desktop extension host. A web-compatible version would need to remove or stub those tools. Tracking as a future issue.
