# Testing strategy

## Overview

The project has two layers of testing:

1. **Unit tests** (Vitest) — fast, no VS Code needed, run in CI on every push
2. **Integration tests** (VS Code Extension Test Runner) — require a VS Code instance, run before releases

This document covers the unit test strategy. Integration tests are documented inline in `test/integration/`.

---

## Test structure

```
test/
├── agent/
│   ├── agent.test.ts          ← agent.run() full loop (mocked provider + tools)
│   ├── planner.test.ts        ← plan parsing, fallback to single-step
│   ├── memory.test.ts         ← append, trim, serialize, deserialize
│   └── loop.test.ts           ← stop flag, maxSteps guard, re-plan on failure
├── providers/
│   ├── claude.test.ts         ← message format, streaming chunk parsing, testConnection
│   ├── openai.test.ts
│   ├── gemini.test.ts
│   └── ollama.test.ts
├── tools/
│   ├── read-file.test.ts
│   ├── write-file.test.ts     ← path traversal, confirmation gate
│   ├── create-file.test.ts
│   ├── delete-file.test.ts
│   ├── run-command.test.ts    ← timeout, blocked patterns, exit codes
│   ├── grep-codebase.test.ts
│   ├── list-files.test.ts
│   ├── git-status.test.ts
│   └── git-commit.test.ts
├── utils/
│   ├── settings.test.ts
│   └── tokens.test.ts
└── fixtures/
    ├── workspace/             ← fake workspace files for tool tests
    │   ├── src/
    │   │   └── auth.ts
    │   └── package.json
    └── responses/             ← recorded LLM API responses for provider tests
        ├── claude-stream.txt
        └── openai-stream.txt
```

---

## Vitest config (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
```

---

## Mocking patterns

### Mocking the VS Code API

VS Code is not available in Vitest's Node environment. Use a mock module:

```typescript
// test/__mocks__/vscode.ts
export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
    update: vi.fn(),
  }),
  workspaceFolders: [{ uri: { fsPath: '/fake/workspace' } }],
};

export const window = {
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  createStatusBarItem: vi.fn().mockReturnValue({ show: vi.fn(), dispose: vi.fn() }),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
};

export const SecretStorage = vi.fn().mockImplementation(() => ({
  get: vi.fn(),
  store: vi.fn(),
  delete: vi.fn(),
}));
```

Add to `vitest.config.ts`:
```typescript
resolve: {
  alias: { vscode: path.resolve(__dirname, 'test/__mocks__/vscode.ts') }
}
```

### Mocking an LLM provider

```typescript
const mockProvider: ILLMProvider = {
  name: 'Mock',
  id: 'mock',
  supportsToolUse: true,
  supportsStreaming: true,
  availableModels: [],
  testConnection: vi.fn().mockResolvedValue({ ok: true }),
  chat: vi.fn().mockImplementation(async function* () {
    yield { type: 'token', content: 'Hello ' };
    yield { type: 'token', content: 'world' };
    yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } };
  }),
};
```

### Mocking the file system

Use `memfs` for file system operations in tool tests:

```typescript
import { createFsFromVolume, Volume } from 'memfs';

const vol = Volume.fromJSON({
  '/fake/workspace/src/auth.ts': 'export function login() {}',
  '/fake/workspace/package.json': '{ "name": "my-app" }',
});
const fs = createFsFromVolume(vol);
vi.mock('fs', () => fs);
vi.mock('fs/promises', () => fs.promises);
```

---

## Required tests per tool

Every tool must have tests for:

```typescript
describe('write_file', () => {
  it('writes file content on approval', async () => { ... });
  it('rejects path outside workspace root', async () => { ... });
  it('rejects path traversal (../../etc/passwd)', async () => { ... });
  it('emits waiting_for_approval before writing', async () => { ... });
  it('does not write if confirmation is rejected', async () => { ... });
});
```

---

## Required tests per provider

```typescript
describe('ClaudeProvider', () => {
  it('converts canonical messages to Anthropic wire format', () => { ... });
  it('parses SSE stream chunks into ChatChunk tokens', async () => { ... });
  it('parses tool_use content block into tool_call event', async () => { ... });
  it('testConnection returns ok:true on 200', async () => { ... });
  it('testConnection returns ok:false with error on 401', async () => { ... });
});
```

---

## Required tests for agent loop

```typescript
describe('Agent loop', () => {
  it('completes a task with no tool calls (text-only response)', async () => { ... });
  it('executes a tool call and injects result into context', async () => { ... });
  it('stops cleanly when stop() is called between tool calls', async () => { ... });
  it('re-plans when a tool returns an error result', async () => { ... });
  it('pauses and emits waiting_for_approval when maxSteps is exceeded', async () => { ... });
  it('resumes after user approves continuation', async () => { ... });
  it('respects autoApproveReadOnly option', async () => { ... });
});
```

---

## Running tests

```bash
# Run all unit tests
npm test

# Run with coverage report
npm run test:coverage

# Run a specific file
npx vitest test/tools/write-file.test.ts

# Run in watch mode during development
npx vitest --watch
```

---

## CI requirement

GitHub Actions runs `npm test` on every push and PR to `main`. PRs cannot be merged if tests fail. Coverage thresholds are enforced in CI — a PR that drops coverage below the threshold will fail.

```yaml
# .github/workflows/ci.yml (relevant step)
- name: Test
  run: npm test -- --coverage
```
