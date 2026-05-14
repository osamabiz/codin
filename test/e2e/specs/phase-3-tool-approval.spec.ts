import { test, expect } from '@playwright/test';
import { launchVSCode, loadScript, readFixtureFile } from '../helpers/launch-vscode';
import { ChatPanel } from '../helpers/chat-panel';

test.describe('Phase 3 — Tool approval flow', () => {
  test('shows tool card before writing a file', async () => {
    const { page } = await launchVSCode();
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Add a comment to src/hello.ts');

    await page.locator('[data-testid="tool-card"]').waitFor({ timeout: 10000 });
    expect(await chat.isToolCardVisible()).toBe(true);
  });

  test('file is unmodified after rejection', async () => {
    const { page } = await launchVSCode();
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    const contentBefore = await readFixtureFile('src/hello.ts');

    await chat.typeMessage('Add a comment to src/hello.ts');
    await page.locator('[data-testid="tool-card"]').waitFor({ timeout: 10000 });
    await chat.rejectToolCard();

    const contentAfter = await readFixtureFile('src/hello.ts');
    expect(contentAfter).toBe(contentBefore);
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

  test('approve and reject buttons have correct test IDs', async () => {
    const { page } = await launchVSCode();
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Add a comment to src/hello.ts');
    await page.locator('[data-testid="tool-card"]').waitFor({ timeout: 10000 });

    await expect(page.locator('[data-testid="btn-approve"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-reject"]')).toBeVisible();
  });
});
