import * as fs from 'fs';
import type { Message } from '../providers/types';
import type { ILLMProvider, ChatOptions } from '../providers/types';
import { estimateTokensForMessages, getContextLimit } from '../utils/token-counter';

export interface WorkspaceSnapshot {
  name: string;
  root: string;
  languages: string[];
  frameworks: string[];
  gitBranch?: string;
  gitStatus?: string;
}

export class AgentMemory {
  messages: Message[] = [];
  workspaceSnapshot: WorkspaceSnapshot = {
    name: '',
    root: '',
    languages: [],
    frameworks: [],
  };

  append(message: Message): void {
    this.messages.push(message);
  }

  get tokenCount(): number {
    return estimateTokensForMessages(this.messages);
  }

  shouldSummarize(modelId: string): boolean {
    const limit = getContextLimit(modelId);
    return this.tokenCount / limit >= 0.8;
  }

  async summarizeOldest(provider: ILLMProvider, modelId: string): Promise<void> {
    const cutoff = Math.max(1, Math.floor(this.messages.length * 0.3));
    const toSummarize = this.messages.slice(0, cutoff);

    const summaryOptions: ChatOptions = {
      model: modelId,
      maxTokens: 512,
      temperature: 0,
      systemPrompt:
        'Summarize the following conversation messages in 3-5 sentences, preserving key facts and decisions.',
    };

    let summaryText = '';
    try {
      for await (const chunk of provider.chat(
        [{ role: 'user', content: JSON.stringify(toSummarize) }],
        summaryOptions
      )) {
        if (chunk.type === 'token') summaryText += chunk.content;
      }
    } catch {
      return;
    }

    if (!summaryText) return;

    const summaryMessage: Message = {
      role: 'user',
      content: `[Context summary of earlier messages] ${summaryText}`,
    };
    this.messages.splice(0, cutoff, summaryMessage);
  }

  trim(maxTokens: number): void {
    const targetChars = maxTokens * 4;
    const charLen = (m: Message): number =>
      typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;

    let totalChars = this.messages.reduce((acc, m) => acc + charLen(m), 0);

    while (totalChars > targetChars && this.messages.length > 2) {
      const removed = this.messages.shift()!;
      totalChars -= charLen(removed);
    }
  }

  toJSON(): string {
    return JSON.stringify({
      messages: this.messages,
      workspaceSnapshot: this.workspaceSnapshot,
    });
  }

  async saveToFile(filePath: string): Promise<void> {
    await fs.promises.writeFile(filePath, this.toJSON(), 'utf-8');
  }

  static async loadFromFile(filePath: string): Promise<AgentMemory | null> {
    try {
      const json = await fs.promises.readFile(filePath, 'utf-8');
      return AgentMemory.fromJSON(json);
    } catch {
      return null;
    }
  }

  static fromJSON(json: string): AgentMemory {
    const data = JSON.parse(json) as {
      messages: Message[];
      workspaceSnapshot: WorkspaceSnapshot;
    };
    const mem = new AgentMemory();
    mem.messages = data.messages ?? [];
    mem.workspaceSnapshot = data.workspaceSnapshot ?? {
      name: '',
      root: '',
      languages: [],
      frameworks: [],
    };
    return mem;
  }
}
