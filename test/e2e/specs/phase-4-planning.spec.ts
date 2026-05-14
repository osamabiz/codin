import { test, expect } from '@playwright/test';
import { launchVSCode, loadScript } from '../helpers/launch-vscode';
import { ChatPanel } from '../helpers/chat-panel';
import { SidebarPanel } from '../helpers/sidebar';

test.describe('Phase 4 — Planning', () => {
  test('plan steps appear in sidebar', async () => {
    const { page } = await launchVSCode();
    await loadScript('multi-step-plan');
    const chat = new ChatPanel(page);
    const sidebar = new SidebarPanel(page);

    await chat.typeMessage('Create a math utility with add and subtract functions');

    await page.locator('[data-testid="plan-step"]').first().waitFor({ timeout: 10000 });

    const steps = await page.locator('[data-testid="plan-step"]').all();
    expect(steps.length).toBeGreaterThan(0);
  });

  test('step status attribute is present on plan steps', async () => {
    const { page } = await launchVSCode();
    await loadScript('multi-step-plan');
    const chat = new ChatPanel(page);

    await chat.typeMessage('Create a math utility');
    await page.locator('[data-testid="plan-step"]').first().waitFor({ timeout: 10000 });

    const statuses = await (new SidebarPanel(page)).getStepStatuses();
    expect(statuses.length).toBeGreaterThan(0);
    // Each step should have a valid status
    for (const s of statuses) {
      expect(['pending', 'active', 'done', 'failed']).toContain(s);
    }
  });
});
