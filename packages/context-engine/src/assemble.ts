import type { ElkLogEntry, JiraIssue } from "@helmsman/integrations";
import type { Lesson } from "@helmsman/learning";

export interface CodeHit {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

export interface ContextInputs {
  readonly issue?: JiraIssue;
  readonly logs?: readonly ElkLogEntry[];
  readonly codeHits?: readonly CodeHit[];
  readonly lessons?: readonly Lesson[];
  /** Approximate character budget for the assembled bundle. */
  readonly charBudget?: number;
}

/**
 * Assemble a ranked, budget-bounded context bundle handed to the execution engine. Order reflects
 * priority: business context (Jira) → learned lessons → runtime signals (ELK) → grounded code.
 */
export function assembleContext(inputs: ContextInputs): string {
  const budget = inputs.charBudget ?? 12_000;
  const sections: string[] = [];

  if (inputs.issue) {
    const i = inputs.issue;
    sections.push(
      `## Jira ${i.key} [${i.status}]\n${i.summary}\n\n${i.description}` +
        (i.labels.length ? `\nLabels: ${i.labels.join(", ")}` : ""),
    );
  }

  if (inputs.lessons?.length) {
    sections.push(
      `## Lessons from past runs\n` + inputs.lessons.map((l) => `- ${l.text}`).join("\n"),
    );
  }

  if (inputs.logs?.length) {
    sections.push(
      `## Relevant logs (ELK)\n` +
        inputs.logs
          .slice(0, 20)
          .map((l) => `[${l.timestamp}] ${l.level} ${l.service ?? ""} ${l.message}`.trim())
          .join("\n"),
    );
  }

  if (inputs.codeHits?.length) {
    sections.push(
      `## Code references\n` +
        inputs.codeHits.map((h) => `${h.path}:${h.line}: ${h.text}`).join("\n"),
    );
  }

  // Greedily include whole sections until the budget is exhausted.
  const bundle: string[] = [];
  let used = 0;
  for (const s of sections) {
    if (used + s.length > budget) {
      const remaining = budget - used;
      if (remaining > 200) bundle.push(s.slice(0, remaining) + "\n…[truncated]");
      break;
    }
    bundle.push(s);
    used += s.length;
  }
  return bundle.join("\n\n");
}
