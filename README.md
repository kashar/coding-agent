# ⎈ Helmsman — Agentic SDLC Platform

Helmsman is a **fully agentic, engine-agnostic, self-checking, self-improving** platform for the
software development lifecycle. It reads codebases, pulls business and operational context from
enterprise systems (Jira, Confluence, Bitbucket/Stash, ELK, Bamboo) via an MCP-style tool layer,
and runs autonomous, observable workflows for **Dev, QA, Support, BA, Architect, and Analyst**
teams — all controlled from a **Mission Control** UI.

All model/coding work flows through a single `ExecutionEngine` seam with **co-equal Amp
(Sourcegraph)** and **GitHub Copilot** adapters, plus a deterministic **Mock** engine so the whole
platform runs offline with no credentials. There is no direct LLM dependency.

> Phased design history and rationale: see [`PROMPT.md`](./PROMPT.md).

---

## Table of contents
1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Workflows](#workflows)
4. [How the agent understands large, complex codebases](#how-the-agent-understands-large-complex-codebases)
5. [Self-checking & self-learning](#self-checking--self-learning)
6. [Quick start (offline)](#quick-start-offline)
7. [Onboarding: connect your org's systems](#onboarding-connect-your-orgs-systems)
8. [Configuration reference](#configuration-reference)
9. [Mission Control](#mission-control)
10. [Extending Helmsman](#extending-helmsman)
11. [Testing & CI](#testing--ci)

---

## What it does

- **Reaches the codebase** — multi-language repo understanding with relevance-ranked retrieval and
  symbol outlines (built for large, polyglot monorepos).
- **Understands business & org context** — pulls Jira issues, Confluence specs, ELK logs/traces,
  Bamboo build results, and Bitbucket code via a unified tool registry.
- **Runs SDLC workflows** — fix bugs, trace requests, write Jira stories, triage, diagram
  architecture, design solutions, run business analysis — each mapped to a persona.
- **Checks its own work** — pre/during/post checks, an LLM self-critique, a calibrated confidence
  score, and **human-approval gates** before any side-effect (PR, Jira/Confluence write).
- **Learns and improves** — captures outcomes + lessons, feeds them back into context, and tunes
  which engine to use per workflow from observed success rates.
- **Is observable & controllable** — Mission Control starts/stops/pauses/resumes runs, streams live
  events, shows per-run timelines, metrics, and the learning state.

Works for **any organisation, any project, any technology stack** — everything org-specific
(endpoints, credentials, target repo, engine policy) is configuration, and workflows/personas/
integrations/engines are added declaratively.

---

## Architecture

A TypeScript **pnpm monorepo**. Every component depends on interfaces, never concrete providers.

```
packages/
  shared              core types + zod schemas, event bus, secret-redacting logger, Result
  execution-engines   ExecutionEngine interface + Amp / Copilot / Mock adapters + policy registry
                      + git-based change capture
  data                RunStore abstraction: SQLite (local-first), Postgres (PgRunStore), in-memory
  verification        pre/during/post checks + calibrated confidence scoring
  learning            durable outcomes + lessons + confidence calibration + engine recommendation
  auth-vault          AES-256-GCM encrypted credential vault (PAT / Basic / OAuth) + onboarding CLI
  integrations        Jira, Confluence, Bitbucket/Stash, ELK, Bamboo clients (+ offline fixtures)
  mcp-gateway         unified, schema-validated tool registry with per-task scoping
  context-engine      RepoMap (multi-language, ranked retrieval, outlines) + org-context assembly
  core-orchestrator   durable workflow engine: start/pause/resume/stop, crash recovery, metrics
  workflows           persona workflows (config-driven)
apps/
  mission-control     Next.js full-stack control plane: UI + API + SSE + tool/metrics endpoints
```

### Execution flow
1. A **workflow** (a declarative list of typed steps) is started via Mission Control or the API.
2. The **orchestrator** selects an `ExecutionEngine` (explicit choice → learning recommendation →
   policy fallback), then runs steps sequentially, persisting each step + emitting events.
3. Steps use the **context engine** (code + org context) and the **MCP gateway** (integration
   tools), and call the engine for generation/agentic work.
4. **Verification** runs checks and computes a confidence score; low confidence **gates** side
   effects for human approval.
5. The **learning** store records the outcome, distils lessons, and updates engine recommendations.

Runs are **durable** (persisted per step) and **resumable** (start/pause/resume/stop); runs
orphaned by a crash are recovered to a resumable state on startup.

---

## Workflows

| Workflow | Persona | Summary |
|---|---|---|
| `fix-bug` | Developer | Jira/ELK/code context → propose fix → self-verify → open Bitbucket PR (human-gated) |
| `trace-request` | Support/QA | Correlate a request across services from ELK logs → narrate the trace |
| `triage` | Support/QA | Classify severity/category from Jira + ELK signals → comment on the issue |
| `write-jira-stories` | Analyst/BA | Extract requirements from a Confluence spec → create Jira stories (gated write) |
| `architecture-diagram` | Architect | Derive a Mermaid diagram from the codebase → optional Confluence publish |
| `solution-design` | Architect/BA | Draft a design from spec/issue → optional Confluence publish |
| `business-analysis` | Analyst/BA | Analyse requirements vs the codebase → report coverage gaps on the issue |

Personas: Analyst, Architect, Developer, Tester, Reviewer, Documentor, Support. New workflows and
personas are **added by a single `register()` call** — the orchestrator never changes.

---

## How the agent understands large, complex codebases

The `context-engine` `RepoMap` is built to scale and to work with any stack:

- **Any technology** — 50+ language extensions out of the box (`DEFAULT_CODE_EXTENSIONS`), plus
  `extensions`/`extraExtensions` options. No build-system or framework coupling.
- **Stays tractable on monorepos** — honours `.gitignore`, skips noisy directories, and applies
  `maxFiles` / `maxFileBytes` guards.
- **Relevance-ranked retrieval** — `rankRelevantFiles(query)` scores the whole tree by filename,
  path, and sampled content matches, so the agent reads the *right* files instead of everything.
- **Structural awareness** — `outline(path)` extracts classes/functions/types across languages, so
  context includes code *structure*, not just text.
- **Token-budgeted assembly** — `assembleContext()` ranks business context → lessons → logs → code
  structure → code references into a bounded bundle for the engine.

---

## Self-checking & self-learning

- **Verification** (`verification`): each step can declare pre/during/post `Check`s; results feed
  `scoreConfidence()`. Below the approval threshold (default 0.75), the run **requires human
  approval** before side effects.
- **Learning** (`learning`, durable in SQLite):
  - records an **outcome** per run (engine, success, predicted confidence, human intervention);
  - turns failures / low-confidence runs into **lessons** that the context engine injects into
    future runs for the same workflow/tags;
  - tracks **calibration** (Brier error: predicted vs realized);
  - recommends the **best engine per workflow** from observed success rates — the orchestrator
    prefers it automatically when no engine is explicitly chosen.

---

## Quick start (offline)

Requires **Node ≥ 22.5** (for the built-in `node:sqlite`) and **pnpm 10**.

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # 37 tests across all suites
pnpm demo:fixbug    # offline end-to-end fix-bug demo on the Mock engine

# Mission Control (offline: seeded fixtures + Mock engine)
pnpm --filter @helmsman/mission-control dev   # http://localhost:4317
```

Out of the box (no credentials) Helmsman runs entirely on **seeded fixtures + the Mock engine**, so
you can explore every workflow and the full UI immediately.

---

## Onboarding: connect your org's systems

The onboarding CLI captures credentials for each MCP/enterprise integration and stores them in the
**encrypted local vault** (AES-256-GCM). Non-secret endpoints are written to `.helmsman/helmsman.env`
(gitignored) and auto-loaded by Mission Control. Secrets are **never** written to that file.

### Interactive
```bash
pnpm onboard            # walk through Jira, Confluence, Bitbucket, ELK, Bamboo
pnpm onboard jira       # configure a single app
pnpm onboard list       # show which apps have stored credentials
```
You'll be asked for each app's base URL and auth (secrets are masked in a TTY). On first run a vault
master key is generated at `.helmsman/vault.key` (mode 0600). **For production, set
`HELMSMAN_VAULT_KEY` instead** of relying on the local key file.

### Non-interactive (automation/CI)
```bash
pnpm onboard jira --url https://acme.atlassian.net --kind basic \
     --username me@acme.com --password "$JIRA_API_TOKEN"

pnpm onboard bitbucket --url https://stash.acme --kind pat --token "$BB_PAT" \
     --project APP --slug web

pnpm onboard elk --url https://elk.acme:9200 --kind basic --username elastic --password "$ELK_PW"
```
Auth `--kind` is one of `basic` (username/password or email/API-token), `pat` (token, sent as
Bearer; add `--scheme basic-username` for token-as-username), or `oauth` (`--access-token`).

After onboarding, start Mission Control and it switches from fixtures to your live systems
automatically:
```bash
HELMSMAN_REPO_DIR=/path/to/your/repo pnpm --filter @helmsman/mission-control dev
```

---

## Configuration reference

All configuration is via environment variables (or `.helmsman/helmsman.env`, written by onboarding).

| Variable | Purpose |
|---|---|
| `HELMSMAN_VAULT_KEY` | Master secret for the encrypted vault (recommended for production) |
| `HELMSMAN_REPO_DIR` | Path to the repository the agent reasons about (default: cwd) |
| `HELMSMAN_TARGET_BRANCH` | Base branch for PRs (default `main`) |
| `HELMSMAN_JIRA_URL` / vault key `jira` | Jira base URL + credential |
| `HELMSMAN_CONFLUENCE_URL` / `confluence` | Confluence base URL + credential |
| `HELMSMAN_BITBUCKET_URL` / `bitbucket` | Bitbucket/Stash base URL + credential |
| `HELMSMAN_BITBUCKET_PROJECT`, `HELMSMAN_BITBUCKET_SLUG` | Target repo coordinates |
| `HELMSMAN_ELK_URL` / `elk` | Elasticsearch base URL + credential |
| `HELMSMAN_BAMBOO_URL` / `bamboo` | Bamboo base URL + credential |
| `HELMSMAN_AMP_BIN` / `HELMSMAN_COPILOT_BIN` | Override the Amp / Copilot CLI binaries |
| `HELMSMAN_DB` | SQLite path for run state (default `./data/helmsman.sqlite`) |
| `HELMSMAN_LEARNING_DB` | SQLite path for learning state |
| `HELMSMAN_PG_URL` | Use Postgres for run state instead of SQLite (durability graduation) |
| `HELMSMAN_LOG_LEVEL` | `debug` / `info` / `warn` / `error` |

**Engine selection:** the Amp/Copilot adapters shell out to their CLIs; if neither is available, the
policy falls back to the Mock engine. The learning store can override the default per workflow.

---

## Mission Control

A Next.js full-stack app (`apps/mission-control`).

- **Dashboard** — start any workflow, choose an engine (or auto), and see all runs.
- **Metrics panel** — runs by status/workflow, average confidence, gated count, engine usage,
  calibration error, learned best-engine per workflow, and lessons learned.
- **Run detail** (`/runs/[id]`) — full step timeline (status, engine, per-step checks, output),
  pause/resume/stop, and an **Approve & proceed** button for gated runs.
- **Live events** — Server-Sent Events stream of every run/step event.

API: `GET/POST /api/runs`, `GET/POST /api/runs/[id]`, `GET /api/stream`, `GET /api/metrics`,
`GET /api/tools`.

---

## Extending Helmsman

- **Add a workflow** — write a `WorkflowDefinition` factory (typed steps + optional checks) and
  register it in the host. Tag it with a persona.
- **Add an integration** — implement the client interface (+ a fixture for offline), expose it as
  MCP tools via `buildIntegrationTools`.
- **Add an execution engine** — implement `ExecutionEngine` and register it; workflows are
  unaffected.
- **Per-task tools/context** — a workflow step can attach extra MCP tools via `ToolRegistry.scoped()`
  without touching the base registry.

---

## Testing & CI

- `pnpm test` runs the suite (orchestrator, execution-engines, context-engine, verification-backed
  workflows, learning, mcp-gateway, auth-vault/onboarding).
- Everything is deterministic offline (Mock engine + fixtures), so CI needs no external services.
- CI (`.github/workflows/ci.yml`): install → **build → typecheck** (build precedes typecheck
  because cross-package types resolve via emitted `dist/*.d.ts`) → test → offline demo → Mission
  Control build.

Requires Node ≥ 22.5.
