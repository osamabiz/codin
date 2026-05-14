import { describe, it, expect, vi } from 'vitest';
import type { ILLMProvider, ChatChunk, Message, ChatOptions } from '../../src/providers/types';
import type { ITool, ToolContext } from '../../src/tools/types';
import type { AgentContext, AgentEvent } from '../../src/agent/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeContext(): AgentContext {
  return {
    workspaceRoot: '/workspace',
    vscode: {
      workspace: { getConfiguration: vi.fn().mockReturnValue({ get: vi.fn() }) },
    } as unknown as typeof import('vscode'),
    model: 'claude-sonnet-4',
    maxTokens: 4096,
    temperature: 0.7,
  };
}

/** Build a provider that emits chunks in sequence, cycling through responses. */
function makeProvider(responses: ChatChunk[][]): ILLMProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    id: 'mock',
    supportsToolUse: true,
    supportsStreaming: true,
    availableModels: [],
    configure: vi.fn(),
    async *chat(_messages: Message[], _options: ChatOptions): AsyncIterable<ChatChunk> {
      const chunks = responses[Math.min(callIndex, responses.length - 1)];
      callIndex++;
      for (const chunk of chunks) yield chunk;
    },
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
  };
}

function makeTool(name: string, requiresConfirmation: boolean, output = 'ok'): ITool & { callCount: number } {
  const tool = {
    name,
    description: `mock ${name}`,
    parameters: { type: 'object', properties: {} },
    requiresConfirmation,
    callCount: 0,
    execute: async (_p: unknown, _c: ToolContext) => {
      tool.callCount++;
      return { ok: true as const, output };
    },
  };
  return tool;
}

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

// ── Import after helpers (no hoisted mocks needed here) ────────────────────
const { Agent } = await import('../../src/agent/agent');

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Agent.run() — no tool calls', () => {
  it('yields token events then a done event for a pure text response', async () => {
    const provider = makeProvider([
      [
        { type: 'token', content: 'Hello ' },
        { type: 'token', content: 'world' },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 5 } },
      ],
    ]);

    const agent = new Agent(provider, [], { enablePlanner: false });
    const events = await collectEvents(agent.run('say hi', makeContext()));

    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens).toHaveLength(2);
    expect((tokens[0] as { type: 'token'; content: string }).content).toBe('Hello ');

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect((done as { type: 'done'; finalMessage: string }).finalMessage).toBe('Hello world');
  });
});

describe('Agent.run() — tool call auto-approved (requiresConfirmation: false)', () => {
  it('executes the tool and injects the result, then finishes on text response', async () => {
    const tool = makeTool('read_file', false, 'file content here');

    const provider = makeProvider([
      // First call: LLM returns a tool_call
      [
        { type: 'tool_call', call: { id: 'call-1', name: 'read_file', input: { path: 'test.ts' } } },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 0 } },
      ],
      // Second call (after tool result injected): LLM returns text
      [
        { type: 'token', content: 'All done.' },
        { type: 'done', usage: { inputTokens: 20, outputTokens: 5 } },
      ],
    ]);

    const agent = new Agent(provider, [tool], { enablePlanner: false });
    const events = await collectEvents(agent.run('read a file', makeContext()));

    expect(tool.callCount).toBe(1);

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
  });
});

describe('Agent.run() — tool call with confirmation (approveTool / rejectTool)', () => {
  it('waits for approval then executes when approveTool is called', async () => {
    const tool = makeTool('write_file', true, 'File written: test.ts');

    const provider = makeProvider([
      [
        { type: 'tool_call', call: { id: 'wf-1', name: 'write_file', input: { path: 'test.ts', content: 'x' } } },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 0 } },
      ],
      [
        { type: 'token', content: 'Done.' },
        { type: 'done', usage: { inputTokens: 15, outputTokens: 3 } },
      ],
    ]);

    const agent = new Agent(provider, [tool], { enablePlanner: false });
    const events: AgentEvent[] = [];

    for await (const event of agent.run('write a file', makeContext())) {
      events.push(event);
      // As soon as we see waiting_for_approval, approve it
      if (event.type === 'waiting_for_approval' && event.call.name === 'write_file') {
        agent.approveTool(event.call.id);
      }
    }

    expect(tool.callCount).toBe(1);
    const approved = events.filter((e) => e.type === 'tool_result');
    expect(approved).toHaveLength(1);
  });

  it('injects rejection message and re-plans when rejectTool is called', async () => {
    const tool = makeTool('write_file', true);

    const provider = makeProvider([
      [
        { type: 'tool_call', call: { id: 'wf-2', name: 'write_file', input: { path: 'a.ts', content: '' } } },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 0 } },
      ],
      // Re-plan: LLM responds with plain text after rejection
      [
        { type: 'token', content: 'Understood, I will not write the file.' },
        { type: 'done', usage: { inputTokens: 20, outputTokens: 10 } },
      ],
    ]);

    const agent = new Agent(provider, [tool], { enablePlanner: false });
    const events: AgentEvent[] = [];

    for await (const event of agent.run('write a file', makeContext())) {
      events.push(event);
      if (event.type === 'waiting_for_approval' && event.call.name === 'write_file') {
        agent.rejectTool(event.call.id, 'not today');
      }
    }

    // Tool must NOT have been executed
    expect(tool.callCount).toBe(0);

    // A tool_result with ok: false should be in events (the rejection injection)
    const rejResult = events.find(
      (e) => e.type === 'tool_result' && !(e as { type: 'tool_result'; result: { ok: boolean } }).result.ok
    );
    expect(rejResult).toBeDefined();

    // The agent should have re-planned and eventually done
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
  });
});

describe('Agent.stop()', () => {
  it('halts the loop cleanly and resolves any pending approvals', async () => {
    const tool = makeTool('write_file', true);

    const provider = makeProvider([
      [
        { type: 'tool_call', call: { id: 'stop-1', name: 'write_file', input: {} } },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 0 } },
      ],
    ]);

    const agent = new Agent(provider, [tool], { enablePlanner: false });
    const events: AgentEvent[] = [];

    for await (const event of agent.run('write a file', makeContext())) {
      events.push(event);
      if (event.type === 'waiting_for_approval') {
        // Stop instead of approving
        agent.stop();
      }
    }

    // Tool must NOT have been executed
    expect(tool.callCount).toBe(0);
    // Generator should have terminated cleanly (no throw)
    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(0);
  });
});

describe('Agent.run() — unknown tool gracefully fails', () => {
  it('injects a TOOL FAILURE message and continues', async () => {
    const provider = makeProvider([
      [
        { type: 'tool_call', call: { id: 'unk-1', name: 'nonexistent_tool', input: {} } },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 0 } },
      ],
      [
        { type: 'token', content: 'Got it.' },
        { type: 'done', usage: { inputTokens: 20, outputTokens: 5 } },
      ],
    ]);

    const agent = new Agent(provider, [], { enablePlanner: false });
    const events = await collectEvents(agent.run('do something', makeContext()));

    const failures = events.filter(
      (e) =>
        e.type === 'tool_result' &&
        !(e as { type: 'tool_result'; result: { ok: boolean } }).result.ok
    );
    expect(failures.length).toBeGreaterThan(0);

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
  });
});
