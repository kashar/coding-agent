import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureGitChanges } from "./git.js";
import { runCli } from "./cli-runner.js";
import { MockEngine } from "./mock-adapter.js";

test("captureGitChanges reports working-tree changes in a git repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "helmsman-git-"));
  await runCli("git", ["-C", dir, "init", "-q"]);
  await runCli("git", ["-C", dir, "config", "user.email", "t@t"]);
  await runCli("git", ["-C", dir, "config", "user.name", "t"]);
  await runCli("git", ["-C", dir, "config", "commit.gpgsign", "false"]);
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
  await runCli("git", ["-C", dir, "add", "."]);
  await runCli("git", ["-C", dir, "commit", "--no-gpg-sign", "-qm", "init"]);

  // No changes yet.
  assert.deepEqual((await captureGitChanges(dir)).changedFiles, []);

  // Modify a tracked file and add an untracked one.
  writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
  writeFileSync(join(dir, "b.ts"), "export const b = 3;\n");
  const changes = await captureGitChanges(dir);
  assert.ok(changes.changedFiles.includes("a.ts"));
  assert.ok(changes.changedFiles.includes("b.ts"));
});

test("captureGitChanges returns empty for a non-git directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "helmsman-nogit-"));
  assert.deepEqual(await captureGitChanges(dir), { changedFiles: [], diff: "" });
});

test("MockEngine remains available and deterministic", async () => {
  const e = new MockEngine();
  assert.equal(await e.isAvailable(), true);
  const r = await e.complete({ prompt: "hello" });
  assert.match(r.text, /\[mock\]/);
});
