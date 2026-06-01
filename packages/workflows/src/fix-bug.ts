import { z } from "zod";
import type { WorkflowDefinition, StepContext } from "@helmsman/core-orchestrator";
import type {
  IBitbucketClient,
  IElkClient,
  IJiraClient,
  JiraIssue,
  RepoRef,
} from "@helmsman/integrations";
import { assembleContext, type CodeHit, type RepoMap } from "@helmsman/context-engine";
import { scoreConfidence } from "@helmsman/verification";
import type { CheckResult, Confidence } from "@helmsman/shared";
import type { LearningStore } from "@helmsman/learning";

export const FixBugInput = z.object({
  issueKey: z.string().min(1),
  /** Optional override for the ELK query; defaults to the issue summary. */
  logQuery: z.string().optional(),
});
export type FixBugInput = z.infer<typeof FixBugInput>;

export interface FixBugDeps {
  readonly jira: IJiraClient;
  readonly elk: IElkClient;
  readonly bitbucket: IBitbucketClient;
  readonly repoRef: RepoRef;
  /** Optional local checkout for grounding the fix in real code. */
  readonly repo?: RepoMap;
  readonly targetBranch?: string;
  readonly learning?: LearningStore;
  readonly approvalThreshold?: number;
}

interface FixBugSignals {
  issue?: JiraIssue;
  logCount?: number;
  codeHits?: CodeHit[];
  contextBundle?: string;
  proposal?: string;
  changedFiles?: string[];
  confidence?: Confidence;
}

function signals(ctx: StepContext): FixBugSignals {
  return ctx.signals as FixBugSignals;
}

/**
 * Flagship Phase 1 workflow: turn a Jira bug into a reviewed, human-gated pull request.
 * Steps: assemble business + runtime + code context → propose a fix via the selected engine →
 * self-verify into a calibrated confidence → open a Bitbucket PR (or gate for human approval).
 */
export function createFixBugWorkflow(deps: FixBugDeps): WorkflowDefinition {
  const targetBranch = deps.targetBranch ?? "main";

  return {
    id: "fix-bug",
    description: "Fix a Jira bug end-to-end: context → patch → verify → PR (human-gated).",
    persona: "developer",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["dev", "bug", "fix-bug"],
    steps: [
      {
        name: "assemble-context",
        checks: [
          {
            name: "issue-retrieved",
            phase: "post",
            async run(c) {
              return { passed: !!(c.signals as FixBugSignals).issue, detail: "Jira issue loaded" };
            },
          },
        ],
        async run(ctx) {
          const input = FixBugInput.parse(ctx.workflowInput);
          const s = signals(ctx);

          ctx.log(`Fetching Jira issue ${input.issueKey}`);
          s.issue = await deps.jira.getIssue(input.issueKey);

          const query = input.logQuery ?? s.issue.summary;
          ctx.log(`Searching ELK for: ${query}`);
          const logs = await deps.elk.search({ query, size: 20 });
          s.logCount = logs.length;

          let codeHits: CodeHit[] = [];
          if (deps.repo) {
            const term = s.issue.summary.split(/\s+/).find((w) => w.length > 4) ?? input.issueKey;
            ctx.log(`Grounding in code: searching for "${term}"`);
            codeHits = deps.repo.search(term, 15);
          }
          s.codeHits = codeHits;

          const lessons = deps.learning
            ? await deps.learning.retrieveLessons({ workflowId: "fix-bug", tags: ["bug"], limit: 5 })
            : [];

          s.contextBundle = assembleContext({
            issue: s.issue,
            logs,
            codeHits,
            lessons,
          });
          return { issueKey: input.issueKey, logCount: logs.length, codeHits: codeHits.length };
        },
      },
      {
        name: "propose-fix",
        checks: [
          {
            name: "proposal-produced",
            phase: "post",
            async run(c) {
              const s = c.signals as FixBugSignals;
              const passed = !!s.proposal && s.proposal.length > 0;
              return { passed, detail: passed ? "engine returned a proposal" : "no proposal" };
            },
          },
        ],
        async run(ctx) {
          const s = signals(ctx);
          ctx.log("Proposing a fix via the selected engine");
          const result = await ctx.engine.runAgenticTask({
            objective: `Fix Jira bug ${s.issue?.key}: ${s.issue?.summary}`,
            context: s.contextBundle,
            mcpServers: [],
          });
          s.proposal = result.summary;
          s.changedFiles = [...result.changedFiles];
          return { summary: result.summary, changedFiles: result.changedFiles };
        },
      },
      {
        name: "self-verify",
        async run(ctx) {
          const s = signals(ctx);
          // Self-checks feeding a calibrated confidence score.
          const checks: CheckResult[] = [
            { name: "issue-loaded", phase: "post", passed: !!s.issue, detail: "" },
            { name: "logs-found", phase: "post", passed: (s.logCount ?? 0) > 0, detail: "" },
            { name: "code-grounded", phase: "post", passed: (s.codeHits?.length ?? 0) > 0, detail: "" },
            {
              name: "proposal-nonempty",
              phase: "post",
              passed: !!s.proposal && s.proposal.length > 20,
              detail: "",
            },
            {
              name: "proposal-references-code",
              phase: "post",
              passed:
                !!s.proposal &&
                (s.codeHits ?? []).some((h) => s.proposal!.includes(h.path.split("/").pop() ?? "")),
              detail: "",
            },
          ];
          const confidence = scoreConfidence(checks, {
            approvalThreshold: deps.approvalThreshold,
          });
          s.confidence = confidence;
          ctx.log(
            `Confidence ${confidence.score.toFixed(2)} — ${confidence.requiresHumanApproval ? "human approval required" : "auto-proceed"}`,
          );
          return confidence;
        },
      },
      {
        name: "open-pr-or-gate",
        async run(ctx) {
          const s = signals(ctx);
          const input = FixBugInput.parse(ctx.workflowInput);
          const confidence = s.confidence;

          if (!confidence || confidence.requiresHumanApproval) {
            ctx.log("Low confidence → gating for human approval; no PR opened.");
            return {
              status: "pending-approval" as const,
              confidence,
              proposal: s.proposal,
            };
          }

          const branch = `fix/${input.issueKey.toLowerCase()}`;
          ctx.log(`Opening PR from ${branch} → ${targetBranch}`);
          await deps.bitbucket.createBranch(deps.repoRef, branch, targetBranch);
          const pr = await deps.bitbucket.createPullRequest(deps.repoRef, {
            title: `${input.issueKey}: ${s.issue?.summary ?? "fix"}`,
            description: `Automated fix for ${input.issueKey}.\n\n${s.proposal ?? ""}`,
            sourceBranch: branch,
            targetBranch,
          });
          await deps.jira.addComment(input.issueKey, `Opened PR: ${pr.url}`);
          return { status: "pr-opened" as const, pr, confidence };
        },
      },
    ],
  };
}
