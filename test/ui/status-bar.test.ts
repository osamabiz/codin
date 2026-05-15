import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { StatusBar } from '../../src/ui/StatusBar';

describe('StatusBar', () => {
  let mockItem: ReturnType<typeof vscode.window.createStatusBarItem>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockItem = {
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      text: '',
      tooltip: '',
      command: undefined as unknown,
      color: undefined as unknown,
      backgroundColor: undefined as unknown,
    };
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue(mockItem as unknown as vscode.StatusBarItem);
  });

  it('creates a status bar item on the left with a command', () => {
    new StatusBar();
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Left,
      100
    );
    expect(mockItem.command).toBe('codin.openChat');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('starts in idle state', () => {
    new StatusBar();
    expect(mockItem.text).toContain('Idle');
  });

  it('setRunning changes text to Running', () => {
    const bar = new StatusBar();
    bar.setRunning();
    expect(mockItem.text).toContain('Running');
  });

  it('setWaiting changes text to Waiting', () => {
    const bar = new StatusBar();
    bar.setWaiting();
    expect(mockItem.text).toContain('Waiting');
  });

  it('setError changes text to Error', () => {
    const bar = new StatusBar();
    bar.setError();
    expect(mockItem.text).toContain('Error');
  });

  it('setIdle returns to Idle after other states', () => {
    const bar = new StatusBar();
    bar.setRunning();
    bar.setIdle();
    expect(mockItem.text).toContain('Idle');
  });

  it('dispose calls item.dispose()', () => {
    const bar = new StatusBar();
    bar.dispose();
    expect(mockItem.dispose).toHaveBeenCalled();
  });

  it('idle → running → waiting → idle transition', () => {
    const bar = new StatusBar();
    expect(mockItem.text).toContain('Idle');

    bar.setRunning();
    expect(mockItem.text).toContain('Running');

    bar.setWaiting();
    expect(mockItem.text).toContain('Waiting');

    bar.setIdle();
    expect(mockItem.text).toContain('Idle');
  });
});
