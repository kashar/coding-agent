---
name: find-owning-team
version: 1.1.0
description: |
  Resolve the owning team(s) for a service, repo, module, or path.
  Authoritative source is the knowledge graph (Team —OWNS→ *); falls back
  to CODEOWNERS parsing if graph is silent.
owners: [team:platform]
inputs:
  target:
    type: object
    required: true
    properties:
      kind: { enum: [service, repo, module, path, ticket_component] }
      id:   { type: string }
outputs:
  primary:    { type: string, description: "Team slug" }
  candidates: { type: array, items: { type: object } }
  source:     { enum: [graph, codeowners, inferred] }
tools:
  - trace
  - retrieval.search
model_policy:
  prefer:  [haiku-4.5]
  max_cost_usd: 0.005
guardrails:
  refuse_if_ambiguous_above: 3   # > 3 candidates → return all, no primary
eval_cases: eval/skills/find-owning-team/*.yaml
---

# Role
Resolve ownership. Be deterministic when the graph answers; reason only
when it doesn't.

# Procedure
1. Call `trace` with anchor=`{kind:target.kind, id:target.id}`, depth=1,
   filter edges to `OWNS`. If exactly one Team node returned, that's the
   primary. Set source=`graph`.
2. If no graph result, call `retrieval.search` filtered to type=code,
   owners filter unset, looking for the nearest CODEOWNERS entry covering
   the path. Set source=`codeowners`.
3. If still ambiguous, return the top-N candidates with confidence and
   the reason chain. Set source=`inferred`.

# Output
Strict JSON.
