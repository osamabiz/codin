# Contributing to Codin

Thank you for your interest in contributing to Codin! We are building the best open-source AI coding assistant for VS Code.

## Prerequisites
- Node.js 18+
- VS Code 1.85+
- Git

## Dev Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/open-source/codin.git
   cd codin
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Launch the extension:**
   - Open the project in VS Code.
   - Press `F5` to open a new Extension Development Host window with Codin loaded.

## Project Structure

Before jumping into the code, check out our specification documents in the `docs/` folder:
- [Agent Logic](docs/components/agent.md)
- [Chat & Settings Webviews](docs/pages/chat-panel.md)
- [Onboarding Webview](docs/pages/onboarding.md)
- [Tools Overview](docs/components/tools.md)
- [LLM Providers Architecture](docs/components/llm-providers.md)

## How to add a new LLM provider

Adding a new provider is straightforward. Follow these 5 steps (reference [docs/components/llm-providers.md](docs/components/llm-providers.md) for full details):

1. **Create the file**: Add a new file in `src/providers/<provider>.ts`.
2. **Implement the interface**: Export a class that implements `ILLMProvider`. Use `OpenAIBaseProvider` if the API is OpenAI-compatible.
3. **Register the provider**: Add your new provider to the `PROVIDERS` registry in `src/providers/index.ts`.
4. **Update package.json**: Add the provider to the `codin.provider` enum in `package.json` configuration properties.
5. **Update onboarding & settings UI**: Add the new provider options to the HTML selects in `webview-ui/onboarding.html` and `src/ui/SettingsPanel.ts`.

## How to add a new tool

Tools allow the agent to interact with the system. Follow these 4 steps (reference [docs/components/tools.md](docs/components/tools.md)):

1. **Create the tool definition**: Define the schema, inputs, and execute function in `src/tools/<tool-name>.ts`.
2. **Implement the logic**: Write the execution code, ensuring it properly captures stdout, stderr, and handles errors safely.
3. **Update the agent prompt**: Explain how to use the tool in the `SystemPrompt` located in `src/agent/prompt.ts`.
4. **Register the tool**: Add it to the array of available tools in the context builder (`src/utils/context-builder.ts`).

## Testing Guide

- **Unit Tests**: Run `npm test` to run all Vitest tests.
- **Integration Tests**: Run `npm run test:integration` (requires the VS Code test runner).
- **End-to-End Tests**: Run `npm run test:e2e` for Playwright tests. This automatically uses our mock LLM server located in `test/e2e/mock-llm-server/` so you don't need real API keys.

## PR Process

1. Keep it focused: One feature or bug fix per Pull Request.
2. **Update specs**: If you change behavior, update the relevant spec file in `docs/`.
3. **Tests required**: Add unit tests for your changes. `npm test` must pass.
4. **Linting**: Ensure `npm run lint` passes without errors.
5. **Code review**: A maintainer will review your code. We require all checks to pass before merging.
