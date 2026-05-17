import * as vscode from 'vscode';

const SECRET_KEY_PREFIX = 'codin.apiKey.';

export class SettingsManager {
  constructor(private readonly _secrets: vscode.SecretStorage) {}

  async getApiKey(providerId: string): Promise<string> {
    // Check SecretStorage first (preferred)
    const secretKey = await this._secrets.get(`${SECRET_KEY_PREFIX}${providerId}`);
    if (secretKey) return secretKey;

    // Fallback: check VS Code settings (codin.apiKey) for users who paste there
    const cfg = vscode.workspace.getConfiguration('codin');
    const settingsKey = cfg.get<string>('apiKey', '');
    if (settingsKey) {
      // Migrate to SecretStorage and clear from settings for security
      await this._secrets.store(`${SECRET_KEY_PREFIX}${providerId}`, settingsKey);
      await cfg.update('apiKey', '', vscode.ConfigurationTarget.Global);
      return settingsKey;
    }

    return '';
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

  getBaseUrl(): string {
    return this._cfg().get<string>('customBaseUrl', '');
  }

  private _cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('codin');
  }
}
