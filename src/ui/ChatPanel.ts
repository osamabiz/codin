import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SettingsManager } from '../utils/SettingsManager';
import { getProvider, configureProvider } from '../providers';
import type { ContextItem } from '../utils/context-builder';
import { buildMessagesWithContext, gatherWorkspaceInfo, buildWorkspaceSystemPrompt } from '../utils/context-builder';
import { getContextLimit } from '../utils/token-counter';
import { Agent } from '../agent/agent';
import { AgentMemory } from '../agent/memory';
import { allTools } from '../tools';
import type { AgentContext, AgentEvent } from '../agent/types';
import { DiffView } from './DiffView';
import type { SidebarProvider } from './SidebarProvider';
import type { StatusBar } from './StatusBar';

type WebviewIncoming =
  | { command: 'sendMessage'; text: string; contextItems: ContextItem[] }
  | { command: 'openSettings' }
  | { command: 'cancelStream' }
  | { command: 'stopAgent' }
  | { command: 'newChat' }
  | { command: 'toggleDryRun' }
  | { command: 'triggerMention' }
  | { command: 'approveTool'; callId: string }
  | { command: 'rejectTool'; callId: string; reason?: string }
  | { command: 'showDiff'; callId: string }
  | { command: 'restoreHistory'; restore: boolean }
  | { command: 'retry' };

interface PendingDiff {
  originalPath: string | undefined;
  proposedContent: string;
  label: string;
}

// Maps HTTP-style error codes to friendly messages.
function mapErrorMessage(raw: string): string {
  if (/401|unauthorized|invalid.*key|api key/i.test(raw)) {
    return 'API key is invalid. Check your key in Settings.';
  }
  if (/429|rate.?limit/i.test(raw)) {
    return 'Rate limit hit. Try again in a few seconds.';
  }
  if (/5\d{2}|server.?error|internal.?error/i.test(raw)) {
    return 'The AI provider had an error. Try again.';
  }
  return raw;
}

