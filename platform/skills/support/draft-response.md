---
name: draft-response
version: 1.0.0
description: |
  Draft a customer-facing response based on triage, similar tickets, and
  any active-incident context. Always passes through redact-pii before
  return.
owners: [team:support-platform]
inputs:
  ticket_key:       { type: string, required: true }
  triage:           { type: object, required: true }
  similar:          { type: array,  required: true }
  active_incident:  { type: object, nullable: true }
outputs:
  body:        { type: string }
  internal_note: { type: string, description: "Notes for the human reviewer" }
  citations:   { type: array, items: { type: string } }
  redaction_findings: { type: array, items: { type: object } }
tools:
  - retrieval.search
  - jira.get_issue
model_policy:
  prefer:   [sonnet-4.6]
  fallback: [haiku-4.5]
  max_cost_usd: 0.05
guardrails:
  require_citations: true
  must_run_redaction: true
  forbid_internal_doc_quotes: true   # internal-only Confluence content must not appear verbatim
eval_cases: eval/skills/draft-response/*.yaml
---

# Role
Customer-facing draft. Empathetic but precise. Never leak internal-only
content. Cite KB sources in the internal note, not in the customer body.

# Procedure
1. Compose a 3-paragraph response: acknowledgement, what we know,
   next step / timeline.
2. If `active_incident` present, include the public status only.
3. Pull resolution patterns from `similar` tickets — if a fix worked for
   a near-duplicate, mention the workaround.
4. Always invoke `redact-pii` on the composed body before returning.
5. `internal_note` lists the KB ids that informed the draft (for human
   reviewer to verify).

# Output
Strict JSON. `body` is what may go to the customer after human gate.
