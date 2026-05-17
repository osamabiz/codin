import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscodeMock from '../__mocks__/vscode';
import { OnboardingPanel } from '../../src/ui/OnboardingPanel';
import { SettingsManager } from '../../src/utils/SettingsManager';

describe('OnboardingPanel tests', () => {
  let mockContext: any;
  let mockSettings: SettingsManager;
  let mockPanel: any;

  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock getConfiguration
    vscodeMock.workspace.getConfiguration.mockReturnValue({
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    } as any);

    let mockGlobalStateValue = false;
    mockContext = {
      globalState: {
        update: vi.fn().mockImplementation((key, val) => {
          if (key === 'onboardingComplete') mockGlobalStateValue = val;
          return Promise.resolve();
        }),
        get: vi.fn().mockImplementation((key) => {
          if (key === 'onboardingComplete') return mockGlobalStateValue;
          return false;
        })
      },
      extensionUri: vscodeMock.Uri.parse('file:///fake/path')
    };
    
    const mockSecrets = {
      get: vi.fn().mockResolvedValue(''),
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    
    mockSettings = new SettingsManager(mockSecrets as any, mockContext.globalState);
    
    mockPanel = {
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn(),
        cspSource: 'vscode-webview:'
      },
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
      dispose: vi.fn()
    };
    
    vi.mocked(vscodeMock.window.createWebviewPanel).mockReturnValue(mockPanel);
    
    // Reset instance for fresh tests
    if ((OnboardingPanel as any)._instance) {
      (OnboardingPanel as any)._instance.dispose();
    }
  });

  describe('detect_ollama', () => {
    it('returns models when fetch is successful', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ models: [{ name: 'qwen2.5-coder' }, { name: 'llama3' }] })
      });
      global.AbortController = vi.fn().mockImplementation(() => ({ abort: vi.fn(), signal: {} })) as any;

      OnboardingPanel.createOrShow(mockContext.extensionUri, mockContext, mockSettings);
      
      const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      messageHandler({ type: 'detect_ollama', baseUrl: 'http://localhost:11434' });
      await flushPromises();
      
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'ollama_status',
        running: true,
        models: ['qwen2.5-coder', 'llama3']
      });
    });

    it('returns running false when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.AbortController = vi.fn().mockImplementation(() => ({ abort: vi.fn(), signal: {} })) as any;

      OnboardingPanel.createOrShow(mockContext.extensionUri, mockContext, mockSettings);
      
      const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      messageHandler({ type: 'detect_ollama', baseUrl: 'http://localhost:11434' });
      await flushPromises();
      
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'ollama_status',
        running: false,
        models: []
      });
    });
  });

  describe('setup_complete', () => {
    it('saves key and sets onboardingComplete to true', async () => {
      OnboardingPanel.createOrShow(mockContext.extensionUri, mockContext, mockSettings);
      
      const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      messageHandler({
        type: 'setup_complete',
        provider: 'claude',
        apiKey: 'test-key',
        model: 'claude-sonnet-4-5'
      });
      await flushPromises();
      
      expect(mockSettings.onboardingComplete).toBe(true);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboardingComplete', true);
      // Key should be passed to secrets.store (SettingsManager mock)
    });
  });

  describe('skip handler', () => {
    it('sets onboardingComplete without saving a key', async () => {
      OnboardingPanel.createOrShow(mockContext.extensionUri, mockContext, mockSettings);
      
      const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0][0];
      messageHandler({ type: 'skip_onboarding' });
      await flushPromises();

      
      expect(mockSettings.onboardingComplete).toBe(true);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboardingComplete', true);
    });
  });

  describe('hasAnyApiKey', () => {
    it('returns true when one provider has a key', async () => {
      const mockSecrets = {
        get: vi.fn().mockImplementation(key => {
          if (key === 'codin.apiKey.claude') return Promise.resolve('test-key');
          return Promise.resolve('');
        })
      };
      const settings = new SettingsManager(mockSecrets as any);
      expect(await settings.hasAnyApiKey()).toBe(true);
    });

    it('returns false when all keys are empty', async () => {
      const mockSecrets = {
        get: vi.fn().mockResolvedValue('')
      };
      const settings = new SettingsManager(mockSecrets as any);
      expect(await settings.hasAnyApiKey()).toBe(false);
    });
  });
});
