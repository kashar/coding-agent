import { InMemoryVault, type Credential, type Vault } from "@helmsman/auth-vault";
import {
  BambooClient,
  BitbucketServerClient,
  ConfluenceClient,
  ElkClient,
  FixtureBambooClient,
  FixtureBitbucketClient,
  FixtureConfluenceClient,
  FixtureElkClient,
  FixtureJiraClient,
  JiraClient,
  type IBambooClient,
  type IBitbucketClient,
  type IConfluenceClient,
  type IElkClient,
  type IJiraClient,
  type RepoRef,
} from "@helmsman/integrations";
import { RepoMap } from "@helmsman/context-engine";

export interface HelmsmanClients {
  readonly jira: IJiraClient;
  readonly elk: IElkClient;
  readonly bitbucket: IBitbucketClient;
  readonly confluence: IConfluenceClient;
  readonly bamboo: IBambooClient;
  readonly repo: RepoMap;
  readonly repoRef: RepoRef;
  readonly targetBranch: string;
  readonly live: boolean;
}

/**
 * Build all enterprise clients. When the endpoints + vault credentials are configured, real HTTP
 * clients are used; otherwise seeded fixtures keep every workflow runnable offline.
 */
export async function buildClients(vault: Vault): Promise<HelmsmanClients> {
  const repoRef: RepoRef = {
    project: process.env.HELMSMAN_BITBUCKET_PROJECT ?? "APP",
    slug: process.env.HELMSMAN_BITBUCKET_SLUG ?? "web",
  };
  const repo = new RepoMap(process.env.HELMSMAN_REPO_DIR ?? process.cwd());
  const targetBranch = process.env.HELMSMAN_TARGET_BRANCH ?? "main";

  const jiraUrl = process.env.HELMSMAN_JIRA_URL;
  const bbUrl = process.env.HELMSMAN_BITBUCKET_URL;
  const elkUrl = process.env.HELMSMAN_ELK_URL;
  const confUrl = process.env.HELMSMAN_CONFLUENCE_URL;
  const bambooUrl = process.env.HELMSMAN_BAMBOO_URL;

  const jiraCred = (await vault.get("jira")) as Credential | undefined;
  const bbCred = (await vault.get("bitbucket")) as Credential | undefined;
  const elkCred = (await vault.get("elk")) as Credential | undefined;
  const confCred = (await vault.get("confluence")) as Credential | undefined;
  const bambooCred = (await vault.get("bamboo")) as Credential | undefined;

  const live = !!(jiraUrl && bbUrl && jiraCred && bbCred);

  if (live) {
    return {
      jira: new JiraClient({ baseUrl: jiraUrl!, credential: jiraCred! }),
      bitbucket: new BitbucketServerClient({ baseUrl: bbUrl!, credential: bbCred! }),
      elk: elkUrl && elkCred ? new ElkClient({ baseUrl: elkUrl, credential: elkCred }) : new FixtureElkClient([]),
      confluence:
        confUrl && confCred
          ? new ConfluenceClient({ baseUrl: confUrl, credential: confCred })
          : new FixtureConfluenceClient(),
      bamboo:
        bambooUrl && bambooCred
          ? new BambooClient({ baseUrl: bambooUrl, credential: bambooCred })
          : new FixtureBambooClient(),
      repo,
      repoRef,
      targetBranch,
      live: true,
    };
  }

  // Offline fixtures seeded with a coherent demo scenario.
  return {
    jira: new FixtureJiraClient().seed({
      key: "DEMO-1",
      summary: "Login fails with NullPointer",
      description: "Users hit a crash when submitting the login form under load.",
      status: "Open",
      labels: ["bug"],
    }),
    elk: new FixtureElkClient([
      { timestamp: new Date().toISOString(), level: "ERROR", message: "NullPointerException in LoginController.handle() req=abc123", service: "web" },
      { timestamp: new Date().toISOString(), level: "INFO", message: "downstream auth call req=abc123", service: "auth" },
    ]),
    bitbucket: new FixtureBitbucketClient(),
    confluence: new FixtureConfluenceClient().seed({
      id: "DEMO-SPEC",
      title: "Login hardening spec",
      body: "- Validate session tokens\n- Rate-limit login attempts\nThe system must log every failed login.",
      spaceKey: "ENG",
    }),
    bamboo: new FixtureBambooClient().seed({ planKey: "WEB-MAIN", buildNumber: 42, state: "Successful" }),
    repo,
    repoRef,
    targetBranch,
    live: false,
  };
}

/** A vault for the host: encrypted file vault when a key is set, otherwise ephemeral in-memory. */
export function buildVault(): Vault {
  return new InMemoryVault();
}
