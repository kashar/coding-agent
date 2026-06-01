import type { RunRecord, StepRecord } from "@helmsman/shared";

/**
 * Persistence seam for runs and steps. Implemented now by SQLite (local-first) and an in-memory
 * store for tests. A Postgres implementation can satisfy the same interface later with no change
 * to the orchestrator or Mission Control.
 */
export interface RunStore {
  createRun(run: RunRecord): Promise<void>;
  updateRun(run: RunRecord): Promise<void>;
  getRun(id: string): Promise<RunRecord | undefined>;
  listRuns(opts?: { limit?: number; status?: string }): Promise<RunRecord[]>;

  upsertStep(step: StepRecord): Promise<void>;
  listSteps(runId: string): Promise<StepRecord[]>;

  close(): Promise<void>;
}
