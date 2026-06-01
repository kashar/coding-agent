import {
  newRunId,
  newStepId,
  nowIso,
  TERMINAL_RUN_STATUSES,
  type CheckResult,
  type EventBus,
  type Logger,
  type RunRecord,
  type RunStatus,
  type StepRecord,
} from "@helmsman/shared";
import type { RunStore } from "@helmsman/data";
import type { ExecutionEngineRegistry } from "@helmsman/execution-engines";
import { runChecks, scoreConfidence } from "@helmsman/verification";
import type { LearningStore } from "@helmsman/learning";
import type { StepContext, WorkflowRegistry } from "./workflow.js";

export interface OrchestratorDeps {
  readonly store: RunStore;
  readonly workflows: WorkflowRegistry;
  readonly engines: ExecutionEngineRegistry;
  readonly bus: EventBus;
  readonly logger: Logger;
  readonly learning?: LearningStore;
  /** Confidence below this forces human approval before completing. */
  readonly approvalThreshold?: number;
  /**
   * Learning-driven engine recommendation. When no explicit engine is requested, the orchestrator
   * asks the advisor which engine has performed best for the workflow and prefers it.
   */
  readonly engineAdvisor?: (workflowId: string) => Promise<string | undefined>;
}

export interface StartOptions {
  /** Engine id override (e.g. from Mission Control). Falls back to the workflow policy. */
  readonly preferredEngineId?: string;
  /** Test/demo hook invoked before each step index; may call `pause()` for deterministic control. */
  readonly onBeforeStep?: (stepIndex: number, runId: string) => void | Promise<void>;
}

export interface DriveResult {
  readonly runId: string;
  readonly status: RunStatus;
}

interface Control {
  paused: boolean;
  cancelled: boolean;
}

/**
 * Executes workflows as durable, resumable step sequences. Supports start / pause / resume /
 * stop. Each step is persisted as it runs so a paused or crashed run can be continued from its
 * cursor. Drives until the run suspends (paused), finishes, or is cancelled.
 */
export class Orchestrator {
  private readonly control = new Map<string, Control>();

  constructor(private readonly deps: OrchestratorDeps) {}

