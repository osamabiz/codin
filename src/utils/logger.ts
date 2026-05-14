import * as vscode from 'vscode';

export class Logger {
  private readonly _channel: vscode.OutputChannel;

  constructor(name: string) {
    this._channel = vscode.window.createOutputChannel(name);
  }

  info(message: string): void {
    this._channel.appendLine(`[INFO]  ${new Date().toISOString()} ${message}`);
  }

  warn(message: string): void {
    this._channel.appendLine(`[WARN]  ${new Date().toISOString()} ${message}`);
  }

  error(message: string, err?: unknown): void {
    this._channel.appendLine(`[ERROR] ${new Date().toISOString()} ${message}`);
    if (err instanceof Error) {
      this._channel.appendLine(`        ${err.message}`);
    } else if (err !== undefined) {
      this._channel.appendLine(`        ${String(err)}`);
    }
  }

  dispose(): void {
    this._channel.dispose();
  }
}
