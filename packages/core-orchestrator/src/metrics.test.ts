import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger, InProcessEventBus, type RunRecord, type StepRecord } from "@helmsman/shared";
import { InMemoryRunStore } from "@helmsman/data";
import {
  ExecutionEngineRegistry,
  MockEngine,
  type ExecutionEngine,
} from "@helmsman/execution-engines";
import { InMemoryLearningStore } from "@helmsman/learning";
import { aggregateMetrics } from "./metrics.js";
import { Orchestrator } from "./orchestrator.js";
import { WorkflowRegistry, type WorkflowDefinition } from "./workflow.js";

test("aggregateMetrics summarises runs and engine usage", () => {
  const runs: RunRecord[] = [
    { id: "r1", workflowId: "fix-bug", status: "completed", nextStepIndex: 2, createdAt: "a", updatedAt: "a", confidence: { score: 0.8, rationale: "", requiresHumanApproval: false } },
    { id: "r2", workflowId: "fix-bug", status: "failed", nextStepIndex: 1, createdAt: "a", updatedAt: "a" },
    { id: "r3", workflowId: "triage", status: "completed", nextStepIndex: 1, createdAt: "a", updatedAt: "a", confidence: { score: 0.4, rationale: "", requiresHumanApproval: true } },
  ];
  const steps: StepRecord[] = [
    { id: "s1", runId: "r1", name: "a", status: "completed", engineId: "amp", checks: [], usage: { engineId: "amp", inputTokens: 10, outputTokens: 5 } },
    { id: "s2", runId: "r1", name: "b", status: "completed", engineId: "amp", checks: [], usage: { engineId: "amp", inputTokens: 4, outputTokens: 2 } },
    { id: "s3", runId: "r3", name: "a", status: "completed", engineId: "copilot", checks: [] },
  ];

  const m = aggregateMetrics(runs, steps);
  assert.equal(m.totalRuns, 3);
  assert.equal(m.byStatus["completed"], 2);
  assert.equal(m.byStatus["failed"], 1);
  assert.equal(m.byWorkflow["fix-bug"], 2);
  assert.equal(m.approvalGated, 1);
  assert.ok(Math.abs(m.avgConfidence - 0.6) < 1e-9);
  assert.equal(m.engineUsage["amp"]!.steps, 2);
  assert.equal(m.engineUsage["amp"]!.inputTokens, 14);
  assert.equal(m.engineUsage["copilot"]!.steps, 1);
});

/** A second registered engine (id "stub") so the advisor's preference is observable. */
class StubEngine implements ExecutionEngine {
  readonly id = "stub";
  readonly displayName = "Stub";
  private readonly inner = new MockEngine();
  get capabilities() {
    return this.inner.capabilities;
  }
  isAvailable() {
    return this.inner.isAvailable();
  }
  complete(req: Parameters<ExecutionEngine["complete"]>[0]) {
    return this.inner.complete(req);
  }
  runAgenticTask(spec: Parameters<ExecutionEngine["runAgenticTask"]>[0]) {
    return this.inner.runAgenticTask(spec);
  }
  editCode(req: Parameters<ExecutionEngine["editCode"]>[0]) {
    return this.inner.editCode(req);
  }
}

test("engineAdvisor preference is used when no explicit engine is requested", async () => {
  const def: WorkflowDefinition = {
    id: "wf",
    enginePolicy: { preference: ["mock"] },
    steps: [{ name: "only", async run() { return "ok"; } }],
  };
  const store = new InMemoryRunStore();
  const orch = new Orchestrator({
    store,
    workflows: new WorkflowRegistry().register(def),
    engines: new ExecutionEngineRegistry().register(new MockEngine()).register(new StubEngine()),
    bus: new InProcessEventBus(),
    logger: createLogger("error"),
    learning: new InMemoryLearningStore(),
    engineAdvisor: async () => "stub",
  });
  const { runId } = await orch.start("wf", "x");
  const steps = await store.listSteps(runId);
  assert.equal(steps[0]!.engineId, "stub");
});

test("auto-lesson captured when a completed run requires human approval", async () => {
  const def: WorkflowDefinition = {
    id: "wf2",
    enginePolicy: { preference: ["mock"] },
    tags: ["t"],
    steps: [{ name: "only", async run() { return "ok"; } }], // no checks => neutral 0.5 => gated
  };
  const learning = new InMemoryLearningStore();
  const orch = new Orchestrator({
    store: new InMemoryRunStore(),
    workflows: new WorkflowRegistry().register(def),
    engines: new ExecutionEngineRegistry().register(new MockEngine()),
    bus: new InProcessEventBus(),
    logger: createLogger("error"),
    learning,
  });
  await orch.start("wf2", "x");
  const lessons = await learning.retrieveLessons({ workflowId: "wf2" });
  assert.equal(lessons.length, 1);
});
