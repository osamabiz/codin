import * as vscode from 'vscode';
import * as assert from 'assert';

// Helper to get tool registry — resolved from compiled output
function getToolRegistry(): { getTool: (name: string) => { execute: (input: unknown, ctx: unknown) => Promise<{ ok: boolean; output?: string; error?: string }> } } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { allTools } = require('../../../../out/tools/index');
  return {
    getTool: (name: string) => {
      const tool = (allTools as Array<{ name: string; execute: (input: unknown, ctx: unknown) => Promise<{ ok: boolean; output?: string; error?: string }> }>).find((t) => t.name === name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return tool;
    },
  };
}

suite('File tools (real filesystem)', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

  test('read_file reads a real file', async () => {
    const tool = getToolRegistry().getTool('read_file');
    const result = await tool.execute({ path: 'package.json' }, { workspaceRoot, vscode });
    assert.ok(result.ok, `read_file failed: ${result.error ?? ''}`);
    assert.ok(result.output?.includes('"name"'), 'package.json should contain "name"');
  });

  test('read_file rejects path outside workspace', async () => {
    const tool = getToolRegistry().getTool('read_file');
    const result = await tool.execute({ path: '../../etc/passwd' }, { workspaceRoot, vscode });
    assert.ok(!result.ok, 'Should have failed for path outside workspace');
    assert.ok(result.error?.toLowerCase().includes('outside workspace'), `Wrong error: ${result.error ?? ''}`);
  });

  test('list_files returns workspace files', async () => {
    const tool = getToolRegistry().getTool('list_files');
    const result = await tool.execute({ path: '.', recursive: false }, { workspaceRoot, vscode });
    assert.ok(result.ok, `list_files failed: ${result.error ?? ''}`);
    assert.ok(result.output?.includes('package.json'), 'Should include package.json');
  });

  test('grep_codebase finds a pattern', async () => {
    const tool = getToolRegistry().getTool('grep_codebase');
    const result = await tool.execute(
      { pattern: 'vscode-agent', fileGlob: '*.json' },
      { workspaceRoot, vscode }
    );
    assert.ok(result.ok, `grep_codebase failed: ${result.error ?? ''}`);
    assert.ok(result.output?.includes('package.json'), 'Should find match in package.json');
  });
});
