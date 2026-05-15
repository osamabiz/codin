import type { ChatChunk, TokenUsage } from './types';
import { OpenAIBaseProvider } from './base/openai-base';

/**
 * MiniMax provider.
 *
 * Uses the chatcompletion_v2 endpoint which has a slightly different streaming
 * response shape: each SSE event may carry a "messages" array instead of a
 * "delta" object (or both).  We check for both forms so the adapter works
 * regardless of which MiniMax API version is behind the endpoint.
 */
export class MiniMaxProvider extends OpenAIBaseProvider {
  constructor() {
    super({
      id: 'minimax',
      name: 'MiniMax',
      baseUrl: 'https://api.minimax.chat/v1',
      chatPath: '/text/chatcompletion_v2',
      defaultTestModel: 'abab6.5s-chat',
      models: [
        { id: 'abab6.5s-chat', name: 'abab6.5s' },
        { id: 'abab5.5-chat', name: 'abab5.5' },
      ],
    });
  }

  protected async *_parseSSE(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal
  ): AsyncIterable<ChatChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let prevContentLen = 0;
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

          // Standard OpenAI delta format
          const delta = choice['delta'] as Record<string, unknown> | undefined;
          if (delta?.['content']) {
            yield { type: 'token', content: delta['content'] as string };
          }

          // MiniMax v2 "messages" array format — each event contains the full text so far
          const msgs = choice['messages'] as Array<Record<string, unknown>> | undefined;
          if (msgs?.length) {
            const fullContent = (msgs[0]['content'] as string | undefined) ?? '';
            const newPart = fullContent.slice(prevContentLen);
            prevContentLen = fullContent.length;
            if (newPart) yield { type: 'token', content: newPart };
          }

          // Tool calls (standard format)
          const finishReason = choice['finish_reason'] as string | null | undefined;
          if (finishReason === 'tool_calls') {
            const tc = delta?.['tool_calls'] as Array<Record<string, unknown>> | undefined;
            if (tc) {
              for (const call of tc) {
                const fn = call['function'] as Record<string, string> | undefined;
                if (!fn) continue;
                let input: unknown = {};
                try {
                  input = JSON.parse(fn['arguments'] ?? '{}');
                } catch {
                  // keep empty
                }
                yield {
                  type: 'tool_call',
                  call: {
                    id: (call['id'] as string | undefined) ?? '',
                    name: fn['name'] ?? '',
                    input,
                  },
                };
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', usage };
  }
}
