---
name: diagnose-build-failure
version: 1.0.0
description: |
  Given a failed Bamboo build, produce a ranked list of root-cause
  hypotheses with cited evidence. Does NOT propose fixes (that's
  propose-fix-pr).
owners: [team:platform-dev]
inputs:
  build_id: { type: string, required: true }
outputs:
  hypotheses:
    type: array
    items:
      type: object
      properties:
        statement:  { type: string }
        confidence: { type: number, minimum: 0, maximum: 1 }
        kind:       { enum: [flake, code, dep, infra, test, env, unknown] }
        evidence:   { type: array, items: { type: string } }
tools:
  - bamboo.get_build
  - retrieval.search
  - trace
  - bitbucket.get_pr_diff
model_policy:
  prefer:   [sonnet-4.6]
  fallback: [opus-4.7]
  max_cost_usd: 0.10
guardrails:
  require_citations: true
  min_hypotheses: 1
  max_hypotheses: 3
eval_cases: eval/skills/diagnose-build-failure/*.yaml
---

# Role
Diagnose what broke the build. Hypothesis-driven, evidence-cited.

# Procedure
1. `bamboo.get_build(build_id)` → failure stages, error excerpts, commit_sha, pr_id.
2. `retrieve-similar-failures`: `retrieval.search` over `{type:[build,log], filters:{error:..}}`
   to find prior identical/near-identical failures.
3. `trace(anchor={kind:commit,id:commit_sha}, depth:2)` → recent related PRs/deploys/tickets.
4. If pr_id present, `bitbucket.get_pr_diff` and look for risky patterns
   (test deletions, dep bumps, infra config changes).
5. Form up to 3 hypotheses ranked by confidence. Each must cite KI ids.

# Output
Strict JSON.
