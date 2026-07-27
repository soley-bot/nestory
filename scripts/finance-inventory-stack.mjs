import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIsolatedSupabaseConfig } from "../src/features/finance/inventory/finance-inventory.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = resolve(repositoryRoot, "artifacts");
const stackRoot = resolve(artifactsRoot, "finance-inventory-stack");
const sourceSupabase = resolve(repositoryRoot, "supabase");
const targetSupabase = resolve(stackRoot, "supabase");
const action = process.argv[2];

if (
  !["prepare", "start", "reset", "test", "stop", "status"].includes(
    action ?? "",
  )
) {
  throw new Error(
    "Usage: npm run finance:inventory:stack -- <prepare|start|reset|test|stop|status>",
  );
}

const relativeStackPath = relative(artifactsRoot, stackRoot);
if (
  relativeStackPath === "" ||
  relativeStackPath.startsWith("..") ||
  resolve(artifactsRoot, relativeStackPath) !== stackRoot
) {
  throw new Error(
    "Disposable stack path escaped the ignored artifacts directory.",
  );
}

if (action === "prepare") {
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

if (action === "start" || action === "status") {
  const status =
    action === "start"
      ? runSupabase(["start", "--workdir", stackRoot], false)
      : { status: 0 };
  if ((status.status ?? 1) !== 0) process.exit(status.status ?? 1);

  const inspected = runSupabase(
    ["status", "--workdir", stackRoot, "--output", "json"],
    false,
  );
  if ((inspected.status ?? 1) !== 0) process.exit(inspected.status ?? 1);

  let payload;
  try {
    payload = JSON.parse(inspected.stdout);
  } catch {
    throw new Error("Disposable stack status did not return valid JSON.");
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        API_URL: payload.API_URL,
        DB_PORT: new URL(payload.DB_URL).port,
        PROJECT_ID: "nestory-finance-inventory",
        STACK_WORKDIR: stackRoot,
        STUDIO_URL: payload.STUDIO_URL,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const commandArgs =
  action === "test"
    ? ["test", "db", "--local", "--workdir", stackRoot]
    : action === "reset"
      ? ["db", "reset", "--local", "--no-seed", "--workdir", stackRoot]
      : [action, "--workdir", stackRoot];
const result = runSupabase(commandArgs, true);
process.exit(result.status ?? 1);

function runSupabase(arguments_, inherit) {
  const command =
    process.platform === "win32" ? process.execPath : "npx";
  const prefixArguments =
    process.platform === "win32"
      ? [
          resolve(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npx-cli.js",
          ),
        ]
      : [];
  return spawnSync(
    command,
    [...prefixArguments, "supabase", ...arguments_],
    {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    },
  );
}
