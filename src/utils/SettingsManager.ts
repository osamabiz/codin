import * as vscode from 'vscode';

const SECRET_KEY_PREFIX = 'codin.apiKey.';

const ALL_PROVIDER_IDS = [
  'claude', 'openai', 'groq', 'openrouter', 'gemini',
  'mistral', 'deepseek', 'moonshot', 'kimi', 'qwen', 'minimax',
  'ollama', 'lmstudio', 'jan', 'openai-compatible',
];

export class SettingsManager {
  private _globalState: vscode.Memento | undefined;

  constructor(
    private readonly _secrets: vscode.SecretStorage,
    globalState?: vscode.Memento
  ) {
    this._globalState = globalState;
  }

  /** Attach globalState after construction (e.g. from extension.ts). */
  setGlobalState(state: vscode.Memento): void {
    this._globalState = state;
  }

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

  /**
   * Check SecretStorage for keys under all known provider IDs.
   * Returns true if any provider has a non-empty key stored.
   */
  async hasAnyApiKey(): Promise<boolean> {
    for (const id of ALL_PROVIDER_IDS) {
      const key = await this._secrets.get(`${SECRET_KEY_PREFIX}${id}`);
      if (key && key.length > 0) return true;
    }
    return false;
  }

  get onboardingComplete(): boolean {
    return this._globalState?.get<boolean>('onboardingComplete', false) ?? false;
  }

  set onboardingComplete(value: boolean) {
    void this._globalState?.update('onboardingComplete', value);
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
