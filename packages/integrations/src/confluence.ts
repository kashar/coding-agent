import { HttpClient, type HttpClientConfig } from "./http.js";
import type { ConfluencePage, IConfluenceClient, NewConfluencePage } from "./types.js";

interface ConfluencePageResponse {
  id: string;
  title: string;
  space?: { key?: string };
  body?: { storage?: { value?: string }; view?: { value?: string } };
  _links?: { base?: string; webui?: string };
}

/** Strip HTML tags to a rough plain-text rendering of Confluence storage format. */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Confluence Cloud REST client. */
export class ConfluenceClient implements IConfluenceClient {
  private readonly http: HttpClient;
  constructor(cfg: HttpClientConfig) {
    this.http = new HttpClient(cfg);
  }

  async getPage(id: string): Promise<ConfluencePage> {
    const r = await this.http.get<ConfluencePageResponse>(
      `/wiki/rest/api/content/${encodeURIComponent(id)}?expand=body.storage,space`,
    );
    return {
      id: r.id,
      title: r.title,
      body: htmlToText(r.body?.storage?.value ?? ""),
      spaceKey: r.space?.key,
    };
  }

  async searchPages(cql: string): Promise<ConfluencePage[]> {
    const r = await this.http.get<{ results?: ConfluencePageResponse[] }>(
      `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&expand=body.storage,space`,
    );
    return (r.results ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      body: htmlToText(p.body?.storage?.value ?? ""),
      spaceKey: p.space?.key,
    }));
  }

  async createPage(page: NewConfluencePage): Promise<{ id: string; url: string }> {
    const r = await this.http.post<ConfluencePageResponse>(`/wiki/rest/api/content`, {
      type: "page",
      title: page.title,
      space: { key: page.spaceKey },
      body: { storage: { value: page.body, representation: "storage" } },
    });
    return { id: r.id, url: `${r._links?.base ?? ""}${r._links?.webui ?? ""}` };
  }
}
