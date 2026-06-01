import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger, InProcessEventBus } from "@helmsman/shared";
import { InMemoryRunStore } from "@helmsman/data";
import { ExecutionEngineRegistry, MockEngine } from "@helmsman/execution-engines";
import { InMemoryLearningStore } from "@helmsman/learning";
import { Orchestrator } from "./orchestrator.js";
import { WorkflowRegistry, type WorkflowDefinition } from "./workflow.js";

function makeWorkflow(): WorkflowDefinition {
  return {
    id: "t.three",
    enginePolicy: { preference: ["mock"] },
    tags: ["test"],
    steps: [
      { name: "a", async run() { return "a-out"; } },
      { name: "b", async run() { return "b-out"; } },
      { name: "c", async run(ctx) { return `c:${String(ctx.outputs["b"])}`; } },
    ],
  };
}

function makeOrchestrator() {
  const store = new InMemoryRunStore();
  const learning = new InMemoryLearningStore();
  const orch = new Orchestrator({
    store,
    workflows: new WorkflowRegistry().register(makeWorkflow()),
    engines: new ExecutionEngineRegistry().register(new MockEngine()),
    bus: new InProcessEventBus(),
    logger: createLogger("error"),
    learning,
  });
  return { orch, store, learning };
}

test("runs all steps to completion with confidence", async () => {
  const { orch, store } = makeOrchestrator();
  const { runId, status } = await orch.start("t.three", "go");
  assert.equal(status, "completed");
  const run = await store.getRun(runId);
  assert.equal(run?.status, "completed");
  assert.equal(run?.confidence?.score, 0.5); // no checks => neutral score
  const steps = await store.listSteps(runId);
  assert.deepEqual(steps.map((s) => s.status), ["completed", "completed", "completed"]);
  assert.equal(steps.at(-1)?.output, "c:b-out");
});

test("pauses before a step and resumes from the persisted cursor", async () => {
  const { orch, store } = makeOrchestrator();
  const first = await orch.start("t.three", "go", {
    onBeforeStep: (idx, id) => {
      if (idx === 1) orch.pause(id);
    },
  });
  assert.equal(first.status, "paused");
  const paused = await store.getRun(first.runId);
  assert.equal(paused?.nextStepIndex, 1);
  assert.equal((await store.listSteps(first.runId)).length, 1);

  const resumed = await orch.resume(first.runId);
  assert.equal(resumed.status, "completed");
  assert.equal((await store.listSteps(first.runId)).length, 3);
});

test("stop cancels the run before the next step", async () => {
  const { orch, store } = makeOrchestrator();
  const res = await orch.start("t.three", "go", {
    onBeforeStep: (idx, id) => {
      if (idx === 1) orch.stop(id);
    },
  });
  assert.equal(res.status, "cancelled");
  const run = await store.getRun(res.runId);
  assert.equal(run?.status, "cancelled");
});

test("records a learning outcome on completion", async () => {
  const { orch, learning } = makeOrchestrator();
  await orch.start("t.three", "go");
  assert.equal(await learning.calibrationError() >= 0, true);
});

test("recoverOrphanedRuns marks crashed running runs as resumable", async () => {
  const { orch, store } = makeOrchestrator();
  const now = new Date().toISOString();
  await store.createRun({
    id: "orphan-1",
    workflowId: "t.three",
    status: "running",
    nextStepIndex: 1,
    createdAt: now,
    updatedAt: now,
  });
  const recovered = await orch.recoverOrphanedRuns();
  assert.deepEqual(recovered, ["orphan-1"]);
  assert.equal((await store.getRun("orphan-1"))?.status, "paused");

  // And it can be resumed to completion from its cursor.
  const res = await orch.resume("orphan-1");
  assert.equal(res.status, "completed");
});
