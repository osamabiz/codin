# Testing automation

## Overview

Three-tier automated test suite that runs entirely in CI with no human involvement. Each tier has a different speed/coverage trade-off. The coding agent implements each tier as part of the phase it belongs to.

```
Tier 1: Unit tests          → Vitest          → ~3s    → every commit
Tier 2: Integration tests   → vscode/test-electron → ~30s → every PR
Tier 3: E2E tests           → Playwright      → ~2min  → merge to main only
```

---

## When each tier is implemented

| Tier | Implemented in | Why |
|---|---|---|
| Unit tests | Each phase (already in spec) | Fast feedback during development |
| Integration tests | Phase 5 | By then the extension API surface is stable |
| E2E tests | Phase 6 (pre-launch) | Protects against regressions before going public |

---

## Tier 1 — Unit tests (Vitest)

Already fully specced in `docs/testing.md`. Summarized here for completeness.

**Runs:** On every commit, every PR, locally with `npm test`
**Speed:** ~3 seconds
**Requires:** Node.js only — no VS Code, no display

**What it covers:**
- All 10 built-in tools (happy path + path traversal + error handling)
- All 4 LLM provider adapters (message format + streaming parsing)
- Agent loop (tool dispatch, stop flag, maxSteps, re-plan on failure)
- Memory (append, trim, serialize, deserialize)
- Planner (JSON plan parsing, fallback to single-step)
- Token counter approximation
- Settings manager (SecretStorage mock, config read/write)

**Coverage thresholds (enforced in CI):**
```
lines:     80%
functions: 80%
branches:  75%
```

**Run command:**
```bash
npm test
npm run test:coverage   # with coverage report
```

---

## Tier 2 — Integration tests (`@vscode/test-electron`)

Spins up a real headless VS Code instance, installs the extension, and runs tests inside the Extension Host. Slower than unit tests but tests real VS Code API behaviour.

### Setup

```bash
npm install --save-dev @vscode/test-electron @vscode/test-cli
```

Add to `package.json`:
```json
{
  "scripts": {
    "test:integration": "vscode-test"
  }
}
```

Add `.vscode-test.mjs`:
```javascript
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'test/integration/**/*.test.ts',
  workspaceFolder: './test/fixtures/workspace',
  mocha: { timeout: 10000 }
});
```

### File structure

```
test/integration/
├── suite/
│   ├── index.ts                      ← Mocha test runner entry
│   ├── extension.test.ts             ← activation + command registration
│   ├── settings.test.ts              ← settings save/load via real SecretStorage
│   ├── chat-panel.test.ts            ← panel opens, webview loads
│   ├── sidebar.test.ts               ← tree view items render
│   ├── tool-registry.test.ts         ← tools registered and callable
│   └── file-tools.test.ts            ← read/write/delete against real workspace
└── runTests.ts                       ← test runner bootstrap
```

### `runTests.ts`

```typescript
import { runTests } from '@vscode/test-electron';
import path from 'path';

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const testWorkspace = path.resolve(__dirname, '../fixtures/workspace');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [testWorkspace, '--disable-extensions'],
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### Tests to write

#### `extension.test.ts`
```typescript
import * as vscode from 'vscode';
import * as assert from 'assert';

suite('Extension activation', () => {
  test('extension activates without error', async () => {
    const ext = vscode.extensions.getExtension('open-source.vscode-agent');
    assert.ok(ext);
    await ext!.activate();
    assert.ok(ext!.isActive);
  });

  test('all commands are registered', async () => {
    const commands = await vscode.commands.getCommands();
    const expected = [
      'agentPlugin.openChat',
      'agentPlugin.newChat',
      'agentPlugin.openSettings',
      'agentPlugin.stopAgent',
      'agentPlugin.toggleDryRun',
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `Missing command: ${cmd}`);
    }
  });

  test('status bar item is visible', async () => {
    // Extension activates → status bar item appears
    // Indirect: if no exception thrown, item was created
    await vscode.commands.executeCommand('agentPlugin.openChat');
    // Give webview time to load
    await new Promise(r => setTimeout(r, 1000));
    // No assertion needed — if command throws, test fails
  });
});
```

#### `settings.test.ts`
```typescript
suite('Settings', () => {
  test('provider setting defaults to claude', () => {
    const config = vscode.workspace.getConfiguration('agentPlugin');
    assert.strictEqual(config.get('provider'), 'claude');
  });

  test('maxSteps defaults to 25', () => {
    const config = vscode.workspace.getConfiguration('agentPlugin');
    assert.strictEqual(config.get('maxSteps'), 25);
  });

  test('can update provider setting', async () => {
    const config = vscode.workspace.getConfiguration('agentPlugin');
    await config.update('provider', 'openai', vscode.ConfigurationTarget.Workspace);
    assert.strictEqual(config.get('provider'), 'openai');
    // Restore
    await config.update('provider', 'claude', vscode.ConfigurationTarget.Workspace);
  });
});
```

#### `file-tools.test.ts`
```typescript
import * as path from 'path';
import * as fs from 'fs/promises';

