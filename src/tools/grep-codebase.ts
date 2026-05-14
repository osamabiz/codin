import * as path from 'path';
import * as fs from 'fs';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface GrepParams {
  pattern: string;
  fileGlob?: string;
  caseSensitive?: boolean;
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

const MAX_RESULTS = 50;

export const grepCodebase: ITool = {
  name: 'grep_codebase',
  description:
    'Search for a regex pattern across workspace files. Returns up to 50 matches as file:line: content.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regular expression to search for' },
      fileGlob: {
        type: 'string',
        description: 'Glob pattern to restrict files (e.g. "**/*.ts"). Defaults to all files.',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case-sensitive search. Defaults to true.',
      },
    },
    required: ['pattern'],
  } satisfies JSONSchema,
  requiresConfirmation: false,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { pattern, fileGlob = '**/*', caseSensitive = true } = params as GrepParams;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, caseSensitive ? '' : 'i');
    } catch (err) {
      return { ok: false, error: `Invalid regex: ${(err as Error).message}` };
    }

    const workspaceRoot = path.resolve(context.workspaceRoot);

    let uris: Array<{ fsPath: string }>;
    try {
      uris = (await context.vscode.workspace.findFiles(
        fileGlob,
        '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**}'
      )) as Array<{ fsPath: string }>;
    } catch (err) {
      return { ok: false, error: `findFiles failed: ${(err as Error).message}` };
    }

    const matches: GrepMatch[] = [];

    for (const uri of uris) {
      if (matches.length >= MAX_RESULTS) break;

      const resolved = path.resolve(uri.fsPath);
      // Path traversal guard — skip files outside workspace
      const rel = path.relative(workspaceRoot, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue;

      try {
        const src = fs.readFileSync(resolved, 'utf8');
        const lines = src.split('\n');
        for (let i = 0; i < lines.length && matches.length < MAX_RESULTS; i++) {
          if (regex.test(lines[i])) {
            matches.push({ file: rel.replace(/\\/g, '/'), line: i + 1, content: lines[i].trim() });
          }
        }
      } catch {
        // Unreadable file (binary, permission denied) — skip silently
      }
    }

    if (matches.length === 0) return { ok: true, output: 'No matches found.' };
    return { ok: true, output: matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n') };
  },
};
