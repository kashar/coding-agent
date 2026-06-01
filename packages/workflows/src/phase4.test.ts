import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, InProcessEventBus } from "@helmsman/shared";
import { InMemoryRunStore } from "@helmsman/data";
import { ExecutionEngineRegistry, MockEngine } from "@helmsman/execution-engines";
import { InMemoryLearningStore } from "@helmsman/learning";
import { Orchestrator, WorkflowRegistry, type WorkflowDefinition } from "@helmsman/core-orchestrator";
import { FixtureConfluenceClient, FixtureJiraClient, type JiraIssue } from "@helmsman/integrations";
import { RepoMap } from "@helmsman/context-engine";
import { createSolutionDesignWorkflow } from "./solution-design.js";
import { createBusinessAnalysisWorkflow } from "./business-analysis.js";

async function runWorkflow(def: WorkflowDefinition, input: unknown) {
  const store = new InMemoryRunStore();
  const orch = new Orchestrator({
    store,
    workflows: new WorkflowRegistry().register(def),
    engines: new ExecutionEngineRegistry().register(new MockEngine()),
    bus: new InProcessEventBus(),
    logger: createLogger("error"),
    learning: new InMemoryLearningStore(),
  });
  const { runId, status } = await orch.start(def.id, input);
  const steps = await store.listSteps(runId);
  return { status, last: steps.at(-1)! };
}

test("solution-design: drafts from a spec and publishes to Confluence", async () => {
  const confluence = new FixtureConfluenceClient().seed({
    id: "SPEC-1",
    title: "Auth spec",
    body: "Sessions must expire after 30 minutes of inactivity.",
    spaceKey: "ENG",
  });
  const { status, last } = await runWorkflow(createSolutionDesignWorkflow({ confluence }), {
    title: "Session expiry design",
    sourcePageId: "SPEC-1",
    spaceKey: "ARCH",
  });
  assert.equal(status, "completed");
  assert.equal((last.output as { status: string }).status, "published");
  assert.equal(confluence.createdPages.length, 1);
});

test("business-analysis: reports coverage gaps and comments on the issue", async () => {
  const issue: JiraIssue = {
    key: "REQ-1",
    summary: "Audit logging",
    description: "- The system must record every PaymentRefund event\n- Must support GraphQL queries",
    status: "Open",
    labels: [],
  };
  const jira = new FixtureJiraClient().seed(issue);

  const dir = mkdtempSync(join(tmpdir(), "helmsman-ba-"));
  // Code covers "PaymentRefund" but not "GraphQL" → exactly one gap expected.
  writeFileSync(join(dir, "refund.ts"), "export function PaymentRefund() {}\n");

  const { status, last } = await runWorkflow(
    createBusinessAnalysisWorkflow({ jira, repo: new RepoMap(dir) }),
    { issueKey: "REQ-1" },
  );
  assert.equal(status, "completed");
  const out = last.output as { total: number; gaps: string[] };
  assert.ok(out.total >= 2);
  assert.ok(out.gaps.some((g) => /GraphQL/.test(g)), "GraphQL requirement should be an uncovered gap");
  assert.ok(!out.gaps.some((g) => /PaymentRefund/.test(g)), "PaymentRefund is covered in code");
  assert.equal(jira.comments.length, 1);
});
