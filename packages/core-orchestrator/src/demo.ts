/**
 * Phase 0 end-to-end demo. Runs entirely offline on the deterministic Mock engine and proves:
 *   - a config-registered workflow executes step-by-step,
 *   - the run can be paused mid-flight and resumed from its persisted cursor,
 *   - verification produces a confidence score,
 *   - a learning outcome is captured.
 *
 * Run with: pnpm --filter @helmsman/core-orchestrator run demo
 */
import { createLogger, InProcessEventBus, type HelmsmanEvent } from "@helmsman/shared";
import { InMemoryRunStore } from "@helmsman/data";
import { ExecutionEngineRegistry, MockEngine } from "@helmsman/execution-engines";
import { InMemoryLearningStore } from "@helmsman/learning";
import type { Check } from "@helmsman/verification";
import { Orchestrator } from "./orchestrator.js";
import { WorkflowRegistry, type WorkflowDefinition } from "./workflow.js";

const producesSummary: Check = {
  name: "produces-summary",
  phase: "post",
  async run(ctx) {
    const ok = typeof ctx.output === "string" && ctx.output.length > 0;
    return { passed: ok, detail: ok ? "summary present" : "missing summary" };
  },
};

const demoWorkflow: WorkflowDefinition = {
  id: "demo.echo",
  description: "Three-step demo workflow exercising the engine end-to-end.",
  persona: "developer",
  enginePolicy: { preference: ["amp", "copilot", "mock"] },
  tags: ["demo"],
  steps: [
    {
      name: "understand",
      async run(ctx) {
        ctx.log("Gathering context for the objective");
        const res = await ctx.engine.complete({ prompt: `Understand: ${String(ctx.workflowInput)}` });
        return res.text;
      },
    },
    {
      name: "act",
      checks: [producesSummary],
      async run(ctx) {
        ctx.log("Running the agentic task");
        const res = await ctx.engine.runAgenticTask({ objective: String(ctx.workflowInput) });
        return res.summary;
      },
    },
    {
      name: "report",
      async run(ctx) {
        ctx.log("Summarising outcome");
        return `done: ${String(ctx.outputs["act"])}`;
      },
    },
  ],
};

async function main(): Promise<void> {
  const logger = createLogger("info", { component: "demo" });
  const bus = new InProcessEventBus();
  bus.subscribe((e: HelmsmanEvent) => logger.info(`event:${e.type}`, { ...e }));

  const store = new InMemoryRunStore();
  const learning = new InMemoryLearningStore();
  const engines = new ExecutionEngineRegistry().register(new MockEngine());
  const workflows = new WorkflowRegistry().register(demoWorkflow);

  const orch = new Orchestrator({ store, workflows, engines, bus, logger, learning });

  // Start, but pause before step index 1 to prove suspend/resume works deterministically.
  let pausedOnce = false;
  const first = await orch.start("demo.echo", "fix the flaky login test", {
    onBeforeStep: (idx, runId) => {
      if (idx === 1 && !pausedOnce) {
        pausedOnce = true;
        orch.pause(runId);
      }
    },
  });
  logger.info("after-start", { ...first });

  const paused = await store.getRun(first.runId);
  logger.info("paused-run", { status: paused?.status, nextStepIndex: paused?.nextStepIndex });

  // Resume to completion.
  const resumed = await orch.resume(first.runId);
  logger.info("after-resume", { ...resumed });

  const finalRun = await store.getRun(first.runId);
  const steps = await store.listSteps(first.runId);
  logger.info("final", {
    status: finalRun?.status,
    confidence: finalRun?.confidence?.score,
    steps: steps.map((s) => ({ name: s.name, status: s.status })),
    calibrationError: await learning.calibrationError(),
  });

  if (finalRun?.status !== "completed") {
    throw new Error(`Expected completed run, got ${finalRun?.status}`);
  }
  logger.info("DEMO_OK", { runId: first.runId });
}

main().catch((e) => {
  process.stderr.write(`DEMO_FAILED: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
