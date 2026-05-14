import * as vscode from 'vscode';
import { SettingsManager } from '../utils/SettingsManager';
import { getProvider, configureProvider } from '../providers';

export class SettingsPanel {
  private static _currentPanel: SettingsPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  static createOrShow(extensionUri: vscode.Uri, settings: SettingsManager): void {
    if (SettingsPanel._currentPanel) {
      SettingsPanel._currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'agentPlugin.settings',
      'AI Agent Settings',
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [extensionUri] }
    );

    SettingsPanel._currentPanel = new SettingsPanel(panel, settings);
  }

  private constructor(panel: vscode.WebviewPanel, private readonly _settings: SettingsManager) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: unknown) => void this._onMessage(msg),
      null,
      this._disposables
    );
    void this._sendSettings();
  }

  private async _onMessage(raw: unknown): Promise<void> {
    const msg = raw as Record<string, unknown>;
    switch (msg['command']) {
      case 'getSettings':
        await this._sendSettings();
        break;

      case 'saveSettings': {
        const provider = msg['provider'] as string;
        const apiKey = msg['apiKey'] as string;
        const model = msg['model'] as string;
        const temperature = msg['temperature'] as number;
        if (apiKey) {
          await this._settings.setApiKey(provider, apiKey);
          configureProvider(provider, apiKey);
        }
        const cfg = vscode.workspace.getConfiguration('agentPlugin');
        await cfg.update('provider', provider, vscode.ConfigurationTarget.Global);
        await cfg.update('model', model, vscode.ConfigurationTarget.Global);
        await cfg.update('temperature', temperature, vscode.ConfigurationTarget.Global);
        void vscode.window.showInformationMessage('AI Agent: settings saved.');
        break;
      }

      case 'saveListSetting': {
        const key = msg['key'] as string;
        const value = msg['value'] as string[];
        const allowedKeys = ['blockedCommands', 'allowedWriteDirectories'];
        if (allowedKeys.includes(key)) {
          const cfg = vscode.workspace.getConfiguration('agentPlugin');
          await cfg.update(key, value, vscode.ConfigurationTarget.Global);
        }
        break;
      }

      case 'testConnection': {
        const provider = msg['provider'] as string;
        const apiKey = msg['apiKey'] as string | undefined;
        const keyToUse = apiKey || (await this._settings.getApiKey(provider));
        configureProvider(provider, keyToUse);
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
    }
  }

  private async _sendSettings(): Promise<void> {
    const provider = this._settings.getProvider();
    const model = this._settings.getModel();
    const temperature = this._settings.getTemperature();
    const storedKey = await this._settings.getApiKey(provider);
    const cfg = vscode.workspace.getConfiguration('agentPlugin');
    const blockedCommands = cfg.get<string[]>('blockedCommands', ['rm -rf /', 'sudo']);
    const allowedWriteDirectories = cfg.get<string[]>('allowedWriteDirectories', []);
    void this._panel.webview.postMessage({
      command: 'loadSettings',
      provider,
      model,
      temperature,
      hasApiKey: storedKey.length > 0,
      blockedCommands,
      allowedWriteDirectories,
    });
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
  <title>AI Agent Settings</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px;
      max-width: 540px;
      margin: 0;
    }
    h2 { margin: 0 0 20px; font-weight: 600; font-size: 1.1em; }
    h3 { margin: 28px 0 12px; font-weight: 600; font-size: 0.95em; opacity: 0.85; border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2)); padding-bottom: 6px; }
    .field { margin-bottom: 18px; }
    label {
      display: block;
      margin-bottom: 5px;
      font-size: 0.88em;
      opacity: 0.75;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    select, input[type="password"], input[type="text"] {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
      border-radius: 3px;
      padding: 7px 9px;
      font-family: inherit;
      font-size: inherit;
    }
    select { padding: 7px 5px; }
    .range-row { display: flex; align-items: center; gap: 10px; }
    input[type="range"] { flex: 1; cursor: pointer; }
    .range-val { min-width: 2.5em; text-align: right; font-variant-numeric: tabular-nums; }
    .hint { margin-top: 5px; font-size: 0.82em; opacity: 0.55; }
    #apiKeyField { display: none; }
    .actions { display: flex; gap: 8px; margin-top: 22px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 7px 16px;
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
    .btn-icon {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 2px 6px;
      opacity: 0.55;
      font-size: 1.1em;
    }
    .btn-icon:hover { opacity: 1; }
    #status { margin-top: 14px; font-size: 0.9em; min-height: 1.3em; }
    #status.ok { color: var(--vscode-testing-iconPassed, #73c991); }
    #status.err { color: var(--vscode-errorForeground, #f48771); }

    /* List settings (blocked commands, allowed dirs) */
    .list-items { margin-bottom: 8px; }
    .list-item {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.15));
      border-radius: 3px;
      padding: 4px 8px;
    }
    .list-item-text { flex: 1; }
    .list-add-row { display: flex; gap: 6px; align-items: center; }
    .list-add-row input { flex: 1; }
    .list-add-row button { padding: 6px 12px; font-size: 0.88em; }
  </style>
