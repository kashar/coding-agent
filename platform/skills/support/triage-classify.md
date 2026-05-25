---
name: triage-classify
version: 1.0.0
description: |
  Classify an incoming support ticket: severity, category, owning team,
  whether it correlates with an active incident.
owners: [team:support-platform]
inputs:
  ticket_key: { type: string, required: true }
outputs:
  severity:     { enum: [s1, s2, s3, s4] }
  category:     { type: string }
  owning_team:  { type: string }
  active_incident: { type: object, nullable: true }
  evidence:     { type: array, items: { type: string } }
tools:
  - jira.get_issue
  - trace
  - retrieval.search
model_policy:
  prefer: [haiku-4.5]
  max_cost_usd: 0.02
guardrails:
  require_citations: true
  refuse_if_severity_uncertain: true   # prefer human triage over a wrong sev
eval_cases: eval/skills/triage-classify/*.yaml
---

# Role
First-line triage classifier. Fast, deterministic where possible.

# Procedure
1. `jira.get_issue(ticket_key)` → summary, customer, product.
2. Map customer + product to owning service via graph; `find-owning-team`
   under the hood (or call it as a skill).
3. `trace(anchor={kind:service, id:owning_service}, lookback:PT2H)` to
   check for an active incident matching the symptom.
4. Severity rules: customer tier × business impact × scope (see fixture
   `/eval/skills/triage-classify/severity-rules.yaml`).

# Output
Strict JSON.
