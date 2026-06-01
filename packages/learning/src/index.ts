import { newLessonId, type LessonId } from "@helmsman/shared";

/**
 * Self-learning subsystem (Phase 0 skeleton). Captures structured outcomes from each run,
 * distills retrievable "lessons" injected into future context, and calibrates confidence by
 * comparing predicted vs. realized outcomes over time. Backed by in-memory storage now;
 * graduates to the shared data layer later.
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

export interface LearningStore {
  recordOutcome(outcome: OutcomeRecord): Promise<void>;
  addLesson(input: Omit<Lesson, "id" | "createdAt">): Promise<Lesson>;
  /** Retrieve lessons relevant to a workflow/tags, for injection into the context bundle. */
  retrieveLessons(query: { workflowId: string; tags?: readonly string[]; limit?: number }): Promise<Lesson[]>;
  /** Brier-style calibration error across recorded outcomes (lower is better). */
  calibrationError(): Promise<number>;
}

export class InMemoryLearningStore implements LearningStore {
  private readonly outcomes: OutcomeRecord[] = [];
  private readonly lessons: Lesson[] = [];

  async recordOutcome(outcome: OutcomeRecord): Promise<void> {
    this.outcomes.push(outcome);
  }

  async addLesson(input: Omit<Lesson, "id" | "createdAt">): Promise<Lesson> {
    const lesson: Lesson = { ...input, id: newLessonId(), createdAt: new Date().toISOString() };
    this.lessons.push(lesson);
    return lesson;
  }

  async retrieveLessons(query: {
    workflowId: string;
    tags?: readonly string[];
    limit?: number;
  }): Promise<Lesson[]> {
    const tagSet = new Set(query.tags ?? []);
    return this.lessons
      .filter((l) => l.workflowId === query.workflowId)
      .map((l) => ({
        l,
        overlap: tagSet.size === 0 ? 0 : l.tags.filter((t) => tagSet.has(t)).length,
      }))
      .sort((a, b) => b.overlap - a.overlap || b.l.createdAt.localeCompare(a.l.createdAt))
      .slice(0, query.limit ?? 5)
      .map((x) => x.l);
  }

  async calibrationError(): Promise<number> {
    if (this.outcomes.length === 0) return 0;
    const sum = this.outcomes.reduce((acc, o) => {
      const realized = o.success ? 1 : 0;
      return acc + (o.predictedConfidence - realized) ** 2;
    }, 0);
    return sum / this.outcomes.length;
  }
}
