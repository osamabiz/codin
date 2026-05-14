import type {
  ILLMProvider,
  Message,
  ChatOptions,
  ChatChunk,
  ModelInfo,
  TokenUsage,
} from './types';

export class OpenAIProvider implements ILLMProvider {
  readonly name = 'OpenAI';
  readonly id = 'openai';
  readonly supportsToolUse = true;
  readonly supportsStreaming = true;
  readonly availableModels: ModelInfo[] = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ];

  private _apiKey = '';
  private static readonly _endpoint = 'https://api.openai.com/v1/chat/completions';

  configure(apiKey: string): void {
    this._apiKey = apiKey;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk> {
    if (!this._apiKey) {
      yield { type: 'error', error: 'No OpenAI API key configured. Open Settings to add your key.' };
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
      body['tools'] = options.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    let response: Response;
    try {
      response = await fetch(OpenAIProvider._endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${this._apiKey}`,
        },
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

  private async *_parseSSE(
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

          // Usage arrives in a final event (stream_options.include_usage)
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

          const toolCallDeltas = delta['tool_calls'] as Array<Record<string, unknown>> | undefined;
          if (toolCallDeltas) {
            for (const tc of toolCallDeltas) {
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

  private _toWireMessages(
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
    if (!this._apiKey) return { ok: false, error: 'No API key configured' };

    try {
      const resp = await fetch(OpenAIProvider._endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
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
