import { exec } from 'child_process';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface GitCommitParams {
  message: string;
  addAll?: boolean;
}

function run(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(cmd, { cwd }, (err, stdout, stderr) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: err?.code ?? 0 });
    });
  });
}

export const gitCommit: ITool = {
  name: 'git_commit',
  description:
    'Stage and commit changes. If addAll is true, runs git add -A first. Requires user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message.' },
      addAll: {
        type: 'boolean',
        description: 'Stage all changes before committing (git add -A).',
      },
    },
    required: ['message'],
  } satisfies JSONSchema,
  requiresConfirmation: true,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { message, addAll = false } = params as GitCommitParams;
    const cwd = context.workspaceRoot;

    if (addAll) {
      const stageResult = await run('git add -A', cwd);
      if (stageResult.code !== 0 && stageResult.stderr) {
        return { ok: false, error: `git add failed: ${stageResult.stderr}` };
      }
    }

    const safeMsg = message.replace(/"/g, '\\"');
    const result = await run(`git commit -m "${safeMsg}"`, cwd);

    if (result.code !== 0) {
      return { ok: false, error: result.stderr || result.stdout };
    }

    // Extract SHA from output like "[main abc1234] message"
    const shaMatch = result.stdout.match(/\[.+?\s+([a-f0-9]+)\]/);
    const sha = shaMatch ? shaMatch[1] : 'unknown';

    return { ok: true, output: `Committed: ${sha} — ${message}` };
  },
};
