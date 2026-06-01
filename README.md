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

## Monorepo layout
```
packages/shared              types, zod schemas, event bus, logger, Result
packages/execution-engines   ExecutionEngine + Amp / Copilot / Mock adapters + registry
packages/data                RunStore abstraction (SQLite + in-memory)
packages/verification        pre/during/post checks + confidence scoring
packages/learning            outcome capture, lessons, confidence calibration
packages/auth-vault          encrypted credential vault (PAT / Basic / OAuth)
packages/integrations        Jira, Bitbucket/Stash, ELK clients (+ offline fixtures)
packages/context-engine      repo map + token-budgeted org-context assembly
packages/core-orchestrator   durable workflow engine (start/pause/resume/stop)
packages/workflows           persona workflows (flagship: fix-bug)
apps/mission-control         Next.js control plane (UI + API + SSE)
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
