import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  assertHostedMigrationLedgerPage,
  evaluateHostedMigrationContent,
  evaluateHostedMigrationParity,
  planHostedMigrationLedgerPages,
  readHostedMigrationLedgerOutput,
  readHostedMigrationMetadataOutput,
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

const metadataResult = await runCommandWithBoundedOutput(
  supabaseCli,
  [
    "--output-format",
    "json",
    "db",
    "query",
    "--linked",
    "select version, name, octet_length(array_to_json(statements)::text) as statement_json_bytes, encode(extensions.digest(convert_to(jsonb_build_object('version', version, 'name', name, 'statements', (select jsonb_agg(replace(replace(statement, E'\\r\\n', E'\\n'), E'\\r', E'\\n') order by ordinality) from unnest(statements) with ordinality as item(statement, ordinality)))::text, 'UTF8'), 'sha256'), 'hex') as hosted_ledger_db_sha256 from supabase_migrations.schema_migrations order by version;",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    windowsHide: true,
  },
);

if (metadataResult.error) {
  console.error(
    `Unable to start the hosted migration metadata query: ${metadataResult.error.message}`,
  );
  process.exit(1);
}
if (metadataResult.status !== 0) {
  console.error(
    `Hosted migration metadata query failed with exit code ${metadataResult.status ?? "unknown"}.`,
  );
  const detail = redactCliOutput(metadataResult.stderr);
  if (detail) console.error(detail);
  process.exit(1);
}

let ledgerPages;
let hostedContentHashes;
try {
  const metadata = readHostedMigrationMetadataOutput(metadataResult.stdout);
  planHostedMigrationLedgerPages({
    remoteVersions: versions.remoteVersions,
    metadata,
    pageBytes: 8 * 1024 * 1024,
    maxSingleMigrationBytes: 8 * 1024 * 1024,
  });
  const exceptionVersions = new Set(
    contentExceptions.map((exception) => exception.version),
  );
  const rawRemoteVersions = versions.remoteVersions.filter(
    (version) => !exceptionVersions.has(version),
  );
  ledgerPages = planHostedMigrationLedgerPages({
    remoteVersions: rawRemoteVersions,
    metadata: metadata.filter((row) => !exceptionVersions.has(row.version)),
    pageBytes: 512 * 1024,
    maxSingleMigrationBytes: 8 * 1024 * 1024,
  });
  hostedContentHashes = metadata
    .filter((row) => exceptionVersions.has(row.version))
    .map((row) => ({
      version: row.version,
      name: row.name,
      hostedLedgerDbSha256: row.hostedLedgerDbSha256,
    }));
} catch (error) {
  console.error(
    `Unable to plan hosted migration ledger pages: ${error.message}`,
  );
  process.exit(1);
}

const remoteMigrations = [];
for (const pageVersions of ledgerPages) {
  const versionLiterals = pageVersions
    .map((version) => `'${version}'`)
    .join(",");
  const ledgerResult = await runCommandWithBoundedOutput(
    supabaseCli,
    [
      "--output-format",
      "json",
      "db",
      "query",
      "--linked",
      `select version, name, statements from supabase_migrations.schema_migrations where version in (${versionLiterals}) order by version;`,
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
      `Unable to start a hosted migration ledger page query: ${ledgerResult.error.message}`,
    );
    process.exit(1);
  }
  if (ledgerResult.status !== 0) {
    console.error(
      `Hosted migration ledger page query failed with exit code ${ledgerResult.status ?? "unknown"}.`,
    );
    const detail = redactCliOutput(ledgerResult.stderr);
    if (detail) console.error(detail);
    process.exit(1);
  }
  try {
    const pageMigrations = readHostedMigrationLedgerOutput(ledgerResult.stdout);
    assertHostedMigrationLedgerPage(pageVersions, pageMigrations);
    remoteMigrations.push(...pageMigrations);
  } catch (error) {
    console.error(
      `Unable to read hosted migration ledger page: ${error.message}`,
    );
    process.exit(1);
  }
}

const contentIssues = evaluateHostedMigrationContent({
  localMigrations,
  remoteMigrations,
  contentExceptions,
  hostedContentHashes,
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
  `Hosted migration ${phase} passed: ${parity.localCount} local, ${parity.remoteCount} remote, ${parity.pendingVersions.length} pending, ${contentExceptions.length} pinned legacy content exceptions, ${ledgerPages.length} content pages.`,
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
  const dbHashes = [];
  for (const filename of readdirSync(reconciliationDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const manifest = JSON.parse(
      readFileSync(path.join(reconciliationDirectory, filename), "utf8"),
    );
    if ("hostedContentExceptions" in manifest) {
      if (!Array.isArray(manifest.hostedContentExceptions)) {
        throw new Error(
          `hosted content exceptions are not an array in ${filename}`,
        );
      }
      exceptions.push(...manifest.hostedContentExceptions);
    }
    if ("hostedContentExceptionDbHashes" in manifest) {
      if (!Array.isArray(manifest.hostedContentExceptionDbHashes)) {
        throw new Error(
          `hosted content exception database hashes are not an array in ${filename}`,
        );
      }
      dbHashes.push(...manifest.hostedContentExceptionDbHashes);
    }
  }

  const dbHashesByVersion = new Map();
  for (const row of dbHashes) {
    if (dbHashesByVersion.has(row?.version)) {
      throw new Error("duplicate hosted content exception database hash");
    }
    dbHashesByVersion.set(row?.version, row);
  }
  if (
    dbHashesByVersion.size !== exceptions.length ||
    exceptions.some(
      (exception) =>
        dbHashesByVersion.get(exception.version)?.name !== exception.name,
    )
  ) {
    throw new Error(
      "hosted content exception database hashes do not exactly match exceptions",
    );
  }
  return exceptions.map((exception) => ({
    ...exception,
    hostedLedgerDbSha256: dbHashesByVersion.get(exception.version)
      .hostedLedgerDbSha256,
  }));
}