suite('File tools (real filesystem)', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

  test('read_file reads a real file', async () => {
    const tool = getToolRegistry().getTool('read_file');
    const result = await tool.execute(
      { path: 'package.json' },
      { workspaceRoot, vscode }
    );
    assert.ok(result.ok);
    assert.ok(result.output.includes('"name"'));
  });

  test('read_file rejects path outside workspace', async () => {
    const tool = getToolRegistry().getTool('read_file');
    const result = await tool.execute(
      { path: '../../etc/passwd' },
      { workspaceRoot, vscode }
    );
    assert.ok(!result.ok);
    assert.ok(result.error.includes('outside workspace'));
  });

  test('list_files returns workspace files', async () => {
    const tool = getToolRegistry().getTool('list_files');
    const result = await tool.execute(
      { path: '.', recursive: false },
      { workspaceRoot, vscode }
    );
    assert.ok(result.ok);
    assert.ok(result.output.includes('package.json'));
  });

  test('grep_codebase finds a pattern', async () => {
    const tool = getToolRegistry().getTool('grep_codebase');
    const result = await tool.execute(
      { pattern: 'vscode-agent', fileGlob: '*.json' },
      { workspaceRoot, vscode }
    );
    assert.ok(result.ok);
    assert.ok(result.output.includes('package.json'));
  });
});
```

**Run command:**
```bash
npm run test:integration
```

---

## Tier 3 — E2E tests (Playwright + VS Code)

Controls a full VS Code window like a browser. Tests real user flows end-to-end with a **mocked LLM** so results are deterministic and free.

### Setup

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Playwright can drive VS Code's Electron shell using its `electron` launch mode. The key trick: inject a mock LLM server that the extension talks to instead of the real API.

### Mock LLM server

A tiny Express server that returns scripted responses. Runs as a child process during tests.

```
test/e2e/
├── mock-llm-server/
│   ├── server.ts          ← Express server mimicking Anthropic/OpenAI API
│   └── scripts/           ← pre-written response scripts per test scenario
│       ├── simple-chat.json
│       ├── write-file-task.json
│       ├── multi-step-plan.json
│       └── tool-failure-replan.json
├── fixtures/
│   └── workspace/         ← test workspace with known files
├── helpers/
│   ├── launch-vscode.ts   ← launches VS Code with extension + mock server URL
│   ├── chat-panel.ts      ← page object for chat panel interactions
│   └── sidebar.ts         ← page object for sidebar interactions
├── specs/
│   ├── phase-1-streaming-chat.spec.ts
│   ├── phase-2-context-mention.spec.ts
│   ├── phase-3-tool-approval.spec.ts
│   ├── phase-4-planning.spec.ts
│   └── phase-5-dry-run.spec.ts
└── playwright.config.ts
```

### Mock LLM server (`mock-llm-server/server.ts`)

```typescript
import express from 'express';

const app = express();
app.use(express.json());

// Loaded per-test via ?script= query param
let activeScript: ResponseScript | null = null;

app.post('/set-script', (req, res) => {
  activeScript = req.body;
  res.json({ ok: true });
});

// Mimics Anthropic Messages API with streaming
app.post('/v1/messages', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  if (!activeScript) {
    res.write('data: {"type":"error","error":"No script loaded"}\n\n');
    res.end();
    return;
  }

  for (const event of activeScript.events) {
    await sleep(event.delayMs ?? 20);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }
  res.end();
});

app.listen(3399, () => console.log('Mock LLM server on :3399'));
```

### Response script example (`scripts/write-file-task.json`)

```json
{
  "description": "Agent reads a file then proposes a write",
  "events": [
    { "data": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } } },
    { "data": { "type": "content_block_delta", "delta": { "type": "text_delta", "text": "I'll read the file first." } } },
    { "data": { "type": "content_block_stop" } },
    { "data": { "type": "content_block_start", "index": 1, "content_block": { "type": "tool_use", "id": "tool_1", "name": "read_file", "input": {} } } },
    { "data": { "type": "content_block_delta", "delta": { "type": "input_json_delta", "partial_json": "{\"path\":\"src/hello.ts\"}" } } },
    { "data": { "type": "content_block_stop" } },
    { "data": { "type": "message_delta", "delta": { "stop_reason": "tool_use" } } }
  ]
}
```

### Page objects (`helpers/chat-panel.ts`)

```typescript
import { Page } from '@playwright/test';

