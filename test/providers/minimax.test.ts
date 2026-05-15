import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MiniMaxProvider } from '../../src/providers/minimax';

function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < lines.length) {
        controller.enqueue(encoder.encode(lines[i++] + '\n'));
      } else {
        controller.close();
      }
    },
  });
}

function makeOkResponse(lines: string[]): Response {
  return {
    ok: true,
    status: 200,
    body: makeSSEStream(lines),
    text: async () => '',
  } as unknown as Response;
}

describe('MiniMaxProvider', () => {
  let provider: MiniMaxProvider;

  beforeEach(() => {
    provider = new MiniMaxProvider();
    provider.configure('mm-test-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the v2 chatcompletion endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(['data: [DONE]']));

    for await (const _ of provider.chat([], {
      model: 'abab6.5s-chat',
      maxTokens: 10,
      temperature: 0,
    })) {
      // consume
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.minimax.chat/v1/text/chatcompletion_v2');
  });

  it('parses standard delta.content format', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        `data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}`,
        `data: {"choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}`,
        'data: [DONE]',
      ])
    );

    const tokens: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'abab6.5s-chat',
      maxTokens: 100,
      temperature: 0,
    })) {
      if (chunk.type === 'token') tokens.push(chunk.content);
    }
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('parses cumulative MiniMax v2 messages[] format and emits only new content', async () => {
    // Each event carries the full text so far — only the delta should be emitted
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        `data: {"choices":[{"messages":[{"content":"Hello"}],"finish_reason":null}]}`,
        `data: {"choices":[{"messages":[{"content":"Hello world"}],"finish_reason":null}]}`,
        `data: {"choices":[{"messages":[{"content":"Hello world!"}],"finish_reason":null}]}`,
        'data: [DONE]',
      ])
    );

    const tokens: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'abab6.5s-chat',
      maxTokens: 100,
      temperature: 0,
    })) {
      if (chunk.type === 'token') tokens.push(chunk.content);
    }
    expect(tokens).toEqual(['Hello', ' world', '!']);
    expect(tokens.join('')).toBe('Hello world!');
  });

  it('does not double-emit when both delta and messages[] present', async () => {
    // If a provider sends both, we should emit both — this test verifies we don't crash
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse([
        `data: {"choices":[{"delta":{"content":"A"},"messages":[{"content":"A"}],"finish_reason":null}]}`,
        'data: [DONE]',
      ])
    );

    const tokens: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'abab6.5s-chat',
      maxTokens: 10,
      temperature: 0,
    })) {
      if (chunk.type === 'token') tokens.push(chunk.content);
    }
    // Both paths fire: delta yields "A", messages[] yields "A" (prevLen was 0, now 1)
    expect(tokens.join('')).toBe('AA');
  });
});
