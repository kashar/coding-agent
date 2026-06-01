import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoMap } from "./repo-map.js";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "helmsman-repomap-"));
  writeFileSync(join(dir, ".gitignore"), "*.log\nsecret.ts\nbuild\n");
  writeFileSync(join(dir, "payment.py"), "class PaymentRefund:\n    def process(self):\n        pass\n");
  writeFileSync(join(dir, "server.go"), "package main\nfunc HandleRefund() {}\n");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "checkout.ts"), "export class Checkout { refund() {} }\n");
  writeFileSync(join(dir, "secret.ts"), "export const KEY = 'nope';\n"); // gitignored
  writeFileSync(join(dir, "debug.log"), "noise\n"); // gitignored ext
  return dir;
}

test("listFiles covers multiple languages and honours .gitignore", () => {
  const repo = new RepoMap(makeRepo());
  const paths = repo.listFiles().map((f) => f.path).sort();
  assert.ok(paths.includes("payment.py"));
  assert.ok(paths.includes("server.go"));
  assert.ok(paths.includes("src/checkout.ts"));
  assert.ok(!paths.includes("secret.ts"), "gitignored file excluded");
  assert.ok(!paths.includes("debug.log"), "gitignored extension excluded");
});

test("rankRelevantFiles ranks by query relevance across the repo", () => {
  const repo = new RepoMap(makeRepo());
  const ranked = repo.rankRelevantFiles("refund payment", 5);
  assert.ok(ranked.length > 0);
  // payment.py mentions both "payment" (filename) and "refund" → should rank at/near top.
  assert.equal(ranked[0]!.path, "payment.py");
});

test("outline extracts cross-language declarations", () => {
  const repo = new RepoMap(makeRepo());
  const py = repo.outline("payment.py");
  assert.ok(py.some((i) => /PaymentRefund/.test(i.text)));
  const go = repo.outline("server.go");
  assert.ok(go.some((i) => /HandleRefund/.test(i.text)));
});

test("custom extensions can target any technology", () => {
  const dir = mkdtempSync(join(tmpdir(), "helmsman-ext-"));
  writeFileSync(join(dir, "main.zig"), "pub fn main() void {}\n");
  const repo = new RepoMap(dir, { extraExtensions: [".zig"] });
  assert.ok(repo.listFiles().some((f) => f.path === "main.zig"));
});
