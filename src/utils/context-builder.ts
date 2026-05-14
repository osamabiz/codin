import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import type { Message } from '../providers/types';

export type ContextItemType = 'file' | 'selection' | 'symbol';

export interface ContextItem {
  type: ContextItemType;
  label: string;
  content: string;
  detail?: string; // e.g. "lines 12-18" for selections
}

/**
 * Formats a single user message with context items prepended.
 * Format matches docs/phases/phase-2-code-context.md spec.
 */
export function buildUserMessage(userText: string, contextItems: ContextItem[]): string {
  if (contextItems.length === 0) return userText;

  const parts: string[] = contextItems.map((item) => {
    const header = item.detail ? `${item.label} (${item.detail})` : item.label;
    return `[CONTEXT: ${header}]\n\`\`\`\n${item.content}\n\`\`\``;
  });

  parts.push(`User message: ${userText}`);
  return parts.join('\n\n');
}

/**
 * Appends a new user message (with injected context) to the history array.
 * Returns a new array — does not mutate the input.
 */
export function buildMessagesWithContext(
  history: Message[],
  userText: string,
  contextItems: ContextItem[]
): Message[] {
  return [...history, { role: 'user' as const, content: buildUserMessage(userText, contextItems) }];
}

// ---------------------------------------------------------------------------
// Workspace snapshot
// ---------------------------------------------------------------------------

export interface WorkspaceInfo {
  projectName: string;
  root: string;
  languages: string[];
  frameworks: string[];
  gitBranch: string;
  gitStatus: string;
  fileTree: string;
}

function detectLanguagesAndFrameworks(root: string): {
  languages: string[];
  frameworks: string[];
} {
  const languages = new Set<string>();
  const frameworks = new Set<string>();

  const langIndicators: Array<{ file: string; lang: string }> = [
    { file: 'tsconfig.json', lang: 'TypeScript' },
    { file: 'package.json', lang: 'JavaScript/TypeScript' },
    { file: 'requirements.txt', lang: 'Python' },
    { file: 'setup.py', lang: 'Python' },
    { file: 'Cargo.toml', lang: 'Rust' },
    { file: 'go.mod', lang: 'Go' },
    { file: 'pom.xml', lang: 'Java' },
    { file: 'build.gradle', lang: 'Java/Kotlin' },
    { file: 'Gemfile', lang: 'Ruby' },
    { file: 'composer.json', lang: 'PHP' },
  ];

  for (const { file, lang } of langIndicators) {
    if (fs.existsSync(path.join(root, file))) {
      languages.add(lang);
    }
  }

  // Detect frameworks from package.json deps
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const frameworkMap: Record<string, string> = {
        react: 'React',
        vue: 'Vue.js',
        '@angular/core': 'Angular',
        express: 'Express.js',
        fastify: 'Fastify',
        next: 'Next.js',
        nuxt: 'Nuxt.js',
        svelte: 'Svelte',
        vite: 'Vite',
        webpack: 'webpack',
      };
      for (const [dep, name] of Object.entries(frameworkMap)) {
        if (dep in deps) frameworks.add(name);
      }
    } catch {
      // Unparseable package.json — ignore
    }
  }

  return { languages: [...languages], frameworks: [...frameworks] };
}

function getGitInfo(root: string): { branch: string; status: string } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    const statusOut = execSync('git status --porcelain', {
      cwd: root,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    const lines = statusOut ? statusOut.split('\n').filter(Boolean) : [];
    const modified = lines.filter((l) => l.startsWith(' M') || l.startsWith('M ')).length;
    const untracked = lines.filter((l) => l.startsWith('??')).length;

    const parts: string[] = [];
    if (modified > 0) parts.push(`${modified} modified`);
    if (untracked > 0) parts.push(`${untracked} untracked`);

    return { branch, status: parts.length > 0 ? parts.join(', ') : 'clean' };
  } catch {
    return { branch: 'unknown', status: 'git not available' };
  }
}

const ALWAYS_IGNORED = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
]);

function loadGitignoreNames(root: string): Set<string> {
  const names = new Set<string>();
  try {
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    for (const raw of gi.split('\n')) {
      const line = raw.trim();
      if (line && !line.startsWith('#') && !line.includes('/')) {
        names.add(line.replace(/\/$/, ''));
      }
    }
  } catch {
    // No .gitignore — that's fine
  }
  return names;
}

function buildFileTree(root: string, maxDepth: number = 2): string {
  const gitignored = loadGitignoreNames(root);

  function walk(dir: string, depth: number, prefix: string): string {
    if (depth > maxDepth) return '';
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return '';
    }
    const visible = entries.filter(
      (e) => !e.name.startsWith('.') && !ALWAYS_IGNORED.has(e.name) && !gitignored.has(e.name)
    );

    return visible
      .map((entry, idx) => {
        const isLast = idx === visible.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';
        const line = prefix + connector + entry.name + (entry.isDirectory() ? '/' : '');
        const subtree =
          entry.isDirectory() && depth < maxDepth
            ? walk(path.join(dir, entry.name), depth + 1, prefix + childPrefix)
            : '';
        return subtree ? `${line}\n${subtree}` : line;
      })
      .join('\n');
  }

  const rootName = path.basename(root);
  const tree = walk(root, 1, '');
  return tree ? `${rootName}/\n${tree}` : `${rootName}/\n(empty)`;
}

export function gatherWorkspaceInfo(root: string): WorkspaceInfo {
  const { languages, frameworks } = detectLanguagesAndFrameworks(root);
  const { branch, status } = getGitInfo(root);
  return {
    projectName: path.basename(root),
    root,
    languages,
    frameworks,
    gitBranch: branch,
    gitStatus: status,
    fileTree: buildFileTree(root, 2),
  };
}

export function buildWorkspaceSystemPrompt(info: WorkspaceInfo): string {
  const lines = [
    '[WORKSPACE]',
    `Project: ${info.projectName}`,
    `Root: ${info.root}`,
  ];
  if (info.languages.length > 0) lines.push(`Languages: ${info.languages.join(', ')}`);
  if (info.frameworks.length > 0) lines.push(`Frameworks: ${info.frameworks.join(', ')}`);
  lines.push(`Git branch: ${info.gitBranch}`);
  lines.push(`Git status: ${info.gitStatus}`);
  lines.push('', 'File structure:', info.fileTree);
  return lines.join('\n');
}
