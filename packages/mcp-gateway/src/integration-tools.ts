import { z } from "zod";
import type {
  IBambooClient,
  IBitbucketClient,
  IConfluenceClient,
  IElkClient,
  IJiraClient,
} from "@helmsman/integrations";
import { defineTool, type ToolDef } from "./registry.js";

export interface IntegrationClients {
  readonly jira?: IJiraClient;
  readonly confluence?: IConfluenceClient;
  readonly elk?: IElkClient;
  readonly bamboo?: IBambooClient;
  readonly bitbucket?: IBitbucketClient;
}

/**
 * Expose the configured enterprise integrations as a set of MCP-style tools. Only clients that are
 * provided are registered, so the available toolset reflects what the org has connected.
 */
export function buildIntegrationTools(clients: IntegrationClients): ToolDef[] {
  const tools: ToolDef[] = [];

  if (clients.jira) {
    const jira = clients.jira;
    tools.push(
      defineTool({
        name: "jira.get_issue",
        description: "Fetch a Jira issue by key.",
        inputSchema: z.object({ key: z.string() }),
        invoke: ({ key }) => jira.getIssue(key),
      }),
      defineTool({
        name: "jira.search",
        description: "Search Jira issues with JQL.",
        inputSchema: z.object({ jql: z.string() }),
        invoke: ({ jql }) => jira.searchIssues(jql),
      }),
    );
  }

  if (clients.confluence) {
    const confluence = clients.confluence;
    tools.push(
      defineTool({
        name: "confluence.get_page",
        description: "Fetch a Confluence page by id.",
        inputSchema: z.object({ id: z.string() }),
        invoke: ({ id }) => confluence.getPage(id),
      }),
    );
  }

  if (clients.elk) {
    const elk = clients.elk;
    tools.push(
      defineTool({
        name: "elk.search",
        description: "Search logs/traces in Elasticsearch.",
        inputSchema: z.object({
          query: z.string(),
          index: z.string().optional(),
          size: z.number().optional(),
        }),
        invoke: (q) => elk.search(q),
      }),
    );
  }

  if (clients.bamboo) {
    const bamboo = clients.bamboo;
    tools.push(
      defineTool({
        name: "bamboo.latest_result",
        description: "Get the latest Bamboo build result for a plan.",
        inputSchema: z.object({ planKey: z.string() }),
        invoke: ({ planKey }) => bamboo.getLatestResult(planKey),
      }),
    );
  }

  return tools;
}
