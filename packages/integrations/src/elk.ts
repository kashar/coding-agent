import { HttpClient, type HttpClientConfig } from "./http.js";
import type { ElkLogEntry, ElkQuery, IElkClient } from "./types.js";

interface EsHit {
  _source?: Record<string, unknown>;
}
interface EsResponse {
  hits?: { hits?: EsHit[] };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Elasticsearch `_search` client for request tracing and triage. */
export class ElkClient implements IElkClient {
  private readonly http: HttpClient;
  constructor(cfg: HttpClientConfig) {
    this.http = new HttpClient(cfg);
  }

  async search(query: ElkQuery): Promise<ElkLogEntry[]> {
    const index = query.index ?? "_all";
    const res = await this.http.post<EsResponse>(`/${encodeURIComponent(index)}/_search`, {
      size: query.size ?? 50,
      query: { query_string: { query: query.query } },
      sort: [{ "@timestamp": "desc" }],
    });
    return (res.hits?.hits ?? []).map((h) => {
      const s = h._source ?? {};
      return {
        timestamp: str(s["@timestamp"] ?? s["timestamp"]),
        level: str(s["level"] ?? s["log.level"]),
        message: str(s["message"]),
        service: s["service"] ? str(s["service"]) : undefined,
      };
    });
  }
}
