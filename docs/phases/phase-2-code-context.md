# Phase 2 — Code reading & context

**Duration:** Weeks 4–5  
**Goal:** The LLM can see your codebase. Users can attach files, symbols, and selections to their messages. The extension automatically injects workspace context into every prompt.

---

## Deliverables

- [ ] `@file` mention — type `@` to pick a file, attaches full content to prompt
- [ ] `@selection` — attaches current editor selection
- [ ] `@symbol` — type `@MyClass` to attach a symbol's definition via language server
- [ ] Active file auto-injected into context (configurable in settings)
- [ ] Context pills UI in chat panel (shows what's attached, click to remove)
- [ ] Token counter (shows approximate tokens in current context)
- [ ] Workspace snapshot (file tree + git status) injected into system prompt
- [ ] `grep_codebase` and `list_files` tools available in read-only mode (no tool-use loop yet — just for LLM to reference)

---

## Coding agent prompt

```
Read docs/overview.md, docs/architecture.md, docs/pages/chat-panel.md,
and docs/components/tools.md before starting.

Implement Phase 2 of the VS Code extension (builds on Phase 1):

1. Context mention system:
   - In the chat input, typing "@" opens a quick pick showing:
     - All workspace files (filtered as user types)
     - @selection (current editor selection)
     - @symbol (triggers symbol search)
   - Selected items appear as pills above the input
   - Each pill stores { type, label, content } — content is injected into the user message

2. Context pills UI:
   - Render pills above the input box in the webview
   - Each pill has an × button to remove it
   - Pills show file name (not full path) for brevity

3. Workspace context injected into system prompt:
   - File tree (top 2 levels, respecting .gitignore)
   - Detected languages and frameworks (look for package.json, requirements.txt, Cargo.toml, etc.)
   - Git branch and status (via child_process git commands)
   - Active file name and language

4. Token counter:
   - Display approximate token count of current context in the input bar
   - Use a simple character/4 approximation (good enough, no external tokenizer needed)
   - Show warning colour when > 75% of model's context window

5. Create src/tools/grep-codebase.ts and src/tools/list-files.ts
   (implement the ITool interface, but don't wire into agent loop yet)

Tests to write:
- Context injection builds correct message array
- Token counter approximation
- File path resolution and workspace-root enforcement
```

---

## Context injection format

When a user sends a message with context attached, the message sent to the LLM looks like:

```
[CONTEXT: src/auth.ts]
```typescript
import express from 'express';

export function login(req, res) {
  ...
}
```

[CONTEXT: selection from src/routes/index.ts lines 12-18]
```typescript
router.get('/login', login);
router.post('/login', login);
```

User message: How does the login route work?
```

---

## Workspace system prompt addition

```
[WORKSPACE]
Project: my-app
Root: /Users/name/projects/my-app
Languages: TypeScript, CSS
Frameworks: Express.js, React
Git branch: feature/auth
Git status: 2 modified files

File structure:
src/
  auth.ts
  routes/
    index.ts
  ...
```

---

## Definition of done

- User types `@` in chat, sees file picker
- Selects `src/auth.ts`, pill appears above input
- Sends message — file content is in the prompt (verify via token counter going up)
- LLM correctly answers questions about the attached file
- Token counter updates as context changes
- Removing a pill removes its content from the token count
