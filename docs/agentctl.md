# agentctl — developer CLI for the platform

`agentctl` is the single command surface for working with skills,
workflows, and evals. It is intentionally thin: it shells out to the
runtime, the Tool Gateway, and the eval harness rather than
reimplementing them.

## Design principles

- **Pure spec in, observable out.** Every command reads from
  `platform/` artifacts and prints structured output (text + JSON via
  `--json`).
- **No hidden state.** No `~/.agentctl/` config; everything is flags +
  env + the repo.
- **Local-first.** `agentctl eval` and `agentctl run` work against a
  local docker-compose stack of pgvector + OpenSearch + Neo4j + a fake
  Tool Gateway, with fixture data — no prod credentials needed for
  authoring.
- **CI-friendly.** Every command exits non-zero on failure with a
  machine-parseable error payload on stderr.

## Command map

```
agentctl
├── scaffold
│   ├── team <slug>           # cp team-template → teams/<slug>, wire CODEOWNERS
│   ├── skill <team>/<name>   # author a new skill from template
│   ├── workflow <team>/<n>   # author a new workflow from template
│   └── tool <name>           # author a new tool registry entry
├── lint
│   ├── skills                # frontmatter schema, prompt smell checks
│   ├── workflows             # step graph validity, tool/skill version pinning
│   ├── tools                 # input/output schema, scope declared
│   └── all
├── eval
│   ├── skill <name> [--case <id>] [--baseline main]
│   ├── workflow <name> [--case <id>] [--replay <fixture>]
│   ├── diff <branch> <other> # eval-score diff between two versions
│   └── report --format md|json
├── run
│   ├── skill <name> --input <file|->     # one-shot local execution
│   ├── workflow <name> --input <file|->  # local Temporal worker
│   └── trace <run_id>                    # print full trace from local OTel
├── rollout
│   ├── status <workflow>
│   ├── promote <workflow> [--to canary|ga]
│   ├── pause <workflow>
│   └── kill <workflow>       # writes kill-switch; no destructive ops
├── kb
│   ├── ingest --source <id> [--since <ts>] [--dry-run]
│   ├── search "<query>" [--filter type=...] [--k 20]
│   ├── snapshot create
│   └── snapshot list
├── trace
│   ├── of <anchor>           # invoke the `trace` tool directly
│   └── show <run_id>
├── cost
│   ├── ls                    # spend by team / workflow / model
│   └── set-budget <scope> --usd <n>
└── audit
    └── show <run_id|user>    # immutable audit log query
```

## Worked examples

### Author and evaluate a new skill

```
$ agentctl scaffold skill qa/find-similar-past-bugs
created  platform/skills/qa/find-similar-past-bugs.md
created  platform/eval/skills/find-similar-past-bugs/case-001.yaml
hint     add at least 10 eval cases before opening a PR

# ... edit the skill, add cases ...

$ agentctl lint skills --only qa/find-similar-past-bugs
PASS  frontmatter schema
PASS  cited tools exist in registry
PASS  output schema is closed (no free-text)
WARN  no example input/output pair in frontmatter (recommended)

$ agentctl eval skill find-similar-past-bugs
case-001 ........... PASS (groundedness=0.91 recall@10=0.83)
case-002 ........... PASS
case-003 ........... FAIL (recall@10=0.41 < 0.60 threshold)
overall: 9/10 PASS — blocking
```

### Replay a historical incident against a workflow

```
$ agentctl eval workflow sre.incident-brief \
    --case incident-brief-001 \
    --replay replays/2025-05-20-payments-p99

✔ fixtures loaded (graph nodes=42, KI items=18)
✔ workflow run started (run_id=lrw_8821)
✔ steps:
    correlate         117ms  $0.012  sonnet-4.6
    enrich (fanout=3) 220ms  $0.005  haiku-4.5
    brief             1.4s   $0.041  sonnet-4.6
    verify_citations  340ms  $0.003  haiku-4.5
✔ judges:
    groundedness  0.92  (min 0.85) PASS
    factuality    1.00  (min 1.00) PASS
    brevity       1.00  (min 1.00) PASS
overall: PASS  total cost $0.061  wallclock 2.4s

trace: agentctl trace show lrw_8821
```

### Diff eval scores against main

```
$ agentctl eval diff HEAD main --workflow sre.incident-brief
                       main      HEAD     Δ
groundedness         0.876     0.912   +0.036  ✔
factuality           0.940     0.940   +0.000
cost_p50_usd         0.058     0.061   +0.003
latency_p95_ms        2800      2410    -390   ✔
brittle_cases        2/30      0/30     -2    ✔

OK to merge.
```

### Promote a workflow

```
$ agentctl rollout status sre.incident-brief
stage: canary  traffic: 10%  age: 11d
metrics (7d):
  groundedness  0.91 ≥ 0.85
  cost_p95      $0.38 ≤ $0.40
  latency_p95   78s  ≤ 90s
  error_rate    0.4% ≤ 2.0%
eligible to promote to: ga (in 3 days, after canary_to_ga.min_days=14)

$ agentctl rollout promote sre.incident-brief --to ga
ERROR: canary_to_ga.min_days not yet met (11 < 14)
       --force requires platform-admin role and writes audit entry

$ agentctl rollout pause sre.incident-brief
paused  written to config/rollout.runtime.yaml
audit   logged as user=krunal action=pause
```

### Trace a request end-to-end

```
$ agentctl trace of --kind=ticket --id=PAY-9921
timeline (12 events, 18 KI ids):
  2025-05-20T14:28:03Z  Deploy   payments-api v2.4.1   [KI-DEP-7741]
  2025-05-20T14:30:12Z  Commit   a1b2c3d 'tighten retry policy' [KI-COMMIT-a1b2c3d]
  2025-05-20T14:32:11Z  Alert    payments-p99 firing   [KI-ALERT-...]
  2025-05-20T14:35:40Z  Ticket   SUPP-9921 created     [KI-JIRA-SUPP-9921]
  2025-05-20T14:41:02Z  Workflow sre.incident-brief    [run_id=lrw_8821]
inferred causes:
  - Deploy KI-DEP-7741  confidence=0.82  evidence=[KI-PR-812, KI-COMMIT-a1b2c3d]
```

## Implementation notes

- Single binary (Go is the pragmatic choice; Python second).
- Wraps the same gRPC contracts as production runtime — no separate
  code path. Local mode just points at the docker-compose Tool Gateway.
- Authentication: short-lived OIDC token cached for the shell session;
  service accounts in CI.
- Pluggable: `agentctl plugin install <pkg>` adds new subcommands
  contributed by teams (e.g. `agentctl payments pci-scan`).

## What `agentctl` deliberately does NOT do

- Edit specs in place (use your editor; CLI only scaffolds and validates).
- Hide the runtime (runs are real Temporal workflows; CLI is a client).
- Hold long-lived state (everything reproducible from the repo).
- Bypass the gateway (no direct MCP calls — same rules as agents).
