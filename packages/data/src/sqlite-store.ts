import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { RunRecord, StepRecord } from "@helmsman/shared";
import type { RunStore } from "./store.js";

/**
 * Local-first SQLite store using Node's built-in `node:sqlite` (no native build step). Records
 * are stored as validated JSON blobs keyed by id, with a few promoted columns for querying.
 */
export class SqliteRunStore implements RunStore {
  private readonly db: DatabaseSync;

  constructor(path = process.env.HELMSMAN_DB ?? "./data/helmsman.sqlite") {
    // node:sqlite does not create parent directories; ensure the path exists.
    if (path !== ":memory:") {
      const dir = dirname(path);
      if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        doc TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        doc TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id, seq);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, updated_at);
    `);
  }

  async createRun(run: RunRecord): Promise<void> {
    this.db
      .prepare(`INSERT INTO runs (id, workflow_id, status, updated_at, doc) VALUES (?, ?, ?, ?, ?)`)
      .run(run.id, run.workflowId, run.status, run.updatedAt, JSON.stringify(run));
  }

  async updateRun(run: RunRecord): Promise<void> {
    this.db
      .prepare(`UPDATE runs SET workflow_id=?, status=?, updated_at=?, doc=? WHERE id=?`)
      .run(run.workflowId, run.status, run.updatedAt, JSON.stringify(run), run.id);
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    const row = this.db.prepare(`SELECT doc FROM runs WHERE id=?`).get(id) as
      | { doc: string }
      | undefined;
    return row ? RunRecord.parse(JSON.parse(row.doc)) : undefined;
  }

  async listRuns(opts: { limit?: number; status?: string } = {}): Promise<RunRecord[]> {
    const limit = opts.limit ?? 100;
    const rows = (
      opts.status
        ? this.db
            .prepare(`SELECT doc FROM runs WHERE status=? ORDER BY updated_at DESC LIMIT ?`)
            .all(opts.status, limit)
        : this.db.prepare(`SELECT doc FROM runs ORDER BY updated_at DESC LIMIT ?`).all(limit)
    ) as { doc: string }[];
    return rows.map((r) => RunRecord.parse(JSON.parse(r.doc)));
  }

  async upsertStep(step: StepRecord): Promise<void> {
    const seqRow = this.db
      .prepare(`SELECT seq FROM steps WHERE id=?`)
      .get(step.id) as { seq: number } | undefined;
    const seq =
      seqRow?.seq ??
      ((
        this.db
          .prepare(`SELECT COUNT(*) AS c FROM steps WHERE run_id=?`)
          .get(step.runId) as { c: number }
      ).c);
    this.db
      .prepare(
        `INSERT INTO steps (id, run_id, seq, doc) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET doc=excluded.doc`,
      )
      .run(step.id, step.runId, seq, JSON.stringify(step));
  }

  async listSteps(runId: string): Promise<StepRecord[]> {
    const rows = this.db
      .prepare(`SELECT doc FROM steps WHERE run_id=? ORDER BY seq ASC`)
      .all(runId) as { doc: string }[];
    return rows.map((r) => StepRecord.parse(JSON.parse(r.doc)));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
