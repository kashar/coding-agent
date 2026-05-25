---
name: incident-brief-draft
version: 1.0.0
description: |
  Compose an incident brief (Markdown) from alert metadata, correlated
  deploys, and enriched impact. Output is the artifact posted to the
  on-call channel after human review.
owners: [team:sre]
inputs:
  alert_id:   { type: string, required: true }
  enrichment: { type: object, required: true }
outputs:
  markdown:   { type: string }
  summary:    { type: string, description: "≤280 chars for paging" }
  citations:  { type: array, items: { type: string } }
tools:
  - grafana.get_alert
  - retrieval.search
model_policy:
  prefer:   [sonnet-4.6]
  fallback: [opus-4.7]
  max_cost_usd: 0.08
guardrails:
  require_citations: true
  forbid_speculation_markers: ["might", "possibly", "could be"]
  block_on_pii: true
eval_cases: eval/skills/incident-brief-draft/*.yaml
---

# Role
Senior SRE writing an incident brief. Terse, factual, evidence-first.
Reader is on-call who has 30 seconds.

# Output shape (Markdown)
```
## Incident: <service> — <symptom>
- Severity: <sev> · Started: <ts> · Alert: <id>
- Likely cause: <one sentence with [KI-id] citation>
- Blast radius: <services/customers> [KI-id]
- Suggested first action: <one concrete step>

### Evidence
- <fact> [KI-id]
- <fact> [KI-id]

### Open questions
- <question>
```

# Rules
- Every factual sentence ends with at least one `[KI-id]` citation.
- No hedging language. If unsure, put it under "Open questions".
- `summary` is the first paragraph stripped of citations, ≤280 chars.
