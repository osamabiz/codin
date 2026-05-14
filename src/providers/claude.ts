import type {
  ILLMProvider,
  Message,
  ChatOptions,
  ChatChunk,
  ModelInfo,
  TokenUsage,
} from './types';

export class ClaudeProvider implements ILLMProvider {
  readonly name = 'Claude (Anthropic)';
  readonly id = 'claude';
  readonly supportsToolUse = true;
  readonly supportsStreaming = true;
  readonly availableModels: ModelInfo[] = [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  ];

  private _apiKey = '';
  private static readonly _endpoint = 'https://api.anthropic.com/v1/messages';

  configure(apiKey: string): void {
    this._apiKey = apiKey;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk> {
    if (!this._apiKey) {
      yield { type: 'error', error: 'No Claude API key configured. Open Settings to add your key.' };
      return;
    }

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: true,
      messages: this._toWireMessages(messages),
    };
    if (options.systemPrompt) {
      body['system'] = options.systemPrompt;
    }
    if (options.tools?.length) {
      body['tools'] = options.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }

    let response: Response;
    try {
      response = await fetch(ClaudeProvider._endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': '2023-06-01',
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

    type ToolBlock = { id: string; name: string; inputJson: string };
    const toolBlocks = new Map<number, ToolBlock>();

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

          const eventType = event['type'] as string | undefined;

          if (eventType === 'message_start') {
            const msg = event['message'] as Record<string, unknown> | undefined;
            const u = msg?.['usage'] as Record<string, number> | undefined;
            if (u) usage.inputTokens = u['input_tokens'] ?? 0;
          } else if (eventType === 'content_block_start') {
            const idx = event['index'] as number;
            const block = event['content_block'] as Record<string, unknown> | undefined;
            if (block?.['type'] === 'tool_use') {
              toolBlocks.set(idx, {
                id: block['id'] as string,
                name: block['name'] as string,
                inputJson: '',
              });
            }
          } else if (eventType === 'content_block_delta') {
            const idx = event['index'] as number;
            const delta = event['delta'] as Record<string, unknown> | undefined;
            const deltaType = delta?.['type'] as string | undefined;

            if (deltaType === 'text_delta') {
              const text = delta?.['text'] as string | undefined;
              if (text) yield { type: 'token', content: text };
            } else if (deltaType === 'input_json_delta') {
              const partial = delta?.['partial_json'] as string | undefined;
              const tb = toolBlocks.get(idx);
              if (tb && partial) tb.inputJson += partial;
            }
          } else if (eventType === 'content_block_stop') {
            const idx = event['index'] as number;
            const tb = toolBlocks.get(idx);
            if (tb) {
              let input: unknown = {};
              try {
                input = JSON.parse(tb.inputJson);
              } catch {
                // keep empty input
              }
              yield { type: 'tool_call', call: { id: tb.id, name: tb.name, input } };
              toolBlocks.delete(idx);
            }
          } else if (eventType === 'message_delta') {
            const u = event['usage'] as Record<string, number> | undefined;
            if (u) usage.outputTokens = u['output_tokens'] ?? 0;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', usage };
  }

  private _toWireMessages(messages: Message[]): Array<{ role: string; content: unknown }> {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      }));
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this._apiKey) return { ok: false, error: 'No API key configured' };

    try {
      const resp = await fetch(ClaudeProvider._endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
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
