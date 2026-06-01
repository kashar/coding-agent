import { HttpClient, type HttpClientConfig } from "./http.js";
import type { BambooBuildResult, IBambooClient } from "./types.js";

interface BambooResultResponse {
  buildNumber?: number;
  buildState?: string;
  buildReason?: string;
}

/** Bamboo CI/CD REST client. */
export class BambooClient implements IBambooClient {
  private readonly http: HttpClient;
  constructor(cfg: HttpClientConfig) {
    this.http = new HttpClient(cfg);
  }

  async getLatestResult(planKey: string): Promise<BambooBuildResult> {
    const r = await this.http.get<{ results?: { result?: BambooResultResponse[] } }>(
      `/rest/api/latest/result/${encodeURIComponent(planKey)}-latest.json`,
    );
    const latest = r.results?.result?.[0] ?? {};
    const state = latest.buildState === "Successful" ? "Successful" : latest.buildState === "Failed" ? "Failed" : "Unknown";
    return {
      planKey,
      buildNumber: latest.buildNumber ?? 0,
      state,
      logSummary: latest.buildReason,
    };
  }

  async triggerBuild(planKey: string): Promise<{ buildNumber: number }> {
    const r = await this.http.post<BambooResultResponse>(
      `/rest/api/latest/queue/${encodeURIComponent(planKey)}.json`,
    );
    return { buildNumber: r.buildNumber ?? 0 };
  }
}
