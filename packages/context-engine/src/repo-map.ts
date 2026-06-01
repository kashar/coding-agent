import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Broad default language coverage so Helmsman works for "any technology". Extend via options. */
export const DEFAULT_CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".kt", ".kts", ".scala", ".groovy",
  ".py", ".rb", ".go", ".rs", ".cs", ".fs", ".php", ".swift", ".m", ".mm", ".c", ".h", ".cc",
  ".cpp", ".hpp", ".cxx", ".dart", ".lua", ".ex", ".exs", ".erl", ".hs", ".clj", ".cljs",
  ".sql", ".sh", ".bash", ".ps1", ".vue", ".svelte", ".yaml", ".yml", ".tf", ".proto", ".graphql",
];

const DEFAULT_IGNORE_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", "out", "target", "vendor", ".venv",
  "venv", "__pycache__", ".gradle", ".idea", ".terraform", "bin", "obj", "coverage",
]);

export interface RepoFile {
  readonly path: string;
  readonly size: number;
}

export interface CodeHit {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

export interface RankedFile {
  readonly path: string;
  readonly score: number;
}

export interface OutlineItem {
  readonly line: number;
  readonly kind: string;
  readonly text: string;
}

export interface RepoMapOptions {
  /** Replace the default extension set entirely. */
  readonly extensions?: readonly string[];
  /** Add to the default extension set. */
  readonly extraExtensions?: readonly string[];
  readonly ignoreDirs?: readonly string[];
  /** Cap files walked, to stay tractable on very large monorepos. */
  readonly maxFiles?: number;
  /** Skip files larger than this when reading/searching. */
  readonly maxFileBytes?: number;
  /** Honour the repo's root .gitignore (simple matcher). Default true. */
  readonly respectGitignore?: boolean;
}

/** Declaration patterns spanning many languages, for lightweight structural outlines. */
const DECL_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "class", re: /\b(class|struct|interface|trait|enum|protocol|record)\s+([A-Za-z_][\w]*)/ },
  { kind: "func", re: /\b(function|func|fn|def|sub)\s+([A-Za-z_][\w]*)/ },
  { kind: "method", re: /^\s*(public|private|protected|static|async|override|suspend|\s)+[A-Za-z_<>\[\]]+\s+([A-Za-z_]\w*)\s*\(/ },
  { kind: "type", re: /\b(type|typealias)\s+([A-Za-z_][\w]*)/ },
  { kind: "component", re: /\b(component|module|namespace|package)\s+([A-Za-z_][\w.]*)/ },
];

/**
 * Single-repo understanding designed to scale to large, complex, polyglot codebases:
 *  - broad language coverage (configurable),
 *  - .gitignore + ignore-dir + size guards to stay tractable,
 *  - relevance-ranked retrieval (not whole-repo dumps),
 *  - cross-language symbol outlines for structural awareness.
 */
export class RepoMap {
  private readonly extensions: Set<string>;
  private readonly ignoreDirs: Set<string>;
  private readonly maxFiles: number;
  private readonly maxFileBytes: number;
  private readonly gitignore: ((rel: string) => boolean) | undefined;
  private cachedFiles: RepoFile[] | undefined;

  constructor(
    private readonly root: string,
    opts: RepoMapOptions = {},
  ) {
    this.extensions = new Set([...(opts.extensions ?? DEFAULT_CODE_EXTENSIONS), ...(opts.extraExtensions ?? [])]);
    this.ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(opts.ignoreDirs ?? [])]);
    this.maxFiles = opts.maxFiles ?? 20_000;
    this.maxFileBytes = opts.maxFileBytes ?? 512 * 1024;
    this.gitignore =
      (opts.respectGitignore ?? true) ? buildGitignoreMatcher(this.root) : undefined;
  }

  listFiles(limit = this.maxFiles): RepoFile[] {
    if (this.cachedFiles && limit >= this.cachedFiles.length) return this.cachedFiles.slice(0, limit);
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
        const rel = relative(this.root, full).split(sep).join("/");
        if (this.gitignore?.(rel)) continue;
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          if (!this.ignoreDirs.has(name)) walk(full);
        } else if (this.extensions.has(name.slice(name.lastIndexOf("."))) && st.size <= this.maxFileBytes) {
          out.push({ path: rel, size: st.size });
        }
      }
    };
    walk(this.root);
    if (limit >= this.maxFiles) this.cachedFiles = out;
    return out;
  }

  readFile(path: string): string {
    return readFileSync(join(this.root, path), "utf8");
  }

  /** Grep for a term across code files, returning matching file/line snippets. */
  search(term: string, maxResults = 25): CodeHit[] {
    const hits: CodeHit[] = [];
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

  /**
   * Rank files by relevance to a free-text query (the key to navigating large codebases): scores
   * filename and path-segment matches highly, plus sampled content term frequency.
   */
  rankRelevantFiles(query: string, limit = 15): RankedFile[] {
    const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2))];
    if (terms.length === 0) return [];
    const scored: RankedFile[] = [];
    for (const file of this.listFiles()) {
      const pathLower = file.path.toLowerCase();
      const fileName = pathLower.slice(pathLower.lastIndexOf("/") + 1);
      let score = 0;
      for (const t of terms) {
        if (fileName.includes(t)) score += 5;
        else if (pathLower.includes(t)) score += 2;
      }
      // Sample content for the strongest signal without reading the whole repo eagerly.
      if (score > 0 || terms.length <= 4) {
        let content = "";
        try {
          content = this.readFile(file.path).toLowerCase();
        } catch {
          /* unreadable */
        }
        for (const t of terms) {
          const occurrences = content.split(t).length - 1;
          score += Math.min(occurrences, 10);
        }
      }
      if (score > 0) scored.push({ path: file.path, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Extract a lightweight structural outline (classes/functions/types) for a file. */
  outline(path: string, maxItems = 60): OutlineItem[] {
    let content: string;
    try {
      content = this.readFile(path);
    } catch {
      return [];
    }
    const items: OutlineItem[] = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length && items.length < maxItems; i++) {
      const text = lines[i];
      if (text === undefined || text.length > 300) continue;
      for (const { kind, re } of DECL_PATTERNS) {
        if (re.test(text)) {
          items.push({ line: i + 1, kind, text: text.trim().slice(0, 160) });
          break;
        }
      }
    }
    return items;
  }
}

/** Build a simple .gitignore matcher from the repo root (supports names, *.ext, and dir/ rules). */
function buildGitignoreMatcher(root: string): ((rel: string) => boolean) | undefined {
  const file = join(root, ".gitignore");
  if (!existsSync(file)) return undefined;
  let patterns: string[];
  try {
    patterns = readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
  } catch {
    return undefined;
  }
  const exts = patterns.filter((p) => p.startsWith("*.")).map((p) => p.slice(1)); // ".log"
  const names = new Set(patterns.filter((p) => !p.includes("*")).map((p) => p.replace(/^\/|\/$/g, "")));
  return (rel: string) => {
    if (exts.some((e) => rel.endsWith(e))) return true;
    return rel.split("/").some((seg) => names.has(seg));
  };
}
