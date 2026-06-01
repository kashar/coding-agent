/**
 * Helmsman onboarding CLI.
 *
 * Captures authentication for each MCP/enterprise integration (Jira, Confluence, Bitbucket/Stash,
 * ELK, Bamboo) and stores it in the encrypted local vault. Non-secret endpoints are written to
 * `.helmsman/helmsman.env` (gitignored) so Mission Control picks them up.
 *
 * Interactive:
 *   pnpm onboard                 # walk through every app
 *   pnpm onboard <app>           # configure one app
 *   pnpm onboard list            # show which apps have stored credentials
 *
 * Non-interactive (automation/CI) — pass --kind to skip prompts:
 *   pnpm onboard jira --url https://acme.atlassian.net --kind basic \
 *        --username me@acme.com --password "$JIRA_TOKEN"
 *   pnpm onboard bitbucket --url https://stash.acme --kind pat --token "$BB_PAT" \
 *        --project APP --slug web
 */
import { createInterface, type Interface } from "node:readline/promises";
import { defaultVault, resolveVaultKey, VAULT_KEY_FILE, type Vault } from "./vault.js";
import type { Credential } from "./credentials.js";
import {
  APPS,
  envFilePath,
  onboardAppNonInteractive,
  parseArgs,
  upsertEnv,
  type AppSpec,
} from "./onboard-core.js";

async function secret(rl: Interface, q: string): Promise<string> {
  const out = process.stdout;
  const anyRl = rl as unknown as { _writeToOutput?: (s: string) => void };
  const original = anyRl._writeToOutput;
  let masking = false;
  if (out.isTTY && original) {
    anyRl._writeToOutput = (s: string) => {
      if (masking && s !== "\r\n" && s !== "\n") out.write("*");
      else out.write(s);
    };
  }
  out.write(q);
  masking = true;
  const answer = await rl.question("");
  masking = false;
  if (original) anyRl._writeToOutput = original;
  out.write("\n");
  return answer.trim();
}

async function captureCredential(rl: Interface, hint: string): Promise<Credential | undefined> {
  console.log(`  Auth hint: ${hint}`);
  const kind = (await rl.question("  Auth type [basic/pat/oauth] (default pat): ")).trim() || "pat";
  if (kind === "basic") {
    const username = (await rl.question("  Username / email: ")).trim();
    const password = await secret(rl, "  Password / API token: ");
    return { kind: "basic", username, password };
  }
  if (kind === "oauth") {
    const accessToken = await secret(rl, "  OAuth access token: ");
    return accessToken ? { kind: "oauth", accessToken } : undefined;
  }
  const token = await secret(rl, "  Personal access token: ");
  if (!token) return undefined;
  const scheme = (await rl.question("  Send as [bearer/basic-username] (default bearer): ")).trim();
  return { kind: "pat", token, scheme: scheme === "basic-username" ? "basic-username" : "bearer" };
}

async function onboardAppInteractive(rl: Interface, app: AppSpec, vault: Vault): Promise<boolean> {
  console.log(`\n=== ${app.label} ===`);
  const yn = (await rl.question(`Configure ${app.label}? [y/N]: `)).trim().toLowerCase();
  if (yn !== "y" && yn !== "yes") return false;

  const envVars: Record<string, string> = {};
  const url = (await rl.question(`  Base URL (${app.urlEnv}): `)).trim();
  if (url) envVars[app.urlEnv] = url;
  for (const extra of app.extraEnv ?? []) {
    const v = (await rl.question(`  ${extra.prompt}: `)).trim();
    if (v) envVars[extra.env] = v;
  }
  const cred = await captureCredential(rl, app.authHint);
  if (cred) {
    await vault.set(app.key, cred);
    console.log(`  ✓ Stored ${app.label} credentials in the vault (key "${app.key}").`);
  } else {
    console.log(`  ⚠ No credential captured for ${app.label}.`);
  }
  if (Object.keys(envVars).length) upsertEnv(envVars);
  return true;
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];

  if (cmd === "list") {
    const keys = await defaultVault().list();
    console.log(keys.length ? `Configured: ${keys.join(", ")}` : "No credentials stored yet.");
    return;
  }

  const hadEnvKey = !!process.env.HELMSMAN_VAULT_KEY;
  const key = resolveVaultKey({ create: true })!;
  const vault = defaultVault();

  // Non-interactive (flag-driven) path.
  if (flags.kind) {
    const app = APPS.find((a) => a.key === cmd);
    if (!app) {
      console.error(`Non-interactive mode needs a known app: ${APPS.map((a) => a.key).join(", ")}`);
      process.exitCode = 1;
      return;
    }
    const ok = await onboardAppNonInteractive(app, flags, vault);
    console.log(ok ? `✓ Stored ${app.label} credentials (key "${app.key}").` : `✗ Incomplete flags for --kind ${flags.kind}.`);
    if (!ok) process.exitCode = 1;
    return;
  }

  console.log("⎈ Helmsman onboarding");
  if (!hadEnvKey) {
    console.log(`Vault master key stored at ${VAULT_KEY_FILE} (0600, gitignored).`);
    console.log(`For production, set instead: export HELMSMAN_VAULT_KEY=${key.slice(0, 6)}…`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const targets = cmd ? APPS.filter((a) => a.key === cmd) : APPS;
    if (cmd && targets.length === 0) {
      console.log(`Unknown app "${cmd}". Known: ${APPS.map((a) => a.key).join(", ")}`);
      return;
    }
    let configured = 0;
    for (const app of targets) if (await onboardAppInteractive(rl, app, vault)) configured += 1;
    console.log(`\nDone — configured ${configured} app(s). Endpoints in ${envFilePath()}.`);
    console.log(`Start Mission Control: pnpm --filter @helmsman/mission-control dev`);
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  process.stderr.write(`onboarding failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
