import type { PersonaId } from "@helmsman/shared";
import type { ExecutionEngine, EngineSelectionPolicy } from "@helmsman/execution-engines";
import type { Check } from "@helmsman/verification";

/**
 * Declarative, config-driven workflow model. A workflow is a persona-tagged sequence of steps.
 * New workflows/personas are added by registering a definition — the orchestrator never changes.
 */

export interface StepContext {
  readonly runId: string;
  readonly workflowInput: unknown;
  /** Outputs of previously completed steps, keyed by step name. */
  readonly outputs: Record<string, unknown>;
  /** The execution engine selected for this run (Amp / Copilot / mock). */
  readonly engine: ExecutionEngine;
  /** Mutable signal bag shared with checks (e.g. test results, diffs). */
  readonly signals: Record<string, unknown>;
  /** Emit a human-readable log line tied to this step. */
  log(message: string): void;
}

export interface WorkflowStep {
  readonly name: string;
  /** Optional pre/during/post checks evaluated around this step. */
  readonly checks?: readonly Check[];
  run(ctx: StepContext): Promise<unknown>;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly description?: string;
  readonly persona?: PersonaId;
  /** Ordered engine preference; overridable per run from Mission Control. */
  readonly enginePolicy: EngineSelectionPolicy;
  /** Tags used by the learning store to retrieve relevant lessons. */
  readonly tags?: readonly string[];
  readonly steps: readonly WorkflowStep[];
}

/** Config-driven registry. Adding a workflow = `register(def)`; no core code changes. */
export class WorkflowRegistry {
  private readonly defs = new Map<string, WorkflowDefinition>();

  register(def: WorkflowDefinition): this {
    if (def.steps.length === 0) throw new Error(`Workflow "${def.id}" has no steps`);
    this.defs.set(def.id, def);
    return this;
  }

  get(id: string): WorkflowDefinition | undefined {
    return this.defs.get(id);
  }

  list(): WorkflowDefinition[] {
    return [...this.defs.values()];
  }
}
