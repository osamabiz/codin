import type { ILLMProvider, ContentBlock, ChatOptions, ToolDefinition } from '../providers/types';
import type { ITool, ToolContext } from '../tools/types';
import type { AgentContext, AgentEvent, AgentOptions, PlanStep, ToolCall, ToolResult } from './types';
import type { AgentMemory } from './memory';

const MAX_OUTPUT_CHARS = 4000;

const SYSTEM_PROMPT = `You are an expert coding agent embedded in VS Code. Your job is to complete the user's task by reasoning step by step and using the tools available.

[RULES]
- Always start by reading the relevant files before editing them.
- Make the smallest edit that achieves the goal.
- After each edit, verify by reading the file back.
- If a tool call fails, explain why and try an alternative approach.
- When done, summarize what you changed and why.
- Never make up file contents — always read first.`;

function buildSystemPrompt(memory: AgentMemory): string {
  const ws = memory.workspaceSnapshot;
  if (!ws.name) return SYSTEM_PROMPT;
  return (
    SYSTEM_PROMPT +
    `\n\n[WORKSPACE]\nProject: ${ws.name}\nRoot: ${ws.root}\nLanguage(s): ${ws.languages.join(', ') || 'unknown'}\nFramework(s): ${ws.frameworks.join(', ') || 'none'}\nGit branch: ${ws.gitBranch ?? 'unknown'}\nGit status: ${ws.gitStatus ?? 'unknown'}`
  );
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const omitted = output.length - MAX_OUTPUT_CHARS;
  return (
    output.slice(0, MAX_OUTPUT_CHARS) +
    `\n[Output truncated at ${MAX_OUTPUT_CHARS} chars. ${omitted} chars omitted.]`
  );
}

