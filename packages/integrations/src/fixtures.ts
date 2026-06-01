import type {
  ElkLogEntry,
  ElkQuery,
  IBitbucketClient,
  IElkClient,
  IJiraClient,
  JiraIssue,
  NewPullRequest,
  PullRequest,
  RepoRef,
} from "./types.js";

/**
 * Offline, in-memory implementations of the integration interfaces. They let the Fix-bug
 * workflow run end-to-end with no live systems (mirroring the Mock execution engine) and record
 * side-effects so tests and Mission Control can assert what would have happened.
 */

export class FixtureJiraClient implements IJiraClient {
  readonly comments: { key: string; body: string }[] = [];
  constructor(private readonly issues: Record<string, JiraIssue> = {}) {}

  seed(issue: JiraIssue): this {
    (this.issues as Record<string, JiraIssue>)[issue.key] = issue;
    return this;
  }
  async getIssue(key: string): Promise<JiraIssue> {
    const issue = this.issues[key];
    if (!issue) throw new Error(`Fixture: unknown Jira issue ${key}`);
    return issue;
  }
  async searchIssues(): Promise<JiraIssue[]> {
    return Object.values(this.issues);
  }
  async addComment(key: string, body: string): Promise<void> {
    this.comments.push({ key, body });
  }
}

export class FixtureElkClient implements IElkClient {
  constructor(private readonly logs: ElkLogEntry[] = []) {}
  async search(query: ElkQuery): Promise<ElkLogEntry[]> {
    const q = query.query.toLowerCase();
    return this.logs.filter((l) => l.message.toLowerCase().includes(q)).slice(0, query.size ?? 50);
  }
}

export class FixtureBitbucketClient implements IBitbucketClient {
  readonly branches: { repo: RepoRef; name: string; fromRef: string }[] = [];
  readonly pullRequests: PullRequest[] = [];
  private prCounter = 100;

  constructor(private readonly files: Record<string, string> = {}) {}

  async getFile(_repo: RepoRef, path: string): Promise<string> {
    return this.files[path] ?? `// fixture: no content for ${path}`;
  }
  async createBranch(repo: RepoRef, name: string, fromRef: string): Promise<void> {
    this.branches.push({ repo, name, fromRef });
  }
  async createPullRequest(repo: RepoRef, pr: NewPullRequest): Promise<PullRequest> {
    const created: PullRequest = {
      id: ++this.prCounter,
      url: `https://bitbucket.example/projects/${repo.project}/repos/${repo.slug}/pull-requests/${this.prCounter}`,
      title: pr.title,
    };
    this.pullRequests.push(created);
    return created;
  }
}
