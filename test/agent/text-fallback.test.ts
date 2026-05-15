/**
 * Tests for text-mode tool calling (supportsToolUse=false providers).
 *
 * The agent injects tool descriptions into the system prompt and then parses
 * ```tool_call ... ``` fenced JSON blocks from the LLM text response.
 */
import { describe, it, expect, vi } from 'vitest';
import { runLoop } from '../../src/agent/loop';
import type { ILLMProvider, ChatChunk } from '../../src/providers/types';
import type { ITool, ToolContext } from '../../src/tools/types';
import type { AgentContext, AgentOptions } from '../../src/agent/types';
import { AgentMemory } from '../../src/agent/memory';

// ── Minimal stubs ─────────────────────────────────────────────────────────────

function makeMemory(): AgentMemory {
  return new AgentMemory({ name: '', root: '', languages: [], frameworks: [] });
}

function makeContext(): AgentContext {
  return {
    workspaceRoot: '/tmp',
    vscode: {} as never,
    model: 'local-model',
    maxTokens: 512,
    temperature: 0,
  };
}

function makeOptions(): AgentOptions {
  return {
    maxSteps: 10,
    maxRetries: 0,
    autoApproveReadOnly: false,
    checkpointBeforeEdit: false,
    dryRun: false,
  };
}

function makeTool(name: string, output: string): ITool {
  return {
    name,
    description: `Does ${name}`,
    parameters: { type: 'object', properties: { input: { type: 'string' } } },
    requiresConfirmation: false,
    execute: vi.fn().mockResolvedValue({ ok: true, output }),
  };
}

