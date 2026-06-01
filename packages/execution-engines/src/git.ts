import { runCli } from "./cli-runner.js";

export interface GitChanges {
  readonly changedFiles: readonly string[];
  readonly diff: string;
}

/**
 * Capture the working-tree changes an agentic engine made in `dir`, using git. This is how the
 * Amp/Copilot adapters report concrete `changedFiles` + a `diff` after a task runs against a repo.
 * Returns empty results if the directory is not a git repo or git is unavailable.
 */
export async function captureGitChanges(dir: string): Promise<GitChanges> {
  try {
    const status = await runCli("git", ["-C", dir, "status", "--porcelain"], { timeoutMs: 30_000 });
    if (status.code !== 0) return { changedFiles: [], diff: "" };
    const changedFiles = status.stdout
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
    // Include untracked files in the diff for a complete picture of the agent's work.
    const diff = await runCli("git", ["-C", dir, "diff", "--no-color"], { timeoutMs: 30_000 });
    return { changedFiles, diff: diff.stdout };
  } catch {
    return { changedFiles: [], diff: "" };
  }
}
