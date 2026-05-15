import type {
  ILLMProvider,
  Message,
  ChatOptions,
  ChatChunk,
  ModelInfo,
  TokenUsage,
} from '../types';

export interface OpenAIBaseConfig {
  id: string;
  name: string;
  /** Full base URL up to (but not including) the path, e.g. "https://api.openai.com/v1" */
  baseUrl: string;
  models: ModelInfo[];
  requiresApiKey?: boolean;   // default true
  supportsToolUse?: boolean;  // default true
  defaultTestModel?: string;
  /** Path appended to baseUrl for chat. Defaults to "/chat/completions" */
  chatPath?: string;
}

export class OpenAIBaseProvider implements ILLMProvider {
  readonly id: string;
  readonly name: string;
  // Not readonly so local subclasses can update after model detection
  supportsToolUse: boolean;
  readonly supportsStreaming = true;
  protected _models: ModelInfo[];
  get availableModels(): ModelInfo[] { return this._models; }

  protected _apiKey = '';
  protected _baseUrl: string;  // mutable so setBaseUrl() works
  protected readonly _requiresApiKey: boolean;
  protected _defaultTestModel: string;
  protected readonly _chatPath: string;

  constructor(cfg: OpenAIBaseConfig) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.supportsToolUse = cfg.supportsToolUse ?? true;
    this._models = cfg.models;
    this._baseUrl = cfg.baseUrl;
    this._requiresApiKey = cfg.requiresApiKey ?? true;
    this._defaultTestModel = cfg.defaultTestModel ?? (cfg.models[0]?.id ?? '');
    this._chatPath = cfg.chatPath ?? '/chat/completions';
  }

  configure(apiKey: string): void {
    this._apiKey = apiKey;
  }

  /** Override endpoint base URL at runtime (used for local/custom providers). */
  setBaseUrl(url: string): void {
    if (url) this._baseUrl = url;
  }

  protected _buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this._apiKey) h['authorization'] = `Bearer ${this._apiKey}`;
    return h;
  }

  protected get _endpoint(): string {
    return `${this._baseUrl}${this._chatPath}`;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk> {
    if (this._requiresApiKey && !this._apiKey) {
      yield {
        type: 'error',
        error: `No API key configured for ${this.name}. Open Settings to add your key.`,
      };
      return;
    }

    const body: Record<string, unknown> = {
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      messages: this._toWireMessages(messages, options.systemPrompt),
    };
    if (options.tools?.length) {
      body['tools'] = options.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));
    }

    let response: Response;
    try {
      response = await fetch(this._endpoint, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      yield { type: 'error', error: `Request failed: ${(err as Error).message}` };
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      yield { type: 'error', error: `API error ${response.status}: ${text}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    yield* this._parseSSE(response.body, options.signal);
  }

  protected async *_parseSSE(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal
  ): AsyncIterable<ChatChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    type ToolCallAcc = { id: string; name: string; args: string };
    const toolCalls = new Map<number, ToolCallAcc>();

    try {
      while (true) {
        if (signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;
        if (value) buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(data) as Record<string, unknown>;
          } catch {
            continue;
          }

          const u = event['usage'] as Record<string, number> | null | undefined;
          if (u) {
            usage.inputTokens = u['prompt_tokens'] ?? 0;
            usage.outputTokens = u['completion_tokens'] ?? 0;
          }

          const choices = event['choices'] as Array<Record<string, unknown>> | undefined;
          if (!choices?.length) continue;

          const choice = choices[0];
          const delta = choice['delta'] as Record<string, unknown> | undefined;
          if (!delta) continue;

          const content = delta['content'] as string | null | undefined;
          if (content) yield { type: 'token', content };

          const tcDeltas = delta['tool_calls'] as Array<Record<string, unknown>> | undefined;
          if (tcDeltas) {
            for (const tc of tcDeltas) {
              const idx = tc['index'] as number;
              const id = tc['id'] as string | undefined;
              const fn = tc['function'] as Record<string, string> | undefined;
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, { id: id ?? '', name: fn?.['name'] ?? '', args: '' });
              }
              const acc = toolCalls.get(idx)!;
              if (id) acc.id = id;
              if (fn?.['name']) acc.name = fn['name'];
              if (fn?.['arguments']) acc.args += fn['arguments'];
            }
          }

          const finishReason = choice['finish_reason'] as string | null | undefined;
          if (finishReason === 'tool_calls') {
            for (const [, tc] of toolCalls) {
              let input: unknown = {};
              try {
                input = JSON.parse(tc.args);
              } catch {
                // keep empty input
              }
              yield { type: 'tool_call', call: { id: tc.id, name: tc.name, input } };
            }
            toolCalls.clear();
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', usage };
  }

  protected _toWireMessages(
    messages: Message[],
    systemPrompt?: string
  ): Array<{ role: string; content: unknown }> {
    const wire: Array<{ role: string; content: unknown }> = [];
    if (systemPrompt) wire.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
      wire.push({ role: m.role, content: m.content });
    }
    return wire;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (this._requiresApiKey && !this._apiKey) {
      return { ok: false, error: 'No API key configured' };
    }

    try {
      const resp = await fetch(this._endpoint, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify({
          model: this._defaultTestModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      if (resp.status === 401) return { ok: false, error: 'Invalid API key' };
      if (!resp.ok) {
        const text = await resp.text();
        return { ok: false, error: `API error ${resp.status}: ${text}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
