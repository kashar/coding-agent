# Decision Log

Locks the 10 open questions from `architecture.md §11`. Each entry follows
ADR shape: status, decision, context, consequences, reversal trigger.

---

## ADR-001 — Deployment: on-prem K8s

**Status**: Accepted
**Decision**: Run the platform on the existing on-prem Kubernetes estate.
**Context**: We already operate K8s clusters with Bamboo deploys and Grafana
coverage; data sensitivity (payments, customer PII) tilts away from public
cloud; org has no SaaS budget approval for a year-1 launch.
**Consequences**: Slower bootstrap (no managed Temporal, OpenSearch,
Postgres); ops burden owned by the platform team; clear data residency.
**Reversal trigger**: Org adopts a public-cloud sovereign offering with
the required certifications, AND ops cost exceeds 1.5× equivalent SaaS.

## ADR-002 — Vector store: pgvector

**Status**: Accepted
**Decision**: pgvector co-located with the metadata/ACL Postgres.
**Context**: KB size projected <10M items in year 1; ACL joins are common
and benefit from being in the same DB; we avoid an extra system.
**Consequences**: Single ANN index per Postgres instance; HNSW good
enough for our query latency budget. Cross-region replication unsolved
(deferred — single-region in Phase 0–2).
**Reversal trigger**: Cardinality crosses ~20M items, OR p95 search
latency exceeds 300ms under realistic load, OR org standardises on a
managed vector DB.

## ADR-003 — Orchestrator: Temporal

**Status**: Accepted
**Decision**: Temporal (self-hosted) for all workflow orchestration; each
skill execution is an activity; human gates are Temporal signals.
**Context**: Workflows can span minutes (human gates ≤48h for BA flow);
retries, compensation, replay, and signals are table-stakes. LangGraph
is in-process; durability bolt-on is awkward.
**Consequences**: Heavier infra (Temporal server + workers); but pays
back the first time a 30-minute flow needs to resume after a pod crash.
Spec'd to be wrapped: workflow YAML is portable — could compile to
Argo or Step Functions later.
**Reversal trigger**: Most flows complete in <30s AND human gates move
out-of-process (e.g. to a separate approval service), making durability
less valuable than simplicity.

## ADR-004 — Graph DB: Neo4j from Phase 1

**Status**: Accepted
**Decision**: Neo4j Community Edition in Phase 0; Enterprise if/when we
need clustering. Graph schema per architecture §3.
**Context**: Traceability is a stated goal; deferring the graph forces
us to fake it with vector hops, which is unreliable for causal queries.
**Consequences**: One more system to operate; Cypher learning curve for
authors of the `trace` resolver. Community edition lacks clustering —
acceptable until billions of edges.
**Reversal trigger**: Edge count > 1B AND Community can't keep up, OR
we move to a graph-capable property store (e.g. Postgres + Apache AGE).

## ADR-005 — Slack/Teams ingestion: defer to Phase 3

**Status**: Accepted
**Decision**: No Slack/Teams content in KB before Phase 3.
**Context**: High signal (incident discussions, customer-support context)
but high legal/consent overhead (DM scope, retention policy, GDPR).
**Consequences**: KB misses real-time tribal knowledge through Phase 2.
Compensate by harvesting postmortems and runbooks more aggressively.
**Reversal trigger**: Legal sign-off lands and an opt-in mechanism per
channel is built; OR a single high-value channel (e.g. `#incidents`)
is whitelisted by the security team with PII redaction at ingest.

## ADR-006 — Embeddings: self-hosted `bge-large-en-v1.5`

**Status**: Accepted
**Decision**: Self-hosted `bge-large-en-v1.5` on the on-prem inference
cluster (vLLM or TEI). Code embeddings use the same model (acceptable
penalty vs. code-specialised; revisit if recall is bad on code).
**Context**: KB is internal; sending embeddings to a hosted API is the
same surface as sending content. Cost at scale (100M chunks) makes
self-hosting clearly cheaper.
**Consequences**: GPU capacity required for ingest backfills; mitigated
by chunk_hash caching so re-indexing is near-free.
**Reversal trigger**: Code-search recall drops below 0.7 in evals AND a
code-tuned model is hostable on the same infra; THEN add a second model
for `type=code` chunks rather than swap globally.

