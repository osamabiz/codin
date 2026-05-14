# Component: Extension entry point

## Location

`src/extension.ts`

## Responsibility

The single entry point VS Code calls when the extension activates or deactivates. Wires together all subsystems — UI panels, agent core, providers, tools, settings — and registers all commands, views, and event listeners.

---

## Lifecycle

```
VS Code loads extension
  → activate(context) called
    → register commands
    → register sidebar provider
    → load settings + initialize provider
    → initialize tool registry
    → create agent instance
    → register status bar item
    → check if onboarding needed → show wizard if first run

VS Code unloads extension (window close, disable, reload)
  → deactivate() called
    → stop any running agent loop
    → disconnect MCP servers (Phase 6+)
    → dispose all disposables
```

---

## Commands registered

| Command ID | Title | Handler |
|---|---|---|
| `agentPlugin.openChat` | Agent: Open Chat | Opens / focuses ChatPanel |
| `agentPlugin.newChat` | Agent: New Chat | Clears history, opens fresh ChatPanel |
| `agentPlugin.openSettings` | Agent: Settings | Opens SettingsPanel |
| `agentPlugin.stopAgent` | Agent: Stop | Calls `agent.stop()` |
| `agentPlugin.toggleDryRun` | Agent: Toggle Dry Run | Flips dry-run mode |

---

## Full `activate()` pseudocode

```typescript
export async function activate(context: vscode.ExtensionContext) {
  // 1. Logger
  const logger = new Logger('AI Agent');

  // 2. Settings
  const settings = new SettingsManager(context.secrets, context.globalState);

  // 3. Provider registry + active provider
  const providerRegistry = buildProviderRegistry();
  const provider = providerRegistry.getProvider(settings.provider);

  // 4. Tool registry
  const toolRegistry = new ToolRegistry(buildBuiltInTools());

  // 5. Agent
  const agent = new Agent(provider, toolRegistry.getAll(), {
    maxSteps: settings.maxSteps,
    maxRetries: settings.maxRetries,
    autoApproveReadOnly: settings.autoApproveReadOnly,
    checkpointBeforeEdit: settings.checkpointBeforeEdit,
  });

  // 6. UI
  const statusBar = new AgentStatusBar();
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  // 7. Register sidebar
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agentPlugin.sidebar', sidebarProvider)
  );

  // 8. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('agentPlugin.openChat', () => {
      ChatPanel.createOrShow(context.extensionUri, agent, settings);
    }),
    vscode.commands.registerCommand('agentPlugin.newChat', () => {
      ChatPanel.reset(context.extensionUri, agent, settings);
    }),
    vscode.commands.registerCommand('agentPlugin.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri, settings);
    }),
    vscode.commands.registerCommand('agentPlugin.stopAgent', () => {
      agent.stop();
    }),
    vscode.commands.registerCommand('agentPlugin.toggleDryRun', () => {
      settings.dryRun = !settings.dryRun;
      statusBar.update(agent.state);
    })
  );

  // 9. Wire agent events → sidebar + status bar
  agent.onEvent((event) => {
    statusBar.update(agent.state);
    sidebarProvider.handleAgentEvent(event);
  });

  // 10. Status bar
  statusBar.show();
  context.subscriptions.push(statusBar);

  // 11. First-run onboarding
  if (!settings.onboardingComplete) {
    OnboardingPanel.createOrShow(context.extensionUri, settings, () => {
      settings.onboardingComplete = true;
      ChatPanel.createOrShow(context.extensionUri, agent, settings);
    });
  }

  logger.info('AI Agent extension activated');
}

export function deactivate() {
  // Cleanup handled via context.subscriptions disposables
}
```

---

## Settings manager (`src/utils/SettingsManager.ts`)

Thin wrapper around VS Code APIs to give the rest of the codebase a typed, clean settings interface:

```typescript
class SettingsManager {
  constructor(
    private secrets: vscode.SecretStorage,
    private globalState: vscode.Memento
  ) {}

  // API key — SecretStorage
  async getApiKey(provider: string): Promise<string | undefined>
  async setApiKey(provider: string, key: string): Promise<void>

  // Config — workspace.getConfiguration('agentPlugin')
  get provider(): string
  get model(): string
  get maxSteps(): number
  get maxRetries(): number
  get temperature(): number
  get autoApproveReadOnly(): boolean
  get checkpointBeforeEdit(): boolean
  get blockedCommands(): string[]
  get allowedWriteDirectories(): string[]
  get dryRun(): boolean
  set dryRun(value: boolean)

  // Global state
  get onboardingComplete(): boolean
  set onboardingComplete(value: boolean)
}
```

---

## Message protocol between extension host and webview

All messages are plain JSON objects with a `type` discriminator.

### Extension → Webview

```typescript
type ExtensionMessage =
  | { type: 'token';               content: string }
  | { type: 'plan';                steps: PlanStep[] }
  | { type: 'step_start';          step: PlanStep }
  | { type: 'step_done';           step: PlanStep }
  | { type: 'tool_waiting';        call: ToolCall }       // show approval card
  | { type: 'tool_result';         callId: string; result: string }
  | { type: 'done';                message: string }
  | { type: 'error';               message: string; retryable: boolean }
  | { type: 'settings_loaded';     settings: PublicSettings }
  | { type: 'history_loaded';      messages: Message[] }
  | { type: 'dry_run_would_call';  call: ToolCall }
```

### Webview → Extension

```typescript
type WebviewMessage =
  | { type: 'send_message';    text: string; contextItems: ContextItem[] }
  | { type: 'approve_tool';    callId: string }
  | { type: 'reject_tool';     callId: string; reason?: string }
  | { type: 'stop' }
  | { type: 'new_chat' }
  | { type: 'save_settings';   settings: Partial<PublicSettings> }
  | { type: 'test_connection'; provider: string; apiKey: string }
  | { type: 'ready' }          // webview finished loading, send initial state
```

---

## Disposable management

Every resource that needs cleanup is pushed to `context.subscriptions`:

```typescript
context.subscriptions.push(
  statusBar,          // implements vscode.Disposable
  sidebarProvider,    // implements vscode.Disposable
  // commands are automatically disposable when registered this way
);
```

VS Code automatically calls `dispose()` on all subscriptions when the extension deactivates.
