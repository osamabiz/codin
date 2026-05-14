import * as vscode from 'vscode';
import type { PlanStep } from '../agent/types';

interface HistoryEntry {
  title: string;
  timestamp: Date;
}

// ── Tree item types ──────────────────────────────────────────────────────────

class SectionItem extends vscode.TreeItem {
  constructor(label: string, sectionId: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = sectionId;
  }
}

class CurrentTaskItem extends vscode.TreeItem {
  constructor(task: string | undefined) {
    super(task ?? 'No active task', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'currentTask';
    this.tooltip = task ? `Current task: ${task}` : 'Open the chat panel to start a task';
  }
}

class PlanStepItem extends vscode.TreeItem {
  constructor(step: PlanStep) {
    const icon = { pending: '⬜', active: '🔄', done: '✅', failed: '❌' }[step.status];
    super(`${icon}  ${step.index}. ${step.description}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'planStep';
    if (step.toolHint) {
      this.tooltip = `Tool hint: ${step.toolHint}`;
    }
  }
}

class HistoryEntryItem extends vscode.TreeItem {
  constructor(entry: HistoryEntry) {
    super(`• ${entry.title}`, vscode.TreeItemCollapsibleState.None);
    this.description = formatRelativeTime(entry.timestamp);
    this.contextValue = 'historyEntry';
    this.tooltip = entry.timestamp.toLocaleString();
  }
}

class PlaceholderItem extends vscode.TreeItem {
  constructor(text: string) {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'placeholder';
  }
}

type SidebarItem =
  | SectionItem
  | CurrentTaskItem
  | PlanStepItem
  | HistoryEntryItem
  | PlaceholderItem;

// ── Provider ─────────────────────────────────────────────────────────────────

export class SidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SidebarItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<SidebarItem | undefined> =
    this._onDidChangeTreeData.event;

  private _currentTask: string | undefined;
  private _steps: PlanStep[] = [];
  private _history: HistoryEntry[] = [];

  // ── Called from ChatPanel ─────────────────────────────────────────────────

  setPlan(taskSummary: string, steps: PlanStep[]): void {
    this._currentTask = taskSummary;
    this._steps = steps.map((s) => ({ ...s, status: 'pending' as const }));
    this._refresh();
  }

  setStepActive(stepIndex: number): void {
    for (const s of this._steps) {
      if (s.index === stepIndex) s.status = 'active';
    }
    this._refresh();
  }

  setStepDone(stepIndex: number): void {
    for (const s of this._steps) {
      if (s.index === stepIndex) s.status = 'done';
    }
    this._refresh();
  }

  setStepFailed(stepIndex: number): void {
    for (const s of this._steps) {
      if (s.index === stepIndex) s.status = 'failed';
    }
    this._refresh();
  }

  completeTask(): void {
    if (this._currentTask) {
      this._history.unshift({ title: this._currentTask, timestamp: new Date() });
      if (this._history.length > 10) this._history.pop();
    }
    this._currentTask = undefined;
    this._steps = [];
    this._refresh();
  }

  // ── TreeDataProvider ──────────────────────────────────────────────────────

  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarItem): SidebarItem[] {
    if (!element) {
      return [
        new SectionItem('📋 Current Task', 'section-task'),
        new SectionItem('📝 Plan', 'section-plan'),
        new SectionItem('📜 History', 'section-history'),
      ];
    }

    if (element.contextValue === 'section-task') {
      return [new CurrentTaskItem(this._currentTask)];
    }

    if (element.contextValue === 'section-plan') {
      if (this._steps.length === 0) {
        return [new PlaceholderItem('No active plan')];
      }
      return this._steps.map((s) => new PlanStepItem(s));
    }

    if (element.contextValue === 'section-history') {
      if (this._history.length === 0) {
        return [new PlaceholderItem('Your completed tasks will appear here')];
      }
      return this._history.map((h) => new HistoryEntryItem(h));
    }

    return [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
