import { getHost } from "../../../lib/host";

export const dynamic = "force-dynamic";

/** List the MCP-style tools exposed by the configured enterprise integrations. */
export async function GET(): Promise<Response> {
  const host = await getHost();
  return Response.json({ live: host.live, tools: host.tools.list() });
}
