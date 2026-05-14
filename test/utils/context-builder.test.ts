import { describe, it, expect } from 'vitest';
import {
  buildUserMessage,
  buildMessagesWithContext,
  buildWorkspaceSystemPrompt,
} from '../../src/utils/context-builder';
import type { ContextItem, WorkspaceInfo } from '../../src/utils/context-builder';

// ---------------------------------------------------------------------------
// buildUserMessage
// ---------------------------------------------------------------------------

describe('buildUserMessage', () => {
  it('returns plain text when no context items provided', () => {
    expect(buildUserMessage('hello', [])).toBe('hello');
  });

  it('prepends a file context block before the user text', () => {
    const item: ContextItem = {
      type: 'file',
      label: 'src/auth.ts',
      content: 'export function login() {}',
    };
    const result = buildUserMessage('How does login work?', [item]);
    expect(result).toContain('[CONTEXT: src/auth.ts]');
    expect(result).toContain('export function login() {}');
    expect(result).toContain('User message: How does login work?');
  });

  it('includes the detail annotation in the context header for selections', () => {
    const item: ContextItem = {
      type: 'selection',
      label: 'selection from src/routes/index.ts',
      content: 'router.get("/login", login);',
      detail: 'lines 12-18',
    };
    const result = buildUserMessage('What is this?', [item]);
    expect(result).toContain('[CONTEXT: selection from src/routes/index.ts (lines 12-18)]');
    expect(result).toContain('router.get("/login", login);');
  });

  it('omits detail parenthetical when detail is absent', () => {
    const item: ContextItem = {
      type: 'symbol',
      label: 'MyClass',
      content: 'class MyClass {}',
    };
    const result = buildUserMessage('Tell me about MyClass', [item]);
    expect(result).toContain('[CONTEXT: MyClass]');
    expect(result).not.toContain('(undefined)');
    expect(result).not.toContain('(null)');
  });

  it('concatenates multiple context items in order', () => {
    const items: ContextItem[] = [
      { type: 'file', label: 'a.ts', content: 'const a = 1;' },
      { type: 'file', label: 'b.ts', content: 'const b = 2;' },
    ];
    const result = buildUserMessage('Compare them', items);
    expect(result.indexOf('[CONTEXT: a.ts]')).toBeLessThan(result.indexOf('[CONTEXT: b.ts]'));
    expect(result).toContain('User message: Compare them');
  });

  it('wraps content in fenced code block', () => {
    const item: ContextItem = { type: 'file', label: 'foo.ts', content: 'const x = 1;' };
    const result = buildUserMessage('Q', [item]);
    expect(result).toContain('```\nconst x = 1;\n```');
  });
});

// ---------------------------------------------------------------------------
// buildMessagesWithContext
// ---------------------------------------------------------------------------

describe('buildMessagesWithContext', () => {
  it('appends a user message to an empty history', () => {
    const result = buildMessagesWithContext([], 'hi', []);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('hi');
  });

  it('preserves existing history and adds new message at end', () => {
    const history = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'response' },
    ];
    const result = buildMessagesWithContext(history, 'second', []);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('first');
    expect(result[2].content).toBe('second');
  });

  it('does not mutate the original history array', () => {
    const history = [{ role: 'user' as const, content: 'first' }];
    buildMessagesWithContext(history, 'second', []);
    expect(history).toHaveLength(1);
  });

  it('injects context into the new user message content', () => {
    const item: ContextItem = { type: 'file', label: 'src/foo.ts', content: 'export const x = 1;' };
    const result = buildMessagesWithContext([], 'What is x?', [item]);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    const content = result[0].content as string;
    expect(content).toContain('[CONTEXT: src/foo.ts]');
    expect(content).toContain('export const x = 1;');
    expect(content).toContain('User message: What is x?');
  });

  it('builds correct message array — no context', () => {
    const result = buildMessagesWithContext(
      [{ role: 'user' as const, content: 'prev' }],
      'next',
      []
    );
    expect(result[1]).toEqual({ role: 'user', content: 'next' });
  });
});

// ---------------------------------------------------------------------------
// buildWorkspaceSystemPrompt
// ---------------------------------------------------------------------------

describe('buildWorkspaceSystemPrompt', () => {
  const fullInfo: WorkspaceInfo = {
    projectName: 'my-app',
    root: '/workspace/my-app',
    languages: ['TypeScript', 'CSS'],
    frameworks: ['Express.js', 'React'],
    gitBranch: 'feature/auth',
    gitStatus: '2 modified',
    fileTree: 'my-app/\n└── src/',
  };

  it('starts with the [WORKSPACE] header', () => {
    expect(buildWorkspaceSystemPrompt(fullInfo)).toMatch(/^\[WORKSPACE\]/);
  });

  it('includes project name, root, languages, frameworks, git info, and file tree', () => {
    const prompt = buildWorkspaceSystemPrompt(fullInfo);
    expect(prompt).toContain('Project: my-app');
    expect(prompt).toContain('Root: /workspace/my-app');
    expect(prompt).toContain('Languages: TypeScript, CSS');
    expect(prompt).toContain('Frameworks: Express.js, React');
    expect(prompt).toContain('Git branch: feature/auth');
    expect(prompt).toContain('Git status: 2 modified');
    expect(prompt).toContain('my-app/');
    expect(prompt).toContain('└── src/');
  });

  it('omits the Languages line when the array is empty', () => {
    const info: WorkspaceInfo = { ...fullInfo, languages: [] };
    expect(buildWorkspaceSystemPrompt(info)).not.toContain('Languages:');
  });

  it('omits the Frameworks line when the array is empty', () => {
    const info: WorkspaceInfo = { ...fullInfo, frameworks: [] };
    expect(buildWorkspaceSystemPrompt(info)).not.toContain('Frameworks:');
  });

  it('includes File structure section label', () => {
    expect(buildWorkspaceSystemPrompt(fullInfo)).toContain('File structure:');
  });
});
