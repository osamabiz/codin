import type { ILLMProvider, ChatOptions } from '../providers/types';
import type { PlanStep } from './types';

interface RawPlanStep {
  id: number;
  description: string;
  toolHint?: string;
}

interface RawPlan {
  taskSummary: string;
  steps: RawPlanStep[];
}

const PLANNER_SYSTEM_PROMPT = `Before taking any action, output a plan as a JSON object and nothing else:
{
  "taskSummary": "one-line description of what you will do",
  "steps": [
    { "id": 1, "description": "Read src/auth.ts to understand current state", "toolHint": "read_file" },
    { "id": 2, "description": "Install jsonwebtoken package", "toolHint": "run_command" }
  ]
}
Output ONLY the JSON object. No markdown fences, no explanation, no other text.`;

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function parsePlan(text: string): RawPlan | null {
  try {
    const clean = stripFences(text.trim());
    const parsed = JSON.parse(clean) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('steps' in parsed) ||
      !Array.isArray((parsed as RawPlan).steps)
    ) {
      return null;
    }
    return parsed as RawPlan;
  } catch {
    return null;
  }
}

export async function createPlan(
  task: string,
  provider: ILLMProvider,
  model: string
): Promise<{ taskSummary: string; steps: PlanStep[] } | null> {
  const options: ChatOptions = {
    model,
    maxTokens: 1024,
    temperature: 0,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let text = '';

    for await (const chunk of provider.chat([{ role: 'user', content: task }], options)) {
      if (chunk.type === 'token') {
        text += chunk.content;
      } else if (chunk.type === 'error') {
        return null;
      }
    }

    const raw = parsePlan(text);
    if (raw && raw.steps.length > 0) {
      return {
        taskSummary: raw.taskSummary ?? task,
        steps: raw.steps.map((s, i) => ({
          index: s.id ?? i + 1,
          description: s.description,
          toolHint: s.toolHint,
          status: 'pending' as const,
        })),
      };
    }
  }

  return null;
}
