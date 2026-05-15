## Summary

The Gemini provider file (`src/providers/gemini.ts`) was scaffolded in Phase 1 but is not yet fully
implemented. This issue covers completing the adapter: wiring up `gemini-2.0-flash` and
`gemini-1.5-pro`, making streaming and tool use work end-to-end, and adding unit tests that match
the pattern documented in `docs/testing.md`.

Gemini uses its own wire format — **do not** extend or reuse `src/providers/base/openai-base.ts`.
The Gemini adapter must implement `ILLMProvider` directly, following the same pattern as
`src/providers/claude.ts`.

## Why it matters

Google Gemini is one of the four first-class providers in the extension (Claude, OpenAI, Gemini,
Ollama). Users who want to bring their own Gemini API key currently see the provider in the
dropdown but get no useful response. Completing this adapter unlocks Gemini for all users at no
extra complexity cost — the provider registry already has a slot for it.

## Relevant spec file

`docs/components/llm-providers.md` — Gemini section covers the endpoint, auth scheme, tool format,
and message-role normalization that must be handled.

## Acceptance criteria

- [ ] `src/providers/gemini.ts` implements `ILLMProvider` in full (no `TODO` stubs remaining)
- [ ] `availableModels` lists at least `gemini-2.0-flash` and `gemini-1.5-pro`
- [ ] Auth uses `?key={apiKey}` query param (not an `Authorization` header)
- [ ] Endpoint follows the pattern `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
- [ ] Outgoing messages normalize the canonical `role: "assistant"` to Gemini's `role: "model"`
- [ ] Tool definitions are sent as `tools[].functionDeclarations` (not the OpenAI `tools[].function` shape)
- [ ] Streaming chunks are parsed into `ChatChunk` tokens correctly (`type: 'token'`, `type: 'tool_call'`, `type: 'done'`, `type: 'error'`)
- [ ] `testConnection()` returns `{ ok: true }` on a valid key and `{ ok: false, error }` on a 400/401
- [ ] Provider is registered in `src/providers/index.ts` under the key `"gemini"`
- [ ] Unit tests in `test/providers/gemini.test.ts` cover all five cases from `docs/testing.md`:
  - [ ] Canonical message → Gemini wire format conversion
  - [ ] SSE stream chunk → `ChatChunk` token parsing
  - [ ] `functionDeclarations` response → `tool_call` event
  - [ ] `testConnection` returns `ok: true` on HTTP 200
  - [ ] `testConnection` returns `ok: false` with error string on HTTP 401
- [ ] `npm test` passes with no new failures

## Estimated complexity

**M** — The spec is fully written and the file already exists; the work is implementing the wire
format translation and stream parser, which takes a few hours but has no design decisions left open.
