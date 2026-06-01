import type { LessonId } from "@helmsman/shared";

/**
 * Self-learning subsystem. Captures structured outcomes from each run, distills retrievable
 * "lessons" injected into future context, calibrates confidence (predicted vs. realized), and
 * recommends the best-performing engine per workflow to close the policy-tuning loop.
 */

export interface OutcomeRecord {
  readonly runId: string;
  readonly workflowId: string;
  readonly engineId: string;
  readonly success: boolean;
  /** Confidence predicted before the outcome was known, in [0,1]. */
  readonly predictedConfidence: number;
  /** Whether a human had to approve/correct the work. */
  readonly humanIntervened: boolean;
  readonly tags: readonly string[];
  readonly at: string;
}

export interface Lesson {
  readonly id: LessonId;
  readonly workflowId: string;
  readonly tags: readonly string[];
  readonly text: string;
  readonly createdAt: string;
}

export interface EngineStat {
  readonly runs: number;
  readonly successes: number;
}

export interface LessonQuery {
  readonly workflowId: string;
  readonly tags?: readonly string[];
  readonly limit?: number;
}

export interface LearningStore {
  recordOutcome(outcome: OutcomeRecord): Promise<void>;
  addLesson(input: Omit<Lesson, "id" | "createdAt">): Promise<Lesson>;
  /** Retrieve lessons relevant to a workflow/tags, for injection into the context bundle. */
  retrieveLessons(query: LessonQuery): Promise<Lesson[]>;
  /** Brier-style calibration error across recorded outcomes (lower is better). */
  calibrationError(): Promise<number>;
  /** Per-engine run/success counts for a workflow. */
  engineStats(workflowId: string): Promise<Record<string, EngineStat>>;
  /** Engine id with the best success rate for a workflow (needs `minSamples` observations). */
  bestEngineFor(workflowId: string, minSamples?: number): Promise<string | undefined>;
}

/** Shared selection logic so every store recommends engines consistently. */
export function pickBestEngine(
  stats: Record<string, EngineStat>,
  minSamples = 3,
): string | undefined {
  let best: { id: string; rate: number; runs: number } | undefined;
  for (const [id, s] of Object.entries(stats)) {
    if (s.runs < minSamples) continue;
    const rate = s.successes / s.runs;
    if (!best || rate > best.rate || (rate === best.rate && s.runs > best.runs)) {
      best = { id, rate, runs: s.runs };
    }
  }
  return best?.id;
}

export function brierError(outcomes: readonly OutcomeRecord[]): number {
  if (outcomes.length === 0) return 0;
  const sum = outcomes.reduce((acc, o) => acc + (o.predictedConfidence - (o.success ? 1 : 0)) ** 2, 0);
  return sum / outcomes.length;
}

export function aggregateEngineStats(
  outcomes: readonly OutcomeRecord[],
  workflowId: string,
): Record<string, EngineStat> {
  const stats: Record<string, EngineStat> = {};
  for (const o of outcomes) {
    if (o.workflowId !== workflowId) continue;
    const prev = stats[o.engineId] ?? { runs: 0, successes: 0 };
    stats[o.engineId] = {
      runs: prev.runs + 1,
      successes: prev.successes + (o.success ? 1 : 0),
    };
  }
  return stats;
}
