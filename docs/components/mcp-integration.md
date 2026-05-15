# Component: MCP integration (Model Context Protocol)

## Location

`src/mcp/`

## What is MCP?

Model Context Protocol is an open standard (by Anthropic) that lets LLM-powered apps connect to external tool servers. An MCP server exposes tools the agent can call just like built-in tools — but they run in a separate process and can do anything: query databases, call APIs, control browsers, etc.

This makes our plugin infinitely extensible without touching plugin code.

## Files

```
src/mcp/
├── client.ts         ← MCP client: connects to a server, lists tools, calls tools
├── manager.ts        ← manages multiple MCP server connections
├── adapter.ts        ← converts MCP tool definitions to ITool (so agent core sees them as normal tools)
└── types.ts          ← MCP-specific types
```

## How it works

```
Agent core
  → requests tool list from ToolRegistry
    → ToolRegistry includes built-in tools + MCP tools
      → MCP adapter wraps each MCP server tool as an ITool
        → When called, MCP adapter forwards the call to the MCP server process
          → MCP server executes (db query, API call, browser action, etc.)
            → Result returned as ToolResult back to agent core
```

## MCP client (`client.ts`)

Connects to a single MCP server over stdio or HTTP/SSE transport:

```typescript
class MCPClient {
  constructor(config: MCPServerConfig) {}

  // Start the server process and establish connection
  connect(): Promise<void>;

  // List all tools the server exposes
  listTools(): Promise<MCPToolDefinition[]>;

  // Call a tool on the server
  callTool(name: string, params: unknown): Promise<MCPToolResult>;

  // Disconnect cleanly
  disconnect(): Promise<void>;
}
```

## Server config (`MCPServerConfig`)

```typescript
interface MCPServerConfig {
  name: string;           // display name
  transport: 'stdio' | 'http';

  // For stdio transport (local process):
  command?: string;       // e.g. "npx @modelcontextprotocol/server-github"
  args?: string[];
  env?: Record<string, string>;

  // For HTTP transport (remote server):
  url?: string;           // e.g. "https://mcp.example.com/sse"
  headers?: Record<string, string>;
}
```

## MCP adapter (`adapter.ts`)

Converts an `MCPToolDefinition` into the plugin's `ITool` interface:

```typescript
function adaptMCPTool(client: MCPClient, def: MCPToolDefinition): ITool {
  return {
    name: `mcp__${client.serverName}__${def.name}`,
    description: def.description,
    parameters: def.inputSchema,
    requiresConfirmation: true,  // all MCP tools require confirmation by default
    execute: async (params) => client.callTool(def.name, params),
  };
}
```

The `mcp__serverName__toolName` naming convention prevents collisions with built-in tools.

## Manager (`manager.ts`)

Manages the full lifecycle of all configured MCP servers:

```typescript
class MCPManager {
  // Load configs from settings, connect all servers
  startAll(): Promise<void>;

  // Return all MCP tools as ITool[] for registration in ToolRegistry
  getAllTools(): ITool[];

  // Add a new server at runtime (from settings UI)
  addServer(config: MCPServerConfig): Promise<void>;

  // Remove a server
  removeServer(name: string): Promise<void>;

  // Health check all servers
  getStatus(): MCPServerStatus[];

  // Disconnect all on extension deactivate
  stopAll(): Promise<void>;
}
```

## Settings integration

MCP servers are configured in the settings page under the "MCP servers" section (see `docs/pages/settings.md`). They are persisted in `workspace.getConfiguration('codin.mcpServers')` as an array of `MCPServerConfig` objects.

## Popular MCP servers users can add

| Server | What it adds |
|---|---|
| `@modelcontextprotocol/server-github` | GitHub issues, PRs, repos |
| `@modelcontextprotocol/server-brave-search` | Web search |
| `@modelcontextprotocol/server-postgres` | Query a Postgres database |
| `@modelcontextprotocol/server-puppeteer` | Control a browser |
| `@modelcontextprotocol/server-filesystem` | Extended file system ops |

## Phase

MCP integration is a Phase 6 (post-launch) feature. Phases 1–5 use only built-in tools. The architecture is designed so that MCP tools slot in transparently when the feature is added.
