export interface AgentContext {
  workspaceRoot: string;
  vscode: typeof import('vscode');
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AgentOptions {
  maxSteps: number;
  maxRetries: number;
  autoApproveReadOnly: boolean;
  checkpointBeforeEdit: boolean;
  enablePlanner: boolean;
  dryRun: boolean;
}

export interface PlanStep {
  index: number;
  description: string;
  toolHint?: string;
  status: 'pending' | 'active' | 'done' | 'failed';
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type ToolResult =
  | { ok: true; output: string }
  | { ok: false; error: string };

export interface AgentError {
  message: string;
  code?: string;
}

export type AgentEvent =
  | { type: 'token'; content: string }
  | { type: 'plan'; taskSummary: string; steps: PlanStep[] }
  | { type: 'step_start'; step: PlanStep }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; callId: string; result: ToolResult }
  | { type: 'step_done'; step: PlanStep }
  | { type: 'done'; finalMessage: string }
  | { type: 'error'; error: AgentError }
  | { type: 'waiting_for_approval'; call: ToolCall }
  | { type: 'dry_run_would_call'; call: ToolCall };
