import { nowIso } from "@helmsman/shared";
import { commandExists, runCli } from "./cli-runner.js";
import {
  EngineUnavailableError,
  type AgenticTaskResult,
  type AgenticTaskSpec,
  type CompleteRequest,
  type CompleteResponse,
  type EditCodeRequest,
  type EditCodeResult,
  type EngineCapabilities,
  type ExecutionEngine,
} from "./engine.js";

export interface AmpAdapterOptions {
  /** Path to the Amp CLI binary. Defaults to `amp` on PATH. */
  readonly binary?: string;
  /**
   * Argument template for non-interactive execution. The prompt is passed on stdin.
   * Defaults to Amp's non-interactive execute flag.
   */
  readonly executeArgs?: readonly string[];
  readonly timeoutMs?: number;
}

/**
 * Drives Amp (Sourcegraph) via its CLI in non-interactive mode (prompt on stdin). Designed to be
 * co-equal with the Copilot adapter. The Amp SDK path can be added behind the same interface; the
 * CLI path keeps Helmsman working in headless/CI contexts with no extra wiring.
 */
export class AmpAdapter implements ExecutionEngine {
  readonly id = "amp";
  readonly displayName = "Amp (Sourcegraph)";
  readonly capabilities: EngineCapabilities = {
    complete: true,
    agenticTask: true,
    editCode: true,
    streaming: false,
  };

  private readonly binary: string;
  private readonly executeArgs: readonly string[];
  private readonly timeoutMs: number;

  constructor(opts: AmpAdapterOptions = {}) {
    this.binary = opts.binary ?? process.env.HELMSMAN_AMP_BIN ?? "amp";
    this.executeArgs = opts.executeArgs ?? ["-x"];
    this.timeoutMs = opts.timeoutMs ?? 600_000;
  }

  async isAvailable(): Promise<boolean> {
    return commandExists(this.binary);
  }

  private async exec(prompt: string, cwd?: string): Promise<{ text: string }> {
    const res = await runCli(this.binary, this.executeArgs, {
      input: prompt,
      cwd,
      timeoutMs: this.timeoutMs,
    });
    if (res.code !== 0) {
      throw new EngineUnavailableError(this.id, `exited ${res.code}: ${res.stderr.slice(0, 500)}`);
    }
    return { text: res.stdout.trim() };
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const prompt = [req.system, req.context, req.prompt].filter(Boolean).join("\n\n");
    const { text } = await this.exec(prompt);
    return { text, usage: { engineId: this.id } };
  }

  async runAgenticTask(spec: AgenticTaskSpec): Promise<AgenticTaskResult> {
    const prompt = [spec.context, spec.objective].filter(Boolean).join("\n\n");
    const { text } = await this.exec(prompt, spec.workingDir);
    return {
      summary: text,
      changedFiles: [],
      usage: { engineId: this.id },
      events: [{ kind: "message", text, at: nowIso() }],
    };
  }

  async editCode(req: EditCodeRequest): Promise<EditCodeResult> {
    const prompt = [req.context, `Apply this change in the working tree:`, req.instruction]
      .filter(Boolean)
      .join("\n\n");
    const { text } = await this.exec(prompt, req.workingDir);
    return { changedFiles: [], diff: text, usage: { engineId: this.id } };
  }
}
