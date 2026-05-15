import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface WriteFileParams {
  path: string;
  content: string;
}

export const writeFile: ITool = {
  name: 'write_file',
  description:
    'Write (overwrite) a file with new content. Requires user confirmation. The diff view will be shown before writing.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root.' },
      content: { type: 'string', description: 'Full file content to write.' },
    },
    required: ['path', 'content'],
  } satisfies JSONSchema,
  requiresConfirmation: true,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: userPath, content } = params as WriteFileParams;

    const workspaceRoot = path.resolve(context.workspaceRoot);
    const resolved = path.resolve(workspaceRoot, userPath);

    if (!resolved.startsWith(workspaceRoot)) {
      return { ok: false, error: 'Path outside workspace is not allowed' };
    }

    // Check allowedWriteDirectories setting
    const allowed = context.vscode.workspace
      .getConfiguration('codin')
      .get<string[]>('allowedWriteDirectories', []);
    if (allowed.length > 0) {
      const inAllowed = allowed.some((dir) => {
        const absDir = path.resolve(workspaceRoot, dir);
        return resolved.startsWith(absDir);
      });
      if (!inAllowed) {
        return { ok: false, error: `Write not permitted outside allowed directories: ${userPath}` };
      }
    }

    // Optional checkpoint before edit
    const checkpoint = context.vscode.workspace
      .getConfiguration('codin')
      .get<boolean>('checkpointBeforeEdit', false);
    if (checkpoint === true) {
      try {
        const relPath = path.relative(workspaceRoot, resolved).replace(/\\/g, '/');
        await new Promise<void>((res) =>
          exec(
            `git add -A && git commit -m "agent: checkpoint before editing ${relPath}"`,
            { cwd: workspaceRoot },
            () => res()
          )
        );
      } catch {
        // Checkpoint failed — continue anyway
      }
    }

    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');
    } catch (err) {
      return { ok: false, error: `Failed to write file: ${(err as Error).message}` };
    }

    const rel = path.relative(workspaceRoot, resolved).replace(/\\/g, '/');
    return { ok: true, output: `File written: ${rel}` };
  },
};
