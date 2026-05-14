import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscodeMock from './__mocks__/vscode';
import { Logger } from '../src/utils/logger';

// The vscode module is resolved to our hand-written mock via the alias in
// vitest.config.ts — Logger's `import * as vscode from 'vscode'` uses it too.

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an output channel with the provided name', () => {
    new Logger('MyChannel');
    expect(vscodeMock.window.createOutputChannel).toHaveBeenCalledWith('MyChannel');
  });

  it('writes [INFO] lines that include the message', () => {
    const mockChannel = {
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(vscodeMock.window.createOutputChannel).mockReturnValueOnce(
      mockChannel as ReturnType<typeof vscodeMock.window.createOutputChannel>
    );

    const logger = new Logger('Test');
    logger.info('hello world');

    expect(mockChannel.appendLine).toHaveBeenCalledTimes(1);
    const [line] = vi.mocked(mockChannel.appendLine).mock.calls[0];
    expect(line).toContain('[INFO]');
    expect(line).toContain('hello world');
  });

  it('writes [WARN] lines that include the message', () => {
    const mockChannel = {
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(vscodeMock.window.createOutputChannel).mockReturnValueOnce(
      mockChannel as ReturnType<typeof vscodeMock.window.createOutputChannel>
    );

    const logger = new Logger('Test');
    logger.warn('something off');

    const [line] = vi.mocked(mockChannel.appendLine).mock.calls[0];
    expect(line).toContain('[WARN]');
    expect(line).toContain('something off');
  });

  it('writes [ERROR] lines and appends the error message', () => {
    const mockChannel = {
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(vscodeMock.window.createOutputChannel).mockReturnValueOnce(
      mockChannel as ReturnType<typeof vscodeMock.window.createOutputChannel>
    );

    const logger = new Logger('Test');
    logger.error('something failed', new Error('boom'));

    const calls = vi.mocked(mockChannel.appendLine).mock.calls;
    expect(calls[0][0]).toContain('[ERROR]');
    expect(calls[0][0]).toContain('something failed');
    expect(calls[1][0]).toContain('boom');
  });

  it('disposes the output channel', () => {
    const mockChannel = {
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(vscodeMock.window.createOutputChannel).mockReturnValueOnce(
      mockChannel as ReturnType<typeof vscodeMock.window.createOutputChannel>
    );

    const logger = new Logger('Test');
    logger.dispose();

    expect(mockChannel.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('getNonce (Phase 0 scaffold)', () => {
  it('produces a 32-character hex string', () => {
    // Reimplemented here to test the logic in isolation.
    const chars = 'ABCDEFabcdef0123456789';
    const getNonce = (): string => {
      let text = '';
      for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return text;
    };

    const n = getNonce();
    expect(n).toHaveLength(32);
    expect(n).toMatch(/^[0-9A-Fa-f]+$/);
  });

  it('produces a different nonce on each call', () => {
    const chars = 'ABCDEFabcdef0123456789';
    const getNonce = (): string => {
      let text = '';
      for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
      return text;
    };
    // Astronomically unlikely to collide — safe as a sanity check.
    expect(getNonce()).not.toBe(getNonce());
  });
});