/** Provider that streams a text response containing a ```tool_call``` block. */
function makeTextModeProvider(responses: string[]): ILLMProvider {
  let callCount = 0;
  return {
    id: 'text-mode',
    name: 'Text Mode',
    supportsToolUse: false,
    supportsStreaming: false,
    availableModels: [],
    configure: vi.fn(),
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
    async *chat(): AsyncIterable<ChatChunk> {
      const text = responses[callCount++] ?? '';
      for (const char of text) {
        yield { type: 'token', content: char };
      }
      yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('text-fallback tool calling', () => {
  it('injects tool descriptions in system prompt when supportsToolUse=false', async () => {
    const capturedPrompts: string[] = [];
    const provider: ILLMProvider = {
      id: 'text-mode',
      name: 'Text Mode',
      supportsToolUse: false,
      supportsStreaming: false,
      availableModels: [],
      configure: vi.fn(),
      testConnection: vi.fn().mockResolvedValue({ ok: true }),
      async *chat(_msgs, opts): AsyncIterable<ChatChunk> {
        capturedPrompts.push(opts.systemPrompt ?? '');
        yield { type: 'token', content: 'Done.' };
        yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
      },
    };

    const tool = makeTool('my_tool', 'result');
    const events = [];
    for await (const e of runLoop(
      'do something',
      provider,
      [tool],
      makeContext(),
      makeMemory(),
      makeOptions(),
      () => false,
      async () => {}
    )) {
      events.push(e);
    }

    expect(capturedPrompts[0]).toContain('[TOOL USE — TEXT MODE]');
    expect(capturedPrompts[0]).toContain('my_tool');
    expect(capturedPrompts[0]).toContain('tool_call');
  });

  it('does NOT inject tool prompt when supportsToolUse=true', async () => {
    const capturedPrompts: string[] = [];
    const provider: ILLMProvider = {
      id: 'cloud',
      name: 'Cloud',
      supportsToolUse: true,
      supportsStreaming: true,
      availableModels: [],
      configure: vi.fn(),
      testConnection: vi.fn().mockResolvedValue({ ok: true }),
      async *chat(_msgs, opts): AsyncIterable<ChatChunk> {
        capturedPrompts.push(opts.systemPrompt ?? '');
        yield { type: 'token', content: 'Done.' };
        yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
      },
    };

    for await (const _ of runLoop(
      'do something',
      provider,
      [makeTool('my_tool', 'ok')],
      makeContext(),
      makeMemory(),
      makeOptions(),
      () => false,
      async () => {}
    )) {
      // consume
    }

    expect(capturedPrompts[0]).not.toContain('[TOOL USE — TEXT MODE]');
  });

  it('parses tool call from text and executes it', async () => {
    const toolResponse = `I will read the file.\n\`\`\`tool_call\n{"tool":"read_tool","input":{"path":"src/main.ts"}}\n\`\`\``;
    const tool = makeTool('read_tool', 'file contents here');

    const provider = makeTextModeProvider([
      toolResponse,   // first call: text with embedded tool_call
      'Done.',        // second call: final answer after tool result
    ]);

    const events = [];
    for await (const e of runLoop(
      'read the file',
      provider,
      [tool],
      makeContext(),
      makeMemory(),
      makeOptions(),
      () => false,
      async () => {}
    )) {
      events.push(e);
    }

    expect(tool.execute).toHaveBeenCalledOnce();
    expect(tool.execute).toHaveBeenCalledWith(
      { path: 'src/main.ts' },
      expect.any(Object) as ToolContext
    );

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0] as { result: { ok: boolean } }).result.ok).toBe(true);
  });

  it('handles multiple tool_call blocks in one response', async () => {
    const text = [
      '```tool_call',
      '{"tool":"tool_a","input":{}}',
      '```',
      '```tool_call',
      '{"tool":"tool_b","input":{}}',
      '```',
    ].join('\n');

    const toolA = makeTool('tool_a', 'a result');
    const toolB = makeTool('tool_b', 'b result');

    const provider = makeTextModeProvider([
      text,     // first: two tool calls
      'Done.',  // second: final
    ]);

    const events = [];
    for await (const e of runLoop(
      'do both',
      provider,
      [toolA, toolB],
      makeContext(),
      makeMemory(),
      makeOptions(),
      () => false,
      async () => {}
    )) {
      events.push(e);
    }

    expect(toolA.execute).toHaveBeenCalledOnce();
    expect(toolB.execute).toHaveBeenCalledOnce();
  });

  it('ignores malformed JSON tool_call blocks', async () => {
    const text = '```tool_call\n{bad json\n```\n```tool_call\n{"tool":"good_tool","input":{}}\n```';
    const goodTool = makeTool('good_tool', 'ok');

    const provider = makeTextModeProvider([text, 'Done.']);

    const events = [];
    for await (const e of runLoop(
      'test',
      provider,
      [goodTool],
      makeContext(),
      makeMemory(),
      makeOptions(),
      () => false,
      async () => {}
    )) {
      events.push(e);
    }

    // Only the valid block should execute
    expect(goodTool.execute).toHaveBeenCalledOnce();
  });

  it('ignores tool_call blocks referencing unknown tool names', async () => {
    const text = '```tool_call\n{"tool":"does_not_exist","input":{}}\n```';
    const realTool = makeTool('real_tool', 'ok');

    const provider = makeTextModeProvider([text]);

    const events = [];
    for await (const e of runLoop(
      'test',
      provider,
      [realTool],
      makeContext(),
      makeMemory(),
      makeOptions(),
      () => false,
      async () => {}
    )) {
      events.push(e);
    }

    expect(realTool.execute).not.toHaveBeenCalled();
    // No tool calls → pure text → done
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('uses plain string (not ContentBlock[]) for assistant message in text mode', async () => {
    const memory = makeMemory();
    const text = 'Just a plain response';
    const provider = makeTextModeProvider([text]);

    for await (const _ of runLoop(
      'hello',
      provider,
      [],
      makeContext(),
      memory,
      makeOptions(),
      () => false,
      async () => {}
    )) {
      // consume
    }

    const assistantMsg = memory.messages.find((m) => m.role === 'assistant');
    expect(typeof assistantMsg?.content).toBe('string');
    expect(assistantMsg?.content).toBe(text);
  });
});