export class ChatPanel {
  private static _currentPanel: ChatPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _agent: Agent | null = null;
  private _pendingDiffs = new Map<string, PendingDiff>();
  private _savedMemory: AgentMemory | null = null;
  private _dryRun = false;
  private _lastTask = '';
  private _lastContextItems: ContextItem[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    settings: SettingsManager,
    sidebar?: SidebarProvider,
    statusBar?: StatusBar
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ChatPanel._currentPanel) {
      ChatPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codin.chatPanel',
      'Codin',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui')],
        retainContextWhenHidden: true,
      }
    );

    ChatPanel._currentPanel = new ChatPanel(panel, settings, sidebar, statusBar);
  }

  static async newChat(
    extensionUri: vscode.Uri,
    settings: SettingsManager,
    sidebar?: SidebarProvider,
    statusBar?: StatusBar
  ): Promise<void> {
    const current = ChatPanel._currentPanel;
    if (current?._agent) {
      const choice = await vscode.window.showWarningMessage(
        'An agent task is in progress. Start a new chat?',
        'Start new chat',
        'Cancel'
      );
      if (choice !== 'Start new chat') return;
      current._agent.stop();
    }
    if (current) {
      current.dispose();
    }
    ChatPanel.createOrShow(extensionUri, settings, sidebar, statusBar);
  }

  static stopAgent(): void {
    ChatPanel._currentPanel?._agent?.stop();
  }

  static toggleDryRun(): void {
    const panel = ChatPanel._currentPanel;
    if (!panel) return;
    panel._dryRun = !panel._dryRun;
    void panel._panel.webview.postMessage({
      command: 'dryRunToggled',
      active: panel._dryRun,
    });
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _settings: SettingsManager,
    private readonly _sidebar?: SidebarProvider,
    private readonly _statusBar?: StatusBar
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewIncoming) => void this._onMessage(msg),
      null,
      this._disposables
    );
    void this._sendModelInfo();
    void this._offerRestore();
  }

  private _sendModelInfo(): void {
    const modelId = this._settings.getModel();
    const limit = getContextLimit(modelId);
    void this._panel.webview.postMessage({ command: 'modelInfo', modelId, limit });
  }

  private async _offerRestore(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    const historyPath = path.join(workspaceRoot, '.agent-history.json');
    try {
      await fs.promises.access(historyPath);
    } catch {
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      'Previous conversation found. Restore it?',
      'Restore',
      'Start Fresh'
    );

    if (choice === 'Restore') {
      try {
        const mem = await AgentMemory.loadFromFile(historyPath);
        if (mem) this._savedMemory = mem;
      } catch {
        // Ignore load errors — start fresh
      }
    }
  }

  private async _onMessage(msg: WebviewIncoming): Promise<void> {
    switch (msg.command) {
      case 'sendMessage':
        if (msg.text?.trim()) await this._handleSend(msg.text.trim(), msg.contextItems ?? []);
        break;
      case 'openSettings':
        void vscode.commands.executeCommand('codin.openSettings');
        break;
      case 'cancelStream':
      case 'stopAgent':
        this._agent?.stop();
        break;
      case 'newChat':
        await this._handleNewChat();
        break;
      case 'toggleDryRun':
        this._dryRun = !this._dryRun;
        void this._panel.webview.postMessage({ command: 'dryRunToggled', active: this._dryRun });
        break;
      case 'triggerMention':
        await this._handleMentionTrigger();
        break;
      case 'approveTool':
        this._agent?.approveTool(msg.callId);
        break;
      case 'rejectTool':
        this._agent?.rejectTool(msg.callId, msg.reason);
        break;
      case 'showDiff': {
        const diff = this._pendingDiffs.get(msg.callId);
        if (diff) {
          const choice = await DiffView.show(diff.originalPath, diff.proposedContent, diff.label);
          if (choice === 'approve') {
            this._agent?.approveTool(msg.callId);
          } else {
            this._agent?.rejectTool(msg.callId, 'User rejected diff');
          }
          this._pendingDiffs.delete(msg.callId);
        }
        break;
      }
      case 'retry':
        if (this._lastTask) {
          await this._handleSend(this._lastTask, this._lastContextItems);
        }
        break;
    }
  }

  private async _handleNewChat(): Promise<void> {
    if (this._agent) {
      const choice = await vscode.window.showWarningMessage(
        'An agent task is in progress. Start a new chat?',
        'Start new chat',
        'Cancel'
      );
      if (choice !== 'Start new chat') return;
      this._agent.stop();
    }
    this._savedMemory = null;
    this._pendingDiffs.clear();
    void this._panel.webview.postMessage({ command: 'clearChat' });
  }

  // ---------------------------------------------------------------------------
  // @ mention handling
  // ---------------------------------------------------------------------------

  private async _handleMentionTrigger(): Promise<void> {
    type MentionItem = vscode.QuickPickItem & { mentionType?: 'selection' | 'symbol' | 'file'; filePath?: string };

    const staticItems: MentionItem[] = [
      {
        label: '$(file-text) @selection',
        description: 'Attach current editor selection',
        mentionType: 'selection',
      },
      {
        label: '$(symbol-class) @symbol',
        description: 'Search workspace symbols',
        mentionType: 'symbol',
      },
    ];

    const fileUris = await vscode.workspace.findFiles(
      '**/*',
      '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**}',
      300
    );

    const fileItems: MentionItem[] = fileUris.map((uri) => {
      const rel = vscode.workspace.asRelativePath(uri.fsPath);
      return {
        label: `$(file) ${path.basename(rel)}`,
        description: rel,
        mentionType: 'file' as const,
        filePath: rel,
      };
    });

    const picked = await vscode.window.showQuickPick([...staticItems, ...fileItems], {
      placeHolder: 'Attach file, @selection, or @symbol…',
      matchOnDescription: true,
    });

    if (!picked) return;

    if (picked.mentionType === 'selection') {
      this._handleSelectionMention();
    } else if (picked.mentionType === 'symbol') {
      await this._handleSymbolMention();
    } else if (picked.mentionType === 'file' && picked.filePath) {
      await this._handleFileMention(picked.filePath);
    }
  }

  private _handleSelectionMention(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showWarningMessage('No text selected in the active editor.');
      return;
    }
    const selText = editor.document.getText(editor.selection);
    const startLine = editor.selection.start.line + 1;
    const endLine = editor.selection.end.line + 1;
    const relPath = vscode.workspace.asRelativePath(editor.document.fileName);

    const item: ContextItem = {
      type: 'selection',
      label: `selection from ${relPath}`,
      content: selText,
      detail: `lines ${startLine}-${endLine}`,
    };
    void this._panel.webview.postMessage({ command: 'contextItemAdded', item });
  }

  private async _handleSymbolMention(): Promise<void> {
    const query = await vscode.window.showInputBox({
      placeHolder: 'Symbol name…',
      prompt: 'Search workspace symbols',
    });
    if (!query) return;

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      query
    );

    if (!symbols || symbols.length === 0) {
      void vscode.window.showInformationMessage(`No symbols found for "${query}".`);
      return;
    }

    type SymbolPickItem = vscode.QuickPickItem & { symbol: vscode.SymbolInformation };
    const symbolItems: SymbolPickItem[] = symbols.slice(0, 50).map((sym) => ({
      label: sym.name,
      description: vscode.workspace.asRelativePath(sym.location.uri),
      symbol: sym,
    }));

    const picked = await vscode.window.showQuickPick(symbolItems, {
      placeHolder: 'Select a symbol to attach',
      matchOnDescription: true,
    });
    if (!picked) return;

    const sym = picked.symbol;
    let content: string;
    try {
      const doc = await vscode.workspace.openTextDocument(sym.location.uri);
      content = doc.getText(sym.location.range);
    } catch {
      void vscode.window.showErrorMessage(`Could not read symbol location.`);
      return;
    }

    const item: ContextItem = {
      type: 'symbol',
      label: sym.name,
      content,
      detail: vscode.workspace.asRelativePath(sym.location.uri),
    };
    void this._panel.webview.postMessage({ command: 'contextItemAdded', item });
  }

  private async _handleFileMention(relativePath: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const resolved = path.resolve(workspaceRoot, relativePath);

    const rel = path.relative(workspaceRoot, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      void vscode.window.showErrorMessage('File path is outside the workspace.');
      return;
    }

    let content: string;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(resolved));
      content = doc.getText();
    } catch {
      void vscode.window.showErrorMessage(`Could not read file: ${relativePath}`);
      return;
    }

    const item: ContextItem = {
      type: 'file',
      label: relativePath,
      content,
    };
    void this._panel.webview.postMessage({ command: 'contextItemAdded', item });
  }

  // ---------------------------------------------------------------------------
  // Agent-powered message send
  // ---------------------------------------------------------------------------

  private async _handleSend(text: string, contextItems: ContextItem[]): Promise<void> {
    this._lastTask = text;
    this._lastContextItems = contextItems;

    const providerId = this._settings.getProvider();
    const apiKey = await this._settings.getApiKey(providerId);
    const baseUrl = this._settings.getBaseUrl();
    configureProvider(providerId, apiKey, baseUrl);

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    let systemPromptExtra = '';
    if (workspaceRoot) {
      try {
        const wsInfo = gatherWorkspaceInfo(workspaceRoot);
        systemPromptExtra = buildWorkspaceSystemPrompt(wsInfo);
      } catch {
        // Workspace snapshot failed — continue without it
      }
    }
    void systemPromptExtra;

    const taskMessages = buildMessagesWithContext([], text, contextItems);
    const task = taskMessages[taskMessages.length - 1]?.content ?? text;
    const taskStr = typeof task === 'string' ? task : text;

    const agentContext: AgentContext = {
      workspaceRoot,
      vscode,
      model: this._settings.getModel(),
      maxTokens: this._settings.getMaxTokens(),
      temperature: this._settings.getTemperature(),
    };

    const provider = getProvider(providerId);

    const agentOptions = {
      maxSteps: vscode.workspace.getConfiguration('codin').get<number>('maxSteps', 25),
      maxRetries: vscode.workspace.getConfiguration('codin').get<number>('maxRetries', 3),
      autoApproveReadOnly: vscode.workspace
        .getConfiguration('codin')
        .get<boolean>('autoApproveReadOnly', false),
      checkpointBeforeEdit: vscode.workspace
        .getConfiguration('codin')
        .get<boolean>('checkpointBeforeEdit', false),
      dryRun: this._dryRun,
    };

    const agent = new Agent(provider, allTools, agentOptions);

    if (this._savedMemory) {
      agent.restoreMemory(this._savedMemory);
    }

    this._agent = agent;
    this._pendingDiffs.clear();

    this._statusBar?.setRunning();
    void this._panel.webview.postMessage({ command: 'streamStart' });

    try {
      for await (const event of agent.run(taskStr, agentContext)) {
        await this._handleAgentEvent(event, workspaceRoot);
      }
    } catch (err) {
      const friendly = mapErrorMessage((err as Error).message);
      this._statusBar?.setError();
      void this._panel.webview.postMessage({
        command: 'error',
        error: friendly,
      });
    } finally {
      const memJson = agent.serializeMemory();
      this._savedMemory = AgentMemory.fromJSON(memJson);
      this._agent = null;
      this._pendingDiffs.clear();
      this._statusBar?.setIdle();
      void this._panel.webview.postMessage({ command: 'agentDone' });

      if (workspaceRoot) {
        void this._persistMemory(workspaceRoot, memJson);
      }
    }
  }

  private async _persistMemory(workspaceRoot: string, memJson: string): Promise<void> {
    const historyPath = path.join(workspaceRoot, '.agent-history.json');
    try {
      await fs.promises.writeFile(historyPath, memJson, 'utf-8');
      await this._ensureGitignore(workspaceRoot);
    } catch {
      // Persistence failure is non-fatal
    }
  }

  private async _ensureGitignore(workspaceRoot: string): Promise<void> {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const entry = '.agent-history.json';
    let content = '';
    try {
      content = await fs.promises.readFile(gitignorePath, 'utf-8');
    } catch {
      // File doesn't exist — will create it
    }
    const lines = content.split('\n').map((l) => l.trim());
    if (!lines.includes(entry)) {
      const newContent = content ? `${content.trimEnd()}\n${entry}\n` : `${entry}\n`;
      await fs.promises.writeFile(gitignorePath, newContent, 'utf-8');
    }
  }

  private async _handleAgentEvent(event: AgentEvent, workspaceRoot: string): Promise<void> {
    switch (event.type) {
      case 'token':
        void this._panel.webview.postMessage({ command: 'token', content: event.content });
        break;

      case 'plan':
        this._sidebar?.setPlan(event.taskSummary, event.steps);
        void this._panel.webview.postMessage({
          command: 'planReady',
          taskSummary: event.taskSummary,
          steps: event.steps,
        });
        break;

      case 'step_start':
        this._sidebar?.setStepActive(event.step.index);
        void this._panel.webview.postMessage({ command: 'stepUpdate', stepIndex: event.step.index, status: 'active' });
        break;

      case 'step_done':
        this._sidebar?.setStepDone(event.step.index);
        void this._panel.webview.postMessage({ command: 'stepUpdate', stepIndex: event.step.index, status: 'done' });
        break;

      case 'done':
        this._sidebar?.completeTask();
        void this._panel.webview.postMessage({ command: 'taskComplete' });
        void this._panel.webview.postMessage({ command: 'done', usage: null });
        break;

      case 'error': {
        const friendly = mapErrorMessage(event.error.message);
        this._statusBar?.setError();
        void this._panel.webview.postMessage({ command: 'error', error: friendly });
        break;
      }

      case 'tool_call':
        void this._panel.webview.postMessage({
          command: 'toolCallStart',
          callId: event.call.id,
          toolName: event.call.name,
        });
        break;

      case 'tool_result':
        void this._panel.webview.postMessage({
          command: 'toolCallDone',
          callId: event.callId,
          ok: event.result.ok,
          output: event.result.ok ? event.result.output : event.result.error,
        });
        break;

      case 'dry_run_would_call': {
        const call = event.call;
        const input = call.input as Record<string, unknown>;
        const paramSummary = buildParamSummary(call.name, input);
        void this._panel.webview.postMessage({
          command: 'dryRunCard',
          callId: call.id,
          toolName: call.name,
          paramSummary,
        });
        break;
      }

      case 'waiting_for_approval': {
        this._statusBar?.setWaiting();
        const call = event.call;
        const input = call.input as Record<string, unknown>;
        const paramSummary = buildParamSummary(call.name, input);

        if (call.name === '__continue__') {
          void this._panel.webview.postMessage({
            command: 'toolCard',
            callId: call.id,
            toolName: call.name,
            paramSummary: String((input as Record<string, unknown>)['message'] ?? 'Continue?'),
            hasDiff: false,
          });
        } else if (call.name === 'delete_file') {
          const filePath = String(input['path'] ?? '');
          const choice = await vscode.window.showWarningMessage(
            `The agent wants to delete ${filePath}. Move to trash?`,
            { modal: true },
            'Delete',
            'Cancel'
          );
          if (choice === 'Delete') {
            this._agent?.approveTool(call.id);
          } else {
            this._agent?.rejectTool(call.id, 'User cancelled delete');
          }
        } else if (call.name === 'write_file' || call.name === 'create_file') {
          const filePath = String(input['path'] ?? '');
          const resolvedPath = workspaceRoot ? path.resolve(workspaceRoot, filePath) : undefined;
          this._pendingDiffs.set(call.id, {
            originalPath: resolvedPath,
            proposedContent: String(input['content'] ?? ''),
            label: filePath,
          });

          void this._panel.webview.postMessage({
            command: 'toolCard',
            callId: call.id,
            toolName: call.name,
            paramSummary,
            hasDiff: true,
          });
        } else {
          void this._panel.webview.postMessage({
            command: 'toolCard',
            callId: call.id,
            toolName: call.name,
            paramSummary,
            hasDiff: false,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // HTML
  // ---------------------------------------------------------------------------

  private _getHtml(): string {
    const nonce = getNonce();
    const cspSource = this._panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
             style-src ${cspSource} 'unsafe-inline';
             img-src ${cspSource} data: https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }

    #app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* ── Top bar ── */
    #topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
      flex-shrink: 0;
    }
    #topbar span { font-weight: 600; font-size: 0.95em; }
    .topbar-actions { display: flex; align-items: center; gap: 6px; }
    #dryRunBtn {
      background: none;
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
      color: var(--vscode-editor-foreground);
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 0.8em;
      opacity: 0.65;
    }
    #dryRunBtn:hover { opacity: 1; }
    #dryRunBtn.active {
      background: var(--vscode-badge-background, rgba(0,122,204,0.3));
      color: var(--vscode-badge-foreground);
      opacity: 1;
      border-color: transparent;
    }
    .topbar-icon-btn {
      background: none;
      border: none;
      color: var(--vscode-editor-foreground);
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 1.1em;
      opacity: 0.7;
    }
    .topbar-icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
    .topbar-icon-btn.active { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

    /* ── Agent status dropdown ── */
    #agentDropdown {
      display: none;
      border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
      background: var(--vscode-editorWidget-background, rgba(128,128,128,0.06));
      padding: 10px 12px;
      max-height: 260px;
      overflow-y: auto;
      font-size: 0.88em;
    }
    #agentDropdown.open { display: block; }
    .dropdown-section { margin-bottom: 10px; }
    .dropdown-section:last-child { margin-bottom: 0; }
    .dropdown-section-title {
      font-size: 0.78em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.55;
      margin-bottom: 4px;
    }
    .dropdown-task {
      font-weight: 600;
      padding: 2px 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dropdown-step {
      padding: 1px 0;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .dropdown-step-icon { flex-shrink: 0; font-size: 0.85em; }
    .dropdown-step-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dropdown-history-item {
      padding: 1px 0;
      opacity: 0.7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dropdown-empty { opacity: 0.4; font-style: italic; }

    /* ── Message list ── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .msg { display: flex; flex-direction: column; max-width: 85%; }
    .msg.user { align-self: flex-end; align-items: flex-end; }
    .msg.assistant { align-self: flex-start; align-items: flex-start; }

    .bubble {
      padding: 9px 13px;
      border-radius: 8px;
      line-height: 1.55;
      word-break: break-word;
    }
    .msg.user .bubble {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-bottom-right-radius: 2px;
    }
    .msg.assistant .bubble {
      background: var(--vscode-editorWidget-background, rgba(128,128,128,0.1));
      border-bottom-left-radius: 2px;
    }

    /* Markdown inside assistant bubbles */
    .bubble p { margin: 0 0 0.5em; }
    .bubble p:last-child { margin-bottom: 0; }
    .bubble pre {
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2));
      border-radius: 4px;
      padding: 10px 12px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }
    .bubble code {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2));
      padding: 0.15em 0.35em;
      border-radius: 3px;
    }
    .bubble pre code { background: none; padding: 0; }
    .bubble ul, .bubble ol { padding-left: 1.4em; margin: 0.3em 0; }
    .bubble blockquote {
      margin: 0.3em 0 0.3em 0;
      padding-left: 0.8em;
      border-left: 3px solid var(--vscode-editorInfo-foreground, #75beff);
      opacity: 0.85;
    }

    .usage {
      margin-top: 5px;
      font-size: 0.78em;
      opacity: 0.45;
    }

    /* Streaming cursor */
    .cursor::after {
      content: '▮';
      display: inline-block;
      animation: blink 0.85s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    /* Error bubble */
    .msg.error .bubble {
      background: var(--vscode-inputValidation-errorBackground, rgba(200,50,50,0.15));
      border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(200,50,50,0.4));
      color: var(--vscode-errorForeground, #f48771);
    }
    .error-actions { margin-top: 8px; }
    .error-actions button {
      background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border: none;
      border-radius: 3px;
      padding: 3px 10px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85em;
    }
    .error-actions button:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.35));
    }

    /* Done indicator */
    .msg-done {
      align-self: flex-start;
      font-size: 0.8em;
      opacity: 0.5;
      padding: 2px 6px;
    }

    /* ── Tool card ── */
    .tool-card {
      align-self: flex-start;
      background: var(--vscode-editorWidget-background, rgba(128,128,128,0.1));
      border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.25));
      border-radius: 6px;
      padding: 10px 12px;
      max-width: 90%;
      min-width: 260px;
    }
    .tool-card.done { opacity: 0.55; }
    .tool-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 0.9em;
    }
    .tool-icon { font-size: 1em; opacity: 0.8; flex-shrink: 0; }
    .tool-name { font-family: var(--vscode-editor-font-family); font-weight: 600; }
    .tool-path { opacity: 0.65; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tool-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .tool-card-actions button {
      background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border: none;
      border-radius: 3px;
      padding: 4px 10px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85em;
    }
    .tool-card-actions button:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.35));
    }
    .btn-approve-action {
      background: var(--vscode-button-background) !important;
      color: var(--vscode-button-foreground) !important;
    }
    .btn-approve-action:hover { background: var(--vscode-button-hoverBackground) !important; }
    .tool-result-summary {
      margin-top: 6px;
      font-size: 0.8em;
      opacity: 0.6;
      font-family: var(--vscode-editor-font-family);
    }

    /* ── Dry-run card ── */
    .dry-run-card {
      align-self: flex-start;
      background: var(--vscode-editorWidget-background, rgba(128,128,128,0.08));
      border: 1px dashed var(--vscode-editorWidget-border, rgba(128,128,128,0.3));
      border-radius: 6px;
      padding: 8px 12px;
      max-width: 90%;
      min-width: 220px;
      font-size: 0.88em;
      opacity: 0.8;
    }
    .dry-run-card-header {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 2px;
      font-size: 0.8em;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.6;
    }
    .dry-run-tool { font-family: var(--vscode-editor-font-family); font-weight: 600; }
    .dry-run-path { opacity: 0.6; }

    /* ── Input area ── */
    #inputArea {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px 12px;
      border-top: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
    }

    /* ── Context pills row ── */
    #pillsRow {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      min-height: 22px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px 2px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background, rgba(0,122,204,0.25));
      color: var(--vscode-badge-foreground, var(--vscode-editor-foreground));
      font-size: 0.78em;
      max-width: 200px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .pill-remove {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 0 0 0 2px;
      opacity: 0.6;
      font-size: 1.1em;
      line-height: 1;
      flex-shrink: 0;
    }
    .pill-remove:hover { opacity: 1; }

    #tokenCount {
      margin-left: auto;
      font-size: 0.75em;
      opacity: 0.5;
      white-space: nowrap;
      flex-shrink: 0;
    }
    #tokenCount.warning {
      color: var(--vscode-editorWarning-foreground, #cca700);
      opacity: 1;
    }

    #input {
      width: 100%;
      resize: none;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
      border-radius: 4px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: inherit;
      line-height: 1.4;
      outline: none;
    }
    #input:focus { border-color: var(--vscode-focusBorder, #007fd4); }

    #btnRow {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    #btnRow button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 5px 14px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    #btnRow button:hover { background: var(--vscode-button-hoverBackground); }
    #btnRow button:disabled { opacity: 0.5; cursor: not-allowed; }
    #newChatBtn, #stopBtn {
      background: var(--vscode-button-secondaryBackground) !important;
      color: var(--vscode-button-secondaryForeground) !important;
    }
    #newChatBtn:hover { background: var(--vscode-button-secondaryHoverBackground) !important; }
    #stopBtn { display: none; }
    #stopBtn:hover { background: var(--vscode-button-secondaryHoverBackground) !important; }
  </style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <span>Codin</span>
    <div class="topbar-actions">
      <button id="dryRunBtn" title="Toggle dry-run mode (preview without executing)">Dry Run</button>
      <button class="topbar-icon-btn" id="agentStatusBtn" title="Task / Plan / History">&#9776;</button>
      <button class="topbar-icon-btn" id="settingsBtn" title="Open Settings">&#9881;</button>
    </div>
  </div>

  <div id="agentDropdown">
    <div class="dropdown-section">
      <div class="dropdown-section-title">Current Task</div>
      <div class="dropdown-task" id="ddTask">No active task</div>
    </div>
    <div class="dropdown-section">
      <div class="dropdown-section-title">Plan</div>
      <div id="ddPlan"><span class="dropdown-empty">No active plan</span></div>
    </div>
    <div class="dropdown-section">
      <div class="dropdown-section-title">History</div>
      <div id="ddHistory"><span class="dropdown-empty">Completed tasks appear here</span></div>
    </div>
  </div>

  <div id="messages" role="log" aria-live="polite"></div>

  <div id="inputArea">
    <div id="pillsRow">
      <span id="tokenCount" data-testid="token-counter">~0 tokens</span>
    </div>
    <textarea id="input" rows="3" data-testid="chat-input"
      placeholder="Ask anything… (Enter to send, Shift+Enter for newline, @ to attach context)"></textarea>
    <div id="btnRow">
      <button id="newChatBtn" data-testid="btn-new-chat">New chat</button>
      <button id="stopBtn" data-testid="btn-stop">Stop</button>
      <button id="sendBtn">Send</button>
    </div>
  </div>