export async function* runLoop(
  task: string,
  provider: ILLMProvider,
  tools: ITool[],
  context: AgentContext,
  memory: AgentMemory,
  options: AgentOptions,
  checkStopped: () => boolean,
  waitForApproval: (call: ToolCall) => Promise<void>,
  planSteps?: PlanStep[]
): AsyncGenerator<AgentEvent> {
  const toolContext: ToolContext = {
    workspaceRoot: context.workspaceRoot,
    vscode: context.vscode,
  };

  const toolDefs: ToolDefinition[] = provider.supportsToolUse
    ? tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters as Record<string, unknown>,
      }))
    : [];

  // Seed conversation with user task
  memory.append({ role: 'user', content: task });

  let stepCount = 0;
  let planStepIndex = 0;

  while (true) {
    if (checkStopped()) return;

    // Max-steps guard
    if (stepCount >= options.maxSteps) {
      const continueCall: ToolCall = {
        id: `__continue__-${Date.now()}`,
        name: '__continue__',
        input: { message: `Reached ${options.maxSteps} steps. Approve to continue.` },
      };
      const continuePromise = waitForApproval(continueCall);
      yield { type: 'waiting_for_approval', call: continueCall };
      try {
        await continuePromise;
        stepCount = 0;
      } catch {
        return;
      }
    }

    if (checkStopped()) return;

    // Context window management: summarize if approaching limit
    if (memory.shouldSummarize(context.model)) {
      try {
        await memory.summarizeOldest(provider, context.model);
      } catch {
        // Summarization failure is non-fatal — continue with full context
      }
    }

    const chatOptions: ChatOptions = {
      model: context.model,
      maxTokens: context.maxTokens,
      temperature: context.temperature,
      tools: toolDefs,
      systemPrompt: buildSystemPrompt(memory),
    };

    // Emit step_start for the current plan step
    if (planSteps && planStepIndex < planSteps.length) {
      yield { type: 'step_start', step: { ...planSteps[planStepIndex], status: 'active' } };
    }

    const pendingCalls: ToolCall[] = [];
    let finalText = '';
    let hasText = false;

    for await (const chunk of provider.chat(memory.messages, chatOptions)) {
      if (checkStopped()) return;
      switch (chunk.type) {
        case 'token':
          hasText = true;
          finalText += chunk.content;
          yield { type: 'token', content: chunk.content };
          break;
        case 'tool_call':
          pendingCalls.push(chunk.call);
          break;
        case 'done':
          break;
        case 'error':
          yield { type: 'error', error: { message: chunk.error } };
          return;
      }
    }

    if (checkStopped()) return;

    if (pendingCalls.length === 0) {
      // Pure text response — agent is done
      if (planSteps && planStepIndex < planSteps.length) {
        yield { type: 'step_done', step: { ...planSteps[planStepIndex], status: 'done' } };
      }
      memory.append({ role: 'assistant', content: finalText });
      yield { type: 'done', finalMessage: finalText };
      return;
    }

    // Suppress unused-variable warning; hasText is used to guard streaming logic upstream
    void hasText;

    // Record assistant message containing text + tool_use blocks
    const assistantContent: ContentBlock[] = [];
    if (finalText) assistantContent.push({ type: 'text', text: finalText });
    for (const call of pendingCalls) {
      assistantContent.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
    }
    memory.append({ role: 'assistant', content: assistantContent });

    // Execute each tool call
    for (const call of pendingCalls) {
      if (checkStopped()) return;

      const tool = tools.find((t) => t.name === call.name);

      if (!tool) {
        const errMsg = `Unknown tool: ${call.name}`;
        memory.append({ role: 'tool', content: `[TOOL FAILURE] ${errMsg}`, toolCallId: call.id });
        yield {
          type: 'tool_result',
          callId: call.id,
          result: { ok: false, error: errMsg },
        };
        continue;
      }

      yield { type: 'tool_call', call };

      // Dry-run mode: skip execution for tools requiring confirmation
      if (options.dryRun && tool.requiresConfirmation) {
        yield { type: 'dry_run_would_call', call };
        const dryMsg = `[DRY RUN] Would have called ${call.name}`;
        memory.append({ role: 'tool', content: dryMsg, toolCallId: call.id });
        yield { type: 'tool_result', callId: call.id, result: { ok: true, output: dryMsg } };
        stepCount++;
        continue;
      }

      // Confirmation gate — register Promise BEFORE yielding so callers can
      // call approveTool/rejectTool synchronously inside the for-await handler.
      if (tool.requiresConfirmation) {
        const approvalPromise = waitForApproval(call);
        yield { type: 'waiting_for_approval', call };
        try {
          await approvalPromise;
        } catch (reason) {
          const rejMsg = `User rejected: ${String(reason)}`;
          memory.append({ role: 'tool', content: rejMsg, toolCallId: call.id });
          yield { type: 'tool_result', callId: call.id, result: { ok: false, error: rejMsg } };

          // Cancel remaining tool calls in this batch
          const remaining = pendingCalls.slice(pendingCalls.indexOf(call) + 1);
          for (const cancelled of remaining) {
            const cancelMsg = 'Tool call cancelled (earlier call rejected)';
            memory.append({ role: 'tool', content: cancelMsg, toolCallId: cancelled.id });
            yield {
              type: 'tool_result',
              callId: cancelled.id,
              result: { ok: false, error: cancelMsg },
            };
          }
          break;
        }
      }

      if (checkStopped()) return;

      // Execute
      let result: ToolResult;
      try {
        result = await tool.execute(call.input, toolContext);
      } catch (err) {
        result = { ok: false, error: (err as Error).message };
      }

      const rawOutput = result.ok ? result.output : result.error;
      const truncated = truncateOutput(rawOutput);
      const toolMsg = result.ok ? truncated : `[TOOL FAILURE] ${truncated}`;
      memory.append({ role: 'tool', content: toolMsg, toolCallId: call.id });

      yield { type: 'tool_result', callId: call.id, result };

      stepCount++;
    }

    // Advance plan step after completing this loop iteration
    if (planSteps && planStepIndex < planSteps.length) {
      yield { type: 'step_done', step: { ...planSteps[planStepIndex], status: 'done' } };
      planStepIndex++;
    }
  }
}
