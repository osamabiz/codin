import * as vscode from 'vscode';
import { SettingsManager } from '../utils/SettingsManager';
import { getProvider, configureProvider } from '../providers';

export class OnboardingPanel implements vscode.Disposable {
  private static _instance: OnboardingPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  static async shouldShow(
    context: vscode.ExtensionContext,
    settings: SettingsManager
  ): Promise<boolean> {
    if (context.globalState.get<boolean>('onboardingComplete')) return false;
    const providerId = settings.getProvider();
    const key = await settings.getApiKey(providerId);
    return key.length === 0;
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    settings: SettingsManager
  ): void {
    if (OnboardingPanel._instance) {
      OnboardingPanel._instance._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codin.onboarding',
      'Welcome to Codin',
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [extensionUri] }
    );

    OnboardingPanel._instance = new OnboardingPanel(panel, context, settings);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _context: vscode.ExtensionContext,
    private readonly _settings: SettingsManager
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
    switch (msg['command']) {
      case 'testConnection': {
        const provider = msg['provider'] as string;
        const apiKey = msg['apiKey'] as string;
        configureProvider(provider, apiKey);
        try {
          const result = await getProvider(provider).testConnection();
          void this._panel.webview.postMessage({ command: 'testResult', ...result });
        } catch (err) {
          void this._panel.webview.postMessage({
            command: 'testResult',
            ok: false,
            error: (err as Error).message,
          });
        }
        break;
      }

      case 'getStarted': {
        const provider = msg['provider'] as string;
        const apiKey = msg['apiKey'] as string;
        if (apiKey) {
          await this._settings.setApiKey(provider, apiKey);
          configureProvider(provider, apiKey);
          const cfg = vscode.workspace.getConfiguration('codin');
          await cfg.update('provider', provider, vscode.ConfigurationTarget.Global);
        }
        await this._context.globalState.update('onboardingComplete', true);
        this.dispose();
        void vscode.commands.executeCommand('codin.openChat');
        break;
      }
    }
  }

  private _getHtml(): string {
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
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 40px 24px;
      max-width: 540px;
      margin: 0 auto;
    }
    h1 { font-size: 1.4em; font-weight: 700; margin: 0 0 8px; }
    .subtitle { opacity: 0.65; margin-bottom: 32px; font-size: 0.95em; }
    .field { margin-bottom: 20px; }
    label {
      display: block;
      margin-bottom: 5px;
      font-size: 0.85em;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    select, input[type="password"] {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
      border-radius: 3px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: inherit;
    }
    select { padding: 8px 6px; }
    .hint { margin-top: 5px; font-size: 0.82em; opacity: 0.55; }
    .actions { display: flex; gap: 8px; margin-top: 28px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 8px 18px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #status { margin-top: 14px; font-size: 0.9em; min-height: 1.3em; }
    #status.ok { color: var(--vscode-testing-iconPassed, #73c991); }
    #status.err { color: var(--vscode-errorForeground, #f48771); }
    #apiKeyField { display: block; }
  </style>
</head>
<body>
  <h1>Welcome to Codin</h1>
  <p class="subtitle">Connect your LLM provider to get started. Your key is stored securely in VS Code — never sent anywhere except your chosen provider.</p>

  <div class="field">
    <label for="provider">Provider</label>
    <select id="provider">
      <option value="claude">Claude (Anthropic) — recommended</option>
      <option value="openai">OpenAI</option>
      <option value="ollama">Ollama (local, no key needed)</option>
    </select>
  </div>

  <div class="field" id="apiKeyField">
    <label for="apiKey">API Key</label>
    <input type="password" id="apiKey" placeholder="Paste your API key here…">
    <p class="hint">Stored in VS Code SecretStorage — never logged or synced.</p>
  </div>

  <div class="actions">
    <button class="btn-secondary" id="testConn">Test connection</button>
    <button id="getStarted">Get started →</button>
  </div>
  <div id="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const providerEl = document.getElementById('provider');
    const apiKeyField = document.getElementById('apiKeyField');
    const apiKeyEl = document.getElementById('apiKey');
    const statusEl = document.getElementById('status');

    function syncApiKeyVisibility() {
      apiKeyField.style.display = providerEl.value === 'ollama' ? 'none' : 'block';
    }

    providerEl.addEventListener('change', () => {
      syncApiKeyVisibility();
      apiKeyEl.value = '';
    });

    document.getElementById('testConn').addEventListener('click', () => {
      statusEl.textContent = 'Testing…';
      statusEl.className = '';
      vscode.postMessage({ command: 'testConnection', provider: providerEl.value, apiKey: apiKeyEl.value });
    });

    document.getElementById('getStarted').addEventListener('click', () => {
      vscode.postMessage({ command: 'getStarted', provider: providerEl.value, apiKey: apiKeyEl.value });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'testResult') {
        statusEl.textContent = msg.ok ? '✓ Connection successful! Click Get started to continue.' : '✗ ' + (msg.error || 'Unknown error');
        statusEl.className = msg.ok ? 'ok' : 'err';
      }
    });
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
