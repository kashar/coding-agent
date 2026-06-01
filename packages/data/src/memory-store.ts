import type { RunRecord, StepRecord } from "@helmsman/shared";
import type { RunStore } from "./store.js";

/** In-memory RunStore for tests and ephemeral demos. Not durable across process restarts. */
export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly steps = new Map<string, StepRecord[]>();

  async createRun(run: RunRecord): Promise<void> {
    this.runs.set(run.id, run);
  }

  async updateRun(run: RunRecord): Promise<void> {
    this.runs.set(run.id, run);
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    return this.runs.get(id);
  }

  async listRuns(opts: { limit?: number; status?: string } = {}): Promise<RunRecord[]> {
    let all = [...this.runs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (opts.status) all = all.filter((r) => r.status === opts.status);
    return all.slice(0, opts.limit ?? 100);
  }

  async upsertStep(step: StepRecord): Promise<void> {
    const list = this.steps.get(step.runId) ?? [];
    const idx = list.findIndex((s) => s.id === step.id);
    if (idx >= 0) list[idx] = step;
    else list.push(step);
    this.steps.set(step.runId, list);
  }

  async listSteps(runId: string): Promise<StepRecord[]> {
    return [...(this.steps.get(runId) ?? [])];
  }

  async close(): Promise<void> {
    this.runs.clear();
    this.steps.clear();
  }
}
