import pg from "pg";
import { RunRecord, StepRecord } from "@helmsman/shared";
import type { RunStore } from "./store.js";

const { Pool } = pg;

/**
 * Postgres-backed RunStore — the production "durability graduation" of the local-first SQLite
 * store. Satisfies the same `RunStore` interface, so the orchestrator and Mission Control use it
 * unchanged; select it by setting `HELMSMAN_PG_URL`. Run docs are stored as JSONB.
 *
 * Note: requires a reachable Postgres instance; not exercised in the offline test suite.
 */
export class PgRunStore implements RunStore {
  private readonly pool: pg.Pool;
  private ready: Promise<void> | undefined;

  constructor(connectionString = process.env.HELMSMAN_PG_URL) {
    if (!connectionString) throw new Error("PgRunStore requires HELMSMAN_PG_URL");
    this.pool = new Pool({ connectionString });
  }

  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS runs (
             id TEXT PRIMARY KEY,
             workflow_id TEXT NOT NULL,
             status TEXT NOT NULL,
             updated_at TEXT NOT NULL,
             doc JSONB NOT NULL
           );
           CREATE TABLE IF NOT EXISTS steps (
             id TEXT PRIMARY KEY,
             run_id TEXT NOT NULL,
             seq INTEGER NOT NULL,
             doc JSONB NOT NULL
           );
           CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id, seq);
           CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, updated_at);`,
        )
        .then(() => undefined);
    }
    return this.ready;
  }

  async createRun(run: RunRecord): Promise<void> {
    await this.init();
    await this.pool.query(
      `INSERT INTO runs (id, workflow_id, status, updated_at, doc) VALUES ($1,$2,$3,$4,$5)`,
      [run.id, run.workflowId, run.status, run.updatedAt, JSON.stringify(run)],
    );
  }

  async updateRun(run: RunRecord): Promise<void> {
    await this.init();
    await this.pool.query(
      `UPDATE runs SET workflow_id=$2, status=$3, updated_at=$4, doc=$5 WHERE id=$1`,
      [run.id, run.workflowId, run.status, run.updatedAt, JSON.stringify(run)],
    );
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    await this.init();
    const res = await this.pool.query<{ doc: unknown }>(`SELECT doc FROM runs WHERE id=$1`, [id]);
    const row = res.rows[0];
    return row ? RunRecord.parse(row.doc) : undefined;
  }

  async listRuns(opts: { limit?: number; status?: string } = {}): Promise<RunRecord[]> {
    await this.init();
    const limit = opts.limit ?? 100;
    const res = opts.status
      ? await this.pool.query<{ doc: unknown }>(
          `SELECT doc FROM runs WHERE status=$1 ORDER BY updated_at DESC LIMIT $2`,
          [opts.status, limit],
        )
      : await this.pool.query<{ doc: unknown }>(
          `SELECT doc FROM runs ORDER BY updated_at DESC LIMIT $1`,
          [limit],
        );
    return res.rows.map((r) => RunRecord.parse(r.doc));
  }

  async upsertStep(step: StepRecord): Promise<void> {
    await this.init();
    const seqRes = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::int AS c FROM steps WHERE run_id=$1`,
      [step.runId],
    );
    const existing = await this.pool.query<{ seq: number }>(`SELECT seq FROM steps WHERE id=$1`, [
      step.id,
    ]);
    const seq = existing.rows[0]?.seq ?? Number(seqRes.rows[0]?.c ?? 0);
    await this.pool.query(
      `INSERT INTO steps (id, run_id, seq, doc) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET doc=EXCLUDED.doc`,
      [step.id, step.runId, seq, JSON.stringify(step)],
    );
  }

  async listSteps(runId: string): Promise<StepRecord[]> {
    await this.init();
    const res = await this.pool.query<{ doc: unknown }>(
      `SELECT doc FROM steps WHERE run_id=$1 ORDER BY seq ASC`,
      [runId],
    );
    return res.rows.map((r) => StepRecord.parse(r.doc));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
