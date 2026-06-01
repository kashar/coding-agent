import { getHost } from "../../../lib/host";
import { aggregateMetrics } from "@helmsman/core-orchestrator";
import type { StepRecord } from "@helmsman/shared";

export const dynamic = "force-dynamic";

/** Platform metrics for the Mission Control dashboard: run/engine usage + learning signals. */
export async function GET(): Promise<Response> {
  const host = await getHost();
  const runs = await host.store.listRuns({ limit: 500 });

  const steps: StepRecord[] = [];
  for (const r of runs) steps.push(...(await host.store.listSteps(r.id)));

  const metrics = aggregateMetrics(runs, steps);
  const calibrationError = await host.learning.calibrationError();

  // Per-workflow learning signals: best engine recommendation + recent lessons.
  const workflowIds = host.workflows.list().map((w) => w.id);
  const learning: Record<string, { bestEngine?: string; lessons: string[] }> = {};
  for (const id of workflowIds) {
    const bestEngine = await host.learning.bestEngineFor(id);
    const lessons = (await host.learning.retrieveLessons({ workflowId: id, limit: 3 })).map((l) => l.text);
    if (bestEngine || lessons.length) learning[id] = { bestEngine, lessons };
  }

  return Response.json({ metrics, calibrationError, learning });
}
