import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from '../utils/SettingsManager';
import { getProvider, configureProvider } from '../providers';

export class OnboardingPanel implements vscode.Disposable {
  private static _instance: OnboardingPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Determine whether the onboarding wizard should auto-show.
   * True when onboardingComplete is false AND no API key is stored.
   */
  static async shouldShow(
    context: vscode.ExtensionContext,
    settings: SettingsManager
  ): Promise<boolean> {
    const hasKey = await settings.hasAnyApiKey();
    if (!settings.onboardingComplete && !hasKey) return true;
    return false;
  }

  /**
   * Create or reveal the onboarding wizard panel.
   * When the wizard completes (user clicks "Start coding →"), onComplete is called.
   */
  static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    settings: SettingsManager,
    onComplete?: () => void
  ): void {
    if (OnboardingPanel._instance) {
      OnboardingPanel._instance._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codin.onboarding',
      'Welcome to Codin',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui')],
      }
    );

    OnboardingPanel._instance = new OnboardingPanel(
      panel,
      extensionUri,
      context,
      settings,
      onComplete
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _settings: SettingsManager,
    private readonly _onComplete?: () => void
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: unknown) => void this._onMessage(msg),
      null,
      this._disposables
    );
  }

  private async _onMessage(raw: unknown): Promise<void> {
    const msg = raw as Record<string, unknown>;
    const type = msg['type'] as string;

    switch (type) {
      case 'detect_ollama': {
        const baseUrl = (msg['baseUrl'] as string) || 'http://localhost:11434';
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(`${baseUrl}/api/tags`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!res.ok) {
            void this._panel.webview.postMessage({
              type: 'ollama_status',
              running: false,
              models: [],
            });
            return;
          }
          const data = (await res.json()) as { models?: Array<{ name: string }> };
          const models = (data.models ?? []).map(
            (m: { name: string }) => m.name
          );
          void this._panel.webview.postMessage({
            type: 'ollama_status',
            running: true,
            models,
          });
        } catch {
          void this._panel.webview.postMessage({
            type: 'ollama_status',
            running: false,
            models: [],
          });
        }
        break;
      }

      case 'test_connection_onboard': {
        const provider = msg['provider'] as string;
        const apiKey = (msg['apiKey'] as string) || '';
        const baseUrl = (msg['baseUrl'] as string) || '';
        configureProvider(provider, apiKey, baseUrl || undefined);
        try {
          const result = await getProvider(provider).testConnection();
          void this._panel.webview.postMessage({
            type: 'connection_result',
            ok: result.ok,
            error: result.error,
          });
        } catch (err) {
          void this._panel.webview.postMessage({
            type: 'connection_result',
            ok: false,
            error: (err as Error).message,
          });
        }
        break;
      }

      case 'open_url': {
        const url = msg['url'] as string;
        if (url) {
          void vscode.env.openExternal(vscode.Uri.parse(url));
        }
        break;
      }

      case 'setup_complete': {
        const provider = msg['provider'] as string;
        const apiKey = (msg['apiKey'] as string) || '';
        const model = (msg['model'] as string) || '';
        const baseUrl = (msg['baseUrl'] as string) || '';

        // Save API key to SecretStorage
        if (apiKey) {
          await this._settings.setApiKey(provider, apiKey);
        }

        // Update VS Code configuration
        const cfg = vscode.workspace.getConfiguration('codin');
        await cfg.update('provider', provider, vscode.ConfigurationTarget.Global);
        if (model) {
          await cfg.update('model', model, vscode.ConfigurationTarget.Global);
        }
        if (baseUrl) {
          await cfg.update('customBaseUrl', baseUrl, vscode.ConfigurationTarget.Global);
        }

        // Configure the provider for immediate use
        if (apiKey) {
          configureProvider(provider, apiKey, baseUrl || undefined);
        }

        // Mark onboarding as complete
        this._settings.onboardingComplete = true;
        await this._context.globalState.update('onboardingComplete', true);

        // Dispose and invoke completion callback
        this.dispose();
        this._onComplete?.();
        break;
      }

      case 'skip_onboarding': {
        // Mark onboarding as complete without saving a key
        this._settings.onboardingComplete = true;
        await this._context.globalState.update('onboardingComplete', true);

        // Open settings panel
        void vscode.commands.executeCommand('codin.openSettings');

        // Dispose wizard
        this.dispose();
        break;
      }
    }
  }

  private _getHtml(): string {
    // Try to load external HTML file first
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      'webview-ui',
      'onboarding.html'
    );

    try {
      let html = fs.readFileSync(htmlPath, 'utf-8');
      // Inject CSP nonce
      const nonce = getNonce();
      const csp = this._panel.webview.cspSource;
      html = html.replace(/{{nonce}}/g, nonce);
      html = html.replace(/{{cspSource}}/g, csp);
      return html;
    } catch {
      // Fallback: return a minimal inline HTML if file not found
      return this._getFallbackHtml();
    }
  }

  private _getFallbackHtml(): string {
    const nonce = getNonce();
    const csp = this._panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${csp} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Codin</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 40px 24px;
      max-width: 540px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <h1>Welcome to Codin</h1>
  <p>Could not load onboarding wizard. Please run the setup wizard from
  the Command Palette: <code>Codin: Setup Wizard</code></p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
  }

  dispose(): void {
    OnboardingPanel._instance = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFabcdef0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
