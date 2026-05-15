## Summary

The chat panel spec (`docs/pages/chat-panel.md`) lists `↑` as a keyboard shortcut that recalls
the previous sent message in the input box — the same behavior as a terminal's history navigation.
This feature is not yet implemented in the webview frontend (`webview-ui/main.ts`). This issue
wires it up: store sent messages in a session-scoped history array and cycle through them with `↑`.

## Why it matters

Users frequently send similar follow-up messages ("run the tests", "fix the lint errors", "try
again"). Without message recall, they must retype or copy-paste. Terminal-style history recall is a
low-friction affordance that experienced developers expect in any text-input tool. It is already
called out in the spec as a required keyboard shortcut.

## Relevant spec file

`docs/pages/chat-panel.md` — Keyboard shortcuts table lists `↑ | Recall previous message in input`.
The input area section describes the textarea behavior (multi-line, `Enter` sends, `Shift+Enter`
newlines).

## Acceptance criteria

- [ ] When the input textarea is focused and empty, pressing `↑` populates it with the most recently sent message
- [ ] Pressing `↑` again cycles to the message before that (oldest messages reachable with repeated `↑` presses)
- [ ] Pressing `↓` after recalling a message cycles forward again (toward the most recent); one extra `↓` returns to an empty input
- [ ] Recall only triggers when the cursor is on the **first line** of the textarea (so `↑` still moves the cursor inside a multi-line draft)
- [ ] History is session-scoped — it resets when the page reloads or "New chat" is clicked
- [ ] A maximum of 50 messages are kept in history (matches the persistence cap in the spec)
- [ ] Recalling a message does not immediately send it — the user can edit before pressing `Enter`
- [ ] The existing `Enter`-to-send and `Shift+Enter`-for-newline behavior is unaffected
- [ ] Manual smoke test: open the chat panel, send 3 messages, press `↑` three times, confirm each message appears in order

## Estimated complexity

**S** — Pure frontend JavaScript change inside the webview bundle. No extension-host code, no new
API calls. The history array and keydown handler are ~30 lines.
