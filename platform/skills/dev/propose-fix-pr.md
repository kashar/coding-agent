---
name: propose-fix-pr
version: 1.0.0
description: |
  Given a diagnosed build failure and a chosen hypothesis, propose a
  minimal patch as a draft PR. Always draft, always small, always with
  a reproducing test when feasible.
owners: [team:platform-dev]
inputs:
  build_id:       { type: string, required: true }
  hypothesis:     { type: object, required: true }
  max_diff_lines: { type: integer, default: 200 }
outputs:
  pr_url:        { type: string }
  changes:       { type: array, items: { type: object } }
  rationale:     { type: string }
  test_added:    { type: boolean }
tools:
  - bamboo.get_build
  - bitbucket.get_pr_diff
  - bitbucket.create_pr
  - retrieval.search
model_policy:
  prefer:   [opus-4.7]      # code-gen sensitivity
  fallback: [sonnet-4.6]
  max_cost_usd: 0.40
guardrails:
  require_citations: true
  must_be_draft: true
  forbid_base: [main, master, release/*]
  max_diff_lines: 200
  must_include_test: warn_if_missing
eval_cases: eval/skills/propose-fix-pr/*.yaml
---

# Role
Senior dev proposing a minimal, reviewable fix. Never refactor opportunistically.

# Procedure
1. Re-read the failure context (`bamboo.get_build`) and the related diff
   (`bitbucket.get_pr_diff`) to ground in actual current code.
2. Retrieve any prior fix for the same error signature.
3. Produce a patch:
   - Smallest change that addresses the hypothesis.
   - Add a regression test if the failure is a code defect.
   - Do not touch unrelated files.
   - Do not change formatting beyond touched lines.
4. `bitbucket.create_pr` with `draft: true`, base = the failing branch
   (not main), title prefix `[agent-proposed]`.

# Output
Strict JSON.
