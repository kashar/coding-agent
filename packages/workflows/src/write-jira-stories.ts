import { z } from "zod";
import type { WorkflowDefinition } from "@helmsman/core-orchestrator";
import type { ConfluencePage, IConfluenceClient, IJiraClient, JiraIssue } from "@helmsman/integrations";

export const WriteStoriesInput = z.object({
  pageId: z.string().min(1),
  projectKey: z.string().min(1),
});
export type WriteStoriesInput = z.infer<typeof WriteStoriesInput>;

export interface WriteStoriesDeps {
  readonly confluence: IConfluenceClient;
  readonly jira: IJiraClient;
  /** Max stories to create in one run (safety cap on a write workflow). */
  readonly maxStories?: number;
}

interface StorySignals {
  spec?: ConfluencePage;
  drafts?: string[];
  created?: JiraIssue[];
}

/** Extract candidate requirements (bullets / "must|should|shall" sentences) from spec text. */
function extractRequirements(body: string): string[] {
  const out: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^[-*]\s+/.test(line)) out.push(line.replace(/^[-*]\s+/, ""));
  }
  for (const sentence of body.split(/(?<=[.!?])\s+/)) {
    const s = sentence.trim();
    if (/\b(must|should|shall)\b/i.test(s) && s.length > 12) out.push(s);
  }
  // De-duplicate while preserving order.
  return [...new Set(out.map((s) => s.replace(/\s+/g, " ").trim()))].filter(Boolean);
}

/**
 * BA workflow: turn a Confluence spec into well-formed Jira stories. Writing to Jira is gated —
 * if no requirements are found, it produces drafts for human review instead of creating issues.
 */
export function createWriteStoriesWorkflow(deps: WriteStoriesDeps): WorkflowDefinition {
  const maxStories = deps.maxStories ?? 10;
  return {
    id: "write-jira-stories",
    description: "Turn a Confluence spec into well-formed Jira stories (gated write).",
    persona: "analyst",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["ba", "analyst", "stories"],
    steps: [
      {
        name: "fetch-spec",
        checks: [
          {
            name: "spec-loaded",
            phase: "post",
            async run(c) {
              return { passed: !!(c.signals as StorySignals).spec, detail: "" };
            },
          },
        ],
        async run(ctx) {
          const input = WriteStoriesInput.parse(ctx.workflowInput);
          const s = ctx.signals as StorySignals;
          ctx.log(`Fetching Confluence page ${input.pageId}`);
          s.spec = await deps.confluence.getPage(input.pageId);
          return { title: s.spec.title, length: s.spec.body.length };
        },
      },
      {
        name: "draft-stories",
        async run(ctx) {
          const s = ctx.signals as StorySignals;
          s.drafts = extractRequirements(s.spec?.body ?? "").slice(0, maxStories);
          // Engine refines the framing; the deterministic extraction keeps runs grounded/testable.
          await ctx.engine.complete({
            prompt: `Refine these into user stories with acceptance criteria:\n${s.drafts.join("\n")}`,
          });
          ctx.log(`Drafted ${s.drafts.length} candidate stories`);
          return { drafts: s.drafts };
        },
      },
      {
        name: "create-or-gate",
        async run(ctx) {
          const input = WriteStoriesInput.parse(ctx.workflowInput);
          const s = ctx.signals as StorySignals;
          const drafts = s.drafts ?? [];
          if (drafts.length === 0) {
            ctx.log("No requirements extracted → gating for human review; no issues created.");
            return { status: "pending-review" as const, drafts };
          }
          const created: JiraIssue[] = [];
          for (const summary of drafts) {
            created.push(
              await deps.jira.createIssue({
                projectKey: input.projectKey,
                summary: summary.slice(0, 240),
                description: `Generated from Confluence page ${input.pageId} (${s.spec?.title ?? ""}).`,
                issueType: "Story",
                labels: ["generated"],
              }),
            );
          }
          s.created = created;
          return { status: "created" as const, keys: created.map((i) => i.key) };
        },
      },
    ],
  };
}
