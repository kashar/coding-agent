# Design Prompt: Org-Wide Agentic Knowledge & Workflow Platform

> Paste this prompt into a strong reasoning model. Replace anything in `<angle brackets>` with your specifics before sending.

---

## Role

You are a principal staff engineer and platform architect. Design a production-grade, **model- and SDK-agnostic agentic platform** that turns my organization's tools, code, and tribal knowledge into a self-growing knowledge base and a library of role-specific agentic workflows. Optimize for **loose coupling, extensibility, traceability, and evaluability** over cleverness.

The output is an **architecture + implementation blueprint**, not code. Where code is needed, use small, illustrative snippets (TypeScript or Python, your choice) and clearly marked interfaces.

## Operating context

- **Organization shape**: multiple multi-module repos; teams of Devs, BAs, QA, Support, and SREs.
- **Existing MCP servers** (already connected, treat as given inputs): Confluence, Jira, Stash/Bitbucket, Bamboo, ELK, Kubernetes, Grafana.
- **Runtime SDK available today**: Amp SDK (ampcode.com, Claude-backed). The design must **not** hard-bind to it — Amp/Claude is one pluggable runtime among many (OpenAI, Bedrock, local OSS via vLLM/Ollama, etc.). Model selection is **config-driven per workflow/agent**.
- **Skills and agents** are first-class artifacts (Markdown + frontmatter, similar to Claude Code skills/subagents) and must be portable across runtimes.

## Goals (must satisfy all)

1. **Self-growing knowledge base** ingested continuously from: source code (all repos, all modules), Confluence spaces, Jira issues + comments + transitions, Bitbucket PRs + reviews + commits, Bamboo build logs + failure patterns, ELK production logs, K8s manifests + events, Grafana dashboards + alert history, runbooks, Slack/Teams threads (optional future), incident postmortems.
2. **Role-specific agentic workflows** for Dev, QA, BA, Support, SRE — each composed of reusable skills + subagents.
3. **Skills & agents as code**: versioned, reviewable, testable artifacts living in a repo with CODEOWNERS.
4. **Evaluation harness** that scores agent output for accuracy, groundedness, completeness, and policy compliance — both offline (regression suites) and online (sampled live traffic).
5. **Extensible, loosely-coupled framework**: new tools, new data sources, new agents, new teams can be added without touching the core. Plugin/registry pattern.
6. **End-to-end request traceability** across repos/services/issues — given a Jira ticket, a Support case, or a PR, produce the full causal/temporal chain across systems.
7. **Model- and SDK-agnostic**: a workflow definition is portable; swapping Claude→GPT→Llama is a config change, not a code change.

## Deliverables — produce each section in order

### 1. High-level architecture
- Component diagram (ASCII or Mermaid) with these planes clearly separated:
  - **Ingestion plane** (connectors → normalizers → chunkers → enrichers)
  - **Knowledge plane** (vector store, lexical/BM25 store, graph store, blob store, metadata DB)
  - **Reasoning plane** (LLM router, agent runtime, skill executor, tool gateway / MCP proxy)
  - **Orchestration plane** (workflow engine, queues, schedulers, human-in-the-loop)
  - **Evaluation plane** (eval harness, judges, regression DB, drift monitors)
  - **Observability plane** (traces, costs, prompts, tool calls, eval scores)
  - **Governance plane** (RBAC, PII/secret scrubbing, audit log, policy engine)
- Data flow for: (a) ingestion of one Confluence page, (b) a Dev asking "why did this service start failing after release 2.4.1?", (c) a QA agent generating regression tests for a PR.

### 2. Knowledge base design
- **Source connectors**: define a `Source` interface (pull/push, incremental, watermark, backfill). Show concrete shapes for Confluence, Jira, Bitbucket, Codebase (AST-aware), Bamboo, ELK, K8s, Grafana.
- **Normalization schema**: a canonical `KnowledgeItem` with `{id, source, uri, type, title, body, structured, embeddings[], entities[], relations[], owners[], acl[], timestamps, hashes, provenance}`.
- **Chunking strategy** per content type (code by symbol/AST, docs by heading, logs by incident window, Jira by event timeline).
- **Enrichment pipeline**: entity extraction (services, repos, tickets, people, env), cross-source link resolution (e.g. commit ↔ PR ↔ ticket ↔ deploy ↔ alert), summary generation, taxonomy tagging.
- **Storage**: hybrid retrieval (dense + sparse + graph). Specify which store for which job and why. Cover incremental updates, deletions, tombstones, GDPR delete.
- **Freshness & cost**: change-data-capture vs. polling, dedup, embedding re-use, cost guardrails.

### 3. Knowledge graph for traceability
- Define the entity and edge types needed to trace a request across systems: `Repo`, `Module`, `Service`, `Commit`, `PR`, `Build`, `Deploy`, `Ticket`, `IncidentAlert`, `LogEvent`, `Dashboard`, `Person`, `Team`, `Doc`.
- Define edges (`fixes`, `mentions`, `deployed-by`, `breaks`, `owns`, `references`, `caused-by`, …).
- Show the **resolver algorithm** that, given any one entity, returns the connected timeline ranked by causal likelihood.
- Show how this graph powers a `trace(request_id|ticket|pr|incident)` tool exposed to agents.

