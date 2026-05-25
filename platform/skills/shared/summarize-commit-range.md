---
name: summarize-commit-range
version: 1.0.0
description: |
  Summarize a range of commits (by service or by base..head SHAs) into a
  ranked list of behavioural changes with cited PRs/tickets.
owners: [team:platform]
inputs:
  service:   { type: string }
  base:      { type: string, required: true, description: "Base commit SHA or tag" }
  head:      { type: string, required: true, description: "Head commit SHA or tag" }
  max_items: { type: integer, default: 20 }
outputs:
  changes:
    type: array
    items:
      type: object
      properties:
        title:     { type: string }
        kind:      { enum: [feature, bugfix, refactor, perf, infra, dep, revert, other] }
        risk:      { enum: [low, medium, high] }
        pr_id:     { type: string }
        commit_sha: { type: string }
        tickets:   { type: array, items: { type: string } }
        citations: { type: array, items: { type: string } }
tools:
  - retrieval.search
model_policy:
  prefer: [haiku-4.5, sonnet-4.6]
  max_cost_usd: 0.05
guardrails:
  require_citations: true
eval_cases: eval/skills/summarize-commit-range/*.yaml
---

# Role
Compress a commit range into the changes a reviewer needs to know about,
ranked by risk. Stay factual, cite PR and ticket ids.

# Procedure
1. `retrieval.search` with filters `{type: [pr, commit], time: {from: base, to: head}}`
   and `service` if provided.
2. Cluster results by PR (one PR may span multiple commits).
3. For each cluster, infer `kind` from labels + diff signal; infer `risk`
   from: diff size, touched modules (use graph to check criticality),
   presence of revert/migration/schema words.
4. Return top `max_items` by risk-then-recency.

# Output
Strict JSON. No prose.
