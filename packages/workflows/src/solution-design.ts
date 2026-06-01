import { z } from "zod";
import type { WorkflowDefinition } from "@helmsman/core-orchestrator";
import type { ConfluencePage, IConfluenceClient, IJiraClient, JiraIssue } from "@helmsman/integrations";

export const SolutionDesignInput = z.object({
  title: z.string().min(1),
  /** Optional Confluence page with the requirement/spec to design against. */
  sourcePageId: z.string().optional(),
  /** Optional Jira issue providing the requirement. */
  issueKey: z.string().optional(),
  /** When set with a Confluence client, publish the design here. */
  spaceKey: z.string().optional(),
});
export type SolutionDesignInput = z.infer<typeof SolutionDesignInput>;

export interface SolutionDesignDeps {
  readonly confluence: IConfluenceClient;
  readonly jira?: IJiraClient;
}

interface DesignSignals {
  spec?: ConfluencePage;
  issue?: JiraIssue;
  design?: string;
}

/**
 * Architect/BA workflow: produce a solution design from a Confluence spec and/or Jira issue,
 * then optionally publish it back to Confluence (gated on a target space being provided).
 */
export function createSolutionDesignWorkflow(deps: SolutionDesignDeps): WorkflowDefinition {
  return {
    id: "solution-design",
    description: "Draft a solution design from a spec/issue and optionally publish to Confluence.",
    persona: "architect",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["architect", "ba", "design"],
    steps: [
      {
        name: "gather-requirements",
        async run(ctx) {
          const input = SolutionDesignInput.parse(ctx.workflowInput);
          const s = ctx.signals as DesignSignals;
          if (input.sourcePageId) s.spec = await deps.confluence.getPage(input.sourcePageId);
          if (input.issueKey && deps.jira) s.issue = await deps.jira.getIssue(input.issueKey);
          return { hasSpec: !!s.spec, hasIssue: !!s.issue };
        },
      },
      {
        name: "draft-design",
        checks: [
          {
            name: "design-produced",
            phase: "post",
            async run(c) {
              const s = c.signals as DesignSignals;
              return { passed: !!s.design && s.design.length > 50, detail: "" };
            },
          },
        ],
        async run(ctx) {
          const input = SolutionDesignInput.parse(ctx.workflowInput);
          const s = ctx.signals as DesignSignals;
          const context = [s.spec?.body, s.issue ? `${s.issue.key}: ${s.issue.summary}\n${s.issue.description}` : ""]
            .filter(Boolean)
            .join("\n\n");
          const narrative = await ctx.engine.complete({
            prompt: `Produce a solution design for "${input.title}".`,
            context,
          });
          // Deterministic, structured skeleton grounded by the engine narrative.
          s.design = [
            `# ${input.title}`,
            `## Context`,
            context || "(no source spec/issue provided)",
            `## Proposed approach`,
            narrative.text,
            `## Risks & alternatives`,
            `- Document trade-offs and rejected options here.`,
          ].join("\n\n");
          return { length: s.design.length };
        },
      },
      {
        name: "publish-or-return",
        async run(ctx) {
          const input = SolutionDesignInput.parse(ctx.workflowInput);
          const s = ctx.signals as DesignSignals;
          if (input.spaceKey) {
            const page = await deps.confluence.createPage({
              spaceKey: input.spaceKey,
              title: input.title,
              body: s.design ?? "",
            });
            return { status: "published" as const, pageId: page.id, url: page.url };
          }
          return { status: "drafted" as const, design: s.design };
        },
      },
    ],
  };
}
