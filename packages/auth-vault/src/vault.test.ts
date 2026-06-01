import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authHeaders, type Credential } from "./credentials.js";
import { EncryptedFileVault, InMemoryVault, resolveVaultKey } from "./vault.js";
import {
  APPS,
  credentialFromFlags,
  onboardAppNonInteractive,
  parseArgs,
} from "./onboard-core.js";

test("authHeaders builds the right scheme per credential kind", () => {
  assert.deepEqual(authHeaders({ kind: "pat", token: "t" }), { Authorization: "Bearer t" });
  assert.deepEqual(authHeaders({ kind: "pat", token: "t", scheme: "basic-username" }), {
    Authorization: `Basic ${Buffer.from("t:").toString("base64")}`,
  });
  assert.deepEqual(authHeaders({ kind: "basic", username: "u", password: "p" }), {
    Authorization: `Basic ${Buffer.from("u:p").toString("base64")}`,
  });
  assert.deepEqual(authHeaders({ kind: "oauth", accessToken: "a" }), { Authorization: "Bearer a" });
});

test("InMemoryVault stores and retrieves credentials by key", async () => {
  const v = new InMemoryVault();
  const cred: Credential = { kind: "basic", username: "u", password: "p" };
  await v.set("jira", cred);
  assert.deepEqual(await v.get("jira"), cred);
  assert.deepEqual(await v.list(), ["jira"]);
  assert.equal(await v.get("missing"), undefined);
});

test("EncryptedFileVault round-trips secrets and stores them encrypted at rest", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "helmsman-vault-")), "v.vault");
  const cred: Credential = { kind: "pat", token: "topsecret-xyz", scheme: "bearer" };
  const v = new EncryptedFileVault(file, "master-key-123");
  await v.set("bitbucket", cred);
  assert.deepEqual(await v.get("bitbucket"), cred);
  // The token must not appear in plaintext on disk.
  assert.ok(!readFileSync(file, "utf8").includes("topsecret-xyz"));
  // A fresh instance with the same key can decrypt.
  assert.deepEqual(await new EncryptedFileVault(file, "master-key-123").get("bitbucket"), cred);
});

test("resolveVaultKey reads HELMSMAN_VAULT_KEY from the environment", () => {
  const prev = process.env.HELMSMAN_VAULT_KEY;
  process.env.HELMSMAN_VAULT_KEY = "envkey";
  try {
    assert.equal(resolveVaultKey(), "envkey");
  } finally {
    if (prev === undefined) delete process.env.HELMSMAN_VAULT_KEY;
    else process.env.HELMSMAN_VAULT_KEY = prev;
  }
});

test("parseArgs splits positionals and --flags (space and = forms)", () => {
  const { positional, flags } = parseArgs(["jira", "--url", "https://x", "--kind=basic", "--ci"]);
  assert.deepEqual(positional, ["jira"]);
  assert.equal(flags.url, "https://x");
  assert.equal(flags.kind, "basic");
  assert.equal(flags.ci, "true");
});

test("credentialFromFlags builds each credential kind and rejects incomplete input", () => {
  assert.deepEqual(credentialFromFlags({ kind: "basic", username: "u", password: "p" }), {
    kind: "basic",
    username: "u",
    password: "p",
  });
  assert.deepEqual(credentialFromFlags({ kind: "pat", token: "t" }), {
    kind: "pat",
    token: "t",
    scheme: "bearer",
  });
  assert.equal(credentialFromFlags({ kind: "basic", username: "u" }), undefined);
  assert.equal(credentialFromFlags({ kind: "pat" }), undefined);
});

test("onboardAppNonInteractive stores the credential in the vault", async () => {
  process.env.HELMSMAN_ENV_FILE = join(mkdtempSync(join(tmpdir(), "helmsman-onb-")), "h.env");
  const vault = new InMemoryVault();
  const jira = APPS.find((a) => a.key === "jira")!;
  const ok = await onboardAppNonInteractive(
    jira,
    { url: "https://acme", kind: "pat", token: "abc" },
    vault,
  );
  assert.equal(ok, true);
  assert.deepEqual(await vault.get("jira"), { kind: "pat", token: "abc", scheme: "bearer" });
});
