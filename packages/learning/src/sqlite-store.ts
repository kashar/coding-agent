import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { newLessonId } from "@helmsman/shared";
import {
  pickBestEngine,
  type EngineStat,
  type LearningStore,
  type Lesson,
  type LessonQuery,
  type OutcomeRecord,
} from "./types.js";

/**
 * Durable learning store (local-first) on Node's built-in `node:sqlite`. Outcomes and lessons
 * survive restarts so calibration and engine-policy tuning improve across sessions.
 */
export class SqliteLearningStore implements LearningStore {
  private readonly db: DatabaseSync;

  constructor(path = process.env.HELMSMAN_LEARNING_DB ?? "./data/helmsman-learning.sqlite") {
    if (path !== ":memory:") {
      const dir = dirname(path);
      if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outcomes (
        run_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        engine_id TEXT NOT NULL,
        success INTEGER NOT NULL,
        predicted REAL NOT NULL,
        human INTEGER NOT NULL,
        at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        tags TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outcomes_wf ON outcomes(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_lessons_wf ON lessons(workflow_id);
    `);
  }

  async recordOutcome(o: OutcomeRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO outcomes (run_id, workflow_id, engine_id, success, predicted, human, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET success=excluded.success, predicted=excluded.predicted`,
      )
      .run(o.runId, o.workflowId, o.engineId, o.success ? 1 : 0, o.predictedConfidence, o.humanIntervened ? 1 : 0, o.at);
  }

  async addLesson(input: Omit<Lesson, "id" | "createdAt">): Promise<Lesson> {
    const lesson: Lesson = { ...input, id: newLessonId(), createdAt: new Date().toISOString() };
    this.db
      .prepare(`INSERT INTO lessons (id, workflow_id, tags, text, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(lesson.id, lesson.workflowId, JSON.stringify(lesson.tags), lesson.text, lesson.createdAt);
    return lesson;
  }

  async retrieveLessons(query: LessonQuery): Promise<Lesson[]> {
    const rows = this.db
      .prepare(`SELECT id, workflow_id, tags, text, created_at FROM lessons WHERE workflow_id=? ORDER BY created_at DESC`)
      .all(query.workflowId) as {
      id: string;
      workflow_id: string;
      tags: string;
      text: string;
      created_at: string;
    }[];
    const tagSet = new Set(query.tags ?? []);
    return rows
      .map((r) => {
        const tags = JSON.parse(r.tags) as string[];
        return {
          lesson: {
            id: r.id as Lesson["id"],
            workflowId: r.workflow_id,
            tags,
            text: r.text,
            createdAt: r.created_at,
          },
          overlap: tagSet.size === 0 ? 0 : tags.filter((t) => tagSet.has(t)).length,
        };
      })
      .sort((a, b) => b.overlap - a.overlap || b.lesson.createdAt.localeCompare(a.lesson.createdAt))
      .slice(0, query.limit ?? 5)
      .map((x) => x.lesson);
  }

  async calibrationError(): Promise<number> {
    const rows = this.db.prepare(`SELECT success, predicted FROM outcomes`).all() as {
      success: number;
      predicted: number;
    }[];
    if (rows.length === 0) return 0;
    const sum = rows.reduce((acc, r) => acc + (r.predicted - r.success) ** 2, 0);
    return sum / rows.length;
  }

  async engineStats(workflowId: string): Promise<Record<string, EngineStat>> {
    const rows = this.db
      .prepare(
        `SELECT engine_id, COUNT(*) AS runs, SUM(success) AS successes
         FROM outcomes WHERE workflow_id=? GROUP BY engine_id`,
      )
      .all(workflowId) as { engine_id: string; runs: number; successes: number }[];
    const stats: Record<string, EngineStat> = {};
    for (const r of rows) stats[r.engine_id] = { runs: r.runs, successes: r.successes ?? 0 };
    return stats;
  }

  async bestEngineFor(workflowId: string, minSamples = 3): Promise<string | undefined> {
    return pickBestEngine(await this.engineStats(workflowId), minSamples);
  }

  close(): void {
    this.db.close();
  }
}
