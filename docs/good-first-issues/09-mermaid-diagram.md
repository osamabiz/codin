## Summary

`docs/architecture.md` currently has a hand-drawn ASCII diagram showing the six architectural
layers of the extension. Replace or supplement it with a [Mermaid](https://mermaid.js.org/)
flowchart that GitHub renders natively. The diagram must represent the same layers as the ASCII
version: UI → Extension Host → Agent Core → Tools → LLM Provider → External Services.

## Why it matters

The ASCII diagram is hard to read on GitHub and impossible to update without careful manual
spacing. Mermaid diagrams are:
- Rendered automatically by GitHub in `.md` files — no extra tooling required
- Diff-friendly (plain text, not a binary image)
- Easy for contributors to modify as the architecture evolves

This is the first file new contributors read to understand the project. A clear, well-rendered
diagram makes onboarding faster.

## Relevant spec file

`docs/architecture.md` — contains the ASCII diagram to be replaced and the prose descriptions of
each layer that the diagram should be consistent with.

## Acceptance criteria

- [ ] `docs/architecture.md` contains a Mermaid `flowchart TD` (or `graph TD`) code block
- [ ] The diagram shows all six layers from the existing ASCII version:
  - [ ] VS Code Interface (Chat panel · Inline diff · Command palette)
  - [ ] Extension Host (Event listeners · Webview · Commands · FS access)
  - [ ] Agent Core (Planner → Tool executor → Memory / context, with the feedback loop)
  - [ ] Built-in Tools (read_file · write_file · run_command · grep · git)
  - [ ] LLM Provider (Claude · OpenAI · Gemini · Ollama)
  - [ ] External Services (GitHub · npm/PyPI · Docs search · MCP servers)
- [ ] Arrows flow top-to-bottom (user layer at top, external services at bottom), matching the existing ASCII layout
- [ ] The Agent Core feedback loop (`observe → reflect → re-plan`) is represented (a cycle/loop subgraph or a back-edge)
- [ ] The Mermaid block renders without errors on [mermaid.live](https://mermaid.live) — paste it in and confirm it renders before submitting the PR
- [ ] The original ASCII diagram is either removed or left as a collapsed `<details>` block — do not keep both as top-level content
- [ ] No other content in `docs/architecture.md` is changed (the prose sections remain intact)

## Estimated complexity

**S** — Documentation-only change. No code, no tests. The main work is translating the existing
ASCII layout into valid Mermaid syntax and verifying it renders correctly.
