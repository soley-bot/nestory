import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  evaluateHostedMigrationHashes,
  evaluateHostedMigrationParity,
  hashGitMigrationBody,
  readHostedMigrationHashOutput,
  readMigrationListOutput,
  resolvePinnedSupabaseCliBinary,
  runCommandWithBoundedOutput,
} from "./hosted-migration-parity-core.mjs";

const phase = readPhase(process.argv.slice(2));
const emitHashManifest = process.argv.includes("--emit-hash-manifest");
const supabaseCli = resolvePinnedSupabaseCliBinary();
const supabaseArgsPrefix = ["--agent", "yes", "--output-format", "json"];
const commandOptions = {
  cwd: process.cwd(),
  encoding: "utf8",
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
  windowsHide: true,
};

const listResult = await runCommandWithBoundedOutput(
  supabaseCli,
  [...supabaseArgsPrefix, "migration", "list", "--linked"],
  commandOptions,
);
assertSuccessfulCommand(listResult, "Supabase migration list");

let versions;
let localMigrations;
let evidence;
try {
  versions = readMigrationListOutput(listResult.stdout);
  localMigrations = readLocalMigrations(
    path.join(process.cwd(), "supabase", "migrations"),
  );
  evidence = readHostedHashEvidence(
    path.join(process.cwd(), "supabase", "migration-reconciliations"),
  );
} catch (error) {
  console.error(`Unable to read migration evidence: ${error.message}`);
  process.exit(1);
}

const parity = evaluateHostedMigrationParity({ ...versions, phase });
const hashResult = await runCommandWithBoundedOutput(
  supabaseCli,
  [
    ...supabaseArgsPrefix,
    "db",
    "query",
    "--linked",
    hostedMigrationHashQuery(),
  ],
  commandOptions,
);
assertSuccessfulCommand(hashResult, "Hosted migration hash query");

let remoteMigrations;
try {
  remoteMigrations = readHostedMigrationHashOutput(hashResult.stdout);
} catch (error) {
  console.error(`Unable to read hosted migration hashes: ${error.message}`);
  process.exit(1);
}

const manifestEntries = emitHashManifest
  ? buildHashManifest(localMigrations, remoteMigrations, evidence.contentExceptions)
  : evidence.hostedMigrationHashes;