## ADR-007 — Judge models: different family from generator

**Status**: Accepted
**Decision**: Judges live in a separate `config/model-policy.yaml`
section and must come from a different provider family than the
generator they grade.
**Context**: Self-grading bias is well-documented; pairwise studies show
≥10pp inflation when judge and generator share weights.
**Consequences**: Slight cost premium; periodic re-calibration against
human labels required (quarterly).
**Reversal trigger**: Open-source judge models reach human agreement
≥90% on our rubrics AND can be hosted in the same family without bias
inflation > 3pp.

## ADR-008 — Skill authoring: engineers only through Phase 2

**Status**: Accepted
**Decision**: Skills and workflows are PR-reviewed code artifacts owned
by engineers through Phase 2. A self-serve authoring UI lands in Phase 3
for BAs and QA leads.
**Context**: Skill quality directly drives output quality; un-reviewed
skills bypass our eval gates. Velocity is fine without a UI in early
phases.
**Consequences**: BA/QA contribute via examples and case authoring (eval
fixtures) rather than skill prompts; engineers translate their intent.
**Reversal trigger**: Eval CI is mature enough that an un-engineer-reviewed
skill cannot regress production metrics (i.e. the gates are the gatekeeper).

## ADR-009 — Multi-tenant: one cluster, namespace per team

**Status**: Accepted
**Decision**: Single platform K8s cluster; per-team namespace with
NetworkPolicy + ResourceQuota; per-team service accounts.
**Context**: Cost (one control plane), shared infra components
(Postgres, OpenSearch, Neo4j) used by all. Blast radius mitigated by
strict policy at the Tool Gateway and Retrieval facade.
**Consequences**: Noisy-neighbour risk on shared stores; mitigated by
per-team quotas in `config/budgets.yaml` and per-team read replicas if
needed.
**Reversal trigger**: A team's compliance regime (e.g. payments PCI)
demands physical isolation that NetworkPolicy can't satisfy.

## ADR-010 — Tool Gateway: build, not buy

**Status**: Accepted
**Decision**: Build the Tool Gateway in-house (target ≤2 kLOC for the
core: routing, authz, PII, audit, budget). Reuse OSS for: OPA for
policy, Presidio for PII, OpenTelemetry SDK for tracing.
**Context**: No OSS gateway cleanly combines (a) MCP/REST/gRPC transports,
(b) per-call ACL propagation from the caller's identity to the upstream
data ACL, (c) PII scrub on request AND response, (d) per-workflow budget
enforcement. Wrappers stitching 4 tools together would exceed 2 kLOC.
**Consequences**: We own the surface; security review on every change.
**Reversal trigger**: An OSS gateway emerges that supports the above
four properties first-class AND the migration cost is < 6 weeks.

---

## Amp SDK as the bootstrap runtime

We use Amp (`ampcode.com`, Claude-backed) as the **first** `AgentRuntime`
adapter for two pragmatic reasons:

1. We already have Amp licences and integration approval at work.
2. Amp's tool registry maps cleanly to our Tool Gateway's tool schema —
   a tool YAML in `plugins/tools/` becomes an Amp tool registration
   without translation.

The adapter is a thin shim, not the contract. The mapping:

| Platform concept              | Amp SDK construct                |
|------------------------------|----------------------------------|
| `WorkflowSpec.steps[]`       | Sequence of Amp `agent.run()` invocations bridged via Temporal |
| `SkillSpec` system + procedure | Amp prompt + tool list per call |
| `plugins/tools/*.yaml`       | Amp tool definitions (1:1 schema) |
| `AgentRuntime.invoke()`      | `amp.runWithTools(...)` |
| `on_tool_call` callback      | Amp tool handler → Tool Gateway gRPC |
| `model_policy`               | Amp model selector + cost cap |
| Reproducibility tuple        | Captured via Amp telemetry hooks + our own OTel span |

What Amp does NOT do for us (and the platform handles):
- Workflow durability and human gates (Temporal).
- Retrieval (our facade fans out across pgvector/OS/Neo4j).
- Graph traversal (`trace` tool service).
- Policy enforcement beyond model-level (Tool Gateway + OPA).
- Audit log immutability (separate append-only store).

A second adapter (Anthropic direct) is required by Phase 1 so we can
prove portability — same skills, same workflows, different runtime.
