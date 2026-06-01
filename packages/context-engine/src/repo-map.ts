import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const IGNORE_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "out", "target"]);
const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".java", ".kt", ".py", ".go", ".rb", ".rs", ".cs", ".php",
]);

export interface RepoFile {
  readonly path: string;
  readonly size: number;
}

/**
 * Minimal single-repo understanding: walk a working tree, list code files, and read/search
 * file contents. Phase 2 will add a real symbol index; this keeps the Fix-bug workflow grounded
 * in actual code today.
 */
export class RepoMap {
  constructor(private readonly root: string) {}

  listFiles(limit = 2000): RepoFile[] {
    const out: RepoFile[] = [];
    const walk = (dir: string): void => {
      if (out.length >= limit) return;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (out.length >= limit) return;
        const full = join(dir, name);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          if (!IGNORE_DIRS.has(name)) walk(full);
        } else if (CODE_EXT.has(name.slice(name.lastIndexOf(".")))) {
          out.push({ path: relative(this.root, full).split(sep).join("/"), size: st.size });
        }
      }
    };
    walk(this.root);
    return out;
  }

  readFile(path: string): string {
    return readFileSync(join(this.root, path), "utf8");
  }

  /** Grep for a term across code files, returning matching file/line snippets. */
  search(term: string, maxResults = 25): { path: string; line: number; text: string }[] {
    const hits: { path: string; line: number; text: string }[] = [];
    const lower = term.toLowerCase();
    for (const file of this.listFiles()) {
      if (hits.length >= maxResults) break;
      let content: string;
      try {
        content = this.readFile(file.path);
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        if (text !== undefined && text.toLowerCase().includes(lower)) {
          hits.push({ path: file.path, line: i + 1, text: text.trim().slice(0, 200) });
          if (hits.length >= maxResults) break;
        }
      }
    }
    return hits;
  }
}
