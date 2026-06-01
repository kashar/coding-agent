import { authHeaders, type Credential } from "@helmsman/auth-vault";

export interface HttpClientConfig {
  readonly baseUrl: string;
  readonly credential: Credential;
  readonly timeoutMs?: number;
}

/** Thin authenticated JSON HTTP client over the global fetch (Node 22). */
export class HttpClient {
  constructor(private readonly cfg: HttpClientConfig) {}

  private url(path: string): string {
    return `${this.cfg.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 30_000);
    try {
      const res = await fetch(this.url(path), {
        method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...authHeaders(this.cfg.credential),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${method} ${path}: ${text.slice(0, 300)}`);
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  /** Fetch a raw text resource (e.g. Bitbucket raw file content). */
  async getText(path: string): Promise<string> {
    const res = await fetch(this.url(path), { headers: { ...authHeaders(this.cfg.credential) } });
    if (!res.ok) throw new Error(`HTTP ${res.status} GET ${path}`);
    return res.text();
  }
}
