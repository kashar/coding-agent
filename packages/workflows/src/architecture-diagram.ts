import { z } from "zod";
import type { WorkflowDefinition } from "@helmsman/core-orchestrator";
import type { IConfluenceClient } from "@helmsman/integrations";
import type { RepoMap } from "@helmsman/context-engine";

export const ArchDiagramInput = z.object({
  title: z.string().default("Architecture overview"),
  /** When set with a Confluence client, publish the diagram to this space. */
  spaceKey: z.string().optional(),
});
export type ArchDiagramInput = z.infer<typeof ArchDiagramInput>;

export interface ArchDiagramDeps {
  readonly repo: RepoMap;
  readonly confluence?: IConfluenceClient;
}

interface ArchSignals {
  modules?: { name: string; files: number }[];
  mermaid?: string;
}

/** Derive top-level modules from the file tree (first path segment). */
function deriveModules(paths: string[]): { name: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const top = p.includes("/") ? p.slice(0, p.indexOf("/")) : "(root)";
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files - a.files);
}

function toMermaid(title: string, modules: { name: string; files: number }[]): string {
  const lines = ["graph TD", `  subgraph "${title}"`];
  for (const m of modules) {
    const id = m.name.replace(/[^a-zA-Z0-9]/g, "_");
    lines.push(`    ${id}["${m.name} (${m.files} files)"]`);
  }
  lines.push("  end");
  return lines.join("\n");
}

/** Architect workflow: generate a Mermaid architecture diagram from code, optionally publish it. */
export function createArchitectureDiagramWorkflow(deps: ArchDiagramDeps): WorkflowDefinition {
  return {
    id: "architecture-diagram",
    description: "Generate a Mermaid architecture diagram from the codebase (optionally publish).",
    persona: "architect",
    enginePolicy: { preference: ["amp", "copilot", "mock"] },
    tags: ["architect", "diagram"],
    steps: [
      {
        name: "scan-repo",
        checks: [
          {
            name: "modules-found",
            phase: "post",
            async run(c) {
              return { passed: (c.signals as ArchSignals).modules!.length > 0, detail: "" };
            },
          },
        ],
        async run(ctx) {
          const s = ctx.signals as ArchSignals;
          const files = deps.repo.listFiles().map((f) => f.path);
          s.modules = deriveModules(files);
          ctx.log(`Scanned ${files.length} files into ${s.modules.length} modules`);
          return { modules: s.modules };
        },
      },
      {
        name: "generate-diagram",
        async run(ctx) {
          const input = ArchDiagramInput.parse(ctx.workflowInput);
          const s = ctx.signals as ArchSignals;
          s.mermaid = toMermaid(input.title, s.modules ?? []);
          // Engine adds a narrative description alongside the deterministic diagram.
          await ctx.engine.complete({
            prompt: `Describe this architecture diagram in prose:\n${s.mermaid}`,
          });
          return { mermaid: s.mermaid };
        },
      },
      {
        name: "publish-or-return",
        async run(ctx) {
          const input = ArchDiagramInput.parse(ctx.workflowInput);
          const s = ctx.signals as ArchSignals;
          if (deps.confluence && input.spaceKey) {
            ctx.log(`Publishing diagram to Confluence space ${input.spaceKey}`);
            const page = await deps.confluence.createPage({
              spaceKey: input.spaceKey,
              title: input.title,
              body: `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">mermaid</ac:parameter><ac:plain-text-body><![CDATA[${s.mermaid}]]></ac:plain-text-body></ac:structured-macro>`,
            });
            return { status: "published" as const, pageId: page.id, url: page.url };
          }
          return { status: "generated" as const, mermaid: s.mermaid };
        },
      },
    ],
  };
}
