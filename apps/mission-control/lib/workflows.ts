import type { WorkflowDefinition } from "@helmsman/core-orchestrator";
import type { Check } from "@helmsman/verification";

const producesOutput: Check = {
  name: "produces-output",
  phase: "post",
  async run(ctx) {
    const ok = typeof ctx.output === "string" && ctx.output.length > 0;
    return { passed: ok, detail: ok ? "output present" : "missing output" };
  },
};

/**
 * Built-in workflows registered at startup. These are intentionally config-driven: additional
 * workflows/personas are added here (or loaded from disk later) without touching the orchestrator.
 * The flagship "Fix bug" workflow is implemented for real in Phase 1; this is its Phase 0 scaffold.
 */
export const builtinWorkflows: WorkflowDefinition[] = [
  {
    id: "demo.echo",
    description: "Three-step demo workflow proving the engine end-to-end.",
    persona: "developer",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["demo"],
    steps: [
      {
        name: "understand",
        async run(ctx) {
          ctx.log("Gathering context");
          return (await ctx.engine.complete({ prompt: `Understand: ${String(ctx.workflowInput)}` })).text;
        },
      },
      {
        name: "act",
        checks: [producesOutput],
        async run(ctx) {
          ctx.log("Running agentic task");
          return (await ctx.engine.runAgenticTask({ objective: String(ctx.workflowInput) })).summary;
        },
      },
      {
        name: "report",
        async run(ctx) {
          return `done: ${String(ctx.outputs["act"])}`;
        },
      },
    ],
  },
];
