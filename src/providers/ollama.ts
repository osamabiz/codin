import type {
  ILLMProvider,
  Message,
  ChatOptions,
  ChatChunk,
  ModelInfo,
  TokenUsage,
} from './types';

export class OllamaProvider implements ILLMProvider {
  readonly name = 'Ollama (local)';
  readonly id = 'ollama';
  readonly supportsToolUse = false;
  readonly supportsStreaming = true;
  readonly availableModels: ModelInfo[] = [
    { id: 'llama3.2', name: 'Llama 3.2' },
    { id: 'mistral', name: 'Mistral' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
    { id: 'deepseek-r1', name: 'DeepSeek R1' },
  ];

  private readonly _baseUrl = 'http://localhost:11434';

  // Ollama requires no API key; this is a no-op.
  configure(_apiKey: string): void {}

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk> {
    const body: Record<string, unknown> = {
      model: options.model,
      stream: true,
      options: { temperature: options.temperature },
      messages: this._toWireMessages(messages, options.systemPrompt),
    };

    let response: Response;
    try {
      response = await fetch(`${this._baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      yield {
        type: 'error',
        error: `Cannot reach Ollama. Is it running? (${(err as Error).message})`,
      };
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      yield { type: 'error', error: `Ollama error ${response.status}: ${text}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    yield* this._parseNDJSON(response.body, options.signal);
  }

  private async *_parseNDJSON(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal
  ): AsyncIterable<ChatChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      while (true) {
        if (signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;
        if (value) buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed) as Record<string, unknown>;
          } catch {
            continue;
          }

          const msg = event['message'] as Record<string, unknown> | undefined;
          const content = msg?.['content'] as string | undefined;
          if (content) yield { type: 'token', content };

          if (event['done']) {
            usage.inputTokens = (event['prompt_eval_count'] as number | undefined) ?? 0;
            usage.outputTokens = (event['eval_count'] as number | undefined) ?? 0;
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
  ): Array<{ role: string; content: string }> {
    const wire: Array<{ role: string; content: string }> = [];
    if (systemPrompt) wire.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
      wire.push({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      });
    }
    return wire;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await fetch(`${this._baseUrl}/api/tags`);
      if (!resp.ok) return { ok: false, error: `Ollama returned ${resp.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Cannot reach Ollama: ${(err as Error).message}` };
    }
  }
}
