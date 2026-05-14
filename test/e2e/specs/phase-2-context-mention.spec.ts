import { test, expect } from '@playwright/test';
import { launchVSCode, loadScript } from '../helpers/launch-vscode';
import { ChatPanel } from '../helpers/chat-panel';

test.describe('Phase 2 — Context mentions', () => {
  test('context pill appears when file is attached', async () => {
    const { page } = await launchVSCode();
    await loadScript('simple-chat');
    const chat = new ChatPanel(page);

    // Simulate a context item being added via postMessage from extension
    // (In real E2E this would use @file trigger; here we verify the pill renders)
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            command: 'contextItemAdded',
            item: { type: 'file', label: 'src/hello.ts', content: 'export function greet() {}' },
          },
        })
      );
    });

    const pills = await chat.getContextPills();
    expect(pills.length).toBeGreaterThan(0);
    expect(pills[0]).toContain('src/hello.ts');
  });

  test('token counter updates when text is typed', async () => {
    const { page } = await launchVSCode();
    const input = page.locator('[data-testid="chat-input"]');
    const counter = page.locator('[data-testid="token-counter"]');

    await input.fill('This is a test message');
    await expect(counter).not.toHaveText('~0 tokens', { timeout: 1000 });
  });
});
