# Helmsman — Agentic SDLC Platform: Implementation Blueprint

> This document is the canonical implementation prompt/spec for **Helmsman**.
> It is phased: build the foundation, then a fully-verified Phase 1 MVP, then expand.
> Re-read the "Working Agreement" before each phase and ask clarifying questions if needed.

## Role & Mission
Build **Helmsman**, a fully agentic Software Development Lifecycle (SDLC) platform for an
enterprise engineering org. Helmsman reads codebases, pulls business and org context from
enterprise systems via MCP, and runs autonomous, **self-checking and self-improving**
workflows for **Dev, QA, Support, and BA** teams — all observable and controllable through a
**Mission Control** UI.

The org has **no direct LLM access**. All model/coding work is driven through two **co-equal**
execution engines: **Amp (Sourcegraph)** (CLI + SDK) and **GitHub Copilot**. Helmsman must
remain engine-agnostic.

## Hard Constraints
- **Stack:** Node.js + TypeScript end-to-end. **Next.js (App Router)** full-stack for Mission
  Control (UI + API routes + server actions). Real-time via WebSocket/SSE.
- **Local-first:** Everything runs locally on a dev machine now. Use **SQLite** (Node's
  built-in `node:sqlite`) for state/history/metrics, but **abstract the data layer** so it can
  graduate to Postgres without rewrites. Use an in-process event bus/queue now, abstracted so
  it can become Redis/Temporal later.
- **No direct LLM calls.** Every generation/code task goes through the `ExecutionEngine`
  interface (Amp or Copilot adapter). Never hardcode a provider.
- **Secrets never logged or committed.** Credentials live in an encrypted local vault.
- **Everything is extensible by config.** Workflows, personas, integrations, execution engines,
  and per-task MCP servers/context are registered declaratively — adding one must not require
  changing core engine code.

## Cross-Cutting Principles (apply to every component)
1. **Engine-agnostic** — depend on interfaces, never a concrete provider.
2. **Config-driven extensibility** — new workflows/personas/MCP servers/context sources are
   added via config + a registry, discovered at load time (plugin loader pattern).
3. **Self-checking** — every task has pre/during/post verification and an LLM self-critique;
   it reports correctness + a calibrated confidence score.
4. **Self-learning** — every run produces structured outcome + feedback records that feed a
   memory/lessons store, which is injected as context into future runs and used to calibrate
   confidence and tune engine/step selection over time.
5. **Observable** — every step emits typed events to a durable store and a live stream.

## Step 0 — Reset the repository (DESTRUCTIVE — done first)
Remove all prior working-tree contents on `claude/agentic-sdlc-platform-4L0gL` (keep `.git`,
`LICENSE`), re-scaffold as a TypeScript pnpm monorepo, commit the clean scaffold. The old
`sdlc-mcp-server` Java project is **reference only** — reimplement integrations in TS.

## Monorepo Layout
```
helmsman/
  apps/
    mission-control/        # Next.js full-stack: UI + control-plane API + WS gateway
  packages/
    shared/                 # types, zod schemas, event bus, logger, Result, telemetry
    execution-engines/      # ExecutionEngine interface + Amp adapter + Copilot adapter + registry
    mcp-gateway/            # MCP client manager + unified tool registry (per-task servers)
    integrations/           # Jira, Confluence, Bitbucket/Stash, ELK, Bamboo clients (+MCP tools)
    context-engine/         # codebase understanding + org-context assembly (token-budgeted)
    core-orchestrator/      # workflow engine: state machine, start/stop/pause/resume, durable runs
    workflows/              # persona workflows defined declaratively (config-driven registry)
    verification/           # pre/during/post checks, self-critique, confidence scoring
    learning/               # outcome capture, memory/lessons store, confidence calibration
    auth-vault/             # OAuth/SSO + PAT + Basic providers, encrypted local vault
    data/                   # data-layer abstraction (SQLite now; Postgres-ready)
```

## Components

### 1. Execution Engines (`execution-engines`)
- `interface ExecutionEngine`: `complete()`, `runAgenticTask(spec)`, `editCode(repo, instruction)`,
  `streamEvents()`, capability flags, and normalized usage/cost reporting.
- **AmpAdapter** (Amp CLI subprocess **and** SDK) and **CopilotAdapter** — **co-equal**, both
  first-class. Engine choice is per-workflow/per-step policy, overridable from Mission Control.
- A `ExecutionEngineRegistry` resolves engines by id; new engines register via config.

### 2. MCP Gateway (`mcp-gateway`)
- Manages MCP server connections; exposes a **unified tool registry** to workflows.
- **Per-task MCP/context injection:** a workflow task can declare additional MCP servers and
  context sources in its config; the gateway spins up/attaches them for that task scope only.

### 3. Integrations (`integrations`)
Auth-pluggable clients, each also wrapped as MCP tools:
- **Jira** (JQL search, read, create/update, transitions)
- **Confluence** (CQL search, read, create/update pages)
- **Bitbucket/Stash Server/DC** (repos, files, branches, PRs, commits, diffs)
- **ELK** (log/trace query for tracing & triage)
- **Bamboo** (build/plan status, trigger, results/logs)

