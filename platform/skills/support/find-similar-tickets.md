---
name: find-similar-tickets
version: 1.0.0
description: |
  Find prior tickets similar to a given one by symptom, customer, and
  service. Returns ranked candidates with resolution status.
owners: [team:support-platform]
inputs:
  ticket_key: { type: string, required: true }
  k:          { type: integer, default: 10, maximum: 25 }
outputs:
  similar:
    type: array
    items:
      type: object
      properties:
        key:         { type: string }
        summary:     { type: string }
        similarity:  { type: number }
        status:      { type: string }
        resolution:  { type: string }
        resolution_steps: { type: string }
        citations:   { type: array, items: { type: string } }
tools:
  - jira.get_issue
  - jira.search_issues
  - retrieval.search
model_policy:
  prefer: [haiku-4.5]
  fallback: [sonnet-4.6]
  max_cost_usd: 0.03
guardrails:
  require_citations: true
eval_cases: eval/skills/find-similar-tickets/*.yaml
---

# Role
Ticket similarity search. Combine semantic + symptom + customer/service
filters. Prefer recall over precision; the caller will rank.

# Procedure
1. `jira.get_issue(ticket_key)` → summary, description, components.
2. `retrieval.search` with type=ticket, time window=last 365d, filtered
   to same components when available.
3. Score by: semantic similarity, symptom keyword overlap, customer
   match, service match.
4. Return top-k with their resolution status and (if resolved) the
   resolution steps text.

# Output
Strict JSON.
