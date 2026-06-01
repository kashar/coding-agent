import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, InProcessEventBus } from "@helmsman/shared";
import { InMemoryRunStore } from "@helmsman/data";
import { ExecutionEngineRegistry, MockEngine } from "@helmsman/execution-engines";
import { InMemoryLearningStore } from "@helmsman/learning";
import { Orchestrator, WorkflowRegistry, type WorkflowDefinition } from "@helmsman/core-orchestrator";
import {
  FixtureConfluenceClient,
  FixtureElkClient,
  FixtureJiraClient,
  type JiraIssue,
} from "@helmsman/integrations";
import { RepoMap } from "@helmsman/context-engine";
import { createTraceRequestWorkflow } from "./trace-request.js";
import { createTriageWorkflow } from "./triage.js";
import { createWriteStoriesWorkflow } from "./write-jira-stories.js";
import { createArchitectureDiagramWorkflow } from "./architecture-diagram.js";

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
  return { status, steps, last: steps.at(-1)! };
}

const issue: JiraIssue = {
  key: "OPS-1",
  summary: "Checkout throws NullPointer",
  description: "intermittent",
  status: "Open",
  labels: ["bug", "payments"],
};

test("trace-request: correlates logs across services", async () => {
  const elk = new FixtureElkClient([
    { timestamp: "2026-06-01T00:00:01Z", level: "INFO", message: "req=abc123 GET /checkout", service: "web" },
    { timestamp: "2026-06-01T00:00:02Z", level: "ERROR", message: "req=abc123 db timeout", service: "db" },
  ]);
  const { status, last } = await runWorkflow(createTraceRequestWorkflow({ elk }), {
    correlationId: "abc123",
  });
  assert.equal(status, "completed");
  const out = last.output as { services: string[]; eventCount: number };
  assert.deepEqual(new Set(out.services), new Set(["web", "db"]));
  assert.equal(out.eventCount, 2);
});

test("triage: classifies high severity on error signals and comments", async () => {
  const jira = new FixtureJiraClient().seed(issue);
  const elk = new FixtureElkClient([
    { timestamp: "2026-06-01T00:00:00Z", level: "ERROR", message: "NullPointerException in CheckoutService" },
  ]);
  const { status, last } = await runWorkflow(createTriageWorkflow({ jira, elk }), {
    issueKey: "OPS-1",
  });
  assert.equal(status, "completed");
  assert.equal((last.output as { severity: string }).severity, "high");
  assert.equal(jira.comments.length, 1);
});

test("write-jira-stories: extracts requirements and creates stories", async () => {
  const confluence = new FixtureConfluenceClient().seed({
    id: "PAGE-1",
    title: "Payments Spec",
    body: "- Support refunds\n- Allow partial captures\nThe system must log every transaction.",
    spaceKey: "PAY",
  });
  const jira = new FixtureJiraClient();
  const { status, last } = await runWorkflow(
    createWriteStoriesWorkflow({ confluence, jira }),
    { pageId: "PAGE-1", projectKey: "PAY" },
  );
  assert.equal(status, "completed");
  const out = last.output as { status: string; keys: string[] };
  assert.equal(out.status, "created");
  assert.equal(out.keys.length, 3);
  assert.equal(jira.created.length, 3);
});

test("architecture-diagram: generates mermaid and publishes to Confluence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "helmsman-arch-"));
  mkdirSync(join(dir, "api"));
  mkdirSync(join(dir, "core"));
  writeFileSync(join(dir, "api", "server.ts"), "export const x = 1;\n");
  writeFileSync(join(dir, "core", "engine.ts"), "export const y = 2;\n");

  const confluence = new FixtureConfluenceClient();
  const { status, last } = await runWorkflow(
    createArchitectureDiagramWorkflow({ repo: new RepoMap(dir), confluence }),
    { title: "Sys", spaceKey: "ARCH" },
  );
  assert.equal(status, "completed");
  const out = last.output as { status: string; pageId?: string };
  assert.equal(out.status, "published");
  assert.equal(confluence.createdPages.length, 1);
});