  async start(workflowId: string, input: unknown, opts: StartOptions = {}): Promise<DriveResult> {
    const def = this.deps.workflows.get(workflowId);
    if (!def) throw new Error(`Unknown workflow: ${workflowId}`);

    const now = nowIso();
    const run: RunRecord = {
      id: newRunId(),
      workflowId,
      persona: def.persona,
      status: "pending",
      input,
      nextStepIndex: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.store.createRun(run);
    this.deps.bus.publish({ type: "run.created", runId: run.id, workflowId, at: now });
    this.control.set(run.id, { paused: false, cancelled: false });
    return this.drive(run, opts);
  }

  /** Request the run to suspend before its next step. Idempotent. */
  pause(runId: string): void {
    const c = this.control.get(runId);
    if (c) c.paused = true;
  }

  /** Request the run to stop permanently before its next step. Idempotent. */
  stop(runId: string): void {
    const c = this.control.get(runId);
    if (c) c.cancelled = true;
  }

  /** Resume a previously paused run from its persisted cursor. */
  async resume(runId: string, opts: StartOptions = {}): Promise<DriveResult> {
    const run = await this.deps.store.getRun(runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    if (TERMINAL_RUN_STATUSES.has(run.status)) return { runId, status: run.status };
    this.control.set(runId, { paused: false, cancelled: false });
    return this.drive(run, opts);
  }

  private async setRunStatus(run: RunRecord, status: RunStatus): Promise<RunRecord> {
    const updated: RunRecord = { ...run, status, updatedAt: nowIso() };
    await this.deps.store.updateRun(updated);
    this.deps.bus.publish({ type: "run.status", runId: run.id, status, at: updated.updatedAt });
    return updated;
  }

  /** Rebuild completed-step outputs from persistence so resume is durable across restarts. */
  private async rebuildOutputs(runId: string): Promise<Record<string, unknown>> {
    const steps = await this.deps.store.listSteps(runId);
    const outputs: Record<string, unknown> = {};
    for (const s of steps) if (s.status === "completed") outputs[s.name] = s.output;
    return outputs;
  }

  private async drive(initial: RunRecord, opts: StartOptions): Promise<DriveResult> {
    const def = this.deps.workflows.get(initial.workflowId)!;
    // No explicit engine? Let the learning advisor recommend the best performer for this workflow.
    const preferredId =
      opts.preferredEngineId ?? (await this.deps.engineAdvisor?.(initial.workflowId));
    const engine = await this.deps.engines.select(def.enginePolicy, preferredId);
    const control = this.control.get(initial.id) ?? { paused: false, cancelled: false };
    const outputs = await this.rebuildOutputs(initial.id);
    const signals: Record<string, unknown> = {};

    let run = await this.setRunStatus(initial, "running");
    this.deps.logger.info("run.start", { runId: run.id, workflowId: run.workflowId, engine: engine.id });

    for (let i = run.nextStepIndex; i < def.steps.length; i++) {
      await opts.onBeforeStep?.(i, run.id);

      if (control.cancelled) {
        run = await this.setRunStatus(run, "cancelled");
        return { runId: run.id, status: run.status };
      }
      if (control.paused) {
        run = await this.setRunStatus({ ...run, nextStepIndex: i }, "paused");
        return { runId: run.id, status: run.status };
      }

      const step = def.steps[i]!;
      const ok = await this.runStep(run, engine, step, outputs, signals);
      if (!ok) {
        run = await this.setRunStatus(run, "failed");
        await this.captureOutcome(run, engine.id, false);
        return { runId: run.id, status: run.status };
      }
      run = { ...run, nextStepIndex: i + 1, updatedAt: nowIso() };
      await this.deps.store.updateRun(run);
    }

    return this.finish(run, engine.id);
  }

  private async runStep(
    run: RunRecord,
    engine: import("@helmsman/execution-engines").ExecutionEngine,
    step: import("./workflow.js").WorkflowStep,
    outputs: Record<string, unknown>,
    signals: Record<string, unknown>,
  ): Promise<boolean> {
    const stepId = newStepId();
    const record: StepRecord = {
      id: stepId,
      runId: run.id,
      name: step.name,
      status: "running",
      engineId: engine.id,
      checks: [],
      startedAt: nowIso(),
    };
    await this.deps.store.upsertStep(record);
    this.deps.bus.publish({
      type: "step.status",
      runId: run.id,
      stepId,
      name: step.name,
      status: "running",
      at: record.startedAt!,
    });

    const ctx: StepContext = {
      runId: run.id,
      workflowInput: run.input,
      outputs,
      engine,
      signals,
      log: (message) =>
        this.deps.bus.publish({ type: "step.log", runId: run.id, stepId, message, at: nowIso() }),
    };

    const checks = step.checks ?? [];
    try {
      const pre = await runChecks(checks, "pre", { runId: run.id, input: run.input, signals });
      if (pre.some((c) => !c.passed)) {
        return await this.failStep(record, "pre-check failed", pre);
      }

      const output = await step.run(ctx);
      outputs[step.name] = output;

      const post = await runChecks(checks, "post", {
        runId: run.id,
        input: run.input,
        output,
        signals,
      });
      const allChecks: CheckResult[] = [...pre, ...post];
      if (post.some((c) => !c.passed)) {
        return await this.failStep({ ...record, output }, "post-check failed", allChecks);
      }

      const done: StepRecord = {
        ...record,
        status: "completed",
        output,
        checks: allChecks,
        finishedAt: nowIso(),
      };
      await this.deps.store.upsertStep(done);
      this.deps.bus.publish({
        type: "step.status",
        runId: run.id,
        stepId,
        name: step.name,
        status: "completed",
        at: done.finishedAt!,
      });
      return true;
    } catch (e) {
      return await this.failStep(record, e instanceof Error ? e.message : String(e), []);
    }
  }

  private async failStep(
    record: StepRecord,
    error: string,
    checks: CheckResult[],
  ): Promise<boolean> {
    const failed: StepRecord = {
      ...record,
      status: "failed",
      error,
      checks,
      finishedAt: nowIso(),
    };
    await this.deps.store.upsertStep(failed);
    this.deps.bus.publish({
      type: "step.status",
      runId: record.runId,
      stepId: record.id,
      name: record.name,
      status: "failed",
      at: failed.finishedAt!,
    });
    this.deps.logger.warn("step.failed", { runId: record.runId, step: record.name, error });
    return false;
  }

  private async finish(run: RunRecord, engineId: string): Promise<DriveResult> {
    const steps = await this.deps.store.listSteps(run.id);
    const allChecks = steps.flatMap((s) => s.checks);
    const confidence = scoreConfidence(allChecks, {
      approvalThreshold: this.deps.approvalThreshold,
    });
    const completed: RunRecord = {
      ...run,
      status: "completed",
      confidence,
      output: steps.at(-1)?.output,
      updatedAt: nowIso(),
    };
    await this.deps.store.updateRun(completed);
    this.deps.bus.publish({
      type: "run.completed",
      runId: run.id,
      status: "completed",
      at: completed.updatedAt,
    });
    await this.captureOutcome(completed, engineId, true);
    this.deps.logger.info("run.completed", {
      runId: run.id,
      confidence: confidence.score,
      requiresHumanApproval: confidence.requiresHumanApproval,
    });
    return { runId: run.id, status: "completed" };
  }

  private async captureOutcome(run: RunRecord, engineId: string, success: boolean): Promise<void> {
    const def = this.deps.workflows.get(run.workflowId);
    if (!this.deps.learning) return;
    const tags = def?.tags ?? [];
    await this.deps.learning.recordOutcome({
      runId: run.id,
      workflowId: run.workflowId,
      engineId,
      success,
      predictedConfidence: run.confidence?.score ?? 0.5,
      humanIntervened: run.confidence?.requiresHumanApproval ?? false,
      tags: [...tags],
      at: nowIso(),
    });

    // Close the loop: turn notable outcomes into lessons retrieved by future runs.
    if (!success) {
      await this.deps.learning.addLesson({
        workflowId: run.workflowId,
        tags: [...tags],
        text: `Run on ${engineId} failed; review preconditions and check inputs before retrying.`,
      });
    } else if (run.confidence?.requiresHumanApproval) {
      await this.deps.learning.addLesson({
        workflowId: run.workflowId,
        tags: [...tags],
        text: `Low confidence (${run.confidence.score.toFixed(2)}): ${run.confidence.rationale}. Gather stronger context next time.`,
      });
    }
  }
}
