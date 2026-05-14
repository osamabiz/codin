import { vi } from 'vitest';

// Full hand-written mock of the VS Code API for use in Vitest unit tests.
// The alias vscode → this file is configured in vitest.config.ts.
// Tests never run inside an Extension Host, so the real vscode module is unavailable.

export const window = {
  createOutputChannel: vi.fn().mockReturnValue({
    appendLine: vi.fn(),
    append: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  }),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  activeTextEditor: undefined as undefined,
  createWebviewPanel: vi.fn().mockReturnValue({
    webview: {
      html: '',
      cspSource: 'vscode-webview:',
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidChangeViewState: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(),
  }),
  registerTreeDataProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  createTreeView: vi.fn().mockReturnValue({
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidChangeSelection: vi.fn(),
    onDidChangeVisibility: vi.fn(),
    onDidExpandElement: vi.fn(),
    onDidCollapseElement: vi.fn(),
  }),
  createStatusBarItem: vi.fn().mockReturnValue({
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    text: '',
    tooltip: '',
    command: undefined,
    color: undefined as unknown,
    backgroundColor: undefined as unknown,
  }),
  createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

export const commands = {
  registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  executeCommand: vi.fn(),
  getCommands: vi.fn().mockResolvedValue([]),
};

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
    update: vi.fn(),
    has: vi.fn(),
    inspect: vi.fn(),
  }),
  workspaceFolders: [
    { uri: { fsPath: '/fake/workspace', scheme: 'file' }, name: 'fake', index: 0 },
  ],
  findFiles: vi.fn().mockResolvedValue([]),
  openTextDocument: vi.fn(),
  getWorkspaceFolder: vi.fn(),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', toString: () => `file://${path}` }),
  joinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
    fsPath: parts.join('/'),
    scheme: 'file',
    toString: () => parts.join('/'),
  })),
  parse: vi.fn((value: string) => ({ fsPath: value, scheme: 'file' })),
};

export class TreeItem {
  public label: string;
  public collapsibleState: number;
  public tooltip?: string;
  public contextValue?: string;
  public iconPath?: unknown;
  public command?: unknown;

  constructor(label: string, collapsibleState = 0) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
} as const;

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
} as const;

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
} as const;

export const ExtensionContext = vi.fn();

export const EventEmitter = vi.fn().mockImplementation(() => ({
  event: vi.fn(),
  fire: vi.fn(),
  dispose: vi.fn(),
}));

export const env = {
  openExternal: vi.fn(),
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(),
  },
};

export const languages = {
  registerHoverProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

export class ThemeColor {
  constructor(public readonly id: string) {}
}
