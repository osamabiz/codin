## Summary

The `delete_file` tool is implemented in `src/tools/delete-file.ts` but its test file
`test/tools/delete-file.test.ts` was never created. `docs/testing.md` specifies that every tool
must have unit tests covering the happy path, security rejections, and confirmation flow. This
issue closes that gap.

## Why it matters

`delete_file` is the most irreversible tool in the extension (even though it moves to trash, not
permanent delete). Missing tests mean:
1. A path-traversal or workspace-escape regression could land silently.
2. The CI coverage threshold may be failing or close to failing because of this gap.
3. Contributors modifying the tool have no safety net.

Four targeted tests are all that's needed to bring this tool up to the project standard.

## Relevant spec file

`docs/testing.md` — "Required tests per tool" section shows the exact shape expected. The
`docs/components/tools.md` `delete_file` entry documents the behavior under test: trash-based
deletion, always-required confirmation, workspace-root enforcement.

## Acceptance criteria

- [ ] New file `test/tools/delete-file.test.ts` exists and runs under Vitest
- [ ] **Happy path test:** when confirmation is approved, the tool calls VS Code's trash API and returns `{ ok: true, output: "File deleted: ..." }`
- [ ] **Path traversal test:** a `path` of `../../etc/passwd` (or similar) is rejected before any file system call with `{ ok: false, error: ... }`
- [ ] **Cancel confirmation test:** when the user rejects the confirmation modal, no file is deleted and the tool returns `{ ok: false, error: ... }` (or an appropriate cancelled result)
- [ ] **Outside-workspace test:** a path that resolves outside the workspace root is rejected with `{ ok: false, error: ... }`
- [ ] All tests use the `memfs` + VS Code mock pattern from `docs/testing.md` — no real file system access
- [ ] The VS Code mock in the test stubs `workspace.fs.delete` (or whichever API the implementation uses for trash)
- [ ] `npm test` passes with no new failures
- [ ] Coverage for `src/tools/delete-file.ts` reaches the project-wide 80% lines/functions threshold

## Estimated complexity

**S** — No production code changes required. Pure test writing. The patterns to follow are already
in `test/tools/write-file.test.ts` (path traversal, confirmation gate) and the mocking docs.
