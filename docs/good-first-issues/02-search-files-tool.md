## Summary

Add a new built-in tool `search_files` that lets the agent find files by name or glob pattern
within the workspace. This is a simpler, name-only sibling to `grep_codebase` (which searches file
*contents*). `search_files` searches file *names* using `vscode.workspace.findFiles` and returns
the matching paths.

Parameters: `{ pattern: string, path?: string }`
`requiresConfirmation: false`

## Why it matters

Currently the agent must either use `list_files` (which walks a directory tree) or `grep_codebase`
(which reads file contents) to find a file. Neither is ideal when the agent just wants to know
"where does a file named `auth.ts` live?" or "how many test files are in this repo?". A dedicated
`search_files` tool is cheaper on tokens and faster for the agent to use, leading to more efficient
multi-step plans.

## Relevant spec file

`docs/components/tools.md` — defines the `ITool` interface, `ToolContext`, security rules
(path-traversal protection, workspace-root scoping), and the contributor registration checklist
every new tool must follow.

## Acceptance criteria

- [ ] New file `src/tools/search-files.ts` implements `ITool`
- [ ] Tool `name` is `"search_files"`
- [ ] `requiresConfirmation` is `false`
- [ ] Parameters schema accepts:
  - [ ] `pattern` (string, required) — glob pattern matched against file names (e.g. `"**/*.test.ts"`)
  - [ ] `path` (string, optional) — sub-directory to restrict the search (defaults to workspace root)
- [ ] Implementation calls `vscode.workspace.findFiles` (not a manual `fs` walk)
- [ ] `path` argument is validated against the workspace root (path-traversal attack rejected with `{ ok: false }`)
- [ ] Returns a formatted list of relative paths, one per line, capped at 100 results with a truncation notice if exceeded
- [ ] Returns a clear `{ ok: false, error }` when the pattern is empty or invalid
- [ ] Tool exported from `src/tools/index.ts` and included in the tools array
- [ ] Tool listed in the tool reference table in `docs/components/tools.md`
- [ ] Unit tests in `test/tools/search-files.test.ts` cover:
  - [ ] Happy path — returns expected paths for a valid glob
  - [ ] `path` option restricts results to the sub-directory
  - [ ] Path traversal in `path` param is rejected
  - [ ] Empty pattern returns an error result
- [ ] `npm test` passes with no new failures

## Estimated complexity

**S** — VS Code's `findFiles` API does the heavy lifting. The implementation is ~40 lines plus
security checks already used verbatim in other tools.
