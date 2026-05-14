import { Page } from '@playwright/test';

export class SidebarPanel {
  constructor(private readonly page: Page) {}

  async getPlanSteps(): Promise<string[]> {
    const steps = await this.page.locator('[data-testid="plan-step"]').all();
    return Promise.all(steps.map((s) => s.innerText()));
  }

  async getStepStatuses(): Promise<string[]> {
    const steps = await this.page.locator('[data-testid="plan-step"]').all();
    return Promise.all(
      steps.map((s) => s.getAttribute('data-status').then((v) => v ?? 'pending'))
    );
  }

  async waitForPlanStep(): Promise<void> {
    await this.page.locator('[data-testid="plan-step"]').first().waitFor({ timeout: 10000 });
  }
}
