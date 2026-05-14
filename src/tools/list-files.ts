import * as path from 'path';
import * as fs from 'fs';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface ListFilesParams {
  path?: string;
  recursive?: boolean;
  includeHidden?: boolean;
}

const ALWAYS_IGNORED = new Set(['node_modules', '.git', 'out', 'dist', 'build', '.next']);

function loadGitignoreNames(root: string): Set<string> {
  const names = new Set<string>();
  try {
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    for (const raw of gi.split('\n')) {
      const line = raw.trim();
      if (line && !line.startsWith('#') && !line.includes('/')) {
        names.add(line.replace(/\/$/, ''));
      }
    }
  } catch {
    // No .gitignore
  }
  return names;
}

function buildTree(
  dir: string,
  depth: number,
  maxDepth: number,
  includeHidden: boolean,
  ignored: Set<string>,
  prefix: string
): string {
  if (depth > maxDepth) return '';
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }

  const visible = entries.filter((e) => {
    if (!includeHidden && e.name.startsWith('.')) return false;
    if (ALWAYS_IGNORED.has(e.name)) return false;
    if (ignored.has(e.name)) return false;
    return true;
  });

  return visible
    .map((entry, idx) => {
      const isLast = idx === visible.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';
      const line = prefix + connector + entry.name + (entry.isDirectory() ? '/' : '');
      const subtree =
        entry.isDirectory() && depth < maxDepth
          ? buildTree(
              path.join(dir, entry.name),
              depth + 1,
              maxDepth,
              includeHidden,
              ignored,
              prefix + childPrefix
            )
          : '';
      return subtree ? `${line}\n${subtree}` : line;
    })
    .join('\n');
}

export const listFiles: ITool = {
  name: 'list_files',
  description:
    'List files and directories in the workspace as a tree. Respects .gitignore. Max depth 5 when recursive.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to workspace root. Defaults to workspace root.',
      },
      recursive: { type: 'boolean', description: 'List recursively (max depth 5).' },
      includeHidden: { type: 'boolean', description: 'Include hidden files/dirs.' },
    },
  } satisfies JSONSchema,
  requiresConfirmation: false,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: userPath = '.', recursive = false, includeHidden = false } =
      params as ListFilesParams;

    const workspaceRoot = path.resolve(context.workspaceRoot);
    const resolved = path.resolve(workspaceRoot, userPath);

    // Path traversal guard
    const rel = path.relative(workspaceRoot, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { ok: false, error: 'Path outside workspace is not allowed' };
    }

    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `Path does not exist: ${userPath}` };
    }

    const maxDepth = recursive ? 5 : 1;
    const ignored = loadGitignoreNames(workspaceRoot);
    const header = (rel || '.') + '/';
    const tree = buildTree(resolved, 1, maxDepth, includeHidden, ignored, '');
    return { ok: true, output: tree ? `${header}\n${tree}` : `${header}\n(empty)` };
  },
};
