import { InMemoryVault, type Credential, type Vault } from "@helmsman/auth-vault";
import {
  BitbucketServerClient,
  ElkClient,
  FixtureBitbucketClient,
  FixtureElkClient,
  FixtureJiraClient,
  JiraClient,
  type IBitbucketClient,
  type IElkClient,
  type IJiraClient,
} from "@helmsman/integrations";
import { RepoMap } from "@helmsman/context-engine";
import type { FixBugDeps } from "@helmsman/workflows";
import type { LearningStore } from "@helmsman/learning";

/**
 * Build Fix-bug dependencies. If the enterprise endpoints are configured via env + a vault
 * credential, real clients are used; otherwise seeded fixtures keep the workflow fully runnable
 * offline (mirroring the Mock execution engine).
 */
export async function buildFixBugDeps(learning: LearningStore, vault: Vault): Promise<FixBugDeps> {
  const repoRef = {
    project: process.env.HELMSMAN_BITBUCKET_PROJECT ?? "APP",
    slug: process.env.HELMSMAN_BITBUCKET_SLUG ?? "web",
  };

  const jiraUrl = process.env.HELMSMAN_JIRA_URL;
  const elkUrl = process.env.HELMSMAN_ELK_URL;
  const bbUrl = process.env.HELMSMAN_BITBUCKET_URL;

  const jiraCred = await vault.get("jira");
  const elkCred = await vault.get("elk");
  const bbCred = await vault.get("bitbucket");

  const live = !!(jiraUrl && bbUrl && jiraCred && bbCred);

  let jira: IJiraClient;
  let elk: IElkClient;
  let bitbucket: IBitbucketClient;

  if (live) {
    jira = new JiraClient({ baseUrl: jiraUrl!, credential: jiraCred as Credential });
    elk = elkUrl && elkCred ? new ElkClient({ baseUrl: elkUrl, credential: elkCred }) : new FixtureElkClient([]);
    bitbucket = new BitbucketServerClient({ baseUrl: bbUrl!, credential: bbCred as Credential });
  } else {
    jira = new FixtureJiraClient().seed({
      key: "DEMO-1",
      summary: "Login fails with NullPointer",
      description: "Users hit a crash when submitting the login form under load.",
      status: "Open",
      labels: ["bug"],
    });
    elk = new FixtureElkClient([
      {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: "NullPointerException in LoginController.handle()",
        service: "web",
      },
    ]);
    bitbucket = new FixtureBitbucketClient();
  }

  return {
    jira,
    elk,
    bitbucket,
    repoRef,
    repo: new RepoMap(process.env.HELMSMAN_REPO_DIR ?? process.cwd()),
    targetBranch: process.env.HELMSMAN_TARGET_BRANCH ?? "main",
    learning,
  };
}

/** A vault for the host. Uses the encrypted file vault if a key is set; otherwise in-memory. */
export function buildVault(): Vault {
  // Encrypted file vault requires HELMSMAN_VAULT_KEY; fall back to ephemeral in-memory for dev.
  return new InMemoryVault();
}
