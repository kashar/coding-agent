import { getHost } from "../../../../lib/host";

export const dynamic = "force-dynamic";

/** Get a single run with its steps. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const host = getHost();
  const run = await host.store.getRun(id);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  const steps = await host.store.listSteps(id);
  return Response.json({ run, steps });
}

/** Control a run. Body: { action: "pause" | "resume" | "stop" }. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const host = getHost();
  const body = (await req.json()) as { action?: "pause" | "resume" | "stop" };

  switch (body.action) {
    case "pause":
      host.orchestrator.pause(id);
      return Response.json({ ok: true, action: "pause" });
    case "stop":
      host.orchestrator.stop(id);
      return Response.json({ ok: true, action: "stop" });
    case "resume": {
      const result = await host.orchestrator.resume(id);
      return Response.json({ ok: true, action: "resume", result });
    }
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
