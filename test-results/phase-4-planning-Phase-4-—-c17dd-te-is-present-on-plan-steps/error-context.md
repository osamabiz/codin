# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase-4-planning.spec.ts >> Phase 4 — Planning >> step status attribute is present on plan steps
- Location: test\e2e\specs\phase-4-planning.spec.ts:21:7

# Error details

```
Error: electron.launch: Target page, context or browser has been closed
Browser logs:

<launching> "C:\Users\md_os\OneDrive\Desktop\codin\.vscode-test\vscode-win32-x64-archive-1.120.0\Code.exe" "--inspect=0" "--remote-debugging-port=0" "--extensionDevelopmentPath=C:\Users\md_os\OneDrive\Desktop\codin" "--disable-extensions" "C:\Users\md_os\OneDrive\Desktop\codin\test\fixtures\workspace" 
<launched> pid=9844
[pid=9844][out] 
[pid=9844][err] Debugger listening on ws://127.0.0.1:60907/f36a5a28-f7c6-4dd1-be8e-aba133617f49
[pid=9844][err] For help, see: https://nodejs.org/en/docs/inspector
[pid=9844][err] Debugger attached.
[pid=9844][err] 
[pid=9844][err] DevTools listening on ws://127.0.0.1:60913/devtools/browser/27541b97-056c-4f23-a43b-b9e7af497dfb
[pid=9844][err] Warning: 'remote-debugging-port' is not in the list of known options, but still passed to Electron/Chromium.
Call log:
  - <launching> "C:\Users\md_os\OneDrive\Desktop\codin\.vscode-test\vscode-win32-x64-archive-1.120.0\Code.exe" "--inspect=0" "--remote-debugging-port=0" "--extensionDevelopmentPath=C:\Users\md_os\OneDrive\Desktop\codin" "--disable-extensions" "C:\Users\md_os\OneDrive\Desktop\codin\test\fixtures\workspace"
  - <launched> pid=9844
  - [pid=9844][out]
  - [pid=9844][err] Debugger listening on ws://127.0.0.1:60907/f36a5a28-f7c6-4dd1-be8e-aba133617f49
  - [pid=9844][err] For help, see: https://nodejs.org/en/docs/inspector
  - <ws connecting> ws://127.0.0.1:60907/f36a5a28-f7c6-4dd1-be8e-aba133617f49
  - <ws connected> ws://127.0.0.1:60907/f36a5a28-f7c6-4dd1-be8e-aba133617f49
  - [pid=9844][err] Debugger attached.
  - [pid=9844][err]
  - [pid=9844][err] DevTools listening on ws://127.0.0.1:60913/devtools/browser/27541b97-056c-4f23-a43b-b9e7af497dfb
  - <ws connecting> ws://127.0.0.1:60913/devtools/browser/27541b97-056c-4f23-a43b-b9e7af497dfb
  - <ws connected> ws://127.0.0.1:60913/devtools/browser/27541b97-056c-4f23-a43b-b9e7af497dfb
  - [pid=9844][err] Warning: 'remote-debugging-port' is not in the list of known options, but still passed to Electron/Chromium.
  - <ws disconnected> ws://127.0.0.1:60907/f36a5a28-f7c6-4dd1-be8e-aba133617f49 code=1005 reason=
  - <ws disconnected> ws://127.0.0.1:60913/devtools/browser/27541b97-056c-4f23-a43b-b9e7af497dfb code=1006 reason=
  - [pid=9844] <kill>
  - [pid=9844] <will force kill>
  - [pid=9844] taskkill stdout: SUCCESS: The process with PID 10688 (child process of PID 11592) has been terminated.
SUCCESS: The process with PID 9844 (child process of PID 11568) has been terminated.
  - [pid=9844] taskkill stderr: ERROR: The process with PID 12844 (child process of PID 11592) could not be terminated.
Reason: There is no running instance of the task.
ERROR: The process with PID 11592 (child process of PID 9844) could not be terminated.
Reason: There is no running instance of the task.
  - [pid=9844] <process did exit: exitCode=1, signal=null>
  - [pid=9844] starting temporary directories cleanup
  - [pid=9844] finished temporary directories cleanup

```

# Test source

```ts
  1  | import { _electron as electron, Page } from '@playwright/test';
  2  | import path from 'path';
  3  | import fs from 'fs/promises';
  4  | import fetch from 'node-fetch';
  5  | 
  6  | const MOCK_LLM_URL = process.env['MOCK_LLM_URL'] ?? 'http://localhost:3399';
  7  | const EXTENSION_ROOT = path.resolve(__dirname, '../../..');
  8  | 
  9  | export interface LaunchOptions {
  10 |   apiKey?: string;
  11 |   dryRun?: boolean;
  12 | }
  13 | 
  14 | export async function launchVSCode(options: LaunchOptions = {}): Promise<{ page: Page }> {
  15 |   const workspaceDir = path.join(__dirname, '../../fixtures/workspace');
  16 | 
  17 |   // Write a minimal settings file so the extension uses the mock server
  18 |   const vscodeDotDir = path.join(workspaceDir, '.vscode');
  19 |   await fs.mkdir(vscodeDotDir, { recursive: true });
  20 |   await fs.writeFile(
  21 |     path.join(vscodeDotDir, 'settings.json'),
  22 |     JSON.stringify({
  23 |       'codin.provider': 'claude',
  24 |       'codin.model': 'claude-sonnet-4-5',
  25 |       'codin.customBaseUrl': MOCK_LLM_URL,
  26 |       // If options.apiKey is explicitly '', we omit it to test onboarding.
  27 |       // Otherwise we inject the mock key so existing tests bypass onboarding.
  28 |       ...(options.apiKey !== '' ? { 'codin.apiKey': options.apiKey ?? 'mock-test-key' } : {})
  29 |     }),
  30 |     'utf-8'
  31 |   );
  32 | 
  33 |   const executablePath = await require('@vscode/test-electron').downloadAndUnzipVSCode();
> 34 |   const app = await electron.launch({
     |               ^ Error: electron.launch: Target page, context or browser has been closed
  35 |     executablePath,
  36 |     args: [
  37 |       '--extensionDevelopmentPath=' + EXTENSION_ROOT,
  38 |       '--disable-extensions',
  39 |       workspaceDir,
  40 |     ],
  41 |     env: {
  42 |       ...process.env,
  43 |       MOCK_LLM_URL,
  44 |       VSCODE_AGENT_API_KEY: options.apiKey ?? 'mock-test-key',
  45 |     },
  46 |   });
  47 | 
  48 |   const page = await app.firstWindow();
  49 |   await page.waitForLoadState('domcontentloaded');
  50 | 
  51 |   return { page };
  52 | }
  53 | 
  54 | export async function loadScript(scriptName: string): Promise<void> {
  55 |   const res = await fetch(`${MOCK_LLM_URL}/load-script/${scriptName}`);
  56 |   if (!res.ok) {
  57 |     throw new Error(`Failed to load script "${scriptName}": ${res.status}`);
  58 |   }
  59 | }
  60 | 
  61 | export async function readFixtureFile(relativePath: string): Promise<string> {
  62 |   const fullPath = path.join(__dirname, '../../fixtures/workspace', relativePath);
  63 |   return fs.readFile(fullPath, 'utf-8');
  64 | }
  65 | 
```