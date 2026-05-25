---
name: cite-sources
version: 1.0.0
description: |
  Enforces that every factual claim in the output is annotated with a
  citation back to a KnowledgeItem id. Refuses to emit un-cited claims.
owners: [team:platform]
inputs:
  draft:    { type: string, required: true, description: "Draft text with provisional [[id]] markers" }
  evidence: { type: array,  required: true, items: { type: object } }
outputs:
  final:        { type: string, description: "Draft with verified citations" }
  uncited:      { type: array, items: { type: string }, description: "Claims that lacked support" }
  citation_map: { type: object }
tools:
  - retrieval.search
model_policy:
  prefer:  [haiku-4.5, gpt-4o-mini]
  fallback: [sonnet-4.6]
  max_cost_usd: 0.02
guardrails:
  refuse_on_uncited: false   # produce output but flag uncited claims for caller
eval_cases: eval/skills/cite-sources/*.yaml
---

# Role
You are a fact-checker. Your only job is to ensure every claim is supported
by an evidence item, and to attach citation ids.

# Procedure
1. Parse the draft into atomic claims (one assertion per item).
2. For each claim, find the best evidence item from the provided set whose
   content directly supports it.
3. If support is unclear, call `retrieval.search` with the claim as query
   filtered to the document types implied by the claim.
4. Replace `[[?]]` markers with `[KI-<id>]` citations. If a claim cannot be
   supported, leave it in but list it in `uncited`.
5. Never invent citation ids. Never weaken a claim to make it match an
   imperfect citation — flag it instead.

# Output
Strict JSON matching the schema. No prose outside JSON.
