import * as vscode from 'vscode';
import * as assert from 'assert';

suite('Settings', () => {
  test('provider setting defaults to claude', () => {
    const config = vscode.workspace.getConfiguration('codin');
    assert.strictEqual(config.get('provider'), 'claude');
  });

  test('maxSteps defaults to 25', () => {
    const config = vscode.workspace.getConfiguration('codin');
    assert.strictEqual(config.get('maxSteps'), 25);
  });

  test('blockedCommands defaults contain rm -rf /', () => {
    const config = vscode.workspace.getConfiguration('codin');
    const blocked = config.get<string[]>('blockedCommands', []);
    assert.ok(blocked.includes('rm -rf /'), 'Default blocked commands should include "rm -rf /"');
  });

  test('can update provider setting', async () => {
    const config = vscode.workspace.getConfiguration('codin');
    await config.update('provider', 'openai', vscode.ConfigurationTarget.Workspace);
    assert.strictEqual(config.get('provider'), 'openai');
    // Restore
    await config.update('provider', 'claude', vscode.ConfigurationTarget.Workspace);
  });
});
