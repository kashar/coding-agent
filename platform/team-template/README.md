# team-template/

Starter kit for onboarding a new team to the platform. Copy this directory
to `teams/<your-team>/` and follow the checklist below.

## Goal: a new team ships its first agentic workflow in <1 day.

## Checklist

- [ ] `cp -r team-template teams/<your-team>` and rename in `overrides.yaml`.
- [ ] Add owners to `/platform/CODEOWNERS` for:
  - `/platform/skills/<your-team>/`
  - `/platform/agents/<your-team>/`
  - `/platform/workflows/<your-team>/`
  - `/platform/teams/<your-team>/`
- [ ] Pick at least two **shared skills** to reuse from `skills/shared/`.
- [ ] Author at least one **team-specific skill** with:
  - frontmatter (name, version, owners, model_policy, tools, eval_cases)
  - clear `# Role` and `# Procedure` sections
  - strict output schema
- [ ] Write **≥10 eval cases** under `eval/skills/<your-skill>/`.
- [ ] Define one **workflow** under `workflows/<your-team>/<name>.yaml`
  with: triggers, steps, agent, guardrails, eval, rollout.
- [ ] Set per-workflow budget in `/platform/config/budgets.yaml`.
- [ ] Run `agentctl eval workflows/<your-team>/<name>.yaml` locally —
  must pass before PR.
- [ ] Open PR with the "new-workflow" label; platform team reviews.
- [ ] Merge → auto-deployed in `dark` stage.
- [ ] Watch metrics; promote via `agentctl rollout promote <workflow>`.

## What goes in `overrides.yaml`

See `/platform/teams/payments/overrides.yaml` for a worked example. Common
overrides:

- `model_policy.rules` — pin sensitive workflows to on-prem inference
- `tools.<name>.allowed_channels` / `require_labels` — narrow tool scope
- `retrieval.default_filters` — exclude sensitive sources by default
- `eval.extra_judges` — add domain-specific judges (PCI, HIPAA, SOX)

## Anti-patterns to avoid

- Re-implementing a shared skill with team-specific tweaks → propose a
  parameter on the shared skill instead.
- Workflows that call MCP servers directly → always go through tools.
- Skills with prose output and no schema → judges can't score them.
- Skipping eval cases "to ship fast" → CI will block merge.
