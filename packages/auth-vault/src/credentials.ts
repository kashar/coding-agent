/**
 * Per-app credentials. Helmsman supports the three auth styles the enterprise tools need:
 *   - pat:   Personal Access Token (Bearer for Bitbucket/Stash Server, or basic-username style)
 *   - basic: username + password / API token (e.g. Jira Cloud email:apiToken)
 *   - oauth: OAuth/SSO access token (per-user, on-behalf-of)
 */
export type Credential =
  | { readonly kind: "pat"; readonly token: string; readonly scheme?: "bearer" | "basic-username" }
  | { readonly kind: "basic"; readonly username: string; readonly password: string }
  | { readonly kind: "oauth"; readonly accessToken: string };

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/** Build the HTTP Authorization header(s) for a credential. */
export function authHeaders(cred: Credential): Record<string, string> {
  switch (cred.kind) {
    case "pat":
      return cred.scheme === "basic-username"
        ? { Authorization: `Basic ${base64(`${cred.token}:`)}` }
        : { Authorization: `Bearer ${cred.token}` };
    case "basic":
      return { Authorization: `Basic ${base64(`${cred.username}:${cred.password}`)}` };
    case "oauth":
      return { Authorization: `Bearer ${cred.accessToken}` };
  }
}
