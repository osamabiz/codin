import { _electron as electron, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const MOCK_LLM_URL = process.env['MOCK_LLM_URL'] ?? 'http://localhost:3399';
const EXTENSION_ROOT = path.resolve(__dirname, '../../..');

export interface LaunchOptions {
  apiKey?: string;
  dryRun?: boolean;
}

export async function launchVSCode(options: LaunchOptions = {}): Promise<{ page: Page }> {
  const workspaceDir = path.join(__dirname, '../../fixtures/workspace');

  // Write a minimal settings file so the extension uses the mock server
  const vscodeDotDir = path.join(workspaceDir, '.vscode');
  await fs.mkdir(vscodeDotDir, { recursive: true });
  await fs.writeFile(
    path.join(vscodeDotDir, 'settings.json'),
    JSON.stringify({
      'codin.provider': 'claude',
      'codin.model': 'claude-sonnet-4-5',
      // Point to mock server via custom base URL (extension must support this)
      'codin.customBaseUrl': MOCK_LLM_URL,
    }),
    'utf-8'
  );

  const app = await electron.launch({
    executablePath: require('@vscode/test-electron').getVSCodeExecutablePath(),
    args: [
      '--extensionDevelopmentPath=' + EXTENSION_ROOT,
      '--disable-extensions',
      workspaceDir,
    ],
    env: {
      ...process.env,
      MOCK_LLM_URL,
      VSCODE_AGENT_API_KEY: options.apiKey ?? 'mock-test-key',
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return { page };
}

export async function loadScript(scriptName: string): Promise<void> {
  const res = await fetch(`${MOCK_LLM_URL}/load-script/${scriptName}`);
  if (!res.ok) {
    throw new Error(`Failed to load script "${scriptName}": ${res.status}`);
  }
}

export async function readFixtureFile(relativePath: string): Promise<string> {
  const fullPath = path.join(__dirname, '../../fixtures/workspace', relativePath);
  return fs.readFile(fullPath, 'utf-8');
}
