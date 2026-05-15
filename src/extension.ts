import * as vscode from 'vscode';
import { ChatPanel } from './ui/ChatPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { SidebarProvider } from './ui/SidebarProvider';
import { StatusBar } from './ui/StatusBar';
import { OnboardingPanel } from './ui/OnboardingPanel';
import { Logger } from './utils/logger';
import { SettingsManager } from './utils/SettingsManager';
import { configureProvider } from './providers';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('Codin');
  const settings = new SettingsManager(context.secrets);
  const sidebar = new SidebarProvider();
  const statusBar = new StatusBar();

  context.subscriptions.push(statusBar);

  // Pre-configure the active provider with its stored API key at startup.
  void (async () => {
    const providerId = settings.getProvider();
    const apiKey = await settings.getApiKey(providerId);
    if (apiKey) configureProvider(providerId, apiKey);

    // Show onboarding on first run when no API key is set.
    const shouldOnboard = await OnboardingPanel.shouldShow(context, settings);
    if (shouldOnboard) {
      OnboardingPanel.createOrShow(context.extensionUri, context, settings);
    }
  })();

  const treeView = vscode.window.createTreeView('codin.sidebar', {
    treeDataProvider: sidebar,
    showCollapseAll: false,
  });

  context.subscriptions.push(
    treeView,

    vscode.commands.registerCommand('codin.openChat', () => {
      ChatPanel.createOrShow(context.extensionUri, settings, sidebar, statusBar);
    }),

    vscode.commands.registerCommand('codin.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri, settings);
    }),

    vscode.commands.registerCommand('codin.newChat', () => {
      ChatPanel.newChat(context.extensionUri, settings, sidebar, statusBar);
    }),

    vscode.commands.registerCommand('codin.stopAgent', () => {
      ChatPanel.stopAgent();
    }),

    vscode.commands.registerCommand('codin.toggleDryRun', () => {
      ChatPanel.toggleDryRun();
    })
  );

  logger.info('Codin extension activated');
}

export function deactivate(): void {
  // Cleanup is handled automatically via context.subscriptions disposables.
}
