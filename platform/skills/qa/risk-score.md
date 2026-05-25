---
name: risk-score
version: 1.0.0
description: |
  Score a PR's regression risk by combining impact-analysis output with
  historical signals (incident density, test coverage on touched files,
  author tenure on the module, PR size).
owners: [team:qa-platform]
inputs:
  impact:    { type: object, required: true }
  pr_id:     { type: string, required: true }
outputs:
  overall_risk: { enum: [low, medium, high, critical] }
  factors:
    type: array
    items:
      type: object
      properties:
        name:   { type: string }
        weight: { type: number }
        value:  { type: string }
        evidence: { type: array, items: { type: string } }
tools:
  - retrieval.search
  - trace
model_policy:
  prefer: [haiku-4.5, sonnet-4.6]
  max_cost_usd: 0.03
guardrails:
  require_citations: true
eval_cases: eval/skills/risk-score/*.yaml
---

# Role
Risk scorer. Deterministic where possible; LLM only for explanation.

# Procedure
1. Use a fixed-weight formula:
   - service_incident_density_90d  (0.30)
   - touched_file_coverage_inverse (0.20)
   - pr_size_log                   (0.15)
   - module_author_tenure_inverse  (0.10)
   - touches_schema_or_migration   (0.15)
   - downstream_consumer_count     (0.10)
2. Map total to band: <0.25 low, <0.5 medium, <0.75 high, else critical.
3. Cite the signal source for each factor (KI ids or trace evidence).

# Output
Strict JSON.
