import { describe, it, expect, vi } from 'vitest';
import { runLoop } from '../../src/agent/loop';
import type { ILLMProvider } from '../../src/providers/types';
import type { ITool } from '../../src/tools/types';
import type { AgentContext, AgentOptions } from '../../src/agent/types';
import { AgentMemory } from '../../src/agent/memory';

function makeProvider(toolCalls: Array<{ id: string; name: string; input: unknown }>): ILLMProvider {
  let called = false;
  return {
    supportsToolUse: true,
    async *chat() {
      if (!called) {
        called = true;
        for (const tc of toolCalls) {
          yield { type: 'tool_call' as const, call: tc };
        }
        yield { type: 'done' as const };
      } else {
        yield { type: 'token' as const, content: 'Done.' };
        yield { type: 'done' as const };
      }
    },
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as ILLMProvider;
}

function makeConfirmTool(name: string): ITool {
  return {
    name,
    description: `Test tool ${name}`,
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
    requiresConfirmation: true,
    execute: vi.fn().mockResolvedValue({ ok: true, output: 'executed' }),
  } as unknown as ITool;
}

const CONTEXT: AgentContext = {
  workspaceRoot: '/fake',
  vscode: {} as typeof import('vscode'),
  model: 'claude-sonnet-4-5',
  maxTokens: 1024,
  temperature: 0,
};

const BASE_OPTIONS: AgentOptions = {
  maxSteps: 25,
  maxRetries: 3,
  autoApproveReadOnly: false,
  checkpointBeforeEdit: false,
  enablePlanner: false,
  dryRun: false,
};

describe('Dry-run mode', () => {
  it('does NOT call tool.execute when dryRun is true for a requiresConfirmation tool', async () => {
    const tool = makeConfirmTool('write_file');
    const provider = makeProvider([{ id: 'c1', name: 'write_file', input: { path: 'a.ts' } }]);
    const memory = new AgentMemory();

    const events: string[] = [];
    const options: AgentOptions = { ...BASE_OPTIONS, dryRun: true };

    for await (const event of runLoop(
      'test task',
      provider,
      [tool],
      CONTEXT,
      memory,
      options,
      () => false,
      () => Promise.resolve()
    )) {
      events.push(event.type);
    }

    expect(tool.execute).not.toHaveBeenCalled();
    expect(events).toContain('dry_run_would_call');
  });

  it('emits dry_run_would_call event with correct call info', async () => {
    const tool = makeConfirmTool('write_file');
    const provider = makeProvider([{ id: 'c2', name: 'write_file', input: { path: 'b.ts' } }]);
    const memory = new AgentMemory();
    const options: AgentOptions = { ...BASE_OPTIONS, dryRun: true };

    const dryRunEvents: Array<{ type: string; call?: { name: string } }> = [];

    for await (const event of runLoop(
      'test task',
      provider,
      [tool],
      CONTEXT,
      memory,
      options,
      () => false,
      () => Promise.resolve()
    )) {
      if (event.type === 'dry_run_would_call') dryRunEvents.push(event);
    }

    expect(dryRunEvents).toHaveLength(1);
    expect(dryRunEvents[0]!.call?.name).toBe('write_file');
  });

  it('calls tool.execute normally when dryRun is false', async () => {
    const tool = makeConfirmTool('write_file');
    const provider = makeProvider([{ id: 'c3', name: 'write_file', input: { path: 'c.ts' } }]);
    const memory = new AgentMemory();
    const options: AgentOptions = { ...BASE_OPTIONS, dryRun: false };

    for await (const event of runLoop(
      'test task',
      provider,
      [tool],
      CONTEXT,
      memory,
      options,
      () => false,
      () => Promise.resolve() // auto-approve
    )) {
      void event;
    }

    expect(tool.execute).toHaveBeenCalledOnce();
  });

  it('does not block read-only tools in dry-run mode', async () => {
    const readTool: ITool = {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      requiresConfirmation: false,
      execute: vi.fn().mockResolvedValue({ ok: true, output: 'file content' }),
    } as unknown as ITool;

    const provider = makeProvider([{ id: 'c4', name: 'read_file', input: { path: 'd.ts' } }]);
    const memory = new AgentMemory();
    const options: AgentOptions = { ...BASE_OPTIONS, dryRun: true };

    for await (const event of runLoop(
      'test task',
      provider,
      [readTool],
      CONTEXT,
      memory,
      options,
      () => false,
      () => Promise.resolve()
    )) {
      void event;
    }

    expect(readTool.execute).toHaveBeenCalledOnce();
  });
});
