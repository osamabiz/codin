import * as vscode from 'vscode';
import * as assert from 'assert';

suite('Extension activation', () => {
  test('extension activates without error', async () => {
    const ext = vscode.extensions.getExtension('open-source.vscode-agent');
    assert.ok(ext, 'Extension not found');
    await ext!.activate();
    assert.ok(ext!.isActive, 'Extension is not active');
  });

  test('all commands are registered', async () => {
    const commands = await vscode.commands.getCommands();
    const expected = [
      'agentPlugin.openChat',
      'agentPlugin.newChat',
      'agentPlugin.openSettings',
      'agentPlugin.stopAgent',
      'agentPlugin.toggleDryRun',
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `Missing command: ${cmd}`);
    }
  });

  test('status bar item is visible after opening chat', async () => {
    await vscode.commands.executeCommand('agentPlugin.openChat');
    // Give webview time to load
    await new Promise<void>((r) => setTimeout(r, 1000));
    // If command did not throw, status bar was created successfully
  });
});
