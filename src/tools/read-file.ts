import * as path from 'path';
import * as fs from 'fs';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface ReadFileParams {
  path: string;
  startLine?: number;
  endLine?: number;
}

const MAX_LINES = 500;

export const readFile: ITool = {
  name: 'read_file',
  description:
    'Read the contents of a file. Optionally specify startLine and endLine (1-based). Returns at most 500 lines.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root.' },
      startLine: { type: 'number', description: 'First line to read (1-based, inclusive).' },
      endLine: { type: 'number', description: 'Last line to read (1-based, inclusive).' },
    },
    required: ['path'],
  } satisfies JSONSchema,
  requiresConfirmation: false,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: userPath, startLine, endLine } = params as ReadFileParams;

    const workspaceRoot = path.resolve(context.workspaceRoot);
    const resolved = path.resolve(workspaceRoot, userPath);

    if (!resolved.startsWith(workspaceRoot)) {
      return { ok: false, error: 'Path outside workspace is not allowed' };
    }

    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `File not found: ${userPath}` };
    }

    let content: string;
    try {
      content = fs.readFileSync(resolved, 'utf8');
    } catch (err) {
      return { ok: false, error: `Cannot read file: ${(err as Error).message}` };
    }

    const lines = content.split('\n');
    const totalLines = lines.length;

    const start = startLine != null ? Math.max(1, startLine) : 1;
    const end = endLine != null ? Math.min(totalLines, endLine) : totalLines;
    const clampedEnd = Math.min(end, start + MAX_LINES - 1);

    const selected = lines.slice(start - 1, clampedEnd);
    let output = selected.join('\n');

    if (clampedEnd < end || (endLine == null && clampedEnd < totalLines)) {
      output += `\n[File has ${totalLines} lines total. Showing lines ${start}–${clampedEnd}.]`;
    }

    return { ok: true, output };
  },
};
