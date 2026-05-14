import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Mocks — declared before the module under test is imported so Vitest hoists
// them correctly.
// ---------------------------------------------------------------------------

const mockReadFileSync = vi.fn<(p: string, enc: string) => string>();

vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
}));

const mockFindFiles = vi.fn();

// Mock ToolContext.vscode — only the workspace.findFiles method is called.
function makeContext(root = '/workspace'): import('../../src/tools/types').ToolContext {
  return {
    workspaceRoot: root,
    vscode: {
      workspace: { findFiles: mockFindFiles },
    } as unknown as typeof import('vscode'),
  };
}

// Import AFTER mocks are set up
const { grepCodebase } = await import('../../src/tools/grep-codebase');

// ---------------------------------------------------------------------------

describe('grepCodebase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue('const hello = "world";\nconst foo = "bar";\n');
  });

  it('has the correct name and does not require confirmation', () => {
    expect(grepCodebase.name).toBe('grep_codebase');
    expect(grepCodebase.requiresConfirmation).toBe(false);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns matching lines with file:line: content format', async () => {
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/src/foo.ts' }]);

    const result = await grepCodebase.execute({ pattern: 'hello' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('src/foo.ts');
    expect(result.output).toContain(':1:');
    expect(result.output).toContain('const hello = "world";');
  });

  it('returns no-matches message when pattern is not found', async () => {
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/src/foo.ts' }]);

    const result = await grepCodebase.execute({ pattern: 'xyzNotPresent123' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toBe('No matches found.');
  });

  it('uses case-insensitive matching when caseSensitive is false', async () => {
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/src/foo.ts' }]);
    // Default content has lowercase "hello" — search uppercase should match when case-insensitive
    const result = await grepCodebase.execute(
      { pattern: 'HELLO', caseSensitive: false },
      makeContext()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain('const hello = "world";');
  });

  it('does NOT match uppercase with case-sensitive search (default)', async () => {
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/src/foo.ts' }]);
    const result = await grepCodebase.execute({ pattern: 'HELLO' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toBe('No matches found.');
  });

  // ── Path traversal guard ───────────────────────────────────────────────────

  it('skips files whose resolved path is outside the workspace root', async () => {
    // fsPath resolves to /outside/evil.ts after path.resolve normalises the ..
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/../outside/evil.ts' }]);

    const result = await grepCodebase.execute({ pattern: 'hello' }, makeContext());
    // The outside file is silently skipped → no matches
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toBe('No matches found.');
    // readFileSync must NOT have been called for the outside file
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('skips absolute paths that resolve outside workspace even without ..', async () => {
    mockFindFiles.mockResolvedValue([{ fsPath: '/etc/passwd' }]);

    const result = await grepCodebase.execute({ pattern: 'root' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toBe('No matches found.');
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  // ── Tool failure handling ──────────────────────────────────────────────────

  it('returns an error result for an invalid regex pattern', async () => {
    mockFindFiles.mockResolvedValue([]);

    const result = await grepCodebase.execute({ pattern: '[unclosed' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Invalid regex/);
  });

  it('returns an error result when findFiles rejects', async () => {
    mockFindFiles.mockRejectedValue(new Error('workspace not available'));

    const result = await grepCodebase.execute({ pattern: 'hello' }, makeContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/findFiles failed/);
  });

  it('continues gracefully when readFileSync throws for one file', async () => {
    mockFindFiles.mockResolvedValue([
      { fsPath: '/workspace/bad.ts' },
      { fsPath: '/workspace/good.ts' },
    ]);
    mockReadFileSync
      .mockImplementationOnce(() => { throw new Error('EACCES'); })
      .mockReturnValueOnce('const hello = "ok";\n');

    const result = await grepCodebase.execute({ pattern: 'hello' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only the good file should contribute a match
    expect(result.output).toContain('good.ts');
    expect(result.output).not.toContain('bad.ts');
  });

  // ── Max results cap ────────────────────────────────────────────────────────

  it('caps results at 50 matches', async () => {
    // 60 files, each with one match → should only return 50
    const files = Array.from({ length: 60 }, (_, i) => ({
      fsPath: `/workspace/src/file${i}.ts`,
    }));
    mockFindFiles.mockResolvedValue(files);
    mockReadFileSync.mockReturnValue('const hello = "world";\n');

    const result = await grepCodebase.execute({ pattern: 'hello' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = result.output.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(50);
  });

  // ── Relative path in output ────────────────────────────────────────────────

  it('reports paths relative to the workspace root', async () => {
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/src/deeply/nested.ts' }]);

    const result = await grepCodebase.execute({ pattern: 'hello' }, makeContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Tool normalises separators to forward slashes
    expect(result.output).toContain('src/deeply/nested.ts');
    // Must NOT contain the absolute root prefix
    expect(result.output).not.toContain('/workspace/src');
  });
});
