import { z } from "zod";

/**
 * Core domain types and zod schemas shared across Helmsman. External edges should validate
 * with these schemas; internal code can rely on the inferred TypeScript types.
 */

// ---- Lifecycle status -------------------------------------------------------
export const RunStatus = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepStatus = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatus>;

/** Statuses from which a run can no longer transition. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

// ---- Personas (config-driven; these are the built-ins) ----------------------
export const PersonaId = z.enum([
  "analyst",
  "architect",
  "developer",
  "tester",
  "reviewer",
  "documentor",
  "support",
]);
export type PersonaId = z.infer<typeof PersonaId>;

// ---- Engine usage (normalized across Amp / Copilot / mock) ------------------
export const EngineUsage = z.object({
  engineId: z.string(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  /** Provider-neutral cost signal (e.g. seat-seconds or token cost) when known. */
  costUnits: z.number().nonnegative().optional(),
  wallClockMs: z.number().nonnegative().optional(),
});
export type EngineUsage = z.infer<typeof EngineUsage>;

// ---- Confidence / verification ---------------------------------------------
export const Confidence = z.object({
  /** Calibrated [0,1] confidence that the work is correct. */
  score: z.number().min(0).max(1),
  rationale: z.string().default(""),
  /** True when side-effects require human approval before proceeding. */
  requiresHumanApproval: z.boolean().default(false),
});
export type Confidence = z.infer<typeof Confidence>;

export const CheckResult = z.object({
  name: z.string(),
  phase: z.enum(["pre", "during", "post"]),
  passed: z.boolean(),
  detail: z.string().default(""),
});
export type CheckResult = z.infer<typeof CheckResult>;

// ---- Run / step persistence records ----------------------------------------
export const StepRecord = z.object({
  id: z.string(),
  runId: z.string(),
  name: z.string(),
  status: StepStatus,
  engineId: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  checks: z.array(CheckResult).default([]),
  usage: EngineUsage.optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});
export type StepRecord = z.infer<typeof StepRecord>;

export const RunRecord = z.object({
  id: z.string(),
  workflowId: z.string(),
  persona: PersonaId.optional(),
  status: RunStatus,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  confidence: Confidence.optional(),
  /** Cursor for resuming a paused/failed run. */
  nextStepIndex: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RunRecord = z.infer<typeof RunRecord>;
