import { Page } from '@playwright/test';

export class ChatPanel {
  constructor(private readonly page: Page) {}

  async typeMessage(text: string): Promise<void> {
    await this.page.locator('[data-testid="chat-input"]').fill(text);
    await this.page.keyboard.press('Enter');
  }

  async waitForResponse(): Promise<void> {
    await this.page.locator('[data-testid="message-assistant"]').waitFor({ timeout: 10000 });
  }

  async getLastAssistantMessage(): Promise<string> {
    const messages = await this.page.locator('[data-testid="message-assistant"]').all();
    if (messages.length === 0) return '';
    return messages[messages.length - 1]!.innerText();
  }

  async approveToolCard(): Promise<void> {
    await this.page.locator('[data-testid="btn-approve"]').click();
  }

  async rejectToolCard(): Promise<void> {
    await this.page.locator('[data-testid="btn-reject"]').click();
  }

  async isToolCardVisible(): Promise<boolean> {
    return this.page.locator('[data-testid="tool-card"]').isVisible();
  }

  async isDryRunCardVisible(): Promise<boolean> {
    return this.page.locator('[data-testid="dry-run-card"]').isVisible();
  }

  async getContextPills(): Promise<string[]> {
    const pills = await this.page.locator('[data-testid="context-pill"]').all();
    return Promise.all(pills.map((p) => p.innerText()));
  }

  async clickStop(): Promise<void> {
    await this.page.locator('[data-testid="btn-stop"]').click();
  }

  async clickNewChat(): Promise<void> {
    await this.page.locator('[data-testid="btn-new-chat"]').click();
  }

  async waitForDone(): Promise<void> {
    await this.page.locator('[data-testid="message-done"]').waitFor({ timeout: 15000 });
  }
}