### 4. Context Engine (`context-engine`)
- **Codebase understanding:** repo map, symbol/file index, retrieval across multiple repos/langs.
- **Org context assembly:** pull relevant Jira/Confluence/ELK/Bamboo + code, plus **learned
  lessons** from the learning store, into a ranked, token-budgeted bundle.

### 5. Core Orchestrator (`core-orchestrator`)
- Durable, resumable workflows as state machines / step graphs with first-class **start, stop,
  pause, resume, retry**. Persist every run/step/input/output/engine/event.
- Live event stream for Mission Control.

### 6. Workflows (`workflows`) — config-driven & extensible
Workflows and personas are **declarative definitions** loaded from a registry; adding a new
workflow/persona = drop in a config + step handlers, no core changes. Ship these:
- **Fix bug** (Dev) · **Trace request** (Support/QA) · **Write Jira stories** (BA) ·
  **Architecture diagramming** (Architect, Mermaid/C4) · **Solution design** (Architect/BA) ·
  **Business analysis** (BA) · **Triage** (Support/QA).
Personas (Analyst, Architect, Developer, Tester, Reviewer, Documentor, Support) are config too.

### 7. Verification (`verification`)
- **Pre:** validate inputs/permissions/preconditions and that required context was retrieved.
- **During:** invariants/guardrails between steps; abort/pause on violation.
- **Post:** builds/tests/linters via integrations, diff review, and an LLM **self-critique** pass.
- Emit a **correctness report + calibrated confidence score**. Low confidence ⇒ require human
  approval before side-effects (PR merge, Jira write, Confluence publish).

### 8. Learning (`learning`) — self-improving
- Capture structured **outcome records** (what ran, engine used, verification results, human
  approvals/edits, success/failure) and **feedback**.
- Maintain a **memory/lessons store** (retrievable) that the context engine injects into future
  runs for similar tasks/repos.
- **Confidence calibration:** compare predicted confidence vs. realized outcomes over time and
  adjust scoring. **Policy tuning:** learn which engine/step config performs best per
  workflow/repo and bias selection accordingly. All learning is inspectable in Mission Control.

### 9. Auth & Vault (`auth-vault`)
Pluggable per-app providers: **OAuth/SSO (OIDC/SAML, per-user, on-behalf-of)**, **PAT**, and
**Basic (username/password)** for apps that only support it. Encrypted local vault (libsodium/age).
Never log/commit secrets; per-user/per-team scoping.

### 10. Mission Control (`apps/mission-control`, Next.js)
- **Views:** active/historical runs; per-run timeline (step I/O, engine, verification, confidence);
  live event stream; learning/lessons inspector.
- **Controls:** start/stop/pause/resume/retry; engine override; approve gated side-effects.
- **Analytics:** runs by workflow/persona, success & confidence trends (incl. calibration),
  engine usage & cost/seat consumption, latency, failure reasons.
- **Settings:** connections/credentials (via auth-vault), engine policies, **register new
  workflows/personas/MCP servers via config**.

## Phasing
- **Phase 0 — Foundation:** monorepo scaffold; `shared` (types/zod/event bus/logger); `data`
  layer (SQLite + abstraction); `ExecutionEngine` interface + **both** Amp & Copilot adapters
  (at least `complete` + `runAgenticTask` working, with a deterministic mock engine for offline
  tests); `auth-vault` skeleton; `core-orchestrator` run engine with start/stop/pause/resume +
  persistence; `learning` skeleton (outcome capture); config-driven workflow/persona registry;
  minimal Mission Control shell listing & streaming runs. A runnable **demo** exercising the
  engine end-to-end with the mock adapter.
- **Phase 1 — MVP (build & fully verify before anything else):**
  Integrations **Jira + Bitbucket/Stash** (read+write) and **ELK** (read); single-repo context;
  one flagship workflow **"Fix bug"** end-to-end (Jira/ELK context → locate → patch → tests/build
  → self-critique + confidence → open Bitbucket PR, human-gated on low confidence); selectable
  between Amp & Copilot; visible in Mission Control with pause/resume; first lessons captured.
- **Phase 2+:** Confluence + Bamboo; remaining workflows; richer analytics & calibration;
  multi-repo context; Postgres/Redis/Temporal graduation.

## Acceptance Criteria (per phase)
- Typed (no `any` at boundaries), zod-validated external edges, passing build/test/lint.
- Phase 0: `pnpm typecheck` clean; the demo runs a durable workflow with start/pause/resume/stop
  using the mock engine and persists run history.
- Phase 1: "Fix bug" runs end-to-end on a sample repo with **both** engines selectable, opens a
  PR, and produces a correctness+confidence report visible in Mission Control; a lesson is stored.
- No secrets in logs, git, or client bundles. Each phase ends with a commit + pushed branch + PR.

## Working Agreement
- Develop on `claude/agentic-sdlc-platform-4L0gL`; commit in logical increments; push & open a PR
  when a phase completes.
- Restate the plan and ask remaining clarifying questions before Phase 1 code. Don't over-build
  ahead of the current phase.
- Keep `sdlc-mcp-server` as reference only; do not couple to its Java.

## Defaults chosen (override if desired)
Diagrams: Mermaid/C4 · Data: `node:sqlite` (Postgres-ready) · Monorepo: pnpm workspaces ·
Vault: libsodium/age · Flagship MVP workflow: Fix-bug · Offline testing: deterministic Mock engine.
