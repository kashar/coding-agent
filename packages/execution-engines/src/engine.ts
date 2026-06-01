import type { EngineUsage } from "@helmsman/shared";

/**
 * The single seam through which ALL model/coding work flows. Helmsman has no direct LLM
 * access; every generation or agentic code task goes through an ExecutionEngine implementation
 * (Amp, Copilot, or the deterministic Mock). Never call a provider directly elsewhere.
 */

export interface EngineCapabilities {
  /** Free-form text completion / reasoning. */
  readonly complete: boolean;
  /** Multi-step agentic task execution (the engine drives its own tool loop). */
  readonly agenticTask: boolean;
  /** Direct code editing against a working tree. */
  readonly editCode: boolean;
  /** Emits incremental streaming events during a task. */
  readonly streaming: boolean;
}

export interface CompleteRequest {
  readonly prompt: string;
  readonly system?: string;
  /** Extra context bundle (assembled by the context engine). */
  readonly context?: string;
  readonly maxOutputTokens?: number;
}

export interface CompleteResponse {
  readonly text: string;
  readonly usage: EngineUsage;
}

export interface AgenticTaskSpec {
  /** Natural-language objective for the engine to accomplish. */
  readonly objective: string;
  /** Absolute path to the working tree the engine may operate on, if any. */
  readonly workingDir?: string;
  /** Additional MCP server ids the engine should have available for this task. */
  readonly mcpServers?: readonly string[];
  readonly context?: string;
  readonly maxSteps?: number;
}

export interface AgenticTaskEvent {
  readonly kind: "thought" | "tool" | "edit" | "message" | "error";
  readonly text: string;
  readonly at: string;
}

export interface AgenticTaskResult {
  readonly summary: string;
  /** Paths the engine reports it changed, when applicable. */
  readonly changedFiles: readonly string[];
  readonly usage: EngineUsage;
  readonly events: readonly AgenticTaskEvent[];
}

export interface EditCodeRequest {
  readonly workingDir: string;
  readonly instruction: string;
  readonly context?: string;
}

export interface EditCodeResult {
  readonly changedFiles: readonly string[];
  readonly diff: string;
  readonly usage: EngineUsage;
}

export interface ExecutionEngine {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: EngineCapabilities;

  /** True when the engine is actually usable in this environment (binary/SDK/creds present). */
  isAvailable(): Promise<boolean>;

  complete(req: CompleteRequest): Promise<CompleteResponse>;
  runAgenticTask(spec: AgenticTaskSpec): Promise<AgenticTaskResult>;
  editCode(req: EditCodeRequest): Promise<EditCodeResult>;
}

/** Raised when an engine is selected but not usable in the current environment. */
export class EngineUnavailableError extends Error {
  constructor(engineId: string, reason: string) {
    super(`Execution engine "${engineId}" is unavailable: ${reason}`);
    this.name = "EngineUnavailableError";
  }
}
