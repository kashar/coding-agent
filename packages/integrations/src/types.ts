/** Provider-neutral shapes the workflows depend on. Concrete clients map vendor payloads to these. */

export interface JiraIssue {
  readonly key: string;
  readonly summary: string;
  readonly description: string;
  readonly status: string;
  readonly labels: readonly string[];
}

export interface NewJiraIssue {
  readonly projectKey: string;
  readonly summary: string;
  readonly description: string;
  /** e.g. "Story", "Bug", "Task". */
  readonly issueType: string;
  readonly labels?: readonly string[];
}

export interface IJiraClient {
  getIssue(key: string): Promise<JiraIssue>;
  searchIssues(jql: string): Promise<JiraIssue[]>;
  addComment(key: string, body: string): Promise<void>;
  createIssue(issue: NewJiraIssue): Promise<JiraIssue>;
}

// ---- Confluence -------------------------------------------------------------
export interface ConfluencePage {
  readonly id: string;
  readonly title: string;
  /** Plain-text rendering of the page body. */
  readonly body: string;
  readonly spaceKey?: string;
}

export interface NewConfluencePage {
  readonly spaceKey: string;
  readonly title: string;
  /** Storage-format (HTML) or plain text body. */
  readonly body: string;
}

export interface IConfluenceClient {
  getPage(id: string): Promise<ConfluencePage>;
  searchPages(cql: string): Promise<ConfluencePage[]>;
  createPage(page: NewConfluencePage): Promise<{ id: string; url: string }>;
}

// ---- Bamboo (CI/CD) ---------------------------------------------------------
export interface BambooBuildResult {
  readonly planKey: string;
  readonly buildNumber: number;
  readonly state: "Successful" | "Failed" | "Unknown";
  readonly logSummary?: string;
}

export interface IBambooClient {
  getLatestResult(planKey: string): Promise<BambooBuildResult>;
  triggerBuild(planKey: string): Promise<{ buildNumber: number }>;
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
