---
name: acceptance-criteria-draft
version: 1.0.0
description: |
  Draft acceptance criteria in Given/When/Then form for a Jira epic,
  grounded in the spec text and impacted systems.
owners: [team:ba-platform]
inputs:
  epic_key: { type: string, required: true }
  impacted: { type: object, required: true }
outputs:
  ac_markdown: { type: string }
  criteria:
    type: array
    items:
      type: object
      properties:
        id:    { type: string }
        given: { type: string }
        when:  { type: string }
        then:  { type: string }
        traces_to: { type: array, items: { type: string } }
  open_questions: { type: array, items: { type: string } }
tools:
  - jira.get_issue
  - retrieval.search
model_policy:
  prefer:   [sonnet-4.6]
  fallback: [opus-4.7]
  max_cost_usd: 0.08
guardrails:
  require_citations: true
  min_criteria: 3
eval_cases: eval/skills/acceptance-criteria-draft/*.yaml
---

# Role
BA drafting acceptance criteria. Crisp Given/When/Then. Each criterion
traces back to either the epic's stated goal or a specific spec section.

# Procedure
1. Re-read epic + linked specs (`jira.get_issue`, then retrieval over links).
2. Identify each user-observable behaviour the epic implies.
3. Write Given/When/Then per behaviour. Cite source for each (KI id).
4. Anything the specs are silent on goes to `open_questions`, not a
   guessed AC.

# Output
Strict JSON. `ac_markdown` is a rendered version of `criteria` for human reading.
