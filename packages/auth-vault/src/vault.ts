import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Credential } from "./credentials.js";

/**
 * Encrypted, local-first credential store. New apps/scopes are added by key (e.g. "jira",
 * "bitbucket:teamA"). A future Postgres/Vault-backed implementation can satisfy the same
 * interface. Secrets are never logged; at rest they are AES-256-GCM encrypted.
 */
export interface Vault {
  set(key: string, cred: Credential): Promise<void>;
  get(key: string): Promise<Credential | undefined>;
  list(): Promise<string[]>;
}

export class InMemoryVault implements Vault {
  private readonly store = new Map<string, Credential>();
  async set(key: string, cred: Credential): Promise<void> {
    this.store.set(key, cred);
  }
  async get(key: string): Promise<Credential | undefined> {
    return this.store.get(key);
  }
  async list(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

interface EncryptedRecord {
  iv: string;
  tag: string;
  data: string;
}

/**
 * File-backed vault encrypted with a master key from `HELMSMAN_VAULT_KEY`. The key is stretched
 * with scrypt; each record uses a fresh IV and an authentication tag (GCM).
 */
export class EncryptedFileVault implements Vault {
  private readonly key: Buffer;
  private records: Record<string, EncryptedRecord>;

  constructor(
    private readonly path = process.env.HELMSMAN_VAULT ?? "./data/helmsman.vault",
    masterSecret = process.env.HELMSMAN_VAULT_KEY,
  ) {
    if (!masterSecret) {
      throw new Error(
        "EncryptedFileVault requires HELMSMAN_VAULT_KEY (or pass a master secret). Use InMemoryVault for ephemeral dev.",
      );
    }
    // Static salt keeps the derived key stable across runs for the same secret.
    this.key = scryptSync(masterSecret, "helmsman-vault", 32);
    this.records = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, EncryptedRecord>)
      : {};
  }

  private persist(): void {
    const dir = dirname(this.path);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.records, null, 2), { mode: 0o600 });
  }

  async set(key: string, cred: Credential): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(cred), "utf8"), cipher.final()]);
    this.records[key] = {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    this.persist();
  }

  async get(key: string): Promise<Credential | undefined> {
    const rec = this.records[key];
    if (!rec) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(rec.iv, "base64"));
    decipher.setAuthTag(Buffer.from(rec.tag, "base64"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(rec.data, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(out.toString("utf8")) as Credential;
  }

  async list(): Promise<string[]> {
    return Object.keys(this.records);
  }
}
