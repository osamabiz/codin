# Component: LLM providers

## Location

`src/providers/`

## Responsibility

Abstracts all LLM API communication behind a single interface so the agent core never knows which provider it's talking to. Adding a new provider means creating one file and registering it — nothing else changes.

## Files

```
src/providers/
├── index.ts          ← registry: maps provider name → implementation
├── types.ts          ← ILLMProvider interface + shared types
├── claude.ts         ← Anthropic Claude
├── openai.ts         ← OpenAI (also handles Azure OpenAI)
├── gemini.ts         ← Google Gemini
└── ollama.ts         ← Local Ollama (OpenAI-compatible)
```

## Core interface (`types.ts`)

```typescript
interface ILLMProvider {
  readonly name: string;            // display name e.g. "Claude (Anthropic)"
  readonly id: string;              // machine id e.g. "claude"
  readonly supportsToolUse: boolean;
  readonly supportsStreaming: boolean;
  readonly availableModels: ModelInfo[];

  // Main method — streams tokens and tool calls
  chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterable<ChatChunk>;

  // Quick ping to verify the key works
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

interface ChatOptions {
  model: string;
  maxTokens: number;
  temperature: number;
  tools?: ToolDefinition[];   // passed when agent loop is active
  systemPrompt?: string;
}

type ChatChunk =
  | { type: 'token';     content: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done';      usage: TokenUsage }
  | { type: 'error';     error: string }

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}
```

## Claude provider (`claude.ts`)

- Endpoint: `https://api.anthropic.com/v1/messages`
- Auth header: `x-api-key: {key}`, `anthropic-version: 2023-06-01`
- Streaming: SSE (`stream: true`)
- Tool use: native (`tools` array in request body)
- Key setting: `agentPlugin.apiKey` (SecretStorage)
- Recommended model: `claude-sonnet-4` (best tool-use / cost balance)
- Also supports: `claude-opus-4`, `claude-haiku-4-5`

```typescript
// Tool definition format for Claude
{
  name: "read_file",
  description: "Read the contents of a file",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file" }
    },
    required: ["path"]
  }
}
```

## OpenAI provider (`openai.ts`)

- Endpoint: `https://api.openai.com/v1/chat/completions` (or custom base URL for Azure)
- Auth header: `Authorization: Bearer {key}`
- Streaming: SSE with `stream: true`
- Tool use: `tools` array with `function` type
- Recommended model: `gpt-4o`
- Azure: set custom base URL + `api-version` query param

## Gemini provider (`gemini.ts`)

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
- Auth: `?key={apiKey}` query param
- Tool use: `tools` with `functionDeclarations`
- Recommended model: `gemini-2.0-flash`
- Note: Gemini uses a different message format (`role: "model"` instead of `"assistant"`) — normalize in adapter

## Ollama provider (`ollama.ts`)

- Endpoint: `http://localhost:11434/api/chat` (configurable base URL)
- Auth: none
- Streaming: NDJSON stream
- Tool use: supported on models that have it (llama3.1, mistral-nemo, etc.)
- No API key required — ideal for privacy-first users
- `testConnection()` hits `/api/tags` to check if Ollama is running

## Provider registry (`index.ts`)

```typescript
const providers: Record<string, ILLMProvider> = {
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
  ollama: new OllamaProvider(),
};

export function getProvider(id: string): ILLMProvider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}
```

## Message format normalization

Internally the agent uses a canonical message format:

```typescript
type Role = 'system' | 'user' | 'assistant' | 'tool';

interface Message {
  role: Role;
  content: string | ContentBlock[];
  toolCallId?: string;    // for role=tool messages
}
```

Each provider adapter converts from this canonical format to its own wire format before sending, and converts responses back on the way in.

## Fallback behavior

- If a provider does not support tool use (`supportsToolUse: false`), the agent falls back to a text-only mode where tools are described in the system prompt and the LLM is asked to respond with JSON tool invocations. The executor parses this JSON and runs the tools.
- This allows Ollama with smaller models to work, at reduced reliability.

## Adding a new provider

1. Create `src/providers/myprovider.ts` implementing `ILLMProvider`
2. Register it in `src/providers/index.ts`
3. Add it to the provider dropdown in `package.json` → `contributes.configuration` enum
4. Add a section in `docs/pages/settings.md`

No other files need to change.
