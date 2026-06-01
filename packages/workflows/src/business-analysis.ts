import { z } from "zod";
import type { WorkflowDefinition } from "@helmsman/core-orchestrator";
import type { IJiraClient, JiraIssue } from "@helmsman/integrations";
import type { RepoMap } from "@helmsman/context-engine";

export const BusinessAnalysisInput = z.object({ issueKey: z.string().min(1) });
export type BusinessAnalysisInput = z.infer<typeof BusinessAnalysisInput>;

export interface BusinessAnalysisDeps {
  readonly jira: IJiraClient;
  readonly repo?: RepoMap;
}

interface BaSignals {
  issue?: JiraIssue;
  requirements?: string[];
  gaps?: string[];
}

/** Split an issue description into atomic requirement statements. */
function extractRequirements(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*]\s+/, "");
    if (line.length > 8 && /[a-z]/i.test(line)) out.push(line);
  }
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const s = sentence.trim();
    if (/\b(must|should|shall|need|require)\b/i.test(s) && s.length > 12) out.push(s);
  }
  return [...new Set(out.map((s) => s.replace(/\s+/g, " ").trim()))].filter(Boolean);
}

/**
 * BA workflow: analyse a requirement against the codebase, surfacing coverage gaps. For each
 * requirement, it checks whether a salient term already appears in the code and reports the gaps.
 */
export function createBusinessAnalysisWorkflow(deps: BusinessAnalysisDeps): WorkflowDefinition {
  return {
    id: "business-analysis",
    description: "Analyse a requirement vs the codebase and surface coverage gaps.",
    persona: "analyst",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["ba", "analyst", "analysis"],
    steps: [
      {
        name: "gather",
        checks: [
          {
            name: "issue-loaded",
            phase: "post",
            async run(c) {
              return { passed: !!(c.signals as BaSignals).issue, detail: "" };
            },
          },
        ],
        async run(ctx) {
          const input = BusinessAnalysisInput.parse(ctx.workflowInput);
          const s = ctx.signals as BaSignals;
          s.issue = await deps.jira.getIssue(input.issueKey);
          s.requirements = extractRequirements(`${s.issue.summary}\n${s.issue.description}`);
          return { requirements: s.requirements.length };
        },
      },
      {
        name: "analyse-gaps",
        async run(ctx) {
          const s = ctx.signals as BaSignals;
          const gaps: string[] = [];
          for (const req of s.requirements ?? []) {
            const term = req
              .split(/\s+/)
              .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
              .filter((w) => w.length > 4)
              .sort((a, b) => b.length - a.length)[0];
            const covered = term && deps.repo ? deps.repo.search(term, 1).length > 0 : false;
            if (!covered) gaps.push(req);
          }
          s.gaps = gaps;
          await ctx.engine.complete({
            prompt: `Assess these unmet requirements and suggest next steps:\n${gaps.join("\n")}`,
          });
          ctx.log(`${gaps.length}/${s.requirements?.length ?? 0} requirements appear uncovered`);
          return { total: s.requirements?.length ?? 0, gaps: gaps.length };
        },
      },
      {
        name: "report",
        async run(ctx) {
          const input = BusinessAnalysisInput.parse(ctx.workflowInput);
          const s = ctx.signals as BaSignals;
          const body =
            `BA analysis: ${s.gaps?.length ?? 0} of ${s.requirements?.length ?? 0} requirements appear uncovered in code.` +
            (s.gaps?.length ? `\nGaps:\n- ${s.gaps.join("\n- ")}` : "");
          await deps.jira.addComment(input.issueKey, body);
          return { total: s.requirements?.length ?? 0, gaps: s.gaps ?? [] };
        },
      },
    ],
  };
}
