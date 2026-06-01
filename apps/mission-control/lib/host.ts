import { createLogger, InProcessEventBus, type EventBus } from "@helmsman/shared";
import { SqliteRunStore, type RunStore } from "@helmsman/data";
import {
  AmpAdapter,
  CopilotAdapter,
  ExecutionEngineRegistry,
  MockEngine,
} from "@helmsman/execution-engines";
import { InMemoryLearningStore, type LearningStore } from "@helmsman/learning";
import { Orchestrator, WorkflowRegistry } from "@helmsman/core-orchestrator";
import { createFixBugWorkflow } from "@helmsman/workflows";
import { builtinWorkflows } from "./workflows";
import { buildFixBugDeps, buildVault } from "./fix-bug-deps";

/**
 * Process-wide Helmsman runtime host. Cached on globalThis so Next.js hot-reload and multiple
 * route handlers share a single orchestrator, event bus, and store. All three execution engines
 * are registered; availability is probed at selection time.
 */
export interface Host {
  readonly store: RunStore;
  readonly bus: EventBus;
  readonly engines: ExecutionEngineRegistry;
  readonly workflows: WorkflowRegistry;
  readonly learning: LearningStore;
  readonly orchestrator: Orchestrator;
}

declare global {
  // eslint-disable-next-line no-var
  var __helmsmanHost: Promise<Host> | undefined;
}

async function build(): Promise<Host> {
  const logger = createLogger("info", { component: "mission-control" });
  const bus = new InProcessEventBus();
  const store = new SqliteRunStore();
  const learning = new InMemoryLearningStore();

  const engines = new ExecutionEngineRegistry()
    .register(new AmpAdapter())
    .register(new CopilotAdapter())
    .register(new MockEngine());

  const workflows = new WorkflowRegistry();
  for (const def of builtinWorkflows) workflows.register(def);

  // Register the flagship config-driven Fix-bug workflow (real clients when configured).
  const vault = buildVault();
  const fixBugDeps = await buildFixBugDeps(learning, vault);
  workflows.register(createFixBugWorkflow(fixBugDeps));

  const orchestrator = new Orchestrator({ store, workflows, engines, bus, logger, learning });
  return { store, bus, engines, workflows, learning, orchestrator };
}

export function getHost(): Promise<Host> {
  if (!globalThis.__helmsmanHost) globalThis.__helmsmanHost = build();
  return globalThis.__helmsmanHost;
}
