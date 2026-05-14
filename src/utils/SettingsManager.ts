import * as vscode from 'vscode';

const SECRET_KEY_PREFIX = 'agentPlugin.apiKey.';

export class SettingsManager {
  constructor(private readonly _secrets: vscode.SecretStorage) {}

  async getApiKey(providerId: string): Promise<string> {
    return (await this._secrets.get(`${SECRET_KEY_PREFIX}${providerId}`)) ?? '';
  }

  async setApiKey(providerId: string, key: string): Promise<void> {
    await this._secrets.store(`${SECRET_KEY_PREFIX}${providerId}`, key);
  }

  getProvider(): string {
    return this._cfg().get<string>('provider', 'claude');
  }

  getModel(): string {
    return this._cfg().get<string>('model', 'claude-sonnet-4-5');
  }

  getTemperature(): number {
    return this._cfg().get<number>('temperature', 0.7);
  }

  getMaxTokens(): number {
    return this._cfg().get<number>('maxTokens', 4096);
  }

  getMaxSteps(): number {
    return this._cfg().get<number>('maxSteps', 25);
  }

  private _cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('agentPlugin');
  }
}
