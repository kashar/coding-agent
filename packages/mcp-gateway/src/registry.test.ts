import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";
import { buildIntegrationTools } from "./integration-tools.js";
import { FixtureJiraClient, type JiraIssue } from "@helmsman/integrations";

test("registry validates input and invokes tools", async () => {
  const reg = new ToolRegistry().register({
    name: "echo",
    description: "echo",
    inputSchema: z.object({ msg: z.string() }),
    invoke: async ({ msg }) => `got:${msg}`,
  });
  assert.equal(await reg.invoke("echo", { msg: "hi" }), "got:hi");
  await assert.rejects(() => reg.invoke("echo", { msg: 123 }));
  await assert.rejects(() => reg.invoke("missing", {}));
});

test("integration tools expose only configured clients", async () => {
  const issue: JiraIssue = { key: "T-1", summary: "s", description: "d", status: "Open", labels: [] };
  const jira = new FixtureJiraClient().seed(issue);
  const reg = new ToolRegistry();
  for (const t of buildIntegrationTools({ jira })) reg.register(t);

  const names = reg.list().map((t) => t.name);
  assert.ok(names.includes("jira.get_issue"));
  assert.ok(!names.includes("elk.search"), "ELK not configured → no ELK tools");
  assert.deepEqual(await reg.invoke("jira.get_issue", { key: "T-1" }), issue);
});

test("scoped registry adds per-task tools without mutating the base", async () => {
  const base = new ToolRegistry().register({
    name: "base",
    description: "",
    inputSchema: z.object({}),
    invoke: async () => "base",
  });
  const scoped = base.scoped([
    { name: "task", description: "", inputSchema: z.object({}), invoke: async () => "task" },
  ]);
  assert.equal(await scoped.invoke("task", {}), "task");
  assert.equal(await scoped.invoke("base", {}), "base");
  assert.equal(base.get("task"), undefined, "base registry stays unmodified");
});
