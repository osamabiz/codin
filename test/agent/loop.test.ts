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

function makeTool(name: string, output = 'ok'): ITool & { callCount: number } {
  const tool = {
    name,
    description: `mock ${name}`,
    parameters: { type: 'object' as const, properties: {} },
    requiresConfirmation: false,
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

const { Agent } = await import('../../src/agent/agent');

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Max steps guard', () => {
  it('emits waiting_for_approval with __continue__ name when maxSteps is reached', async () => {
    // Provider always responds with a tool call so stepCount increments each iteration
    const provider = makeProvider([
      // Iteration 1: tool call → stepCount becomes 1
      [
        { type: 'tool_call', call: { id: 'c1', name: 'run_command', input: { command: 'echo a' } } },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 0 } },
      ],
      // Iteration 2: tool call → stepCount becomes 2 (= maxSteps, guard fires next loop)
      [
        { type: 'tool_call', call: { id: 'c2', name: 'run_command', input: { command: 'echo b' } } },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 0 } },
      ],
      // After approval reset: final text response
      [
        { type: 'token', content: 'All done.' },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 3 } },
      ],
    ]);

    const tool = makeTool('run_command');
    // maxSteps: 2 — guard fires after 2 tool executions
    const agent = new Agent(provider, [tool], { maxSteps: 2, enablePlanner: false });

    const events: AgentEvent[] = [];
    let approvalCount = 0;

    for await (const event of agent.run('do work', makeContext())) {
      events.push(event);
      if (event.type === 'waiting_for_approval' && event.call.name === '__continue__') {
        approvalCount++;
        // Stop after first approval to prevent infinite loop in test
        agent.stop();
      }
    }

    const continueApprovals = events.filter(
      (e) => e.type === 'waiting_for_approval' && e.call.name === '__continue__'
    );
    expect(continueApprovals).toHaveLength(1);
    expect(approvalCount).toBe(1);
  });

  it('resets the step count and continues when the user approves continuation', async () => {
    const provider = makeProvider([
      // Two tool calls to hit maxSteps: 2
      [
        { type: 'tool_call', call: { id: 'd1', name: 'run_command', input: {} } },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 0 } },
      ],
      [
        { type: 'tool_call', call: { id: 'd2', name: 'run_command', input: {} } },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 0 } },
      ],
      // After approval: final answer (no more tools)
      [
        { type: 'token', content: 'Done after continuation.' },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 5 } },
      ],
    ]);

    const tool = makeTool('run_command');
    const agent = new Agent(provider, [tool], { maxSteps: 2, enablePlanner: false });

    const events = await collectEvents(
      (async function* () {
        for await (const event of agent.run('do more work', makeContext())) {
          yield event;
          if (event.type === 'waiting_for_approval' && event.call.name === '__continue__') {
            // Approve continuation
            agent.approveTool(event.call.id);
          }
        }
      })()
    );

    // Exactly one __continue__ approval was needed
    const guards = events.filter(
      (e) => e.type === 'waiting_for_approval' && e.call.name === '__continue__'
    );
    expect(guards).toHaveLength(1);

    // The loop continued and finished
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect((done as { type: 'done'; finalMessage: string }).finalMessage).toBe(
      'Done after continuation.'
    );
  });

  it('does not emit __continue__ when step count stays below maxSteps', async () => {
    const provider = makeProvider([
      // Single tool call (stepCount = 1 < maxSteps 5)
      [
        { type: 'tool_call', call: { id: 'e1', name: 'run_command', input: {} } },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 0 } },
      ],
      [
        { type: 'token', content: 'Quick task done.' },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 3 } },
      ],
    ]);

    const tool = makeTool('run_command');
    const agent = new Agent(provider, [tool], { maxSteps: 5, enablePlanner: false });
    const events = await collectEvents(agent.run('quick task', makeContext()));

    const guards = events.filter(
      (e) => e.type === 'waiting_for_approval' && e.call.name === '__continue__'
    );
    expect(guards).toHaveLength(0);

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
  });
});

describe('Step events from plan steps', () => {
  it('emits step_start and step_done events aligned with loop iterations', async () => {
    // Agent.run() calls createPlan() first — we need the mock to handle that call too.
    // Since the mock provider cycles through responses, set up planner call + loop calls.
    const planJson = JSON.stringify({
      taskSummary: 'Do two things',
      steps: [
        { id: 1, description: 'Step one', toolHint: 'run_command' },
        { id: 2, description: 'Step two', toolHint: 'read_file' },
      ],
    });

    const provider = makeProvider([
      // Planner call (phase A)
      [{ type: 'token', content: planJson }],
      // Loop iteration 1: tool call
      [
        { type: 'tool_call', call: { id: 'f1', name: 'run_command', input: {} } },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 0 } },
      ],
      // Loop iteration 2: final text
      [
        { type: 'token', content: 'Finished.' },
        { type: 'done', usage: { inputTokens: 5, outputTokens: 3 } },
      ],
    ]);

    const tool = makeTool('run_command');
    const agent = new Agent(provider, [tool], { maxSteps: 10 });
    const events = await collectEvents(agent.run('do two things', makeContext()));

    const planEvent = events.find((e) => e.type === 'plan');
    expect(planEvent).toBeDefined();
    expect((planEvent as { type: 'plan'; taskSummary: string }).taskSummary).toBe('Do two things');

    const stepStarts = events.filter((e) => e.type === 'step_start');
    const stepDones = events.filter((e) => e.type === 'step_done');

    expect(stepStarts.length).toBeGreaterThan(0);
    expect(stepDones.length).toBeGreaterThan(0);
  });
});
