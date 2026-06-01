import type {
  BambooBuildResult,
  ConfluencePage,
  ElkLogEntry,
  ElkQuery,
  IBambooClient,
  IBitbucketClient,
  IConfluenceClient,
  IElkClient,
  IJiraClient,
  JiraIssue,
  NewConfluencePage,
  NewJiraIssue,
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
  async createIssue(issue: NewJiraIssue): Promise<JiraIssue> {
    const key = `${issue.projectKey}-${++this.issueCounter}`;
    const created: JiraIssue = {
      key,
      summary: issue.summary,
      description: issue.description,
      status: "To Do",
      labels: issue.labels ?? [],
    };
    (this.issues as Record<string, JiraIssue>)[key] = created;
    this.created.push(created);
    return created;
  }
  readonly created: JiraIssue[] = [];
  private issueCounter = 1000;
}

export class FixtureConfluenceClient implements IConfluenceClient {
  readonly createdPages: { id: string; title: string; spaceKey: string }[] = [];
  private pageCounter = 5000;
  constructor(private readonly pages: Record<string, ConfluencePage> = {}) {}

  seed(page: ConfluencePage): this {
    (this.pages as Record<string, ConfluencePage>)[page.id] = page;
    return this;
  }
  async getPage(id: string): Promise<ConfluencePage> {
    const page = this.pages[id];
    if (!page) throw new Error(`Fixture: unknown Confluence page ${id}`);
    return page;
  }
  async searchPages(): Promise<ConfluencePage[]> {
    return Object.values(this.pages);
  }
  async createPage(page: NewConfluencePage): Promise<{ id: string; url: string }> {
    const id = String(++this.pageCounter);
    this.createdPages.push({ id, title: page.title, spaceKey: page.spaceKey });
    return { id, url: `https://confluence.example/pages/${id}` };
  }
}

export class FixtureBambooClient implements IBambooClient {
  readonly triggered: string[] = [];
  constructor(private readonly results: Record<string, BambooBuildResult> = {}) {}

  seed(result: BambooBuildResult): this {
    (this.results as Record<string, BambooBuildResult>)[result.planKey] = result;
    return this;
  }
  async getLatestResult(planKey: string): Promise<BambooBuildResult> {
    return this.results[planKey] ?? { planKey, buildNumber: 0, state: "Unknown" };
  }
  async triggerBuild(planKey: string): Promise<{ buildNumber: number }> {
    this.triggered.push(planKey);
    return { buildNumber: 1 };
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
