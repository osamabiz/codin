import type { ILLMProvider } from '../providers/types';
import type { ITool } from '../tools/types';
import type { AgentContext, AgentEvent, AgentOptions, ToolCall } from './types';
import { AgentMemory } from './memory';
import { runLoop } from './loop';
import { createPlan } from './planner';

const DEFAULT_OPTIONS: AgentOptions = {
  maxSteps: 25,
  maxRetries: 3,
  autoApproveReadOnly: false,
  checkpointBeforeEdit: false,
  enablePlanner: true,
  dryRun: false,
};

export class Agent {
  private readonly _options: AgentOptions;
  private _stopped = false;
  private readonly _pendingApprovals = new Map<
    string,
    { resolve: () => void; reject: (reason: string) => void }
  >();
  private _memory: AgentMemory = new AgentMemory();

  constructor(
    private readonly _provider: ILLMProvider,
    private readonly _tools: ITool[],
    options: Partial<AgentOptions> = {}
  ) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  async *run(task: string, context: AgentContext): AsyncGenerator<AgentEvent> {
    this._stopped = false;
    this._pendingApprovals.clear();

    // Phase A: generate a plan via a separate LLM call (when enabled)
    let planSteps = undefined;
    const plan = this._options.enablePlanner
      ? await createPlan(task, this._provider, context.model)
      : null;
    if (plan) {
      planSteps = plan.steps;
      yield { type: 'plan', taskSummary: plan.taskSummary, steps: plan.steps };
    }

    // Phase B: execute using the loop, passing plan steps for step events
    yield* runLoop(
      task,
      this._provider,
      this._tools,
      context,
      this._memory,
      this._options,
      () => this._stopped,
      (call: ToolCall) => this._waitForApproval(call),
      planSteps
    );
  }

  stop(): void {
    this._stopped = true;
    // Reject all pending approvals so the loop can unwind
    for (const [, handlers] of this._pendingApprovals) {
      handlers.reject('Agent stopped');
    }
    this._pendingApprovals.clear();
  }

  approveTool(callId: string): void {
    this._pendingApprovals.get(callId)?.resolve();
    this._pendingApprovals.delete(callId);
  }

  rejectTool(callId: string, reason = 'User rejected'): void {
    this._pendingApprovals.get(callId)?.reject(reason);
    this._pendingApprovals.delete(callId);
  }

  serializeMemory(): string {
    return this._memory.toJSON();
  }

  restoreMemory(memory: AgentMemory): void {
    this._memory = memory;
  }

  private _waitForApproval(call: ToolCall): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._pendingApprovals.set(call.id, { resolve, reject });
    });
  }
}
