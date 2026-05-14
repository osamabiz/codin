import * as path from 'path';
import * as fs from 'fs';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface CreateFileParams {
  path: string;
  content: string;
}

export const createFile: ITool = {
  name: 'create_file',
  description:
    'Create a new file. Fails if the file already exists (use write_file to update). Requires user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root.' },
      content: { type: 'string', description: 'Initial file content.' },
    },
    required: ['path', 'content'],
  } satisfies JSONSchema,
  requiresConfirmation: true,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: userPath, content } = params as CreateFileParams;

    const workspaceRoot = path.resolve(context.workspaceRoot);
    const resolved = path.resolve(workspaceRoot, userPath);

    if (!resolved.startsWith(workspaceRoot)) {
      return { ok: false, error: 'Path outside workspace is not allowed' };
    }

    if (fs.existsSync(resolved)) {
      return {
        ok: false,
        error: `File already exists: ${userPath} (use write_file to overwrite)`,
      };
    }

    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');
    } catch (err) {
      return { ok: false, error: `Failed to create file: ${(err as Error).message}` };
    }

    const rel = path.relative(workspaceRoot, resolved).replace(/\\/g, '/');
    return { ok: true, output: `File created: ${rel}` };
  },
};
