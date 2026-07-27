import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { buildIsolatedSupabaseConfig } from "../src/features/finance/inventory/finance-inventory.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const stackRoot = resolve(repositoryRoot, "artifacts", "finance-inventory-stack");
const sourceSupabase = resolve(repositoryRoot, "supabase");
const targetSupabase = resolve(stackRoot, "supabase");
const action = process.argv[2];

if (!["prepare", "start", "reset", "test", "stop", "status"].includes(action ?? "")) {
  throw new Error(
    "Usage: npm run finance:inventory:stack -- <prepare|start|reset|test|stop|status>",
  );
}

if (action === "prepare") {
  if (!stackRoot.startsWith(resolve(repositoryRoot, "artifacts") + "\\")) {
    throw new Error("Disposable stack path escaped the ignored artifacts directory.");
  }
  await rm(stackRoot, { force: true, recursive: true });
  await mkdir(stackRoot, { recursive: true });
  await cp(sourceSupabase, targetSupabase, { recursive: true });
  const config = await readFile(resolve(sourceSupabase, "config.toml"), "utf8");
  await writeFile(
    resolve(targetSupabase, "config.toml"),
    buildIsolatedSupabaseConfig(config),
  );
  process.stdout.write(`${stackRoot}\n`);
  process.exit(0);
}

const commandArgs =
  action === "test"
    ? ["supabase", "test", "db", "--local", "--workdir", stackRoot]
    : action === "reset"
      ? ["supabase", "db", "reset", "--local", "--no-seed", "--workdir", stackRoot]
      : ["supabase", action, "--workdir", stackRoot];

const result = spawnSync("npx", commandArgs, {
  cwd: repositoryRoot,
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
