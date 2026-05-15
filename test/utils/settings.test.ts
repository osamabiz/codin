import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsManager } from '../../src/utils/SettingsManager';
import * as vscodeMock from '../__mocks__/vscode';
import type * as vscode from 'vscode';

// Build a mock SecretStorage for each test.
function makeSecrets(stored: Record<string, string> = {}) {
  const data = { ...stored };
  return {
    get: vi.fn(async (key: string) => data[key]),
    store: vi.fn(async (key: string, value: string) => { data[key] = value; }),
    delete: vi.fn(async (key: string) => { delete data[key]; }),
    onDidChange: vi.fn(),
  };
}

describe('SettingsManager — SecretStorage', () => {
  it('getApiKey retrieves value under the namespaced key', async () => {
    const secrets = makeSecrets({ 'codin.apiKey.claude': 'sk-abc123' });
    const mgr = new SettingsManager(secrets as unknown as vscode.SecretStorage);

    const key = await mgr.getApiKey('claude');

    expect(secrets.get).toHaveBeenCalledWith('codin.apiKey.claude');
    expect(key).toBe('sk-abc123');
  });

  it('getApiKey returns empty string when nothing is stored', async () => {
    const secrets = makeSecrets();
    const mgr = new SettingsManager(secrets as unknown as vscode.SecretStorage);

    expect(await mgr.getApiKey('openai')).toBe('');
  });

  it('setApiKey stores the value under the namespaced key', async () => {
    const secrets = makeSecrets();
    const mgr = new SettingsManager(secrets as unknown as vscode.SecretStorage);

    await mgr.setApiKey('openai', 'sk-openai-xyz');

    expect(secrets.store).toHaveBeenCalledWith('codin.apiKey.openai', 'sk-openai-xyz');
  });

  it('getApiKey + setApiKey round-trips correctly', async () => {
    const secrets = makeSecrets();
    const mgr = new SettingsManager(secrets as unknown as vscode.SecretStorage);

    await mgr.setApiKey('ollama', 'no-key-needed');
    const retrieved = await mgr.getApiKey('ollama');

    expect(retrieved).toBe('no-key-needed');
  });

  it('separate providers have separate keys', async () => {
    const secrets = makeSecrets();
    const mgr = new SettingsManager(secrets as unknown as vscode.SecretStorage);

    await mgr.setApiKey('claude', 'claude-key');
    await mgr.setApiKey('openai', 'openai-key');

    expect(await mgr.getApiKey('claude')).toBe('claude-key');
    expect(await mgr.getApiKey('openai')).toBe('openai-key');
  });
});

describe('SettingsManager — workspace configuration', () => {
  let secrets: ReturnType<typeof makeSecrets>;
  let mgr: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    secrets = makeSecrets();
    mgr = new SettingsManager(secrets as unknown as vscode.SecretStorage);
  });

  it('getProvider calls getConfiguration with correct section and key', () => {
    const mockGet = vi.fn().mockReturnValue('openai');
    vi.mocked(vscodeMock.workspace.getConfiguration).mockReturnValue({
      get: mockGet,
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    });

    const result = mgr.getProvider();

    expect(vscodeMock.workspace.getConfiguration).toHaveBeenCalledWith('codin');
    expect(mockGet).toHaveBeenCalledWith('provider', 'claude');
    expect(result).toBe('openai');
  });

  it('getModel calls getConfiguration with correct key', () => {
    const mockGet = vi.fn().mockReturnValue('gpt-4o');
    vi.mocked(vscodeMock.workspace.getConfiguration).mockReturnValue({
      get: mockGet,
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    });

    const result = mgr.getModel();
    expect(mockGet).toHaveBeenCalledWith('model', 'claude-sonnet-4-5');
    expect(result).toBe('gpt-4o');
  });

  it('getTemperature calls getConfiguration with correct key', () => {
    const mockGet = vi.fn().mockReturnValue(0.9);
    vi.mocked(vscodeMock.workspace.getConfiguration).mockReturnValue({
      get: mockGet,
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    });

    expect(mgr.getTemperature()).toBe(0.9);
    expect(mockGet).toHaveBeenCalledWith('temperature', 0.7);
  });

  it('getMaxTokens calls getConfiguration with correct key', () => {
    const mockGet = vi.fn().mockReturnValue(8192);
    vi.mocked(vscodeMock.workspace.getConfiguration).mockReturnValue({
      get: mockGet,
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    });

    expect(mgr.getMaxTokens()).toBe(8192);
    expect(mockGet).toHaveBeenCalledWith('maxTokens', 4096);
  });
});
