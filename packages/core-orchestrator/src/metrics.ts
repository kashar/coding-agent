import type { RunRecord, StepRecord } from "@helmsman/shared";

export interface EngineUsageSummary {
  readonly steps: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUnits: number;
}

export interface PlatformMetrics {
  readonly totalRuns: number;
  readonly byStatus: Record<string, number>;
  readonly byWorkflow: Record<string, number>;
  /** Average run-level confidence across completed runs that reported one. */
  readonly avgConfidence: number;
  /** Number of completed runs that required human approval (low confidence). */
  readonly approvalGated: number;
  readonly engineUsage: Record<string, EngineUsageSummary>;
}

/** Aggregate run + step records into dashboard metrics. Pure and easily testable. */
export function aggregateMetrics(runs: readonly RunRecord[], steps: readonly StepRecord[]): PlatformMetrics {
  const byStatus: Record<string, number> = {};
  const byWorkflow: Record<string, number> = {};
  let confidenceSum = 0;
  let confidenceCount = 0;
  let approvalGated = 0;

  for (const r of runs) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byWorkflow[r.workflowId] = (byWorkflow[r.workflowId] ?? 0) + 1;
    if (r.confidence) {
      confidenceSum += r.confidence.score;
      confidenceCount += 1;
      if (r.confidence.requiresHumanApproval) approvalGated += 1;
    }
  }

  const engineUsage: Record<string, EngineUsageSummary> = {};
  for (const s of steps) {
    const id = s.engineId ?? s.usage?.engineId;
    if (!id) continue;
    const prev = engineUsage[id] ?? { steps: 0, inputTokens: 0, outputTokens: 0, costUnits: 0 };
    engineUsage[id] = {
      steps: prev.steps + 1,
      inputTokens: prev.inputTokens + (s.usage?.inputTokens ?? 0),
      outputTokens: prev.outputTokens + (s.usage?.outputTokens ?? 0),
      costUnits: prev.costUnits + (s.usage?.costUnits ?? 0),
    };
  }

  return {
    totalRuns: runs.length,
    byStatus,
    byWorkflow,
    avgConfidence: confidenceCount === 0 ? 0 : confidenceSum / confidenceCount,
    approvalGated,
    engineUsage,
  };
}
