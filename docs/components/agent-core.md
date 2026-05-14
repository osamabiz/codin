# Component: Agent core

## Location

`src/agent/`

## Responsibility

Orchestrates the full agentic loop: receives a user task, calls the LLM to plan, executes tools step by step, observes results, re-plans if needed, and returns a final answer.

## Files

```
src/agent/
├── agent.ts       ← public API — the one thing extension.ts calls
├── planner.ts     ← calls LLM to produce a numbered plan
├── executor.ts    ← dispatches plan steps to tools
├── memory.ts      ← conversation history + workspace snapshot
├── loop.ts        ← the observe → reflect → re-plan cycle
└── types.ts       ← shared types: Task, Plan, Step, ToolResult, etc.
```

## Public API (`agent.ts`)

```typescript
class Agent {
  constructor(provider: ILLMProvider, tools: ITool[], options: AgentOptions) {}

  // Start a new task. Returns an async generator that yields AgentEvents.
  run(task: string, context: AgentContext): AsyncGenerator<AgentEvent>;

  // Interrupt after the current tool call completes.
  stop(): void;

  // Approve a pending tool call (called from UI on user click).
  approveTool(callId: string): void;

  // Reject a pending tool call.
  rejectTool(callId: string, reason?: string): void;
}
```

## Event types (`AgentEvent`)

The `run()` generator yields a stream of events that the extension host maps to UI updates:

```typescript
type AgentEvent =
  | { type: 'token';       content: string }               // streaming token
  | { type: 'plan';        steps: PlanStep[] }             // planner output
  | { type: 'step_start';  step: PlanStep }                // step beginning
  | { type: 'tool_call';   call: ToolCall }                // tool about to execute
  | { type: 'tool_result'; callId: string; result: ToolResult }
  | { type: 'step_done';   step: PlanStep }
  | { type: 'done';        finalMessage: string }
  | { type: 'error';       error: AgentError }
  | { type: 'waiting_for_approval'; call: ToolCall }       // UI must call approveTool/rejectTool
```

## The loop (`loop.ts`)

```
LOOP:
  1. Build prompt: system prompt + conversation history + workspace snapshot + task
  2. Call LLM with tool definitions attached
  3. If LLM returns a text response with no tool calls → DONE (final answer)
  4. If LLM returns tool calls:
       For each tool call:
         a. Emit 'tool_call' event
         b. If tool.requiresConfirmation:
              Emit 'waiting_for_approval'
              Await user decision (approveTool / rejectTool)
              If rejected: inject rejection into context, goto LOOP
         c. Execute tool
         d. Emit 'tool_result'
         e. Append result to conversation history
  5. Check step count vs maxSteps setting
     If exceeded: emit 'waiting_for_approval' with a "continue?" prompt
  6. Goto LOOP
```

## System prompt structure

The system prompt is assembled fresh at the start of each `run()` call:

```
[ROLE]
You are an expert coding agent embedded in VS Code. Your job is to complete
the user's task by reasoning step by step and using the tools available.

[WORKSPACE]
Project: {workspaceName}
Language(s): {detectedLanguages}
Framework(s): {detectedFrameworks}
Git status: {gitStatus}

[TOOLS]
{tool definitions injected by provider SDK}

[RULES]
- Always start by reading the relevant files before editing them.
- Make the smallest edit that achieves the goal.
- After each edit, verify by reading the file back.
- If a tool call fails, explain why and try an alternative approach.
- When done, summarize what you changed and why.
- Never make up file contents — always read first.
```

## Memory (`memory.ts`)

```typescript
class AgentMemory {
  // Full conversation as LLM messages (user/assistant/tool alternating)
  messages: Message[];

  // Snapshot of workspace (file tree, git status)
  workspaceSnapshot: WorkspaceSnapshot;

  // Add a message to history
  append(message: Message): void;

  // Trim oldest messages when approaching context limit (keeps system prompt + last N)
  trim(maxTokens: number): void;

  // Serialize to JSON for persistence
  toJSON(): string;

  // Load from persisted JSON
  static fromJSON(json: string): AgentMemory;
}
```

## Error handling

| Error type | Agent behaviour |
|---|---|
| Tool execution failure | Injects error into context, LLM re-plans |
| LLM API error (rate limit, timeout) | Exponential backoff up to `maxRetries`, then surfaces to user |
| LLM returns no tool call and no answer | Treats as done (edge case guard) |
| User rejects tool call | Injects "User rejected: {reason}" into context, LLM re-plans |
| Max steps exceeded | Pauses loop, asks user to confirm continuation |
| Context window full | Summarizes oldest messages via a separate LLM call, then continues |

## Options

```typescript
interface AgentOptions {
  maxSteps: number;         // default 25
  maxRetries: number;       // default 3
  autoApproveReadOnly: boolean; // default false
  checkpointBeforeEdit: boolean; // default false
}
```
