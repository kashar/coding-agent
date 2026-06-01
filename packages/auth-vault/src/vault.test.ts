import { test } from "node:test";
import assert from "node:assert/strict";
import { authHeaders, type Credential } from "./credentials.js";
import { InMemoryVault } from "./vault.js";

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
