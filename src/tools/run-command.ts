import * as path from 'path';
import { exec } from 'child_process';
import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface RunCommandParams {
  command: string;
  cwd?: string;
}

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 10_000;

const DEFAULT_BLOCKED = ['rm -rf /', 'sudo', 'format c:', 'del /f /s /q'];

function isBlocked(command: string, patterns: string[]): boolean {
  const lower = command.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function truncateOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return s.slice(0, MAX_OUTPUT_CHARS) + `\n[Output truncated at ${MAX_OUTPUT_CHARS} chars.]`;
}

export const runCommand: ITool = {
  name: 'run_command',
  description:
    'Run a shell command in the workspace. Times out after 30 seconds. Requires user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run.' },
      cwd: {
        type: 'string',
        description: 'Working directory (relative to workspace root). Defaults to workspace root.',
      },
    },
    required: ['command'],
  } satisfies JSONSchema,
  requiresConfirmation: true,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { command, cwd: userCwd = '.' } = params as RunCommandParams;

    const workspaceRoot = path.resolve(context.workspaceRoot);
    const resolvedCwd = path.resolve(workspaceRoot, userCwd);

    if (!resolvedCwd.startsWith(workspaceRoot)) {
      return { ok: false, error: 'Working directory outside workspace is not allowed' };
    }

    // Check blocked commands
    const blockedPatterns = context.vscode.workspace
      .getConfiguration('agentPlugin')
      .get<string[]>('blockedCommands', DEFAULT_BLOCKED);

    if (isBlocked(command, blockedPatterns)) {
      return { ok: false, error: `Command blocked by policy: ${command}` };
    }

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const child = exec(command, {
          cwd: resolvedCwd,
          signal: controller.signal,
          maxBuffer: MAX_OUTPUT_CHARS * 2,
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (d: Buffer | string) => {
          stdout += String(d);
        });
        child.stderr?.on('data', (d: Buffer | string) => {
          stderr += String(d);
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? -1 });
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          const timedOut = (err as NodeJS.ErrnoException).code === 'ABORT_ERR';
          resolve({
            stdout,
            stderr: timedOut ? 'Command timed out after 30 seconds.' : err.message,
            exitCode: -1,
          });
        });
      }
    );

    const out = truncateOutput(result.stdout);
    const err = truncateOutput(result.stderr);
    const output =
      `exit code: ${result.exitCode}\n` +
      (out ? `stdout:\n${out}\n` : '') +
      (err ? `stderr:\n${err}` : '');

    return { ok: result.exitCode === 0, output: output.trim() };
  },
};
