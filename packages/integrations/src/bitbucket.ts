import { HttpClient, type HttpClientConfig } from "./http.js";
import type { IBitbucketClient, NewPullRequest, PullRequest, RepoRef } from "./types.js";

/** Bitbucket Server / Data Center (Stash) REST 1.0 client. */
export class BitbucketServerClient implements IBitbucketClient {
  private readonly http: HttpClient;
  constructor(cfg: HttpClientConfig) {
    this.http = new HttpClient(cfg);
  }

  private base(repo: RepoRef): string {
    return `/rest/api/1.0/projects/${encodeURIComponent(repo.project)}/repos/${encodeURIComponent(repo.slug)}`;
  }

  async getFile(repo: RepoRef, path: string, ref?: string): Promise<string> {
    const at = ref ? `?at=${encodeURIComponent(ref)}` : "";
    return this.http.getText(`${this.base(repo)}/raw/${path}${at}`);
  }

  async createBranch(repo: RepoRef, name: string, fromRef: string): Promise<void> {
    await this.http.post(
      `/rest/branch-utils/1.0/projects/${encodeURIComponent(repo.project)}/repos/${encodeURIComponent(repo.slug)}/branches`,
      { name, startPoint: fromRef },
    );
  }

  async createPullRequest(repo: RepoRef, pr: NewPullRequest): Promise<PullRequest> {
    const res = await this.http.post<{ id: number; links?: { self?: { href?: string }[] } }>(
      `${this.base(repo)}/pull-requests`,
      {
        title: pr.title,
        description: pr.description,
        fromRef: { id: `refs/heads/${pr.sourceBranch}` },
        toRef: { id: `refs/heads/${pr.targetBranch}` },
      },
    );
    return { id: res.id, url: res.links?.self?.[0]?.href ?? "", title: pr.title };
  }
}