</div>

<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"></script>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const messagesEl   = document.getElementById('messages');
  const inputEl      = document.getElementById('input');
  const sendBtn      = document.getElementById('sendBtn');
  const stopBtn      = document.getElementById('stopBtn');
  const newChatBtn   = document.getElementById('newChatBtn');
  const dryRunBtn    = document.getElementById('dryRunBtn');
  const pillsRow     = document.getElementById('pillsRow');
  const tokenCountEl = document.getElementById('tokenCount');

  let streamingBubble = null;
  let streamingText   = '';
  let isStreaming     = false;
  let dryRunActive    = false;

  const contextItems  = [];
  let historyChars    = 0;
  let modelLimit      = 128000;

  marked.setOptions({ breaks: true, gfm: true });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

  function addMessage(role, html, raw) {
    const msg    = document.createElement('div');
    msg.className = 'msg ' + role;
    msg.setAttribute('data-testid', role === 'user' ? 'message-user' : 'message-assistant');
    const bubble  = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'user') { bubble.textContent = raw; } else { bubble.innerHTML = html; }
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return { msg, bubble };
  }

  function setStreaming(active) {
    isStreaming = active;
    sendBtn.disabled  = active;
    inputEl.disabled  = active;
    stopBtn.style.display = active ? '' : 'none';
    newChatBtn.style.display = active ? 'none' : '';
  }

  // ── Token counter ──────────────────────────────────────────────────────────
  function updateTokenCount() {
    const contextChars = contextItems.reduce((s, i) => s + i.content.length, 0);
    const inputChars   = inputEl.value.length;
    const totalChars   = historyChars + contextChars + inputChars;
    const tokens       = Math.ceil(totalChars / 4);
    const limitK       = Math.round(modelLimit / 1000);
    const pct          = Math.round((tokens / modelLimit) * 100);
    const warning      = tokens / modelLimit >= 0.75;

    tokenCountEl.textContent = '~' + tokens.toLocaleString() + ' / ' + limitK + 'k tokens (' + pct + '%)';
    tokenCountEl.className   = warning ? 'warning' : '';
  }

  // ── Context pills ──────────────────────────────────────────────────────────
  function renderPills() {
    const existing = pillsRow.querySelectorAll('.pill');
    existing.forEach((p) => p.remove());

    contextItems.forEach((item, idx) => {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.setAttribute('data-testid', 'context-pill');
      pill.title = item.detail ? item.label + ' (' + item.detail + ')' : item.label;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      pill.appendChild(labelSpan);

      const btn = document.createElement('button');
      btn.className = 'pill-remove';
      btn.textContent = '\\u00d7';
      btn.title = 'Remove';
      btn.addEventListener('click', () => {
        contextItems.splice(idx, 1);
        renderPills();
        updateTokenCount();
      });
      pill.appendChild(btn);

      pillsRow.insertBefore(pill, tokenCountEl);
    });

    updateTokenCount();
  }

  // ── Tool icon helper ───────────────────────────────────────────────────────
  function toolIcon(name) {
    const icons = {
      write_file: '[edit]',
      create_file: '[new]',
      delete_file: '[del]',
      run_command: '[run]',
      read_file: '[read]',
      grep_codebase: '[grep]',
      list_files: '[ls]',
      git_status: '[git]',
      git_commit: '[commit]',
      open_browser: '[url]',
      __continue__: '[?]',
    };
    return icons[name] || '[tool]';
  }

  // ── Tool card ──────────────────────────────────────────────────────────────
  function renderToolCard(callId, toolName, paramSummary, hasDiff) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.setAttribute('data-testid', 'tool-card');
    card.setAttribute('data-call-id', callId);

    const header = document.createElement('div');
    header.className = 'tool-card-header';
    header.innerHTML =
      '<span class="tool-icon">' + toolIcon(toolName) + '</span>' +
      '<span class="tool-name">' + toolName + '</span>' +
      '<span class="tool-path">' + escHtml(paramSummary) + '</span>';
    card.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'tool-card-actions';

    if (hasDiff) {
      const diffBtn = document.createElement('button');
      diffBtn.setAttribute('data-testid', 'btn-show-diff');
      diffBtn.textContent = 'Show diff';
      diffBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'showDiff', callId });
      });
      actions.appendChild(diffBtn);
    }

    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn-approve-action';
    approveBtn.setAttribute('data-testid', 'btn-approve');
    approveBtn.textContent = 'Approve';
    approveBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'approveTool', callId });
      markCardDone(callId, true);
    });
    actions.appendChild(approveBtn);

    const rejectBtn = document.createElement('button');
    rejectBtn.setAttribute('data-testid', 'btn-reject');
    rejectBtn.textContent = 'Reject';
    rejectBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'rejectTool', callId });
      markCardDone(callId, false);
    });
    actions.appendChild(rejectBtn);

    card.appendChild(actions);
    messagesEl.appendChild(card);
    scrollToBottom();
    return card;
  }

  // ── Dry-run card ───────────────────────────────────────────────────────────
  function renderDryRunCard(callId, toolName, paramSummary) {
    const card = document.createElement('div');
    card.className = 'dry-run-card';
    card.setAttribute('data-testid', 'dry-run-card');
    card.setAttribute('data-call-id', callId);

    const header = document.createElement('div');
    header.className = 'dry-run-card-header';
    header.textContent = 'Dry run — would call';
    card.appendChild(header);

    const body = document.createElement('div');
    body.innerHTML =
      '<span class="dry-run-tool">' + escHtml(toolName) + '</span>' +
      ' <span class="dry-run-path">' + escHtml(paramSummary) + '</span>';
    card.appendChild(body);

    messagesEl.appendChild(card);
    scrollToBottom();
  }

  function markCardDone(callId, approved) {
    const card = messagesEl.querySelector('[data-call-id="' + callId + '"]');
    if (!card) return;
    card.classList.add('done');
    const actions = card.querySelector('.tool-card-actions');
    if (actions) actions.remove();
    const summary = document.createElement('div');
    summary.className = 'tool-result-summary';
    summary.textContent = approved ? 'Approved' : 'Rejected';
    card.appendChild(summary);
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;
    inputEl.value = '';
    inputEl.style.height = '';
    addMessage('user', '', text);

    const items = contextItems.splice(0);
    renderPills();

    vscode.postMessage({ command: 'sendMessage', text, contextItems: items });
  }

  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', () => vscode.postMessage({ command: 'stopAgent' }));
  newChatBtn.addEventListener('click', () => vscode.postMessage({ command: 'newChat' }));
  dryRunBtn.addEventListener('click', () => vscode.postMessage({ command: 'toggleDryRun' }));

  // Keyboard shortcut: Ctrl+L to clear chat, Escape to stop
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isStreaming) { vscode.postMessage({ command: 'stopAgent' }); }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); vscode.postMessage({ command: 'newChat' }); }
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  inputEl.addEventListener('input', () => {
    const val = inputEl.value;
    const pos = inputEl.selectionStart != null ? inputEl.selectionStart : val.length;
    if (pos > 0 && val[pos - 1] === '@') {
      inputEl.value = val.slice(0, pos - 1) + val.slice(pos);
      inputEl.setSelectionRange(pos - 1, pos - 1);
      vscode.postMessage({ command: 'triggerMention' });
    }
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
    updateTokenCount();
  });

   document.getElementById('settingsBtn').addEventListener('click', () => {
     vscode.postMessage({ command: 'openSettings' });
   });

   // ── Agent status dropdown ──────────────────────────────────────────────
   const agentDropdown = document.getElementById('agentDropdown');
   const agentStatusBtn = document.getElementById('agentStatusBtn');
   const ddTask = document.getElementById('ddTask');
   const ddPlan = document.getElementById('ddPlan');
   const ddHistory = document.getElementById('ddHistory');
   const taskHistory = [];
   let currentPlanSteps = [];

   agentStatusBtn.addEventListener('click', () => {
     agentDropdown.classList.toggle('open');
     agentStatusBtn.classList.toggle('active');
   });

   function renderDropdownPlan() {
     if (currentPlanSteps.length === 0) {
       ddPlan.innerHTML = '<span class="dropdown-empty">No active plan</span>';
       return;
     }
     ddPlan.innerHTML = '';
     currentPlanSteps.forEach(s => {
       const icon = { pending: '⬜', active: '🔄', done: '✅', failed: '❌' }[s.status] || '⬜';
       const row = document.createElement('div');
       row.className = 'dropdown-step';
       row.innerHTML = '<span class="dropdown-step-icon">' + icon + '</span><span class="dropdown-step-text">' + escHtml(s.index + '. ' + s.description) + '</span>';
       ddPlan.appendChild(row);
     });
   }

   function renderDropdownHistory() {
     if (taskHistory.length === 0) {
       ddHistory.innerHTML = '<span class="dropdown-empty">Completed tasks appear here</span>';
       return;
     }
     ddHistory.innerHTML = '';
     taskHistory.forEach(h => {
       const row = document.createElement('div');
       row.className = 'dropdown-history-item';
       row.textContent = '• ' + h;
       ddHistory.appendChild(row);
     });
   }

  // ── Messages from extension host ───────────────────────────────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.command) {
      case 'streamStart': {
        streamingText = '';
        setStreaming(true);
        const { msg: el, bubble } = addMessage('assistant', '', '');
        bubble.classList.add('cursor');
        streamingBubble = { el, bubble };
        break;
      }
      case 'token': {
        if (!streamingBubble) break;
        streamingText += msg.content;
        streamingBubble.bubble.textContent = streamingText;
        scrollToBottom();
        break;
      }
      case 'done': {
        setStreaming(false);
        if (streamingBubble) {
          const { bubble } = streamingBubble;
          bubble.classList.remove('cursor');
          bubble.innerHTML = marked.parse(streamingText);
          streamingBubble = null;
          streamingText   = '';
          scrollToBottom();
        }
        break;
      }
      case 'agentDone': {
        setStreaming(false);
        if (streamingBubble) {
          const { bubble } = streamingBubble;
          bubble.classList.remove('cursor');
          if (streamingText) bubble.innerHTML = marked.parse(streamingText);
          streamingBubble = null;
          streamingText   = '';
        }
        const doneEl = document.createElement('div');
        doneEl.className = 'msg-done';
        doneEl.setAttribute('data-testid', 'message-done');
        doneEl.textContent = 'Task complete';
        messagesEl.appendChild(doneEl);
        scrollToBottom();
        break;
      }
      case 'error': {
        setStreaming(false);
        if (streamingBubble) {
          streamingBubble.bubble.classList.remove('cursor');
          streamingBubble = null;
          streamingText   = '';
        }
        const errEl     = document.createElement('div');
        errEl.className = 'msg error';
        const errBubble = document.createElement('div');
        errBubble.className = 'bubble';
        errBubble.setAttribute('data-testid', 'error-banner');
        errBubble.textContent = msg.error;
        errEl.appendChild(errBubble);

        const errActions = document.createElement('div');
        errActions.className = 'error-actions';
        const retryBtn = document.createElement('button');
        retryBtn.setAttribute('data-testid', 'btn-retry');
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => vscode.postMessage({ command: 'retry' }));
        errActions.appendChild(retryBtn);
        errBubble.appendChild(errActions);

        messagesEl.appendChild(errEl);
        scrollToBottom();
        break;
      }
      case 'toolCard': {
        renderToolCard(msg.callId, msg.toolName, msg.paramSummary || '', msg.hasDiff);
        break;
      }
      case 'dryRunCard': {
        renderDryRunCard(msg.callId, msg.toolName, msg.paramSummary || '');
        break;
      }
      case 'toolCallDone': {
        markCardDone(msg.callId, msg.ok);
        break;
      }
      case 'toolCallStart': {
        // Shown inline — no extra UI needed (card shown on waiting_for_approval)
        break;
      }
      case 'dryRunToggled': {
        dryRunActive = msg.active;
        dryRunBtn.classList.toggle('active', dryRunActive);
        dryRunBtn.title = dryRunActive
          ? 'Dry run active — click to disable'
          : 'Toggle dry-run mode (preview without executing)';
        break;
      }
      case 'clearChat': {
        messagesEl.innerHTML = '';
        streamingBubble = null;
        streamingText   = '';
        historyChars    = 0;
        updateTokenCount();
        break;
      }
      case 'contextItemAdded': {
        contextItems.push(msg.item);
        renderPills();
        break;
      }
      case 'historyUpdate': {
        historyChars = msg.chars;
        updateTokenCount();
        break;
      }
      case 'modelInfo': {
        modelLimit = msg.limit;
        updateTokenCount();
        break;
      }
      case 'planReady': {
        ddTask.textContent = msg.taskSummary || 'Running…';
        currentPlanSteps = (msg.steps || []).map(s => ({...s}));
        renderDropdownPlan();
        break;
      }
      case 'stepUpdate': {
        const si = currentPlanSteps.findIndex(s => s.index === msg.stepIndex);
        if (si >= 0) currentPlanSteps[si].status = msg.status;
        renderDropdownPlan();
        break;
      }
      case 'taskComplete': {
        if (ddTask.textContent && ddTask.textContent !== 'No active task') {
          taskHistory.unshift(ddTask.textContent);
          if (taskHistory.length > 10) taskHistory.pop();
          renderDropdownHistory();
        }
        ddTask.textContent = 'No active task';
        currentPlanSteps = [];
        renderDropdownPlan();
        break;
      }
    }
  });
</script>
</body>
</html>`;
  }

  public dispose(): void {
    ChatPanel._currentPanel = undefined;
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

function buildParamSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'write_file':
    case 'create_file':
    case 'read_file':
    case 'delete_file':
      return String(input['path'] ?? '');
    case 'run_command':
    case 'git_commit':
      return String(input['command'] ?? input['message'] ?? '');
    case 'grep_codebase':
      return `pattern: ${String(input['pattern'] ?? '')}`;
    case 'list_files':
      return String(input['path'] ?? '.');
    case 'open_browser':
      return String(input['url'] ?? '');
    default:
      return JSON.stringify(input).slice(0, 80);
  }
}
