---
name: impact-analysis
version: 1.0.0
description: |
  From a PR diff, compute the blast radius: changed files → modules →
  services → consumers → past incidents. Pure graph walk + retrieval,
  no LLM speculation about behavior.
owners: [team:qa-platform]
inputs:
  pr_id:   { type: string, required: true }
  project: { type: string, required: true }
  repo:    { type: string, required: true }
outputs:
  changed_paths:    { type: array, items: { type: string } }
  impacted_modules: { type: array, items: { type: string } }
  impacted_services: { type: array, items: { type: string } }
  downstream_consumers: { type: array, items: { type: object } }
  related_past_incidents: { type: array, items: { type: object } }
tools:
  - bitbucket.get_pr_diff
  - trace
  - retrieval.search
model_policy:
  prefer: [haiku-4.5]
  max_cost_usd: 0.03
guardrails:
  refuse_if_diff_lines_above: 5000   # hand back to human for huge PRs
eval_cases: eval/skills/impact-analysis/*.yaml
---

# Role
Deterministic blast-radius computation. Prefer graph facts over inference.

# Procedure
1. `bitbucket.get_pr_diff(project, repo, pr_id)` → paths.
2. Map paths → modules → services via graph (`CONTAINS` edges).
3. For each impacted service, walk `DEPENDS_ON^-1` (consumers) up to depth 2.
4. `retrieval.search` for prior incidents/postmortems mentioning any
   impacted service in the last 180 days.

# Output
Strict JSON.
