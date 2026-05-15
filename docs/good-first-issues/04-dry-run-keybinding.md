## Summary

The VS Code command `agentPlugin.toggleDryRun` is already registered in the extension but has no
default keyboard shortcut. This issue adds a default keybinding entry in `package.json` under
`contributes.keybindings` so users can toggle dry-run mode without opening the command palette.

Suggested default: `Ctrl+Shift+D` (Win/Linux) / `Cmd+Shift+D` (Mac), scoped to when the
extension is active. The exact binding is open to discussion in the PR if there is a conflict.

## Why it matters

Dry-run mode is a safety feature that lets users preview what the agent *would* do without
executing any tools. Toggling it should be as fast as possible — a keyboard shortcut makes it a
one-keystroke action instead of a three-step command palette flow. This makes dry-run mode
practically usable during a live agent session where every second counts.

## Relevant spec file

`docs/pages/settings.md` — the dry-run toggle is part of the Safety section. `docs/overview.md`
— design principle #1: "User approval before any destructive action" is the motivation behind
making dry-run easy to reach.

## Acceptance criteria

- [ ] `package.json` `contributes.keybindings` array contains an entry for `agentPlugin.toggleDryRun`
- [ ] The entry specifies separate `key` (Win/Linux) and `mac` bindings
- [ ] The binding does not conflict with any default VS Code shortcut (verify with the VS Code keybindings reference)
- [ ] A `when` clause is included to scope the shortcut appropriately (e.g. `editorFocus` or no restriction — document the choice)
- [ ] Running the keybinding in a VS Code window with the extension loaded toggles dry-run on/off (manual smoke test)
- [ ] `package.json` remains valid JSON (`npm run package` or `vsce package` does not error)

## Estimated complexity

**S** — This is a one-to-three line JSON change in `package.json`. The command implementation
already exists; no TypeScript changes are required.
