import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── child_process mock ────────────────────────────────────────────────────
type ExecCallback = (
  error: NodeJS.ErrnoException | null,
  stdout: string,
  stderr: string
) => void;

interface MockChildProcess {
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
}

const mockExec = vi.fn<
  (
    cmd: string,
    opts: Record<string, unknown>,
    cb?: ExecCallback
  ) => MockChildProcess
>();

vi.mock('child_process', () => ({ exec: mockExec }));

function makeContext(root = '/workspace'): import('../../src/tools/types').ToolContext {
  return {
    workspaceRoot: root,
    vscode: {
      workspace: {
        getConfiguration: vi.fn().mockReturnValue({
          get: (_key: string, def: unknown) => def,
        }),
      },
    } as unknown as typeof import('vscode'),
  };
}

/** Build a mock child process that emits stdout/stderr then closes. */
function fakeChild(
  stdout: string,
  stderr: string,
  code: number,
  signal?: AbortSignal
): MockChildProcess {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const child: MockChildProcess = {
    stdout: {
      on: vi.fn((_ev: string, cb: (data: Buffer | string) => void) => {
        if (stdout) setTimeout(() => cb(stdout), 0);
      }),
    },
    stderr: {
      on: vi.fn((_ev: string, cb: (data: Buffer | string) => void) => {
        if (stderr) setTimeout(() => cb(stderr), 0);
      }),
    },
    on: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
      listeners[ev] = listeners[ev] ?? [];
      listeners[ev].push(cb);
      if (ev === 'close') {
        setTimeout(() => {
          if (signal?.aborted) return;
          cb(code);
        }, 1);
      }
    }),
  };

  return child;
}

const { runCommand } = await import('../../src/tools/run-command');

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runCommand tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and requiresConfirmation: true', () => {
    expect(runCommand.name).toBe('run_command');
    expect(runCommand.requiresConfirmation).toBe(true);
  });

  // ── Blocked patterns ───────────────────────────────────────────────────────

  it('blocks commands matching the default blocklist pattern', async () => {
    const ctx = makeContext();
    // "sudo" is in the default blocked list
    const result = await runCommand.execute({ command: 'sudo apt install curl' }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/blocked/i);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('blocks rm -rf / pattern', async () => {
    const result = await runCommand.execute({ command: 'rm -rf /' }, makeContext());
    expect(result.ok).toBe(false);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('blocks custom patterns from settings', async () => {
    const ctx: import('../../src/tools/types').ToolContext = {
      workspaceRoot: '/workspace',
      vscode: {
        workspace: {
          getConfiguration: vi.fn().mockReturnValue({
            get: (_key: string, def: unknown) =>
              _key === 'blockedCommands' ? ['curl', 'wget'] : def,
          }),
        },
      } as unknown as typeof import('vscode'),
    };
    const result = await runCommand.execute({ command: 'curl https://evil.com' }, ctx);
    expect(result.ok).toBe(false);
    expect(mockExec).not.toHaveBeenCalled();
  });

  // ── Path traversal on cwd ─────────────────────────────────────────────────

  it('rejects cwd outside workspace root', async () => {
    const result = await runCommand.execute(
      { command: 'ls', cwd: '../../etc' },
      makeContext('/workspace')
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/outside workspace/i);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns stdout and exit code on success', async () => {
    mockExec.mockImplementation((_cmd, _opts) => {
      return fakeChild('hello world\n', '', 0);
    });

    const result = await runCommand.execute({ command: 'echo hello' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('hello world');
    expect(result.output).toContain('exit code: 0');
  });

  it('returns ok: false when exit code is non-zero', async () => {
    mockExec.mockImplementation(() => fakeChild('', 'command not found', 127));

    const result = await runCommand.execute({ command: 'nonexistent-cmd' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.output).toContain('127');
  });

  // ── Timeout ────────────────────────────────────────────────────────────────

  it('returns a timeout error when AbortController fires', async () => {
    mockExec.mockImplementation((_cmd, opts) => {
      const signal = (opts as { signal?: AbortSignal }).signal;
      // Simulate the 'error' event that fires when the signal aborts
      const child: MockChildProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
          if (ev === 'error') {
            // Trigger abort error immediately
            setImmediate(() => {
              const err = new Error('AbortError') as NodeJS.ErrnoException;
              err.code = 'ABORT_ERR';
              err.name = 'AbortError';
              cb(err);
            });
          }
          // 'close' never fires (timed out)
        }),
      };
      return child;
    });

    const result = await runCommand.execute({ command: 'sleep 999' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.output).toMatch(/timed out/i);
  });
});