### 4. Agent & skill model (portable, runtime-agnostic)
- Define a **WorkflowSpec** (YAML) and a **SkillSpec** (Markdown + frontmatter) that together describe an agentic workflow without referencing any specific SDK.
- Specify:
  - Skill: `name, description, inputs, outputs, tools[], prompts, examples, eval_cases, owners`.
  - Subagent: `name, role, system_prompt, allowed_tools, allowed_skills, model_policy, budget`.
  - Workflow: `triggers[], steps[], routing, guardrails, human_gates, sla`.
- Show a **runtime adapter interface** (`AgentRuntime`) with implementations for: Amp SDK, Anthropic SDK, OpenAI SDK, Bedrock, local OSS. The same `WorkflowSpec` must execute on any.
- Define the **tool gateway**: a single registry that wraps MCP servers + internal APIs, applies authz/PII scrubbing, emits traces, enforces rate/cost budgets. Agents never call MCP directly — only via the gateway.
- Define the **model router**: pick model per step based on cost/latency/capability/sensitivity rules in config; support fallback chains.

### 5. Reference workflows (give one concrete spec each)
Provide an end-to-end spec (trigger, steps, skills used, tools used, guardrails, evals, success metrics) for:
- **Dev**: "Explain this failing build and propose a fix PR" (input: Bamboo build URL).
- **QA**: "Generate risk-based regression test plan for PR #X" (input: PR URL).
- **BA**: "Draft acceptance criteria and impacted-systems list from this Jira epic" (input: Jira key).
- **Support**: "Triage this customer ticket, find prior similar incidents, draft response, suggest owning team" (input: ticket id).
- **SRE**: "Given this Grafana alert, correlate with recent deploys + log anomalies and produce an incident brief" (input: alert id).

For each, list the **shared skills** they reuse (e.g. `find-owning-team`, `summarize-commit-range`, `correlate-deploy-to-alert`, `draft-response`, `cite-sources`).

### 6. Evaluation framework
- **Offline eval**: golden datasets per workflow; metrics (groundedness/citation accuracy, factuality vs. KB, task success, hallucination rate, code-compile/test-pass for code outputs, tool-use correctness, cost, latency).
- **LLM-as-judge**: rubric design, judge model selection, calibration against human labels, bias controls.
- **Online eval**: sampled production traces, shadow runs, A/B between model/prompt variants, regression alerts.
- **Red-team & safety**: prompt-injection corpus (especially for ingested external content), permission-escape tests, data-exfil tests against the tool gateway.
- **CI integration**: every change to a Skill/Workflow/Prompt triggers eval suite; promotion gates by score threshold.

### 7. Extensibility model
- Plugin contracts for: `Source`, `Tool`, `Skill`, `Subagent`, `Runtime`, `Judge`, `Storage`.
- Registry + discovery (filesystem convention + manifest).
- Versioning, semver, deprecation policy.
- Multi-tenant config: per-team overrides without forking core.
- How another team in the org onboards a new workflow in <1 day.

### 8. Governance, security, ops
- AuthN/Z model (SSO, per-tool scopes, per-source ACL propagation into retrieval).
- Secret handling, PII detection and redaction at ingestion AND egress.
- Audit log: every prompt, tool call, retrieval, model used, cost, user.
- Cost controls and quotas per team/workflow/user.
- Rollout: dark launch → shadow → canary → GA, per workflow.
- DR/Backups for KB; reproducibility (pinned prompt + pinned model + pinned KB snapshot per trace).

### 9. Repo & code layout
Propose the monorepo (or polyrepo) layout, top-level packages, where Skills/Workflows live, CODEOWNERS strategy, how a Dev adds a new Skill (PR template, eval requirements, review checklist).

### 10. Phased delivery plan
- **Phase 0 (2 wks)**: thin slice — one source (Confluence), one workflow (Support triage), one runtime (Amp), one eval suite. End-to-end trace working.
- **Phase 1**: add code + Jira + Bitbucket ingestion; Dev and QA workflows; knowledge graph v1; model router.
- **Phase 2**: ELK + Bamboo + Grafana + K8s; SRE workflow; online eval; multi-runtime support.
- **Phase 3**: org rollout, self-serve skill authoring, federated team plugins, FinOps dashboards.

For each phase: scope, exit criteria, risks, kill-switches.

### 11. Open questions you want me to answer before finalizing
List the top 10 decisions you need from me (vector DB choice, on-prem vs. cloud, build-vs-buy for orchestration, etc.) with your recommendation and the tradeoff.

---

## Constraints & non-negotiables

- **No vendor lock-in** at the workflow or skill layer. Amp/Claude is the bootstrap runtime, not the contract.
- Agents **must cite sources** from the KB for every factual claim; un-cited claims are flagged by the evaluator.
- Tools are reached **only** through the gateway; direct MCP calls from agents are forbidden.
- Every agent run is **fully reproducible** from `{workflow_version, skill_versions, prompt_versions, model_id, kb_snapshot_id, inputs}`.
- Prefer **boring, composable** infra over bespoke frameworks. Justify any custom-built component vs. an OSS alternative.
- Design for **<1 day** new-workflow onboarding by a team that has never touched the platform.

## Style of the response

- Lead with the architecture diagram and the 5 most important design decisions (with rationale and rejected alternatives).
- Use tables for interface contracts and tradeoffs.
- Mermaid for diagrams.
- Be opinionated. Where you make a call, say *why* and what you'd reverse it for.
- Length: as long as needed, but every paragraph must earn its place.

Begin.
