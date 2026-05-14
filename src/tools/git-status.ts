import { exec } from 'child_process';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

function run(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { cwd }, (_err, stdout, stderr) => {
      resolve(stdout.trim() || stderr.trim());
    });
  });
}

export const gitStatus: ITool = {
  name: 'git_status',
  description:
    'Return the current git status: branch, staged changes, unstaged changes, and untracked files.',
  parameters: {
    type: 'object',
    properties: {},
  } satisfies JSONSchema,
  requiresConfirmation: false,

  async execute(_params: unknown, context: ToolContext): Promise<ToolResult> {
    const cwd = context.workspaceRoot;

    try {
      const [branch, status] = await Promise.all([
        run('git rev-parse --abbrev-ref HEAD', cwd),
        run('git status --short', cwd),
      ]);

      if (branch.startsWith('fatal') || branch.startsWith('error')) {
        return { ok: true, output: 'Git not available in this workspace.' };
      }

      const output = [`Branch: ${branch}`, status ? `Changes:\n${status}` : 'Working tree clean']
        .join('\n')
        .trim();

      return { ok: true, output };
    } catch {
      return { ok: true, output: 'Git not available in this workspace.' };
    }
  },
};
