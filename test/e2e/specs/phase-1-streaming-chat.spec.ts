import { test, expect } from '@playwright/test';
import { launchVSCode, loadScript } from '../helpers/launch-vscode';
import { ChatPanel } from '../helpers/chat-panel';

test.describe('Phase 1 — Streaming chat', () => {
  test('sends a message and receives a streaming response', async () => {
    const { page } = await launchVSCode();
    await loadScript('simple-chat');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Hello');
    await chat.waitForResponse();

    const response = await chat.getLastAssistantMessage();
    expect(response.length).toBeGreaterThan(0);
  });

  test('shows error banner on bad API key', async () => {
    const { page } = await launchVSCode({ apiKey: 'invalid-key' });
    const chat = new ChatPanel(page);

    await chat.typeMessage('Hello');
    await page.locator('[data-testid="error-banner"]').waitFor({ timeout: 5000 });

    const error = await page.locator('[data-testid="error-banner"]').innerText();
    expect(error.length).toBeGreaterThan(0);
  });

  test('retry button appears after error', async () => {
    const { page } = await launchVSCode({ apiKey: 'invalid-key' });
    const chat = new ChatPanel(page);

    await chat.typeMessage('Hello');
    await page.locator('[data-testid="error-banner"]').waitFor({ timeout: 5000 });
    await expect(page.locator('[data-testid="btn-retry"]')).toBeVisible();
  });

  test('stop button appears while streaming', async () => {
    const { page } = await launchVSCode();
    await loadScript('simple-chat');
    const chat = new ChatPanel(page);

    const stopBtn = page.locator('[data-testid="btn-stop"]');
    await chat.typeMessage('Hello');
    // Stop button should become visible during streaming
    await expect(stopBtn).toBeVisible({ timeout: 3000 });
  });
});
