import type { ExecutionEngine } from "./engine.js";
import { EngineUnavailableError } from "./engine.js";

/**
 * Resolves execution engines by id and selects one for a task. New engines register here, so
 * adding an engine never requires touching workflow code. A future learning-driven policy can
 * wrap `select()` to bias toward the best-performing engine per workflow/repo.
 */
export interface EngineSelectionPolicy {
  /** Ordered preference of engine ids; the first available one wins. */
  readonly preference: readonly string[];
}

export class ExecutionEngineRegistry {
  private readonly engines = new Map<string, ExecutionEngine>();

  register(engine: ExecutionEngine): this {
    this.engines.set(engine.id, engine);
    return this;
  }

  get(id: string): ExecutionEngine | undefined {
    return this.engines.get(id);
  }

  list(): ExecutionEngine[] {
    return [...this.engines.values()];
  }

  /**
   * Select an engine. An explicit `preferredId` (e.g. a Mission Control override) is tried first;
   * otherwise the policy preference order is used, skipping unavailable engines.
   */
  async select(policy: EngineSelectionPolicy, preferredId?: string): Promise<ExecutionEngine> {
    const order = preferredId ? [preferredId, ...policy.preference] : [...policy.preference];
    for (const id of order) {
      const engine = this.engines.get(id);
      if (engine && (await engine.isAvailable())) return engine;
    }
    throw new EngineUnavailableError(
      order.join(","),
      "no preferred engine is registered and available",
    );
  }
}
