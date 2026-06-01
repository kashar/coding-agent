# ⎈ Helmsman — Agentic SDLC Platform

Helmsman is an **engine-agnostic, self-checking, self-improving** agentic platform for the
software development lifecycle. It reads codebases, pulls business and org context from enterprise
systems (Jira, Confluence, Bitbucket/Stash, ELK, Bamboo) via MCP, and runs autonomous workflows
for **Dev, QA, Support, and BA** teams — all observable and controllable from a **Mission Control**
UI.

All model/coding work flows through a single `ExecutionEngine` seam with **co-equal Amp
(Sourcegraph)** and **GitHub Copilot** adapters (plus a deterministic Mock engine for offline dev).
There is no direct LLM dependency.

> Full design and phased plan: see [`PROMPT.md`](./PROMPT.md).

## Status — Phase 0 (Foundation) + Phase 1 (Fix-bug MVP) ✅
A working, verified backbone:
- **Config-driven workflow engine** with durable **start / pause / resume / stop** (resumes from a
  persisted cursor).
- **Execution engines**: `ExecutionEngine` interface + **Amp**, **Copilot**, and **Mock** adapters,
  selected by a per-run/per-workflow policy (overridable from Mission Control).
- **Verification**: pre/during/post checks → a calibrated **confidence score**; low confidence
  flags work for human approval.
- **Learning** (skeleton): captures run outcomes and a lessons store; computes confidence
  calibration error for self-improvement.
- **Local-first persistence** via Node's built-in `node:sqlite` (Postgres-ready abstraction).
- **Mission Control** (Next.js): list/start workflows, pick an engine, pause/resume/stop runs, and
  watch a live SSE event feed.

### Phase 1 — flagship **Fix-bug** workflow (end-to-end)
- **Integrations**: Jira, Bitbucket/Stash (Server/DC), and ELK clients — real HTTP impls **and**
  offline fixtures behind one interface, so the workflow runs fully offline or against live systems.
- **Auth vault**: PAT / Basic / OAuth credentials in an **AES-256-GCM encrypted** local vault.
- **Context engine**: single-repo understanding (file map + code search) + token-budgeted org-context
  assembly (Jira + ELK + code + learned lessons).
- **Fix-bug workflow**: `assemble-context → propose-fix → self-verify → open-PR-or-gate`. It scores
  its own confidence and **opens a Bitbucket PR** (commenting the link on Jira) when confident, or
  **gates for human approval** when not — selectable between Amp and Copilot.

### Phase 2 — full app coverage, more workflows, MCP gateway
- **Confluence + Bamboo** integrations added (clients + offline fixtures) → all five enterprise apps
  (Jira, Confluence, Bitbucket/Stash, ELK, Bamboo) are covered.
- **MCP gateway**: integrations exposed as a unified, schema-validated **tool registry** with
  **per-task scoping** (a workflow step can attach extra tools/context just for that task).
- **Four new config-driven workflows** (each persona-tagged, registered in one call):
  `trace-request` (Support/QA), `triage` (Support/QA), `write-jira-stories` (BA, gated write),
  `architecture-diagram` (Architect, Mermaid → optional Confluence publish).

### Phase 3 — closed self-learning loop + richer Mission Control
- **Durable learning** (`SqliteLearningStore`): outcomes and lessons persist across restarts.
- **Closed loop**: every run records an outcome; failures and low-confidence runs auto-generate
  **lessons** that the context engine injects into future runs. An **engine advisor** recommends the
  best-performing engine per workflow (from past success rates) and the orchestrator prefers it.
- **Confidence calibration**: Brier-style predicted-vs-realized error tracked over time.
- **Mission Control**: a **metrics dashboard** (runs by status/workflow, avg confidence, gated
  count, engine usage, calibration, learned best-engine) and a **run-detail page** with the full
  step timeline (status, engine, checks, output) and pause/resume/stop controls.

## Monorepo layout
```
packages/shared              types, zod schemas, event bus, logger, Result
packages/execution-engines   ExecutionEngine + Amp / Copilot / Mock adapters + registry
packages/data                RunStore abstraction (SQLite + in-memory)
packages/verification        pre/during/post checks + confidence scoring
packages/learning            outcome capture, lessons, confidence calibration
packages/auth-vault          encrypted credential vault (PAT / Basic / OAuth)
packages/integrations        Jira, Confluence, Bitbucket/Stash, ELK, Bamboo (+ offline fixtures)
packages/mcp-gateway         unified MCP-style tool registry (per-task scoping)
packages/context-engine      repo map + token-budgeted org-context assembly
packages/core-orchestrator   durable workflow engine (start/pause/resume/stop)
packages/workflows           persona workflows: fix-bug, trace-request, triage,
                             write-jira-stories, architecture-diagram
apps/mission-control         Next.js control plane (UI + API + SSE + tool registry)
```

## Quick start
```bash
pnpm install
pnpm build                 # build all packages
pnpm test                  # orchestrator pause/resume/stop + learning tests
pnpm demo:fixbug           # offline end-to-end demo on the Mock engine

# Mission Control
pnpm --filter @helmsman/mission-control dev    # http://localhost:4317
```

### Engine configuration
The Amp and Copilot adapters shell out to their CLIs (`amp`, `copilot`); override the binaries with
`HELMSMAN_AMP_BIN` / `HELMSMAN_COPILOT_BIN`. When neither is available the engine policy falls back
to the deterministic Mock engine, so the whole platform runs offline.

## Principles
Engine-agnostic · config-driven extensibility (workflows, personas, MCP servers, context per task) ·
self-checking (confidence + human gates) · self-learning (lessons + calibration) · fully observable.

Requires Node ≥ 22.5 (for `node:sqlite`).
