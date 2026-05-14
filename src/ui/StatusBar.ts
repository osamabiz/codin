import * as vscode from 'vscode';

type StatusBarState = 'idle' | 'running' | 'waiting' | 'error';

export class StatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;

  constructor() {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._item.command = 'agentPlugin.openChat';
    this._item.tooltip = 'AI Agent — click to open chat';
    this._setState('idle');
    this._item.show();
  }

  setIdle(): void {
    this._setState('idle');
  }

  setRunning(): void {
    this._setState('running');
  }

  setWaiting(): void {
    this._setState('waiting');
  }

  setError(): void {
    this._setState('error');
  }

  private _setState(state: StatusBarState): void {
    switch (state) {
      case 'idle':
        this._item.text = '$(circle-filled) Agent: Idle';
        this._item.color = new vscode.ThemeColor('statusBar.foreground');
        this._item.backgroundColor = undefined;
        break;
      case 'running':
        this._item.text = '$(sync~spin) Agent: Running...';
        this._item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        break;
      case 'waiting':
        this._item.text = '$(circle-filled) Agent: Waiting';
        this._item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'error':
        this._item.text = '$(error) Agent: Error';
        this._item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  dispose(): void {
    this._item.dispose();
  }
}
