import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dirent } from 'fs';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExistsSync    = vi.fn<(p: string) => boolean>();
const mockReaddirSync   = vi.fn<(p: string, opts?: object) => Dirent[]>();
const mockReadFileSync  = vi.fn<(p: string, enc: string) => string>();

vi.mock('fs', () => ({
  existsSync:   mockExistsSync,
  readdirSync:  mockReaddirSync,
  readFileSync: mockReadFileSync,
}));

function makeContext(root = '/workspace'): import('../../src/tools/types').ToolContext {
  return {
    workspaceRoot: root,
    vscode: {} as unknown as typeof import('vscode'),
  };
}

// Helper to make a fake Dirent
function fakeEntry(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
  } as unknown as Dirent;
}

const { listFiles } = await import('../../src/tools/list-files');

// ---------------------------------------------------------------------------

describe('listFiles', () => {
  beforeEach(() => {
    // resetAllMocks clears both call history AND the mockReturnValueOnce queue so
    // leftover items from one test don't bleed into the next.
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  });

  it('has the correct name and does not require confirmation', () => {
    expect(listFiles.name).toBe('list_files');
    expect(listFiles.requiresConfirmation).toBe(false);
  });

  // ── Path traversal guard ───────────────────────────────────────────────────

  it('rejects paths that traverse above the workspace root via ..', async () => {
    const result = await listFiles.execute({ path: '../../etc/passwd' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/outside workspace/i);
  });

  it('rejects absolute paths that resolve outside the workspace', async () => {
    const result = await listFiles.execute({ path: '/etc/passwd' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/outside workspace/i);
  });

  it('rejects nested traversal attempts', async () => {
    const result = await listFiles.execute({ path: 'src/../../etc' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/outside workspace/i);
  });

  // ── Non-existent path ──────────────────────────────────────────────────────

  it('returns an error when the target path does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await listFiles.execute({ path: 'nonexistent' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('does not exist');
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('accepts paths within the workspace root', async () => {
    const result = await listFiles.execute({ path: 'src' }, makeContext());
    expect(result.ok).toBe(true);
  });

  it('defaults to the workspace root when path is omitted', async () => {
    const result = await listFiles.execute({}, makeContext());
    expect(result.ok).toBe(true);
  });

  it('lists files and directories returned by readdirSync', async () => {
    mockReaddirSync.mockReturnValue([
      fakeEntry('index.ts', false),
      fakeEntry('utils', true),
    ]);
    const result = await listFiles.execute({}, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('index.ts');
    expect(result.output).toContain('utils/');
  });

  it('shows (empty) when the directory has no visible entries', async () => {
    mockReaddirSync.mockReturnValue([]);
    const result = await listFiles.execute({}, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('(empty)');
  });

  it('excludes hidden files by default', async () => {
    mockReaddirSync.mockReturnValue([
      fakeEntry('.env', false),
      fakeEntry('visible.ts', false),
    ]);
    const result = await listFiles.execute({}, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).not.toContain('.env');
    expect(result.output).toContain('visible.ts');
  });

  it('includes hidden files when includeHidden is true', async () => {
    mockReaddirSync.mockReturnValue([fakeEntry('.env', false)]);
    const result = await listFiles.execute({ includeHidden: true }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('.env');
  });

  it('excludes always-ignored directories (node_modules, .git, out)', async () => {
    mockReaddirSync.mockReturnValue([
      fakeEntry('node_modules', true),
      fakeEntry('.git', true),
      fakeEntry('out', true),
      fakeEntry('src', true),
    ]);
    const result = await listFiles.execute({}, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).not.toContain('node_modules');
    expect(result.output).not.toContain('.git');
    expect(result.output).not.toContain('out/');
    expect(result.output).toContain('src/');
  });

  it('does not recurse beyond depth 1 when recursive is false', async () => {
    // Simulate nested structure: root → src/ → index.ts
    mockReaddirSync
      .mockReturnValueOnce([fakeEntry('src', true)])       // root level
      .mockReturnValueOnce([fakeEntry('index.ts', false)]); // src/ level (should NOT be called)

    const result = await listFiles.execute({ recursive: false }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only one readdirSync call (root); the nested one should be skipped
    expect(mockReaddirSync).toHaveBeenCalledTimes(1);
  });

  it('recurses when recursive is true', async () => {
    mockReaddirSync
      .mockReturnValueOnce([fakeEntry('src', true)])
      .mockReturnValueOnce([fakeEntry('index.ts', false)]);

    const result = await listFiles.execute({ recursive: true }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('index.ts');
    expect(mockReaddirSync).toHaveBeenCalledTimes(2);
  });

  // ── File path resolution ───────────────────────────────────────────────────

  it('resolves sub-directory paths relative to workspace root', async () => {
    const result = await listFiles.execute({ path: 'src/components' }, makeContext());
    // existsSync will have been called with the resolved absolute path
    expect(mockExistsSync).toHaveBeenCalledWith(
      expect.stringContaining('src')
    );
    expect(result.ok).toBe(true);
  });
});
