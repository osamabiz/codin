# Component: Webview UI

## Location

`webview-ui/`

## Responsibility

The frontend of the chat panel and settings panel. Runs inside VS Code's sandboxed webview (a restricted browser iframe). Communicates with the extension host exclusively via `postMessage`.

---

## Files

```
webview-ui/
├── index.html          ← chat panel HTML shell
├── settings.html       ← settings panel HTML shell
├── main.ts             ← chat panel logic (compiled to main.js)
├── settings.ts         ← settings panel logic (compiled to settings.js)
├── style.css           ← shared styles
├── components/
│   ├── message.ts      ← renders a single chat message (user or assistant)
│   ├── tool-card.ts    ← renders a tool approval card
│   ├── plan-view.ts    ← renders the plan steps inline in chat
│   └── pill.ts         ← context pill component
└── utils/
    ├── markdown.ts     ← marked.js wrapper with syntax highlighting
    ├── tokens.ts       ← approximate token counter
    └── vscode-api.ts   ← typed wrapper around acquireVsCodeApi()
```

---

## VS Code API bridge (`utils/vscode-api.ts`)

```typescript
// acquireVsCodeApi() can only be called once per webview session
const vscode = acquireVsCodeApi();

export function postMessage(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

export function onMessage(handler: (msg: ExtensionMessage) => void): void {
  window.addEventListener('message', (e) => handler(e.data));
}

// Persist small state across webview reloads (VS Code caches it)
export function getState<T>(): T | undefined {
  return vscode.getState() as T;
}

export function setState<T>(state: T): void {
  vscode.setState(state);
}
```

---

## Chat panel (`main.ts`)

### State

```typescript
interface ChatState {
  messages: RenderedMessage[];
  contextItems: ContextItem[];
  isStreaming: boolean;
  currentStreamBuffer: string;
  pendingToolCall: ToolCall | null;
  plan: PlanStep[] | null;
  dryRun: boolean;
}
```

### Initialization

```typescript
document.addEventListener('DOMContentLoaded', () => {
  // Restore state if webview was hidden and re-shown
  const saved = getState<ChatState>();
  if (saved) restoreState(saved);

  // Tell extension we're ready — triggers settings_loaded + history_loaded
  postMessage({ type: 'ready' });

  // Wire up input
  setupInput();
  setupMentionPicker();
});
```

### Streaming rendering

Tokens are appended to a buffer and the last message element is updated:

```typescript
function handleToken(content: string) {
  state.currentStreamBuffer += content;
  // Re-render markdown of the current streaming message
  currentMessageEl.innerHTML = renderMarkdown(state.currentStreamBuffer);
  scrollToBottom();
}

function handleDone(finalMessage: string) {
  state.isStreaming = false;
  state.currentStreamBuffer = '';
  enableInput();
}
```

### `@` mention picker

```typescript
inputEl.addEventListener('input', (e) => {
  const cursor = inputEl.selectionStart;
  const textBefore = inputEl.value.slice(0, cursor);
  const mentionMatch = textBefore.match(/@(\w*)$/);

  if (mentionMatch) {
    const query = mentionMatch[1];
    showMentionPicker(query);   // renders a floating list of file matches
  } else {
    hideMentionPicker();
  }
});

function onMentionSelected(item: ContextItem) {
  // Replace "@query" in input with the item name
  // Add item to contextItems array
  // Render as pill
  hideMentionPicker();
}
```

---

## Styling rules

### Theme compatibility

All colours use VS Code CSS variables. Never use hardcoded hex:

```css
/* Correct */
background: var(--vscode-editor-background);
color: var(--vscode-editor-foreground);
border-color: var(--vscode-panel-border);

/* For interactive elements */
background: var(--vscode-button-background);
color: var(--vscode-button-foreground);

/* For inputs */
background: var(--vscode-input-background);
border: 1px solid var(--vscode-input-border);
```

### Message bubbles

```css
.message-user {
  align-self: flex-end;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-radius: 12px 12px 2px 12px;
  max-width: 80%;
  padding: 8px 12px;
}

.message-assistant {
  align-self: flex-start;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 2px 12px 12px 12px;
  max-width: 90%;
  padding: 8px 12px;
}
```

### Tool call card

```css
.tool-card {
  border: 1px solid var(--vscode-panel-border);
  border-left: 3px solid var(--vscode-charts-blue);
  border-radius: 4px;
  padding: 10px 12px;
  margin: 6px 0;
  background: var(--vscode-editor-background);
}

.tool-card.dry-run {
  border-left-color: var(--vscode-charts-gray);
  opacity: 0.7;
}
```

### Context pills

```css
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 11px;
}

.pill-remove {
  cursor: pointer;
  opacity: 0.6;
}
.pill-remove:hover { opacity: 1; }
```

---

## Markdown rendering (`utils/markdown.ts`)

Uses `marked.js` from CDN (loaded in `index.html`):

```html
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
```

```typescript
export function renderMarkdown(text: string): string {
  return marked.parse(text, {
    breaks: true,
    gfm: true,
  });
}
```

Code blocks get VS Code's built-in monospace font automatically via:
```css
code, pre { font-family: var(--vscode-editor-font-family); }
```

No external syntax highlighting library — VS Code themes style `<code>` blocks naturally.

---

## Content Security Policy

VS Code requires a strict CSP on all webview HTML:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
           style-src 'unsafe-inline' ${webview.cspSource};
           font-src ${webview.cspSource};
           img-src ${webview.cspSource} data:;">
```

The `nonce` is generated fresh per-panel in `ChatPanel.ts`:

```typescript
function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFabcdef0123456789';
  for (let i = 0; i < 32; i++)
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
```

---

## Token counter (`utils/tokens.ts`)

Simple approximation — no external tokenizer:

```typescript
export function estimateTokens(text: string): number {
  // ~4 chars per token is a reasonable average for English + code
  return Math.ceil(text.length / 4);
}

export function estimateContextTokens(
  messages: Message[],
  contextItems: ContextItem[]
): number {
  const msgTokens = messages.reduce((acc, m) =>
    acc + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
  const ctxTokens = contextItems.reduce((acc, c) =>
    acc + estimateTokens(c.content), 0);
  return msgTokens + ctxTokens;
}

// Model context limits (tokens)
export const MODEL_LIMITS: Record<string, number> = {
  'claude-opus-4':     200000,
  'claude-sonnet-4':   200000,
  'claude-haiku-4-5':  200000,
  'gpt-4o':            128000,
  'gpt-4o-mini':       128000,
  'gemini-2.0-flash':  1000000,
  'default':           32000,
};
```
