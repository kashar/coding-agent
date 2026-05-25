# platform/

Concrete artifact layout matching `docs/architecture.md` §9. No runtime code yet
— this directory holds the **portable specs** (skills, workflows, tools,
sources, configs, evals) that any compliant runtime can execute.

## Vertical slice included

A complete `sre.incident-brief` flow, end to end:

```
plugins/sources/confluence/   ← where ingested knowledge enters
plugins/tools/                ← jira.get_issue, grafana.get_alert,
                                bamboo.list_deploys, trace
skills/shared/                ← cite-sources, find-owning-team
skills/sre/                   ← correlate-deploy-to-alert
agents/sre/                   ← incident-responder subagent
workflows/sre/                ← incident-brief.yaml
eval/skills/                  ← one case per skill
eval/workflows/               ← one case per workflow
config/                       ← model-policy, budgets, rollout
teams/payments/               ← per-team overrides example
team-template/                ← starter kit for new teams
```

## How a run executes (from spec to result)

1. `workflows/sre/incident-brief.yaml` is triggered (webhook or manual).
2. Orchestrator (Temporal) resolves `steps[]`, each pointing at a skill@version.
3. Each step is a Temporal activity that hands the `SkillSpec` to the
   **Runtime Adapter** named in `config/model-policy.yaml`.
4. Adapter (Amp / Anthropic / OpenAI / Bedrock / vLLM) invokes the model with
   the skill's system prompt and the **tool schemas** from `plugins/tools/*`.
5. Every tool call goes through the **Tool Gateway** — never direct to MCP.
6. Retrieval calls fan out across pgvector + OpenSearch + Neo4j behind the
   Retrieval facade.
7. Output is judged against `eval/skills/<name>/*.yaml` (offline) or sampled
   for online eval per `workflows/.../eval.online_sample_rate`.
8. Full trace (prompts, tools, model, KB snapshot id, cost) persisted.

## Onboarding a new team

```
cp -r team-template teams/<your-team>
# edit overrides.yaml, add skills under skills/<your-team>/,
# add workflows under workflows/<your-team>/,
# add owners to CODEOWNERS, open PR
```

CI runs evals; platform team reviews; merge → deployed dark → promote via
`config/rollout.yaml`.
