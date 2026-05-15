## Summary

The settings spec (`docs/pages/settings.md`, UI preferences section) lists a **Compact messages**
toggle. When enabled, it should reduce padding on message bubbles and hide timestamps to fit more
messages on screen at once. This issue implements the full round-trip: reading the `codin.compactMessages`
setting in the webview and applying the appropriate CSS class to the message list.

## Why it matters

The default message layout is designed for readability, with generous padding and visible
timestamps. Users working on a laptop or with a small VS Code window sometimes find the chat panel
too sparse — they can only see a few messages at once and must scroll constantly. Compact mode
makes the panel feel more like a dense terminal log, which many developers prefer during an active
coding session.

## Relevant spec file

`docs/pages/settings.md` — Section 5 "UI preferences" lists `Compact messages [ ]` as a
configurable toggle. `docs/pages/chat-panel.md` — describes the message list layout that compact
mode modifies.

## Acceptance criteria

- [ ] `package.json` `contributes.configuration` includes `codin.compactMessages` as a `boolean` setting (default `false`)
- [ ] The settings panel UI (`src/ui/SettingsPanel.ts` or the webview form) renders a "Compact messages" checkbox that reads and writes this setting
- [ ] When `codin.compactMessages` is `true`, the chat panel webview adds a CSS class (e.g. `compact`) to the message list container
- [ ] The `compact` CSS class reduces vertical padding on message bubbles (exact values are up to the implementer — aim for ~50% reduction)
- [ ] The `compact` CSS class hides timestamps (the timestamp element gets `display: none` or equivalent)
- [ ] Toggling the setting in the settings panel takes effect in an already-open chat panel without requiring a reload
- [ ] When `codin.compactMessages` is `false` (default), the layout is visually unchanged from the current state
- [ ] Manual smoke test: enable compact mode, verify the panel looks denser; disable, verify it returns to normal

## Estimated complexity

**M** — Touches three layers: `package.json` (setting declaration), the settings panel (checkbox
UI), and the chat panel webview (CSS + setting subscriber). Each piece is small, but coordinating
them cleanly is the main challenge.
