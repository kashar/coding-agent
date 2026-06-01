import { nowIso } from "@helmsman/shared";
import type {
  AgenticTaskResult,
  AgenticTaskSpec,
  CompleteRequest,
  CompleteResponse,
  EditCodeRequest,
  EditCodeResult,
  EngineCapabilities,
  ExecutionEngine,
} from "./engine.js";

/**
 * Deterministic, offline execution engine used for development and tests. It produces stable,
 * inspectable output without any network or external binary, so the orchestrator and Mission
 * Control can be exercised end-to-end in CI and on a laptop with no credentials.
 */
export class MockEngine implements ExecutionEngine {
  readonly id = "mock";
  readonly displayName = "Mock (deterministic)";
  readonly capabilities: EngineCapabilities = {
    complete: true,
    agenticTask: true,
    editCode: true,
    streaming: true,
  };

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const text = `[mock] ${req.prompt.trim().slice(0, 280)}`;
    return {
      text,
      usage: { engineId: this.id, inputTokens: req.prompt.length, outputTokens: text.length, costUnits: 0 },
    };
  }

  async runAgenticTask(spec: AgenticTaskSpec): Promise<AgenticTaskResult> {
    const at = nowIso();
    return {
      summary: `[mock] completed objective: ${spec.objective}`,
      changedFiles: [],
      usage: { engineId: this.id, inputTokens: spec.objective.length, outputTokens: 32, costUnits: 0 },
      events: [
        { kind: "thought", text: `Planning: ${spec.objective}`, at },
        { kind: "message", text: "Mock engine produced a deterministic result.", at },
      ],
    };
  }

  async editCode(req: EditCodeRequest): Promise<EditCodeResult> {
    return {
      changedFiles: [],
      diff: `# [mock] would edit ${req.workingDir}\n# instruction: ${req.instruction}\n`,
      usage: { engineId: this.id, outputTokens: 16, costUnits: 0 },
    };
  }
}
