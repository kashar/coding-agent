import { spawn } from "node:child_process";

export interface CliRunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run a CLI command, optionally feeding stdin, with a hard timeout. No shell interpolation. */
export function runCli(
  command: string,
  args: readonly string[],
  options: { cwd?: string; input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<CliRunResult> {
  const { cwd, input, timeoutMs = 600_000, env } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

/** True if `command --version` resolves without a spawn error (any exit code counts as present). */
export async function commandExists(command: string): Promise<boolean> {
  try {
    await runCli(command, ["--version"], { timeoutMs: 10_000 });
    return true;
  } catch {
    return false;
  }
}
