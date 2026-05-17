import { test, expect } from '@playwright/test';
import { launchVSCode } from '../helpers/launch-vscode';

test.describe('Onboarding Wizard', () => {
  test('fresh install shows onboarding wizard not chat panel', async () => {
    // Launch without an API key to trigger onboarding
    const { page } = await launchVSCode({ apiKey: '' });
    
    // The webview might take a moment to load
    const frame = page.frameLocator('iframe.webview').first();
    
    // Verify the wizard is visible by checking for the path selections
    await expect(frame.locator('[data-testid="onboard-path-local"]')).toBeVisible();
    await expect(frame.locator('[data-testid="onboard-path-free"]')).toBeVisible();
    await expect(frame.locator('[data-testid="onboard-path-key"]')).toBeVisible();
    
    // The next button should be disabled initially
    await expect(frame.locator('[data-testid="onboard-next"]')).toBeDisabled();
  });

  test('next enables after path selection', async () => {
    const { page } = await launchVSCode({ apiKey: '' });
    const frame = page.frameLocator('iframe.webview').first();
    
    await frame.locator('[data-testid="onboard-path-free"]').click();
    await expect(frame.locator('[data-testid="onboard-next"]')).toBeEnabled();
  });

  test('local path shows ollama not detected when not running', async () => {
    const { page } = await launchVSCode({ apiKey: '' });
    const frame = page.frameLocator('iframe.webview').first();
    
    // Mock the webview API / fetch logic using Playwright route or let it naturally fail
    // Since Ollama likely isn't running in CI, it will naturally fail and show not detected
    
    await frame.locator('[data-testid="onboard-path-local"]').click();
    await frame.locator('[data-testid="onboard-next"]').click();
    
    await expect(frame.locator('[data-testid="onboard-ollama-status"]')).toContainText('Not detected');
  });

  test('completing setup closes wizard and opens chat panel', async () => {
    const { page } = await launchVSCode({ apiKey: '' });
    const frame = page.frameLocator('iframe.webview').first();
    
    // Go to Have Key path
    await frame.locator('[data-testid="onboard-path-key"]').click();
    await frame.locator('[data-testid="onboard-next"]').click();
    
    // Enter key
    await frame.locator('[data-testid="onboard-api-key"]').fill('sk-test-mock-key');
    
    // In a real E2E environment we would need to mock the testConnection. 
    // Here we'll just check if the UI lets us proceed
    await frame.locator('[data-testid="onboard-test-connection"]').click();
    
    // If we mock the vscode postMessage logic for connection_result ok:true...
    // For this test we assume the mock server returns success for testConnection
    await expect(frame.locator('[data-testid="onboard-connection-status"]')).toContainText('Connected');
    await expect(frame.locator('[data-testid="onboard-next"]')).toBeEnabled();
    
    await frame.locator('[data-testid="onboard-next"]').click();
    
    // Screen 3
    await expect(frame.locator('[data-testid="onboard-start"]')).toBeVisible();
    await frame.locator('[data-testid="onboard-start"]').click();
    
    // The onboarding panel should close and the chat panel should open
    // Wait for the new chat panel frame
    await expect(page.locator('.chat-input-textarea')).toBeVisible({ timeout: 10000 });
  });
});
