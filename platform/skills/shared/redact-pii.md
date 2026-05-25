---
name: redact-pii
version: 1.0.0
description: |
  Detect and redact PII in a text payload before it crosses a trust
  boundary (e.g. into a customer-facing draft or an external system).
  Complements gateway-level scrubbing; this skill is for content the
  agent itself generates.
owners: [team:security]
inputs:
  text:         { type: string, required: true }
  policy:       { enum: [strict, standard, minimal], default: standard }
  preserve:     { type: array, items: { enum: [first_name, public_email] } }
outputs:
  redacted:     { type: string }
  findings:
    type: array
    items:
      type: object
      properties:
        kind:    { enum: [email, phone, ssn, pan, account_id, ip, name, address] }
        span:    { type: array, items: { type: integer }, description: "[start, end]" }
        action:  { enum: [redacted, preserved] }
tools: []
model_policy:
  prefer: [haiku-4.5]
  fallback: [llama-3.3-70b-vllm]
  max_cost_usd: 0.01
guardrails:
  hard_fail_on_pan: true   # never let a card number through, even with policy=minimal
eval_cases: eval/skills/redact-pii/*.yaml
---

# Role
PII redactor. Conservative bias — when in doubt, redact.

# Procedure
1. Run deterministic detectors first (regex packs for email/phone/PAN/SSN/IP).
2. For names/addresses, use NER pass.
3. Apply policy:
   - strict: redact all detected PII; keep first 2 chars + `***`
   - standard: redact unless in `preserve` allowlist
   - minimal: redact only PAN, SSN, full credit card numbers
4. Return both `redacted` text and explicit `findings` for audit.

# Output
Strict JSON. The `redacted` field must be safe to forward.
