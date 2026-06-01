/** Provider-neutral shapes the workflows depend on. Concrete clients map vendor payloads to these. */

export interface JiraIssue {
  readonly key: string;
  readonly summary: string;
  readonly description: string;
  readonly status: string;
  readonly labels: readonly string[];
}

export interface IJiraClient {
  getIssue(key: string): Promise<JiraIssue>;
  searchIssues(jql: string): Promise<JiraIssue[]>;
  addComment(key: string, body: string): Promise<void>;
}

export interface ElkLogEntry {
  readonly timestamp: string;
  readonly level: string;
  readonly message: string;
  readonly service?: string;
}

export interface ElkQuery {
  readonly index?: string;
  /** Lucene/KQL query string. */
  readonly query: string;
  readonly size?: number;
}

export interface IElkClient {
  search(query: ElkQuery): Promise<ElkLogEntry[]>;
}

export interface RepoRef {
  readonly project: string;
  readonly slug: string;
}

export interface PullRequest {
  readonly id: number;
  readonly url: string;
  readonly title: string;
}

export interface NewPullRequest {
  readonly title: string;
  readonly description: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
}

export interface IBitbucketClient {
  getFile(repo: RepoRef, path: string, ref?: string): Promise<string>;
  createBranch(repo: RepoRef, name: string, fromRef: string): Promise<void>;
  createPullRequest(repo: RepoRef, pr: NewPullRequest): Promise<PullRequest>;
}
