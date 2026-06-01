import type { CheckResult, Confidence } from "@helmsman/shared";

/**
 * Self-checking subsystem. A workflow declares checks that run before (pre), between (during),
 * and after (post) its work. Results feed a calibrated confidence score; low confidence forces
 * human approval before any side-effect (PR merge, Jira write, Confluence publish).
 */

export interface CheckContext {
  readonly runId: string;
  readonly input: unknown;
  readonly output?: unknown;
  /** Arbitrary, workflow-specific signals checks may inspect (e.g. test results, diffs). */
  readonly signals: Record<string, unknown>;
}

export interface Check {
  readonly name: string;
  readonly phase: "pre" | "during" | "post";
  run(ctx: CheckContext): Promise<Omit<CheckResult, "name" | "phase">>;
}

export async function runChecks(
  checks: readonly Check[],
  phase: "pre" | "during" | "post",
  ctx: CheckContext,
): Promise<CheckResult[]> {
  const selected = checks.filter((c) => c.phase === phase);
  const results: CheckResult[] = [];
  for (const check of selected) {
    try {
      const r = await check.run(ctx);
      results.push({ name: check.name, phase, passed: r.passed, detail: r.detail ?? "" });
    } catch (e) {
      results.push({
        name: check.name,
        phase,
        passed: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export interface ScoreOptions {
  /** Below this score, side-effects require human approval. */
  readonly approvalThreshold?: number;
}

/**
 * Derive a confidence score from check results. The base is the pass ratio; later phases will
 * fold in an LLM self-critique signal and learning-based calibration.
 */
export function scoreConfidence(
  checks: readonly CheckResult[],
  opts: ScoreOptions = {},
): Confidence {
  const threshold = opts.approvalThreshold ?? 0.75;
  if (checks.length === 0) {
    return { score: 0.5, rationale: "no checks were run", requiresHumanApproval: true };
  }
  const passed = checks.filter((c) => c.passed).length;
  const score = passed / checks.length;
  const failed = checks.filter((c) => !c.passed).map((c) => c.name);
  return {
    score,
    rationale:
      failed.length === 0
        ? `all ${checks.length} checks passed`
        : `${failed.length} check(s) failed: ${failed.join(", ")}`,
    requiresHumanApproval: score < threshold,
  };
}
