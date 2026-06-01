import { newLessonId } from "@helmsman/shared";
import {
  aggregateEngineStats,
  brierError,
  pickBestEngine,
  type EngineStat,
  type LearningStore,
  type Lesson,
  type LessonQuery,
  type OutcomeRecord,
} from "./types.js";

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

  async retrieveLessons(query: LessonQuery): Promise<Lesson[]> {
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
    return brierError(this.outcomes);
  }

  async engineStats(workflowId: string): Promise<Record<string, EngineStat>> {
    return aggregateEngineStats(this.outcomes, workflowId);
  }

  async bestEngineFor(workflowId: string, minSamples = 3): Promise<string | undefined> {
    return pickBestEngine(aggregateEngineStats(this.outcomes, workflowId), minSamples);
  }
}
