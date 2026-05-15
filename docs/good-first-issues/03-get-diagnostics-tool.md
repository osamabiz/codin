## Summary

Add a new built-in tool `get_diagnostics` that exposes the VS Code language server's errors and
warnings to the agent. The implementation calls `vscode.languages.getDiagnostics()` and returns a
formatted, human-readable string listing every error and warning across the current workspace.

Parameters: `{}` (no input required)
`requiresConfirmation: false`

## Why it matters

Right now the agent is blind to TypeScript errors, ESLint warnings, and other language-server
diagnostics unless it explicitly runs `tsc` or a linter via `run_command`. That requires a shell
round-trip, output parsing, and a confirmation click. `get_diagnostics` gives the agent direct
access to the same error list the user sees in VS Code's Problems panel — instantly, with no
subprocess and no confirmation required. This single tool can dramatically shorten the
"write code → see error → fix error" feedback loop.

## Relevant spec file

`docs/components/tools.md` — defines `ITool`, `ToolContext` (which provides the `vscode` API
handle needed for `getDiagnostics`), result-truncation rules, and the contributor checklist.

## Acceptance criteria

- [ ] New file `src/tools/get-diagnostics.ts` implements `ITool`
- [ ] Tool `name` is `"get_diagnostics"`
- [ ] `requiresConfirmation` is `false`
- [ ] Parameters schema is an empty object (`{}` — no required fields)
- [ ] Implementation calls `context.vscode.languages.getDiagnostics()` (workspace-wide overload)
- [ ] Filters results to `DiagnosticSeverity.Error` and `DiagnosticSeverity.Warning` only (ignores Info and Hint)
- [ ] Output is a formatted string with file path, line number, severity, and message for each diagnostic, e.g.:
  ```
  src/auth.ts:12 [error] Property 'token' does not exist on type 'User'
  src/routes.ts:34 [warning] Variable 'res' is declared but never used
  ```
- [ ] Returns `"No errors or warnings found."` when the workspace is clean
- [ ] Output is truncated to 4,000 characters with a notice if the diagnostic list is very long (consistent with other tools)
- [ ] Tool exported from `src/tools/index.ts` and included in the tools array
- [ ] Tool listed in the tool reference table in `docs/components/tools.md`
- [ ] Unit tests in `test/tools/get-diagnostics.test.ts` cover:
  - [ ] Happy path — returns formatted lines for errors and warnings
  - [ ] Clean workspace — returns the "no errors" message
  - [ ] Filters out Info/Hint severity diagnostics
  - [ ] Truncates output at 4,000 characters with a notice
- [ ] `npm test` passes with no new failures

## Estimated complexity

**S** — The VS Code API call is one line; the rest is string formatting. No file I/O, no subprocess,
no confirmation flow. The mock in `test/__mocks__/vscode.ts` will need a `languages.getDiagnostics`
stub added, which is straightforward.
