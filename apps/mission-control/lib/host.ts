import { createLogger, InProcessEventBus, type EventBus } from "@helmsman/shared";
import { SqliteRunStore, type RunStore } from "@helmsman/data";
import {
  AmpAdapter,
  CopilotAdapter,
  ExecutionEngineRegistry,
  MockEngine,
} from "@helmsman/execution-engines";
import { SqliteLearningStore, type LearningStore } from "@helmsman/learning";
import { Orchestrator, WorkflowRegistry } from "@helmsman/core-orchestrator";
import {
  createArchitectureDiagramWorkflow,
  createFixBugWorkflow,
  createTraceRequestWorkflow,
  createTriageWorkflow,
  createWriteStoriesWorkflow,
} from "@helmsman/workflows";
import { buildIntegrationTools, ToolRegistry } from "@helmsman/mcp-gateway";
import { builtinWorkflows } from "./workflows";
import { buildClients, buildVault } from "./clients";

/**
 * Process-wide Helmsman runtime host. Cached on globalThis so Next.js hot-reload and multiple
 * route handlers share a single orchestrator, event bus, store, and tool registry.
 */
export interface Host {
  readonly store: RunStore;
  readonly bus: EventBus;
  readonly engines: ExecutionEngineRegistry;
  readonly workflows: WorkflowRegistry;
  readonly learning: LearningStore;
  readonly orchestrator: Orchestrator;
  readonly tools: ToolRegistry;
  readonly live: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __helmsmanHost: Promise<Host> | undefined;
}

async function build(): Promise<Host> {
  const logger = createLogger("info", { component: "mission-control" });
  const bus = new InProcessEventBus();
  const store = new SqliteRunStore();
  const learning = new SqliteLearningStore();

  const engines = new ExecutionEngineRegistry()
    .register(new AmpAdapter())
    .register(new CopilotAdapter())
    .register(new MockEngine());

  const vault = buildVault();
  const c = await buildClients(vault);

  // Config-driven workflow registry: adding a workflow is a single register() call.
  const workflows = new WorkflowRegistry();
  for (const def of builtinWorkflows) workflows.register(def);
  workflows.register(
    createFixBugWorkflow({
      jira: c.jira,
      elk: c.elk,
      bitbucket: c.bitbucket,
      repoRef: c.repoRef,
      repo: c.repo,
      targetBranch: c.targetBranch,
      learning,
    }),
  );
  workflows.register(createTraceRequestWorkflow({ elk: c.elk, repo: c.repo }));
  workflows.register(createTriageWorkflow({ jira: c.jira, elk: c.elk }));
  workflows.register(createWriteStoriesWorkflow({ confluence: c.confluence, jira: c.jira }));
  workflows.register(createArchitectureDiagramWorkflow({ repo: c.repo, confluence: c.confluence }));

  // Unified MCP-style tool registry over the configured integrations.
  const tools = new ToolRegistry();
  for (const t of buildIntegrationTools({
    jira: c.jira,
    confluence: c.confluence,
    elk: c.elk,
    bamboo: c.bamboo,
    bitbucket: c.bitbucket,
  })) {
    tools.register(t);
  }

  const orchestrator = new Orchestrator({
    store,
    workflows,
    engines,
    bus,
    logger,
    learning,
    // Closed learning loop: prefer the engine that has performed best for each workflow.
    engineAdvisor: (workflowId) => learning.bestEngineFor(workflowId),
  });
  return { store, bus, engines, workflows, learning, orchestrator, tools, live: c.live };
}

export function getHost(): Promise<Host> {
  if (!globalThis.__helmsmanHost) globalThis.__helmsmanHost = build();
  return globalThis.__helmsmanHost;
}
