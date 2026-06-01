import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, InProcessEventBus } from "@helmsman/shared";
import { InMemoryRunStore } from "@helmsman/data";
import { ExecutionEngineRegistry, MockEngine } from "@helmsman/execution-engines";
import { InMemoryLearningStore } from "@helmsman/learning";
import { Orchestrator, WorkflowRegistry } from "@helmsman/core-orchestrator";
import {
  FixtureBitbucketClient,
  FixtureElkClient,
  FixtureJiraClient,
  type JiraIssue,
} from "@helmsman/integrations";
import { RepoMap } from "@helmsman/context-engine";
import { createFixBugWorkflow, type FixBugDeps } from "./fix-bug.js";

const issue: JiraIssue = {
  key: "BUG-1",
  summary: "Login fails with NullPointer",
  description: "Users hit a crash when submitting the login form.",
  status: "Open",
  labels: ["bug"],
};

function makeOrchestrator(deps: FixBugDeps) {
  const store = new InMemoryRunStore();
  const orch = new Orchestrator({
    store,
    workflows: new WorkflowRegistry().register(createFixBugWorkflow(deps)),
    engines: new ExecutionEngineRegistry().register(new MockEngine()),
    bus: new InProcessEventBus(),
    logger: createLogger("error"),
    learning: new InMemoryLearningStore(),
  });
  return { orch, store };
}

test("rich context → high confidence → opens a Bitbucket PR and comments on Jira", async () => {
  const repoDir = mkdtempSync(join(tmpdir(), "helmsman-repo-"));
  writeFileSync(join(repoDir, "LoginController.ts"), "export class LoginController { login() {} }\n");

  const jira = new FixtureJiraClient().seed(issue);
  const elk = new FixtureElkClient([
    { timestamp: "2026-06-01T00:00:00Z", level: "ERROR", message: "NullPointerException in LoginController" },
  ]);
  const bitbucket = new FixtureBitbucketClient();

  const { orch, store } = makeOrchestrator({
    jira,
    elk,
    bitbucket,
    repoRef: { project: "APP", slug: "web" },
    repo: new RepoMap(repoDir),
  });

  const { runId, status } = await orch.start("fix-bug", {
    issueKey: "BUG-1",
    logQuery: "NullPointer",
  });
  assert.equal(status, "completed");

  assert.equal(bitbucket.pullRequests.length, 1, "a PR should be opened");
  assert.equal(jira.comments.length, 1, "Jira should be commented with the PR link");
  assert.match(jira.comments[0]!.body, /pull-requests/);

  const steps = await store.listSteps(runId);
  const last = steps.at(-1)!;
  assert.equal((last.output as { status: string }).status, "pr-opened");
});

test("sparse context → low confidence → gates for human approval, no PR", async () => {
  const jira = new FixtureJiraClient().seed(issue);
  const elk = new FixtureElkClient([]); // no logs
  const bitbucket = new FixtureBitbucketClient();

  const { orch, store } = makeOrchestrator({
    jira,
    elk,
    bitbucket,
    repoRef: { project: "APP", slug: "web" },
    // no repo → no code grounding
  });

  const { runId, status } = await orch.start("fix-bug", { issueKey: "BUG-1" });
  assert.equal(status, "completed");

  assert.equal(bitbucket.pullRequests.length, 0, "no PR should be opened");
  assert.equal(jira.comments.length, 0);

  const steps = await store.listSteps(runId);
  const last = steps.at(-1)!;
  assert.equal((last.output as { status: string }).status, "pending-approval");
});

test("sparse context but human-approved → opens the PR anyway", async () => {
  const jira = new FixtureJiraClient().seed(issue);
  const elk = new FixtureElkClient([]);
  const bitbucket = new FixtureBitbucketClient();

  const { orch, store } = makeOrchestrator({
    jira,
    elk,
    bitbucket,
    repoRef: { project: "APP", slug: "web" },
  });

  const { runId, status } = await orch.start("fix-bug", { issueKey: "BUG-1", approved: true });
  assert.equal(status, "completed");
  assert.equal(bitbucket.pullRequests.length, 1, "approval should force the PR open");
  const steps = await store.listSteps(runId);
  assert.equal((steps.at(-1)!.output as { status: string }).status, "pr-opened");
});
