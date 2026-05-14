import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export type DiffChoice = 'approve' | 'reject' | 'edit';

export class DiffView {
  /**
   * Show a diff between the current file and proposed content.
   * Returns the user's decision. For new files, originalPath is undefined.
   */
  static async show(
    originalPath: string | undefined,
    proposedContent: string,
    label: string
  ): Promise<DiffChoice> {
    const tmpFile = path.join(os.tmpdir(), `agent-proposed-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, proposedContent, 'utf8');

    const proposedUri = vscode.Uri.file(tmpFile);

    let originalUri: vscode.Uri;
    if (originalPath && fs.existsSync(originalPath)) {
      originalUri = vscode.Uri.file(originalPath);
    } else {
      // New file: use an empty virtual document as the left side
      originalUri = vscode.Uri.parse(`untitled:${label} (new file)`);
    }

    const diffTitle = originalPath
      ? `${path.basename(originalPath)} (original ↔ proposed)`
      : `${label} (new file)`;

    await vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, diffTitle);

    const choice = await vscode.window.showInformationMessage(
      `Apply changes to ${label}?`,
      { modal: false },
      'Approve and continue',
      'Reject',
      'Edit manually'
    );

    // Clean up temp file (best-effort)
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }

    if (choice === 'Approve and continue') return 'approve';
    if (choice === 'Edit manually') {
      // Open the proposed content in a new untitled editor for manual editing
      const doc = await vscode.workspace.openTextDocument({
        content: proposedContent,
        language: originalPath ? getLanguageId(originalPath) : 'plaintext',
      });
      await vscode.window.showTextDocument(doc, { preview: false });
      return 'edit';
    }
    return 'reject';
  }
}

function getLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.json': 'json',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.sh': 'shellscript',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };
  return map[ext] ?? 'plaintext';
}