export class ChatPanel {
  constructor(private page: Page) {}

  async typeMessage(text: string) {
    await this.page.locator('[data-testid="chat-input"]').fill(text);
    await this.page.keyboard.press('Enter');
  }

  async waitForResponse() {
    await this.page.locator('[data-testid="message-assistant"]').waitFor({ timeout: 10000 });
  }

  async getLastAssistantMessage(): Promise<string> {
    const messages = await this.page.locator('[data-testid="message-assistant"]').all();
    return messages[messages.length - 1].innerText();
  }

  async approveToolCard() {
    await this.page.locator('[data-testid="btn-approve"]').click();
  }

  async rejectToolCard() {
    await this.page.locator('[data-testid="btn-reject"]').click();
  }

  async isToolCardVisible(): Promise<boolean> {
    return this.page.locator('[data-testid="tool-card"]').isVisible();
  }

  async getContextPills(): Promise<string[]> {
    const pills = await this.page.locator('[data-testid="context-pill"]').all();
    return Promise.all(pills.map(p => p.innerText()));
  }

  async clickStop() {
    await this.page.locator('[data-testid="btn-stop"]').click();
  }
}
```

**Note:** Add `data-testid` attributes to webview HTML elements as you build them in Phases 1–4. This is the bridge between Playwright and the webview DOM.

### E2E specs

#### `phase-1-streaming-chat.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { launchVSCode, loadScript } from '../helpers/launch-vscode';
import { ChatPanel } from '../helpers/chat-panel';

test.describe('Phase 1 — Streaming chat', () => {
  test('sends a message and receives a streaming response', async () => {
    const { page } = await launchVSCode();
    await loadScript('simple-chat');   // loads script into mock server
    const chat = new ChatPanel(page);

    await chat.typeMessage('Hello');
    await chat.waitForResponse();

    const response = await chat.getLastAssistantMessage();
    expect(response.length).toBeGreaterThan(0);
  });

  test('shows error message on bad API key', async () => {
    const { page } = await launchVSCode({ apiKey: 'invalid-key' });
    const chat = new ChatPanel(page);

    await chat.typeMessage('Hello');
    await page.locator('[data-testid="error-banner"]').waitFor({ timeout: 5000 });

    const error = await page.locator('[data-testid="error-banner"]').innerText();
    expect(error).toContain('API key');
  });
});
```

#### `phase-3-tool-approval.spec.ts`

```typescript
test.describe('Phase 3 — Tool approval flow', () => {
  test('shows diff and approval card before writing a file', async () => {
    const { page } = await launchVSCode();
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Add a comment to src/hello.ts');

    // Tool card should appear
    await page.locator('[data-testid="tool-card"]').waitFor({ timeout: 10000 });
    expect(await chat.isToolCardVisible()).toBe(true);

    // File should NOT be modified yet
    const contentBefore = await readFixtureFile('src/hello.ts');

    await chat.rejectToolCard();

    // File should still be unmodified after rejection
    const contentAfter = await readFixtureFile('src/hello.ts');
    expect(contentAfter).toBe(contentBefore);
  });

  test('writes file after approval', async () => {
    const { page } = await launchVSCode();
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Add a comment to src/hello.ts');
    await page.locator('[data-testid="tool-card"]').waitFor({ timeout: 10000 });
    await chat.approveToolCard();

    // Wait for agent to complete
    await page.locator('[data-testid="message-done"]').waitFor({ timeout: 10000 });

    // File should now be modified
    const content = await readFixtureFile('src/hello.ts');
    expect(content).toContain('// ');
  });

  test('path traversal is blocked', async () => {
    const { page } = await launchVSCode();
    await loadScript('path-traversal-attempt');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Read ../../etc/passwd');
    await chat.waitForResponse();

    const response = await chat.getLastAssistantMessage();
    expect(response.toLowerCase()).toContain('outside workspace');
  });
});
```

#### `phase-4-planning.spec.ts`

```typescript
test.describe('Phase 4 — Planning', () => {
  test('plan steps appear in sidebar', async () => {
    const { page } = await launchVSCode();
    await loadScript('multi-step-plan');
    const chat = new ChatPanel(page);
    const sidebar = new SidebarPanel(page);

    await chat.typeMessage('Create a math utility with add and subtract functions');

    // Plan should appear in sidebar
    await page.locator('[data-testid="plan-step"]').first().waitFor({ timeout: 10000 });

    const steps = await page.locator('[data-testid="plan-step"]').all();
    expect(steps.length).toBeGreaterThan(1);
  });

  test('step status updates from pending to complete', async () => {
    const { page } = await launchVSCode();
    await loadScript('multi-step-plan');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Create a math utility');

    // First step should become active
    const firstStep = page.locator('[data-testid="plan-step"]').first();
    await expect(firstStep).toHaveAttribute('data-status', 'active', { timeout: 10000 });

    // After approving tool calls, first step should complete
    if (await chat.isToolCardVisible()) await chat.approveToolCard();
    await expect(firstStep).toHaveAttribute('data-status', 'done', { timeout: 10000 });
  });
});
```

#### `phase-5-dry-run.spec.ts`

```typescript
test.describe('Phase 5 — Dry run mode', () => {
  test('dry run shows what agent would do without executing', async () => {
    const { page } = await launchVSCode({ dryRun: true });
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    const contentBefore = await readFixtureFile('src/hello.ts');

    await chat.typeMessage('Add a comment to src/hello.ts');
    await page.locator('[data-testid="dry-run-card"]').waitFor({ timeout: 10000 });

    // File must NOT be touched
    const contentAfter = await readFixtureFile('src/hello.ts');
    expect(contentAfter).toBe(contentBefore);

    // Dry run card should describe what would have happened
    const cardText = await page.locator('[data-testid="dry-run-card"]').innerText();
    expect(cardText).toContain('write_file');
  });
});
```

---

## `data-testid` attributes required in webview HTML

Add these as each phase is built. The E2E tests depend on them:

| Element | `data-testid` |
|---|---|
| Chat input textarea | `chat-input` |
| User message bubble | `message-user` |
| Assistant message bubble | `message-assistant` |
| Tool approval card | `tool-card` |
| Approve button | `btn-approve` |
| Reject button | `btn-reject` |
| Show diff button | `btn-show-diff` |
| Stop button | `btn-stop` |
| New chat button | `btn-new-chat` |
| Error banner | `error-banner` |
| Retry button | `btn-retry` |
| Context pill | `context-pill` |
| Token counter | `token-counter` |
| Dry run card | `dry-run-card` |
| Done indicator | `message-done` |
| Plan step (sidebar) | `plan-step` (+ `data-status="pending\|active\|done\|failed"`) |

---

## CI pipeline (`github/workflows/ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage

  integration-tests:
    name: Integration tests
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - name: Run integration tests (headless)
        run: xvfb-run -a npm run test:integration
        env:
          DISPLAY: ':99.0'

  e2e-tests:
    name: E2E tests
    runs-on: ubuntu-latest
    needs: integration-tests
    # Only on merge to main — not every PR
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - name: Start mock LLM server
        run: node test/e2e/mock-llm-server/server.js &
      - name: Run E2E tests
        run: xvfb-run -a npx playwright test
        env:
          DISPLAY: ':99.0'
          MOCK_LLM_URL: 'http://localhost:3399'
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Coding agent prompt (for Phase 5 implementation)

