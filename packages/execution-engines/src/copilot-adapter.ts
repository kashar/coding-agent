import { nowIso } from "@helmsman/shared";
import { commandExists, runCli } from "./cli-runner.js";
import { captureGitChanges } from "./git.js";
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

export interface CopilotAdapterOptions {
  /** Path to the GitHub Copilot CLI binary. Defaults to `copilot` on PATH. */
  readonly binary?: string;
  /** Argument template for non-interactive execution. The prompt is passed on stdin. */
  readonly executeArgs?: readonly string[];
  readonly timeoutMs?: number;
}

/**
 * Drives GitHub Copilot via its CLI, co-equal with the Amp adapter. Kept behind the same
 * ExecutionEngine seam so workflows never know which engine they are running on.
 */
export class CopilotAdapter implements ExecutionEngine {
  readonly id = "copilot";
  readonly displayName = "GitHub Copilot";
  readonly capabilities: EngineCapabilities = {
    complete: true,
    agenticTask: true,
    editCode: true,
    streaming: false,
  };

  private readonly binary: string;
  private readonly executeArgs: readonly string[];
  private readonly timeoutMs: number;

  constructor(opts: CopilotAdapterOptions = {}) {
    this.binary = opts.binary ?? process.env.HELMSMAN_COPILOT_BIN ?? "copilot";
    this.executeArgs = opts.executeArgs ?? ["-p"];
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
    const changes = spec.workingDir ? await captureGitChanges(spec.workingDir) : { changedFiles: [] };
    return {
      summary: text,
      changedFiles: [...changes.changedFiles],
      usage: { engineId: this.id },
      events: [{ kind: "message", text, at: nowIso() }],
    };
  }

  async editCode(req: EditCodeRequest): Promise<EditCodeResult> {
    const prompt = [req.context, `Apply this change in the working tree:`, req.instruction]
      .filter(Boolean)
      .join("\n\n");
    const { text } = await this.exec(prompt, req.workingDir);
    const changes = await captureGitChanges(req.workingDir);
    return {
      changedFiles: [...changes.changedFiles],
      diff: changes.diff || text,
      usage: { engineId: this.id },
    };
  }
}
