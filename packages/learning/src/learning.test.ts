import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryLearningStore } from "./in-memory-store.js";
import { SqliteLearningStore } from "./sqlite-store.js";
import { pickBestEngine } from "./types.js";
import type { LearningStore, OutcomeRecord } from "./types.js";

function outcome(engineId: string, success: boolean): OutcomeRecord {
  return {
    runId: `r_${Math.random()}`,
    workflowId: "fix-bug",
    engineId,
    success,
    predictedConfidence: success ? 0.9 : 0.4,
    humanIntervened: !success,
    tags: ["bug"],
    at: new Date().toISOString(),
  };
}

async function seedAndCheck(store: LearningStore): Promise<void> {
  // amp: 2/3 success, copilot: 3/3 success → copilot is best.
  for (const s of [true, true, false]) await store.recordOutcome(outcome("amp", s));
  for (const s of [true, true, true]) await store.recordOutcome(outcome("copilot", s));

  const stats = await store.engineStats("fix-bug");
  assert.equal(stats["amp"]!.runs, 3);
  assert.equal(stats["amp"]!.successes, 2);
  assert.equal(stats["copilot"]!.successes, 3);
  assert.equal(await store.bestEngineFor("fix-bug"), "copilot");
  // Below the sample threshold → no recommendation.
  assert.equal(await store.bestEngineFor("unknown-wf"), undefined);

  await store.addLesson({ workflowId: "fix-bug", tags: ["bug"], text: "watch null checks" });
  const lessons = await store.retrieveLessons({ workflowId: "fix-bug", tags: ["bug"] });
  assert.equal(lessons.length, 1);
  assert.match(lessons[0]!.text, /null checks/);

  const err = await store.calibrationError();
  assert.ok(err >= 0 && err <= 1);
}

test("pickBestEngine respects the minimum sample size", () => {
  assert.equal(pickBestEngine({ a: { runs: 2, successes: 2 } }, 3), undefined);
  assert.equal(pickBestEngine({ a: { runs: 5, successes: 5 }, b: { runs: 5, successes: 3 } }), "a");
});

test("InMemoryLearningStore: stats, recommendation, lessons, calibration", async () => {
  await seedAndCheck(new InMemoryLearningStore());
});

test("SqliteLearningStore: durable stats, recommendation, lessons, calibration", async () => {
  await seedAndCheck(new SqliteLearningStore(":memory:"));
});
