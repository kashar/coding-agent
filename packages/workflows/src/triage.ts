import { z } from "zod";
import type { WorkflowDefinition } from "@helmsman/core-orchestrator";
import type { ElkLogEntry, IElkClient, IJiraClient, JiraIssue } from "@helmsman/integrations";

export const TriageInput = z.object({ issueKey: z.string().min(1) });
export type TriageInput = z.infer<typeof TriageInput>;

export interface TriageDeps {
  readonly jira: IJiraClient;
  readonly elk: IElkClient;
}

interface TriageSignals {
  issue?: JiraIssue;
  logs?: ElkLogEntry[];
  severity?: string;
  category?: string;
}

const ERROR_SIGNALS = /(exception|error|fatal|timeout|npe|nullpointer)/i;

/** Support/QA workflow: classify and route an incoming issue using Jira + ELK signals. */
export function createTriageWorkflow(deps: TriageDeps): WorkflowDefinition {
  return {
    id: "triage",
    description: "Classify and route a Jira issue using business + runtime signals.",
    persona: "support",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["support", "qa", "triage"],
    steps: [
      {
        name: "gather-signals",
        checks: [
          {
            name: "issue-loaded",
            phase: "post",
            async run(c) {
              return { passed: !!(c.signals as TriageSignals).issue, detail: "" };
            },
          },
        ],
        async run(ctx) {
          const input = TriageInput.parse(ctx.workflowInput);
          const s = ctx.signals as TriageSignals;
          s.issue = await deps.jira.getIssue(input.issueKey);
          // Query logs by the most salient term (whole summaries rarely appear verbatim in logs).
          const term =
            s.issue.summary
              .split(/\s+/)
              .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
              .sort((a, b) => b.length - a.length)[0] ?? input.issueKey;
          s.logs = await deps.elk.search({ query: term, size: 50 });
          return { key: input.issueKey, logCount: s.logs.length };
        },
      },
      {
        name: "classify",
        async run(ctx) {
          const s = ctx.signals as TriageSignals;
          const text = `${s.issue?.summary ?? ""} ${(s.logs ?? []).map((l) => l.message).join(" ")}`;
          const hasErrors = (s.logs ?? []).some((l) => ERROR_SIGNALS.test(`${l.level} ${l.message}`));
          s.severity = hasErrors ? "high" : ERROR_SIGNALS.test(text) ? "medium" : "low";
          s.category =
            s.issue?.labels.find((l) => l !== "bug") ?? (ERROR_SIGNALS.test(text) ? "defect" : "request");
          ctx.log(`Classified ${s.issue?.key}: severity=${s.severity} category=${s.category}`);
          return { severity: s.severity, category: s.category };
        },
      },
      {
        name: "annotate",
        async run(ctx) {
          const s = ctx.signals as TriageSignals;
          const input = TriageInput.parse(ctx.workflowInput);
          const comment = `Triage — severity: ${s.severity}, category: ${s.category}, signals: ${s.logs?.length ?? 0} log lines.`;
          await deps.jira.addComment(input.issueKey, comment);
          return { severity: s.severity, category: s.category, annotated: true };
        },
      },
    ],
  };
}
