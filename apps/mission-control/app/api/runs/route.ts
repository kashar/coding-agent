import { getHost } from "../../../lib/host";

export const dynamic = "force-dynamic";

/** List runs plus the registered workflows and engines (for the dashboard controls). */
export async function GET(): Promise<Response> {
  const host = await getHost();
  const [runs, engines] = [await host.store.listRuns({ limit: 100 }), host.engines.list()];
  const workflows = host.workflows.list().map((w) => ({
    id: w.id,
    description: w.description ?? "",
    persona: w.persona ?? null,
  }));
  return Response.json({
    runs,
    workflows,
    engines: engines.map((e) => ({ id: e.id, displayName: e.displayName })),
  });
}

/** Start a workflow run. Body: { workflowId, input, preferredEngineId? }. */
export async function POST(req: Request): Promise<Response> {
  const host = await getHost();
  const body = (await req.json()) as {
    workflowId?: string;
    input?: unknown;
    preferredEngineId?: string;
  };
  if (!body.workflowId) {
    return Response.json({ error: "workflowId is required" }, { status: 400 });
  }
  try {
    const result = await host.orchestrator.start(body.workflowId, body.input ?? "", {
      preferredEngineId: body.preferredEngineId,
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