</head>
<body>
  <h2>AI Agent Settings</h2>

  <h3>LLM Provider</h3>

  <div class="field">
    <label for="provider">Provider</label>
    <select id="provider">
      <option value="claude">Claude (Anthropic)</option>
      <option value="openai">OpenAI</option>
      <option value="ollama">Ollama (local, no key needed)</option>
    </select>
  </div>

  <div class="field" id="apiKeyField">
    <label for="apiKey">API Key</label>
    <input type="password" id="apiKey" placeholder="Paste your API key here…">
    <p class="hint">Stored in VS Code SecretStorage — never logged or synced.</p>
  </div>

  <div class="field">
    <label for="model">Model</label>
    <select id="model"></select>
  </div>

  <div class="field">
    <label>Temperature</label>
    <div class="range-row">
      <input type="range" id="temperature" min="0" max="1" step="0.05" value="0.7">
      <span class="range-val" id="tempLabel">0.7</span>
    </div>
  </div>

  <div class="actions">
    <button id="save">Save</button>
    <button class="btn-secondary" id="testConn">Test connection</button>
  </div>
  <div id="status"></div>

  <h3>Safety</h3>

  <div class="field">
    <label>Blocked commands</label>
    <p class="hint">Commands matching these patterns will be refused.</p>
    <div class="list-items" id="blockedList"></div>
    <div class="list-add-row">
      <input type="text" id="blockedInput" placeholder="e.g. rm -rf">
      <button id="blockedAdd">Add pattern</button>
    </div>
  </div>

  <div class="field">
    <label>Allowed write directories</label>
    <p class="hint">Agent can only write within these paths (empty = entire workspace).</p>
    <div class="list-items" id="allowedDirList"></div>
    <div class="list-add-row">
      <input type="text" id="allowedDirInput" placeholder="e.g. src/">
      <button id="allowedDirAdd">Add path</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const MODELS = {
      claude: [
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (recommended)' },
        { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (fastest)' },
      ],
      openai: [
        { id: 'gpt-4o', name: 'GPT-4o (recommended)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o mini (faster)' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      ],
      ollama: [
        { id: 'llama3.2', name: 'Llama 3.2' },
        { id: 'mistral', name: 'Mistral' },
        { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
        { id: 'deepseek-r1', name: 'DeepSeek R1' },
      ],
    };

    const providerEl = document.getElementById('provider');
    const apiKeyField = document.getElementById('apiKeyField');
    const apiKeyEl = document.getElementById('apiKey');
    const modelEl = document.getElementById('model');
    const tempEl = document.getElementById('temperature');
    const tempLabel = document.getElementById('tempLabel');
    const statusEl = document.getElementById('status');

    // List state
    let blockedCommands = [];
    let allowedWriteDirectories = [];

    function populateModels(provider, selected) {
      const list = MODELS[provider] || [];
      modelEl.innerHTML = '';
      for (const m of list) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.id === selected) opt.selected = true;
        modelEl.appendChild(opt);
      }
    }

    function syncApiKeyVisibility() {
      apiKeyField.style.display = providerEl.value === 'ollama' ? 'none' : '';
    }

    // ── List rendering helpers ──────────────────────────────────────────────
    function renderList(containerId, items, onRemove) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'list-item';
        const text = document.createElement('span');
        text.className = 'list-item-text';
        text.textContent = item;
        row.appendChild(text);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon';
        removeBtn.title = 'Remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => onRemove(idx));
        row.appendChild(removeBtn);
        container.appendChild(row);
      });
    }

    function renderBlockedList() {
      renderList('blockedList', blockedCommands, (idx) => {
        blockedCommands.splice(idx, 1);
        renderBlockedList();
        saveListSetting('blockedCommands', blockedCommands);
      });
    }

    function renderAllowedDirList() {
      renderList('allowedDirList', allowedWriteDirectories, (idx) => {
        allowedWriteDirectories.splice(idx, 1);
        renderAllowedDirList();
        saveListSetting('allowedWriteDirectories', allowedWriteDirectories);
      });
    }

    function saveListSetting(key, value) {
      vscode.postMessage({ command: 'saveListSetting', key, value });
    }

    document.getElementById('blockedAdd').addEventListener('click', () => {
      const input = document.getElementById('blockedInput');
      const val = input.value.trim();
      if (!val) return;
      blockedCommands.push(val);
      input.value = '';
      renderBlockedList();
      saveListSetting('blockedCommands', blockedCommands);
    });

    document.getElementById('allowedDirAdd').addEventListener('click', () => {
      const input = document.getElementById('allowedDirInput');
      const val = input.value.trim();
      if (!val) return;
      allowedWriteDirectories.push(val);
      input.value = '';
      renderAllowedDirList();
      saveListSetting('allowedWriteDirectories', allowedWriteDirectories);
    });

    // ── Provider / model ───────────────────────────────────────────────────
    providerEl.addEventListener('change', () => {
      populateModels(providerEl.value, '');
      syncApiKeyVisibility();
      apiKeyEl.value = '';
      apiKeyEl.placeholder = 'Paste your API key here…';
    });

    tempEl.addEventListener('input', () => {
      tempLabel.textContent = parseFloat(tempEl.value).toFixed(2);
    });

    document.getElementById('save').addEventListener('click', () => {
      statusEl.textContent = '';
      statusEl.className = '';
      vscode.postMessage({
        command: 'saveSettings',
        provider: providerEl.value,
        apiKey: apiKeyEl.value,
        model: modelEl.value,
        temperature: parseFloat(tempEl.value),
      });
    });

    document.getElementById('testConn').addEventListener('click', () => {
      statusEl.textContent = 'Testing…';
      statusEl.className = '';
      vscode.postMessage({
        command: 'testConnection',
        provider: providerEl.value,
        apiKey: apiKeyEl.value || null,
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'loadSettings') {
        providerEl.value = msg.provider;
        tempEl.value = String(msg.temperature);
        tempLabel.textContent = parseFloat(msg.temperature).toFixed(2);
        populateModels(msg.provider, msg.model);
        syncApiKeyVisibility();
        if (msg.hasApiKey) {
          apiKeyEl.value = '';
          apiKeyEl.placeholder = '(key saved — paste to replace)';
        }
        blockedCommands = msg.blockedCommands || [];
        allowedWriteDirectories = msg.allowedWriteDirectories || [];
        renderBlockedList();
        renderAllowedDirList();
      } else if (msg.command === 'testResult') {
        statusEl.textContent = msg.ok ? '✓ Connection successful!' : '✗ ' + (msg.error || 'Unknown error');
        statusEl.className = msg.ok ? 'ok' : 'err';
      }
    });

    vscode.postMessage({ command: 'getSettings' });
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    SettingsPanel._currentPanel = undefined;
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
