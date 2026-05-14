import * as path from 'path';
import * as fs from 'fs';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface DeleteFileParams {
  path: string;
}

export const deleteFile: ITool = {
  name: 'delete_file',
  description:
    'Delete a file by moving it to the VS Code trash (recoverable). Always requires confirmation — no override.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root.' },
    },
    required: ['path'],
  } satisfies JSONSchema,
  requiresConfirmation: true,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: userPath } = params as DeleteFileParams;

    const workspaceRoot = path.resolve(context.workspaceRoot);
    const resolved = path.resolve(workspaceRoot, userPath);

    if (!resolved.startsWith(workspaceRoot)) {
      return { ok: false, error: 'Path outside workspace is not allowed' };
    }

    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `File not found: ${userPath}` };
    }

    try {
      // Use VS Code's trash API (recoverable delete)
      await context.vscode.workspace.fs.delete(context.vscode.Uri.file(resolved), {
        useTrash: true,
      });
    } catch (err) {
      return { ok: false, error: `Failed to delete file: ${(err as Error).message}` };
    }

    const rel = path.relative(workspaceRoot, resolved).replace(/\\/g, '/');
    return { ok: true, output: `File deleted: ${rel}` };
  },
};
