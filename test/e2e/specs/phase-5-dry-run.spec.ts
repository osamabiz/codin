import { test, expect } from '@playwright/test';
import { launchVSCode, loadScript, readFixtureFile } from '../helpers/launch-vscode';
import { ChatPanel } from '../helpers/chat-panel';

test.describe('Phase 5 — Dry run mode', () => {
  test('dry run shows what agent would do without executing', async () => {
    const { page } = await launchVSCode({ dryRun: true });
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    const contentBefore = await readFixtureFile('src/hello.ts');

    // Enable dry run via the button in the chat panel top bar
    await page.locator('#dryRunBtn').click();
    await expect(page.locator('#dryRunBtn')).toHaveClass(/active/);

    await chat.typeMessage('Add a comment to src/hello.ts');
    await page.locator('[data-testid="dry-run-card"]').waitFor({ timeout: 10000 });

    // File must NOT be touched
    const contentAfter = await readFixtureFile('src/hello.ts');
    expect(contentAfter).toBe(contentBefore);

    // Dry run card should describe what would have happened
    const cardText = await page.locator('[data-testid="dry-run-card"]').innerText();
    expect(cardText).toContain('write_file');
  });

  test('dry run card is visible when tool would be called', async () => {
    const { page } = await launchVSCode();
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    // Enable dry run
    await page.locator('#dryRunBtn').click();
    await chat.typeMessage('Modify src/hello.ts');

    await page.locator('[data-testid="dry-run-card"]').waitFor({ timeout: 10000 });
    expect(await chat.isDryRunCardVisible()).toBe(true);
  });

  test('toggling dry run off resumes normal approval flow', async () => {
    const { page } = await launchVSCode();
    await loadScript('write-file-task');
    const chat = new ChatPanel(page);

    // Enable then disable
    await page.locator('#dryRunBtn').click();
    await page.locator('#dryRunBtn').click();
    await expect(page.locator('#dryRunBtn')).not.toHaveClass(/active/);

    await chat.typeMessage('Add a comment to src/hello.ts');
    await page.locator('[data-testid="tool-card"]').waitFor({ timeout: 10000 });
    expect(await chat.isToolCardVisible()).toBe(true);
  });
});
