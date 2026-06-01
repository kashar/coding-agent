import type { ZodType } from "zod";

/**
 * A unified, MCP-style tool registry. Integrations and any additional MCP servers are exposed as
 * named, schema-validated tools that workflows (and execution engines) can call. Per-task scoping
 * lets a workflow step attach extra tools/context just for that task without mutating the base.
 */
export interface ToolDef<I = unknown, O = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodType<I>;
  invoke(input: I): Promise<O>;
}

/** Identity helper that preserves a tool's input/output generics through inference. */
export function defineTool<I, O>(tool: ToolDef<I, O>): ToolDef<I, O> {
  return tool;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();

  register<I, O>(tool: ToolDef<I, O>): this {
    this.tools.set(tool.name, tool as ToolDef);
    return this;
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list(): { name: string; description: string }[] {
    return [...this.tools.values()].map((t) => ({ name: t.name, description: t.description }));
  }

  /** Validate input against the tool schema and invoke it. */
  async invoke(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const parsed = tool.inputSchema.parse(input);
    return tool.invoke(parsed);
  }

  /**
   * Produce a child registry that includes this registry's tools plus extra per-task tools.
   * Extra tools override base tools with the same name. The base is never mutated.
   */
  scoped(extra: readonly ToolDef[]): ToolRegistry {
    const child = new ToolRegistry();
    for (const t of this.tools.values()) child.register(t);
    for (const t of extra) child.register(t);
    return child;
  }
}
