export type JSONSchema = Record<string, unknown>;

export interface ToolContext {
  workspaceRoot: string;
  vscode: typeof import('vscode');
  onProgress?: (msg: string) => void;
}

export type ToolResult = { ok: true; output: string } | { ok: false; error: string };

export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema;
  readonly requiresConfirmation: boolean;
  execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}
