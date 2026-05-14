# Component: Built-in tools

## Location

`src/tools/`

## Responsibility

Each tool gives the agent a concrete capability: reading files, writing code, running commands, searching the codebase, or interacting with git. Tools are the agent's hands.

## Files

```
src/tools/
├── index.ts          ← exports all tools as an array
├── types.ts          ← ITool interface + ToolResult type
├── read-file.ts
├── write-file.ts
├── create-file.ts
├── delete-file.ts
├── run-command.ts
├── grep-codebase.ts
├── list-files.ts
├── git-status.ts
├── git-commit.ts
└── open-browser.ts
```

## Core interface (`types.ts`)

```typescript
interface ITool {
  readonly name: string;           // snake_case, matches LLM tool name
  readonly description: string;    // shown to LLM in system prompt
  readonly parameters: JSONSchema;  // JSON Schema for input validation
  readonly requiresConfirmation: boolean;

  execute(
    params: unknown,
    context: ToolContext
  ): Promise<ToolResult>;
}

interface ToolContext {
  workspaceRoot: string;           // absolute path to workspace
  vscode: typeof import('vscode'); // VS Code API access
  onProgress?: (msg: string) => void;
}

type ToolResult =
  | { ok: true;  output: string }
  | { ok: false; error: string }
```

## Tool reference

### `read_file`
- **Confirmation:** No
- **Params:** `{ path: string, startLine?: number, endLine?: number }`
- **Output:** File content as a string (or the specified line range)
- **Limits:** Max 500 lines per call; if file exceeds this, truncates and notes line count
- **Notes:** Path is relative to workspace root. Rejects paths outside workspace.

---

### `write_file`
- **Confirmation:** Yes — opens inline diff view before writing
- **Params:** `{ path: string, content: string }`
- **Output:** `"File written: {path}"` on success
- **Notes:** Overwrites existing files. Never writes outside workspace root. If `checkpointBeforeEdit` is on, creates a git commit first.

---

### `create_file`
- **Confirmation:** Yes (diff view with empty left pane)
- **Params:** `{ path: string, content: string }`
- **Output:** `"File created: {path}"`
- **Notes:** Fails if file already exists (use write_file to update).

---

### `delete_file`
- **Confirmation:** Yes — warning modal (always, cannot be auto-approved)
- **Params:** `{ path: string }`
- **Output:** `"File deleted: {path}"`
- **Notes:** Moves to VS Code trash (recoverable) rather than permanent delete.

---

### `run_command`
- **Confirmation:** Yes — shows command string before running
- **Params:** `{ command: string, cwd?: string }`
- **Output:** `{ stdout: string, stderr: string, exitCode: number }`
- **Limits:** Times out after 30 seconds. Max 10,000 chars of output (truncates with notice).
- **Blocked patterns:** Checked against user's `blockedCommands` setting before execution.
- **Notes:** Runs in VS Code's integrated terminal API. `cwd` defaults to workspace root.

---

### `grep_codebase`
- **Confirmation:** No
- **Params:** `{ pattern: string, fileGlob?: string, caseSensitive?: boolean }`
- **Output:** Array of `{ file, line, content }` matches (max 50 results)
- **Notes:** Uses VS Code's `workspace.findFiles` + ripgrep under the hood if available, else Node.js `fs` fallback.

---

### `list_files`
- **Confirmation:** No
- **Params:** `{ path?: string, recursive?: boolean, includeHidden?: boolean }`
- **Output:** Tree-style string of files and folders
- **Notes:** Respects `.gitignore`. Max depth 5 if recursive. Defaults to workspace root.

---

### `git_status`
- **Confirmation:** No
- **Params:** `{}`
- **Output:** `{ branch, staged, unstaged, untracked }` as formatted string
- **Notes:** Returns "Git not available" gracefully if workspace is not a git repo.

---

### `git_commit`
- **Confirmation:** Yes
- **Params:** `{ message: string, addAll?: boolean }`
- **Output:** Commit SHA + message on success
- **Notes:** If `addAll` is true, stages all changes first (`git add -A`).

---

### `open_browser`
- **Confirmation:** No
- **Params:** `{ url: string }`
- **Output:** `"Opened: {url}"`
- **Notes:** Uses VS Code's Simple Browser view (`vscode.env.openExternal` for external, `vscode.commands.executeCommand('simpleBrowser.show')` for in-editor).

---

## Security rules (enforced in `execute()` for all tools)

1. **Path traversal protection:** All file paths are resolved with `path.resolve(workspaceRoot, userPath)` and must start with `workspaceRoot`. Any attempt to access `../../etc/passwd` or similar is rejected.
2. **Blocked command patterns:** `run_command` checks the command string against the user's blocklist before running.
3. **Allowed write directories:** If the user configured `allowedWriteDirectories`, file writes outside those paths are rejected.
4. **No network access from tools:** Tools cannot make HTTP requests. Network calls go through the LLM provider only.

## Tool result formatting

Tool results are injected back into the conversation as `role: "tool"` messages. Results are truncated to 4,000 characters maximum to avoid bloating the context window. A truncation notice is appended: `[Output truncated at 4000 chars. {N} chars omitted.]`

## Registering a custom tool (for contributors)

1. Create `src/tools/my-tool.ts` implementing `ITool`
2. Export it from `src/tools/index.ts`
3. Document it in this file
4. Add a test in `test/tools/my-tool.test.ts`
