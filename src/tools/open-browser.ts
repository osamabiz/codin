import type { ITool, ToolContext, ToolResult, JSONSchema } from './types';

interface OpenBrowserParams {
  url: string;
}

export const openBrowser: ITool = {
  name: 'open_browser',
  description: "Open a URL in VS Code's Simple Browser or the system browser.",
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to open.' },
    },
    required: ['url'],
  } satisfies JSONSchema,
  requiresConfirmation: false,

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    const { url } = params as OpenBrowserParams;

    try {
      new URL(url); // validate URL structure
    } catch {
      return { ok: false, error: `Invalid URL: ${url}` };
    }

    try {
      await context.vscode.env.openExternal(context.vscode.Uri.parse(url));
    } catch (err) {
      return { ok: false, error: `Failed to open URL: ${(err as Error).message}` };
    }

    return { ok: true, output: `Opened: ${url}` };
  },
};
