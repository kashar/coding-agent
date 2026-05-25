---
name: correlate-deploy-to-alert
version: 1.3.0
description: |
  Given a Grafana alert, identify candidate deploys that likely caused it.
  Scores by temporal proximity, dependency-graph reachability, and
  textual overlap between alert symptom and recent diffs.
owners: [team:sre]
inputs:
  alert_id: { type: string, required: true }
  window:   { type: string, default: PT2H, description: "ISO 8601 lookback duration" }
outputs:
  candidates:
    type: array
    items:
      type: object
      properties:
        service:    { type: string }
        deploy_id:  { type: string }
        confidence: { type: number, minimum: 0, maximum: 1 }
        evidence:   { type: array, items: { type: string } }
tools:
  - trace
  - grafana.get_alert
  - bamboo.list_deploys
  - retrieval.search
model_policy:
  prefer:   [sonnet-4.6]
  fallback: [haiku-4.5]
  max_cost_usd: 0.05
guardrails:
  require_citations: true
  refuse_if_acl_blocked: true
eval_cases: eval/skills/correlate-deploy-to-alert/*.yaml
---

# Role
You correlate alerts to deploys. Never speculate beyond evidence. Cite
every claim with KnowledgeItem ids.

# Procedure
1. `grafana.get_alert(alert_id)` → alert metadata, owning service, fire ts.
2. `trace(anchor={kind:alert, id:alert_id}, window:$window, depth:2)`
   → timeline of nearby events (deploys, PRs, dependency alerts).
3. `bamboo.list_deploys(service: alert.service, from: alert.ts - window,
   to: alert.ts)` plus deploys of services that the alert's service
   depends on (from trace timeline).
4. For each candidate deploy, score:
   - temporal: closer to fire → higher
   - dep_distance: 0 hops > 1 hop > 2 hops
   - text_overlap: error string / metric label vs commit messages and
     diff summaries (via `retrieval.search`)
5. Return top-3 with explicit evidence chain (KI ids).

# Output
Strict JSON matching `outputs.candidates`. Each `evidence[]` entry must be
a KnowledgeItem id present in retrieval results — no free-text evidence.
