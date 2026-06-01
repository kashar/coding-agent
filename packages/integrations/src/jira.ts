import { HttpClient, type HttpClientConfig } from "./http.js";
import type { IJiraClient, JiraIssue, NewJiraIssue } from "./types.js";

interface JiraFields {
  summary?: string;
  description?: unknown;
  status?: { name?: string };
  labels?: string[];
}
interface JiraIssueResponse {
  key: string;
  fields?: JiraFields;
}

/** Best-effort flattening of Jira's ADF/rich description into plain text. */
function descriptionToText(description: unknown): string {
  if (typeof description === "string") return description;
  if (!description || typeof description !== "object") return "";
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(description);
  return parts.join(" ");
}

function mapIssue(r: JiraIssueResponse): JiraIssue {
  return {
    key: r.key,
    summary: r.fields?.summary ?? "",
    description: descriptionToText(r.fields?.description),
    status: r.fields?.status?.name ?? "unknown",
    labels: r.fields?.labels ?? [],
  };
}

/** Jira Cloud REST v3 client. */
export class JiraClient implements IJiraClient {
  private readonly http: HttpClient;
  constructor(cfg: HttpClientConfig) {
    this.http = new HttpClient(cfg);
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const r = await this.http.get<JiraIssueResponse>(
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,labels`,
    );
    return mapIssue(r);
  }

  async searchIssues(jql: string): Promise<JiraIssue[]> {
    const r = await this.http.get<{ issues?: JiraIssueResponse[] }>(
      `/rest/api/3/search?fields=summary,description,status,labels&jql=${encodeURIComponent(jql)}`,
    );
    return (r.issues ?? []).map(mapIssue);
  }

  async addComment(key: string, body: string): Promise<void> {
    await this.http.post(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
      body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] },
    });
  }

  async createIssue(issue: NewJiraIssue): Promise<JiraIssue> {
    const res = await this.http.post<{ key: string }>(`/rest/api/3/issue`, {
      fields: {
        project: { key: issue.projectKey },
        summary: issue.summary,
        description: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: issue.description }] }],
        },
        issuetype: { name: issue.issueType },
        labels: issue.labels ?? [],
      },
    });
    return {
      key: res.key,
      summary: issue.summary,
      description: issue.description,
      status: "To Do",
      labels: issue.labels ?? [],
    };
  }
}
