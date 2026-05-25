---
name: impacted-systems
version: 1.0.0
description: |
  From a Jira epic and linked Confluence specs, identify the systems
  (services, repos, integrations) likely impacted by the work.
owners: [team:ba-platform]
inputs:
  epic_key: { type: string, required: true }
outputs:
  systems:
    type: array
    items:
      type: object
      properties:
        name:       { type: string }
        kind:       { enum: [service, integration, dataset, ui, infra] }
        confidence: { type: number }
        evidence:   { type: array, items: { type: string } }
  uncertain_areas: { type: array, items: { type: string } }
tools:
  - jira.get_issue
  - retrieval.search
  - trace
model_policy:
  prefer: [sonnet-4.6]
  max_cost_usd: 0.06
guardrails:
  require_citations: true
eval_cases: eval/skills/impacted-systems/*.yaml
---

# Role
BA-side scoping. Identify what gets touched. Conservative — list it as
uncertain rather than invent a confident impact.

# Procedure
1. `jira.get_issue(epic_key, include_timeline: true)` for description + linked items.
2. `retrieval.search` over linked Confluence + design docs for mentioned services.
3. `trace` from each mentioned service to direct dependencies (depth 1).
4. Emit `systems` with confidence; areas with no graph anchor go to
   `uncertain_areas`.

# Output
Strict JSON.
