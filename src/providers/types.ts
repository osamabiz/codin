export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: string;
  toolUseId?: string;
}

export interface Message {
  role: Role;
  content: string | ContentBlock[];
  toolCallId?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ChatChunk =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; usage: TokenUsage }
  | { type: 'error'; error: string };

export interface ChatOptions {
  model: string;
  maxTokens: number;
  temperature: number;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface ILLMProvider {
  readonly name: string;
  readonly id: string;
  readonly supportsToolUse: boolean;
  readonly supportsStreaming: boolean;
  readonly availableModels: ModelInfo[];
  configure(apiKey: string): void;
  chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
