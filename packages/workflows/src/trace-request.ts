import { z } from "zod";
import type { WorkflowDefinition } from "@helmsman/core-orchestrator";
import type { ElkLogEntry, IElkClient } from "@helmsman/integrations";
import { assembleContext, type RepoMap } from "@helmsman/context-engine";

export const TraceRequestInput = z.object({
  correlationId: z.string().min(1),
});
export type TraceRequestInput = z.infer<typeof TraceRequestInput>;

export interface TraceRequestDeps {
  readonly elk: IElkClient;
  readonly repo?: RepoMap;
}

interface TraceSignals {
  logs?: ElkLogEntry[];
  services?: string[];
}

/**
 * Support/QA workflow: follow a request across services using ELK, then narrate the trace.
 * Grounds service/handler names in code when a repo is available.
 */
export function createTraceRequestWorkflow(deps: TraceRequestDeps): WorkflowDefinition {
  return {
    id: "trace-request",
    description: "Trace a request across services from logs and summarise the flow.",
    persona: "support",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["support", "qa", "trace"],
    steps: [
      {
        name: "gather-logs",
        checks: [
          {
            name: "logs-found",
            phase: "post",
            async run(c) {
              const s = c.signals as TraceSignals;
              return { passed: (s.logs?.length ?? 0) > 0, detail: `${s.logs?.length ?? 0} log lines` };
            },
          },
        ],
        async run(ctx) {
          const input = TraceRequestInput.parse(ctx.workflowInput);
          const s = ctx.signals as TraceSignals;
          ctx.log(`Searching ELK for correlation id ${input.correlationId}`);
          s.logs = await deps.elk.search({ query: input.correlationId, size: 200 });
          s.services = [...new Set(s.logs.map((l) => l.service ?? "unknown"))];
          return { logCount: s.logs.length, services: s.services };
        },
      },
      {
        name: "summarise-trace",
        async run(ctx) {
          const s = ctx.signals as TraceSignals;
          const logs = (s.logs ?? [])
            .slice()
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          const bundle = assembleContext({ logs });
          ctx.log("Summarising request trace via the selected engine");
          const res = await ctx.engine.complete({
            prompt: "Summarise this request trace across services, noting where it failed.",
            context: bundle,
          });
          return {
            services: s.services ?? [],
            eventCount: logs.length,
            timeline: logs.map((l) => ({ ts: l.timestamp, service: l.service, message: l.message })),
            summary: res.text,
          };
        },
      },
    ],
  };
}
