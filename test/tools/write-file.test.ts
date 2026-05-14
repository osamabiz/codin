import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── fs mock — hoisted before module import ─────────────────────────────────
const mockExistsSync = vi.fn<(p: string) => boolean>();
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

// Mock child_process so checkpoint exec never runs
vi.mock('child_process', () => ({ exec: vi.fn() }));

function makeContext(root = '/workspace'): import('../../src/tools/types').ToolContext {
  return {
    workspaceRoot: root,
    vscode: {
      workspace: {
        getConfiguration: vi.fn().mockReturnValue({
          get: (key: string, def: unknown) => {
            if (key === 'allowedWriteDirectories') return [];
            if (key === 'checkpointBeforeEdit') return false;
            return def;
          },
        }),
      },
    } as unknown as typeof import('vscode'),
  };
}

const { writeFile } = await import('../../src/tools/write-file');

// ── Tests ──────────────────────────────────────────────────────────────────

describe('writeFile tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('has correct name and requiresConfirmation: true', () => {
    expect(writeFile.name).toBe('write_file');
    expect(writeFile.requiresConfirmation).toBe(true);
  });

  // ── Path traversal ─────────────────────────────────────────────────────────

  it('rejects paths containing .. that escape the workspace', async () => {
    const result = await writeFile.execute(
      { path: '../../etc/passwd', content: 'evil' },
      makeContext('/workspace')
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/outside workspace/i);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('rejects absolute paths outside the workspace', async () => {
    const result = await writeFile.execute(
      { path: '/etc/passwd', content: 'evil' },
      makeContext('/workspace')
    );
    expect(result.ok).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('writes the file and returns the relative path on success', async () => {
    const result = await writeFile.execute(
      { path: 'src/auth.ts', content: 'export {};\n' },
      makeContext('/workspace')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('src/auth.ts');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('auth.ts'),
      'export {};\n',
      'utf8'
    );
  });

  it('creates parent directories if they do not exist', async () => {
    await writeFile.execute(
      { path: 'deep/nested/new.ts', content: '' },
      makeContext('/workspace')
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  // ── Write failure ──────────────────────────────────────────────────────────

  it('returns ok: false when writeFileSync throws', async () => {
    mockWriteFileSync.mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied');
    });
    const result = await writeFile.execute(
      { path: 'src/locked.ts', content: 'x' },
      makeContext('/workspace')
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Failed to write file/i);
  });

  // ── allowedWriteDirectories ────────────────────────────────────────────────

  it('rejects writes outside allowedWriteDirectories when configured', async () => {
    const ctx: import('../../src/tools/types').ToolContext = {
      workspaceRoot: '/workspace',
      vscode: {
        workspace: {
          getConfiguration: vi.fn().mockReturnValue({
            get: (key: string, def: unknown) => {
              if (key === 'allowedWriteDirectories') return ['src'];
              if (key === 'checkpointBeforeEdit') return false;
              return def;
            },
          }),
        },
      } as unknown as typeof import('vscode'),
    };
    const result = await writeFile.execute({ path: 'test/foo.ts', content: 'x' }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not permitted/i);
  });

  it('allows writes inside allowedWriteDirectories', async () => {
    const ctx: import('../../src/tools/types').ToolContext = {
      workspaceRoot: '/workspace',
      vscode: {
        workspace: {
          getConfiguration: vi.fn().mockReturnValue({
            get: (key: string, def: unknown) => {
              if (key === 'allowedWriteDirectories') return ['src'];
              if (key === 'checkpointBeforeEdit') return false;
              return def;
            },
          }),
        },
      } as unknown as typeof import('vscode'),
    };
    const result = await writeFile.execute({ path: 'src/new.ts', content: 'x' }, ctx);
    // Should pass the directory check — any failure is about the write itself, not the guard
    if (!result.ok) {
      expect(result.error).not.toMatch(/not permitted/i);
    }
  });
});