```
Read docs/testing-automation.md, docs/testing.md, and .agent/AGENT.md
before starting.

Implement the full testing automation spec for Phase 5:

1. Integration test setup:
   - Install @vscode/test-electron and @vscode/test-cli
   - Create .vscode-test.mjs config
   - Write test/integration/suite/index.ts runner
   - Implement all 4 integration test files as specified

2. E2E test setup:
   - Install @playwright/test
   - Create test/e2e/mock-llm-server/server.ts
   - Create response scripts: simple-chat.json, write-file-task.json,
     multi-step-plan.json, path-traversal-attempt.json
   - Implement ChatPanel and SidebarPanel page objects
   - Write all 5 E2E spec files as specified

3. Add data-testid attributes:
   - Go through webview-ui/index.html and main.ts
   - Add every data-testid from the table in this spec
   - Do not change any logic — attributes only

4. Update CI workflow:
   - Replace the existing ci.yml with the three-job pipeline from this spec
   - Ensure xvfb-run is used for headless display on Linux

5. Add npm scripts to package.json:
   - "test:integration": "vscode-test"
   - "test:e2e": "playwright test"
   - "test:all": "npm test && npm run test:integration && npm run test:e2e"

Verify by running:
  npm test                  → unit tests green
  npm run test:integration  → integration tests green
  npm run test:e2e          → e2e tests green (mock server running)
```

---

## Run commands summary

```bash
# Tier 1 — Unit (run always, ~3s)
npm test
npm run test:coverage

# Tier 2 — Integration (run before PR, ~30s)
npm run test:integration

# Tier 3 — E2E (run before release, ~2min)
node test/e2e/mock-llm-server/server.js &   # start mock server first
npm run test:e2e

# All tiers
npm run test:all
```
