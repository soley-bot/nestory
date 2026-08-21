import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  evaluateHostedMigrationContent,
  evaluateHostedMigrationParity,
  readHostedMigrationLedgerOutput,
  readMigrationListOutput,
  resolvePinnedSupabaseCliBinary,
  runCommandWithBoundedOutput,
} from "./hosted-migration-parity-core.mjs";

const phase = readPhase(process.argv.slice(2));
const supabaseCli = resolvePinnedSupabaseCliBinary();
const result = await runCommandWithBoundedOutput(
  supabaseCli,
  ["--output-format", "json", "migration", "list", "--linked"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    windowsHide: true,
  },
);

if (result.error) {
  console.error(
    `Unable to start the pinned Supabase CLI: ${result.error.message}`,
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `Supabase migration list failed with exit code ${result.status ?? "unknown"}.`,
  );
  const detail = redactCliOutput(result.stderr);
  if (detail) console.error(detail);
  process.exit(1);
}

let versions;
try {
  versions = readMigrationListOutput(result.stdout);
} catch (error) {
  console.error(
    `Unable to read Supabase migration-list JSON: ${error.message}`,
  );
  process.exit(1);
}

const parity = evaluateHostedMigrationParity({ ...versions, phase });
const ledgerResult = await runCommandWithBoundedOutput(
  supabaseCli,
  [
    "--output-format",
    "json",
    "db",
    "query",
    "--linked",
    "select version, name, statements from supabase_migrations.schema_migrations order by version;",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    windowsHide: true,
  },
);

if (ledgerResult.error) {
  console.error(
    `Unable to start the hosted migration ledger query: ${ledgerResult.error.message}`,
  );
  process.exit(1);
}
if (ledgerResult.status !== 0) {
  console.error(
    `Hosted migration ledger query failed with exit code ${ledgerResult.status ?? "unknown"}.`,
  );
  const detail = redactCliOutput(ledgerResult.stderr);
  if (detail) console.error(detail);
  process.exit(1);
}

let remoteMigrations;
try {
  remoteMigrations = readHostedMigrationLedgerOutput(ledgerResult.stdout);
} catch (error) {
  console.error(
    `Unable to read hosted migration ledger JSON: ${error.message}`,
  );
  process.exit(1);
}

let localMigrations;
let contentExceptions;
try {
  localMigrations = readLocalMigrations(
    path.join(process.cwd(), "supabase", "migrations"),
  );
  contentExceptions = readHostedContentExceptions(
    path.join(process.cwd(), "supabase", "migration-reconciliations"),
  );
} catch (error) {
  console.error(`Unable to read Git migration evidence: ${error.message}`);
  process.exit(1);
}

const contentIssues = evaluateHostedMigrationContent({
  localMigrations,
  remoteMigrations,
  contentExceptions,
});
const issues = [...parity.issues, ...contentIssues];
if (issues.length > 0) {
  console.error(
    `Hosted migration ${phase} failed (${parity.localCount} local, ${parity.remoteCount} remote):`,
  );
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `Hosted migration ${phase} passed: ${parity.localCount} local, ${parity.remoteCount} remote, ${parity.pendingVersions.length} pending, ${contentExceptions.length} pinned legacy content exceptions.`,
);
if (parity.pendingVersions.length > 0) {
  console.log(
    `Pending migration versions: ${parity.pendingVersions.join(", ")}`,
  );
}

function readPhase(args) {
  const phaseIndex = args.indexOf("--phase");
  const value = phaseIndex === -1 ? undefined : args[phaseIndex + 1];
  if (value !== "preflight" && value !== "postflight") {
    console.error(
      "Usage: node scripts/verify-hosted-migration-parity.mjs --phase <preflight|postflight>",
    );
    process.exit(2);
  }
  return value;
}

function redactCliOutput(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database URL]")
    .replace(
      /(access_token|password|service_role)\s*[=:]\s*\S+/gi,
      "$1=[redacted]",
    )
    .trim();
}

function readLocalMigrations(migrationsDirectory) {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => {
      const match = entry.name.match(/^(\d{14})_([a-z0-9_]+)\.sql$/);
      if (!match) {
        throw new Error("migration directory contains an invalid SQL filename");
      }
      return {
        version: match[1],
        name: match[2],
        body: readFileSync(path.join(migrationsDirectory, entry.name), "utf8"),
      };
    });
}

function readHostedContentExceptions(reconciliationDirectory) {
  const exceptions = [];
  for (const filename of readdirSync(reconciliationDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const manifest = JSON.parse(
      readFileSync(path.join(reconciliationDirectory, filename), "utf8"),
    );
    if (!("hostedContentExceptions" in manifest)) continue;
    if (!Array.isArray(manifest.hostedContentExceptions)) {
      throw new Error(
        `hosted content exceptions are not an array in ${filename}`,
      );
    }
    exceptions.push(...manifest.hostedContentExceptions);
  }
  return exceptions;
}