const hashIssues = evaluateHostedMigrationHashes({
  localMigrations,
  remoteVersions: versions.remoteVersions,
  remoteMigrations,
  manifestEntries,
  contentExceptions: evidence.contentExceptions,
});
const issues = [...parity.issues, ...hashIssues];
if (issues.length > 0) {
  console.error(
    `Hosted migration ${phase} failed (${parity.localCount} local, ${parity.remoteCount} remote):`,
  );
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

if (emitHashManifest) {
  if (phase !== "postflight" || parity.pendingVersions.length > 0) {
    console.error(
      "Hash manifest emission requires an exact zero-pending postflight.",
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify({ hostedMigrationHashes: manifestEntries, entries: [] }, null, 2),
  );
  process.exit(0);
}

console.log(
  `Hosted migration ${phase} passed: ${parity.localCount} local, ${parity.remoteCount} remote, ${parity.pendingVersions.length} pending, ${remoteMigrations.length} deterministic hosted hashes, ${evidence.contentExceptions.length} pinned legacy exceptions.`,
);
if (parity.pendingVersions.length > 0) {
  console.log(
    `Pending migration versions: ${parity.pendingVersions.join(", ")}`,
  );
}

function hostedMigrationHashQuery() {
  return `
with normalized_statements as (
  select
    migration.version,
    migration.name,
    item.ordinality,
    btrim(
      replace(replace(item.statement, E'\\r\\n', E'\\n'), E'\\r', E'\\n'),
      E' \\t\\n\\r\\f' || chr(11)
    ) as statement
  from supabase_migrations.schema_migrations as migration
  cross join lateral unnest(migration.statements)
    with ordinality as item(statement, ordinality)
),
statement_hashes as (
  select
    version,
    name,
    ordinality,
    octet_length(statement) as byte_length,
    encode(
      extensions.digest(convert_to(statement, 'UTF8'), 'sha256'),
      'hex'
    ) as statement_sha256
  from normalized_statements
),
migration_hashes as (
  select
    migration.version,
    migration.name,
    count(statement.ordinality)::integer as statement_count,
    sum(statement.byte_length)::bigint as statement_bytes,
    jsonb_agg(
      jsonb_build_object(
        'byteLength', statement.byte_length,
        'sha256', statement.statement_sha256
      )
      order by statement.ordinality
    ) as statement_descriptors,
    string_agg(
      's' || statement.byte_length || ':' || statement.statement_sha256,
      ''
      order by statement.ordinality
    ) as descriptor_stream
  from supabase_migrations.schema_migrations as migration
  join statement_hashes as statement
    on statement.version = migration.version
   and statement.name = migration.name
  group by migration.version, migration.name
)
select
  hashed.version,
  hashed.name,
  hashed.statement_count,
  hashed.statement_bytes,
  hashed.statement_descriptors,
  encode(
    extensions.digest(
      convert_to(
        'v' || octet_length(hashed.version) || ':' || hashed.version ||
        'n' || octet_length(hashed.name) || ':' || hashed.name ||
        'c' || hashed.statement_count || ':' || hashed.descriptor_stream,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as canonical_sha256,
  encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'version', migration.version,
          'name', migration.name,
          'statements', (
            select jsonb_agg(
              replace(replace(item.statement, E'\\r\\n', E'\\n'), E'\\r', E'\\n')
              order by item.ordinality
            )
            from unnest(migration.statements)
              with ordinality as item(statement, ordinality)
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as hosted_ledger_db_sha256
from migration_hashes as hashed
join supabase_migrations.schema_migrations as migration
  on migration.version = hashed.version
 and migration.name = hashed.name
order by hashed.version;
`;
}

function assertSuccessfulCommand(result, label) {
  if (result.error) {
    console.error(`Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `${label} failed with exit code ${result.status ?? "unknown"}.`,
    );
    const detail = redactCliOutput(result.stderr);
    if (detail) console.error(detail);
    process.exit(1);
  }
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

function readHostedHashEvidence(reconciliationDirectory) {
  const contentExceptions = [];
  const exceptionDbHashes = [];
  const hostedMigrationHashes = [];
  for (const filename of readdirSync(reconciliationDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const manifest = JSON.parse(
      readFileSync(path.join(reconciliationDirectory, filename), "utf8"),
    );
    appendManifestArray(
      manifest,
      "hostedContentExceptions",
      contentExceptions,
      filename,
    );
    appendManifestArray(
      manifest,
      "hostedContentExceptionDbHashes",
      exceptionDbHashes,
      filename,
    );
    appendManifestArray(
      manifest,
      "hostedMigrationHashes",
      hostedMigrationHashes,
      filename,
    );
  }

  const dbHashesByVersion = new Map();
  for (const row of exceptionDbHashes) {
    if (dbHashesByVersion.has(row?.version)) {
      throw new Error("duplicate hosted content exception database hash");
    }
    dbHashesByVersion.set(row?.version, row);
  }
  if (
    dbHashesByVersion.size !== contentExceptions.length ||
    contentExceptions.some(
      (exception) =>
        dbHashesByVersion.get(exception.version)?.name !== exception.name,
    )
  ) {
    throw new Error(
      "hosted content exception database hashes do not exactly match exceptions",
    );
  }

  return {
    contentExceptions: contentExceptions.map((exception) => ({
      ...exception,
      hostedLedgerDbSha256: dbHashesByVersion.get(exception.version)
        .hostedLedgerDbSha256,
    })),
    hostedMigrationHashes,
  };
}

function appendManifestArray(manifest, field, target, filename) {
  if (!(field in manifest)) return;
  if (!Array.isArray(manifest[field])) {
    throw new Error(`${field} is not an array in ${filename}`);
  }
  target.push(...manifest[field]);
}

function buildHashManifest(localMigrations, remoteMigrations, exceptions) {
  const localByVersion = new Map(
    localMigrations.map((migration) => [migration.version, migration]),
  );
  const exceptionVersions = new Set(
    exceptions.map((exception) => exception.version),
  );
  return remoteMigrations.map((remote) => {
    const local = localByVersion.get(remote.version);
    return {
      version: remote.version,
      name: remote.name,
      gitSqlSha256: hashGitMigrationBody(local?.body ?? ""),
      canonicalSha256: remote.canonicalSha256,
      ...(exceptionVersions.has(remote.version) ? { legacyException: true } : {}),
    };
  });
}
