// Deliberately fixed to the disposable IPS readiness stack. This is a synthetic
// rehearsal, not a restore command for arbitrary projects or customer backups.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import {
  assertFixtureIdentities, assertRecoveryCleanup, assertRecoveryContainer,
  assertRecoverySource, compareEvidence, FIXTURE_ORGANIZATION, FIXTURE_USERS,
  parseJsonLines, RECOVERY_CONTAINER, RECOVERY_PROJECT, recoveryIdentity,
  schemaCensusSql, schemaDiagnosticSql, catalogCanonicalizationChecksSql, assertUniqueObjectKeys, sha256, tableCensusSql,
} from "./ips-readiness-recovery-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = randomUUID();
const identity = recoveryIdentity(runId);
const artifactDirectory = path.join(root, ".codex-artifacts", "ips-readiness-recovery", runId);
const report = {
  runId, startedAt: new Date().toISOString(), project: RECOVERY_PROJECT,
  sourceDatabase: "postgres", targetDatabase: identity.database, phases: {},
  productionRecoveryProven: false, hostedPitrProven: false,
  authServiceSignInOnRestoredDatabaseProven: false,
  storageServiceFailoverProven: false, globalsRestored: false,
  excluded: ["extension pg_cron", "schema cron (scheduled jobs)", "extension pg_net", "schema net (outgoing queues)"],
  limitations: [
    "Synthetic local fixture size does not establish a production RTO or recovery point.",
    "The clone reuses existing cluster roles; role password/global restoration is not exercised.",
    "Authenticated SQL replay verifies restored grants/RLS, not an Auth service connected to the clone.",
    "Storage metadata is restored in PostgreSQL; object bytes are backed up and re-uploaded separately through the original local API.",
    "No services are switched to the clone and no scheduler or outgoing queue is restored.",
  ],
};
let docker;
let sourceContainerId;
let databaseCreated = false;
let dumpAttempted = false;
let storageRequest;
let storageBucketCreated = false;
const storageBucket = `ips-recovery-${runId}`;
const storageObjects = [];
let phase = "source validation";

function execute(file, args, input, { timeoutMs = 60_000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: root, timeout: timeoutMs, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Never emit command arguments, SQL, database dump data or API credentials.
      if (error) {
        const sqlstate = stderr?.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];
        reject(Error(`${phase}: command failed${sqlstate ? ` (SQLSTATE ${sqlstate})` : ""}.`));
      } else resolve(stdout);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
}

async function timed(name, operation) {
  phase = name;
  const started = performance.now();
  try { return await operation(); }
  finally { report.phases[name] = { milliseconds: Math.round(performance.now() - started) }; }
}

async function verifyContainer() {
  const template = '{"name":{{json .Name}},"id":{{json .Id}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"image":{{json .Image}}}';
  const inspection = JSON.parse(await docker(["inspect", RECOVERY_CONTAINER, "--format", template]));
  assertRecoveryContainer(inspection, sourceContainerId);
  return inspection;
}

const sql = (database, command) => docker(["exec", "-i", sourceContainerId, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", database, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], command);
const rows = async (database, command) => parseJsonLines(await sql(database, command));
const census = async database => {
  const result = { tables: await rows(database, tableCensusSql), schema: await rows(database, schemaCensusSql) };
  assertUniqueObjectKeys(result.schema);
  return result;
};
const databaseRecord = async () => (await rows("postgres", `SELECT jsonb_build_object('name',datname,'oid',oid::bigint,'owner',pg_get_userbyid(datdba),'comment',shobj_description(oid,'pg_database')) FROM pg_database WHERE datname='${identity.database}';`))[0];

async function storageSetup(config) {
  if (!/^\[api\][\s\S]*?^port = 59321\s*$/m.test(config)) throw Error("Storage proof requires the fixed isolated API port.");
  // The coordinating fixture runner recorded this status for this exact stack.
  // Keep its key in memory and never include it in diagnostics or evidence.
  const status = JSON.parse((await readFile(path.join(root, ".codex-artifacts/isolated-local-status.json"), "utf8")).replace(/^\uFEFF/, ""));
  if (status.API_URL !== "http://127.0.0.1:59321" || !status.SERVICE_ROLE_KEY) throw Error("Local Storage API identity could not be verified.");
  storageRequest = async (resource, { method = "GET", json, bytes } = {}) => {
    const response = await fetch(`${status.API_URL}/storage/v1/${resource}`, {
      method, redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, ...(json ? { "Content-Type": "application/json" } : bytes ? { "Content-Type": "application/octet-stream" } : {}) },
      body: json ? JSON.stringify(json) : bytes,
    });
    if (!response.ok) throw Error(`Synthetic Storage ${method} failed with HTTP ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  };
  report.storage = { bucket: storageBucket, coverage: "One generated synthetic object; existing fixture object bytes are not copied.", bucketCreationAttempted: true, restoredBytesVerified: false, metadataRestored: false };
  await storageRequest("bucket", { method: "POST", json: { id: storageBucket, name: storageBucket, public: false } });
  storageBucketCreated = true;
  const bytes = Buffer.from(`Nestory isolated synthetic recovery object\n${runId}\n${"abc123\n".repeat(1024)}`);
  storageObjects.push("original.bin");
  await storageRequest(`object/${storageBucket}/original.bin`, { method: "POST", bytes });
  const downloaded = await storageRequest(`object/authenticated/${storageBucket}/original.bin`);
  if (!downloaded.equals(bytes)) throw Error("Synthetic Storage upload/download bytes differ.");
  await writeFile(path.join(artifactDirectory, "synthetic-object-backup.bin"), downloaded, { flag: "wx" });
  Object.assign(report.storage, { bytes: downloaded.length, sha256: sha256(downloaded), backupSaved: true });
}

async function replay(database) {
  const property = "10000000-0000-0000-0000-000000000001";
  const org = FIXTURE_ORGANIZATION;
  const expressions = [
    ["finance_context", `public.get_finance_read_context('${org}','${property}')`],
    ["lease_context", `public.get_lease_read_context('${org}',ARRAY(SELECT id FROM public.leases WHERE organization_id='${org}' AND property_id='${property}' ORDER BY id LIMIT 1))`],
    ["invoice_page", `public.get_rent_invoice_page('${org}',p_property_id=>'${property}',p_page=>1,p_page_size=>50)`],
    ["deposit_scope", `(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) FROM public.lease_deposits d JOIN public.leases l ON l.id=d.lease_id AND l.organization_id=d.organization_id WHERE d.organization_id='${org}' AND l.property_id='${property}')`],
    ["property_scope", `(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb) FROM public.properties p WHERE organization_id='${org}')`],
  ];
  const results = await rows(database, `BEGIN READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL "request.jwt.claim.sub"='${FIXTURE_USERS[0]}'; SET LOCAL ROLE authenticated;
SELECT jsonb_build_object('name','actor','uid',auth.uid());
${expressions.map(([name, expression]) => `SELECT jsonb_build_object('name','${name}','sha256',encode(extensions.digest((${expression})::text,'sha256'),'hex'));`).join("\n")}
ROLLBACK;
BEGIN READ ONLY; SET LOCAL "request.jwt.claim.sub"='99999999-9999-4999-8999-999999999999'; SET LOCAL ROLE authenticated;
SELECT jsonb_build_object('name','unrelated_actor_properties','rows',count(*)) FROM public.properties WHERE organization_id='${org}'; ROLLBACK;`);
  if (results.find(row => row.name === "actor")?.uid !== FIXTURE_USERS[0] || results.find(row => row.name === "unrelated_actor_properties")?.rows !== 0) throw Error("Restored SQL authentication or RLS isolation check failed.");
  return results;
}

try {
  if (process.argv.length > 2) throw Error("Readiness recovery accepts no target, credential, or backup arguments.");
  if (process.env.IPS_LOCAL_HANDOFF !== RECOVERY_PROJECT) throw Error("Readiness recovery requires an explicit local stack handoff.");
  const [config, fixture, manifestText] = await Promise.all([
    readFile(path.join(root, "supabase/config.toml"), "utf8"),
    readFile(path.join(root, "supabase/test-fixtures/baseline.sql")),
    readFile(path.join(root, ".codex-artifacts/ips-readiness-source-manifest.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ""));
  assertRecoverySource({ config, manifest, fixtureHash: sha256(fixture), explicitContainer: process.env.SUPABASE_DB_CONTAINER });
  sourceContainerId = manifest.containerId;
  await mkdir(artifactDirectory, { recursive: true });
  const local = await localRecoveryDocker({ execute });
  docker = local.docker;
  report.dockerEndpoint = local.endpoint;
  report.sourceManifest = manifest;
  report.container = await verifyContainer();
  const disk = (await docker(["exec", sourceContainerId, "df", "-Pk", "/var/lib/postgresql/data"])).trim().split(/\r?\n/).at(-1).trim().split(/\s+/);
  report.availableDiskBytesBefore = Number(disk[3]) * 1024;
  if (!Number.isFinite(report.availableDiskBytesBefore) || report.availableDiskBytesBefore < 8 * 1024 ** 3) throw Error("Recovery requires at least 8 GiB available on the local database volume.");
  const [preflight] = await rows("postgres", `BEGIN READ ONLY;
SELECT jsonb_build_object('database',current_database(),'version',current_setting('server_version'),'versionNumber',current_setting('server_version_num')::int,'databaseBytes',pg_database_size(current_database()),
'organizationIds',(SELECT jsonb_agg(id ORDER BY id) FROM public.organizations),'authUserIds',(SELECT jsonb_agg(id ORDER BY id) FROM auth.users),
'requiredObjects',to_regprocedure('public.get_rent_invoice_page(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text,integer,integer)') IS NOT NULL AND to_regprocedure('public.update_property_details_checked(uuid,uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric)') IS NOT NULL AND to_regclass('public.deposit_rent_applications') IS NOT NULL AND to_regclass('public.deposit_rent_allocations') IS NOT NULL AND to_regclass('public.deposit_rent_custody_confirmations') IS NOT NULL AND to_regclass('app_private.deposit_rent_custody_attestations') IS NOT NULL,
'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls) ORDER BY rolname) FROM pg_roles)); COMMIT;`);
  assertFixtureIdentities(preflight);
  if (preflight.database !== "postgres" || Math.floor(preflight.versionNumber / 10_000) !== 17 || preflight.databaseBytes > 1024 ** 3 || !preflight.requiredObjects) throw Error("Source version, size or integrated schema preflight failed.");
  report.preflight = preflight;
  report.catalogCanonicalizationChecks = await rows("postgres", catalogCanonicalizationChecksSql);
  if (report.catalogCanonicalizationChecks.length !== 7 || report.catalogCanonicalizationChecks.some(check => check.passed !== true)) throw Error("Catalog ACL canonicalization regression checks failed.");
  const migrationDirectory = path.join(root, "supabase/migrations");
  const migrationFiles = (await readdir(migrationDirectory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const ledgerVersions = await rows("postgres", "SELECT jsonb_build_object('version',version) FROM supabase_migrations.schema_migrations ORDER BY version;");
  compareEvidence(migrationFiles.map(name => ({ version: name.split("_")[0] })), ledgerVersions, "Current migration ledger");
  report.migrations = await Promise.all(migrationFiles.map(async name => ({ name, sha256: sha256(await readFile(path.join(migrationDirectory, name))) })));
  await timed("storage synthetic backup", () => storageSetup(config));
  const before = await timed("source census", () => census("postgres"));
  const replayBefore = await timed("source scoped queries", () => replay("postgres"));
  await timed("dump", async () => {
    await verifyContainer();
    dumpAttempted = true;
    await docker(["exec", sourceContainerId, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "--format=custom", `--file=${identity.dumpPath}`, "--exclude-extension=pg_cron", "--exclude-schema=cron", "--exclude-extension=pg_net", "--exclude-schema=net"]);
    const digest = (await docker(["exec", sourceContainerId, "sha256sum", identity.dumpPath])).split(/\s/)[0];
    const bytes = Number((await docker(["exec", sourceContainerId, "stat", "-c", "%s", identity.dumpPath])).trim());
    if (!/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 256 * 1024 ** 2) throw Error("Dump fingerprint or bounded size check failed.");
    report.dump = { sha256: digest, bytes, format: "custom" };
  });
  await timed("create owned clone", async () => {
    await verifyContainer();
    if (await databaseRecord()) throw Error("Generated recovery database already exists; refusing reuse.");
    report.targetCreationAttempted = true;
    await sql("postgres", `CREATE DATABASE "${identity.database}" OWNER postgres TEMPLATE template0;`);
    databaseCreated = true;
    await sql("postgres", `COMMENT ON DATABASE "${identity.database}" IS '${identity.marker}';`);
    const record = await databaseRecord();
    identity.oid = record?.oid;
    assertRecoveryCleanup(identity, record);
    report.targetOid = identity.oid;
  });
  await timed("restore", async () => {
    await verifyContainer();
    assertRecoveryCleanup(identity, await databaseRecord());
    await docker(["exec", sourceContainerId, "pg_restore", "-U", "supabase_admin", "-d", identity.database, "--exit-on-error", "--single-transaction", "--clean", "--if-exists", identity.dumpPath]);
  });
  await timed("integrity and scoped replay", async () => {
    const restoredExtensions = await rows(identity.database, "SELECT jsonb_build_object('name',extname,'version',extversion) FROM pg_extension ORDER BY extname;");
    report.extensionIntegritySha256 = compareEvidence(preflight.extensions.filter(extension => !["pg_cron", "pg_net"].includes(extension.name)), restoredExtensions, "Restored extensions");
    report.restoredExtensions = restoredExtensions;
    const after = await census(identity.database);
    const sourceAfter = await census("postgres");
    const replayAfter = await replay(identity.database);
    // Only counts, object identities and digests are saved, including on mismatch.
    await writeFile(path.join(artifactDirectory, "integrity-fingerprints.json"), `${JSON.stringify({ before, after, sourceAfter }, null, 2)}\n`);
    const beforeByKey = new Map(before.schema.map(row => [JSON.stringify([row.kind, row.name]), row.sha256]));
    const changed = new Set(after.schema.filter(row => beforeByKey.get(JSON.stringify([row.kind, row.name])) !== row.sha256).map(row => JSON.stringify([row.kind, row.name])));
    if (changed.size) {
      const filterChanged = list => list.filter(row => changed.has(JSON.stringify([row.kind, row.name])));
      await writeFile(path.join(artifactDirectory, "schema-mismatch-descriptors.json"), `${JSON.stringify({ before: filterChanged(await rows("postgres", schemaDiagnosticSql)), after: filterChanged(await rows(identity.database, schemaDiagnosticSql)) }, null, 2)}\n`);
    }
    report.tableIntegritySha256 = compareEvidence(before.tables, after.tables, "Restored tables and sequences");
    report.schemaIntegritySha256 = compareEvidence(before.schema, after.schema, "Restored schemas and constraints");
    compareEvidence(before.tables, sourceAfter.tables, "Source stability");
    compareEvidence(before.schema, sourceAfter.schema, "Source schema stability");
    report.scopedQuerySha256 = compareEvidence(replayBefore, replayAfter, "Restored scoped queries");
    report.tables = after.tables;
    report.emptyDepositTables = after.tables.filter(row => row.kind === "table" && row.name.startsWith("deposit_rent_") && row.rows === 0).map(row => `${row.schema}.${row.name}`);
    if (report.emptyDepositTables.length) report.limitations.push("Some new deposit tables are empty in the synthetic source; their schema/constraints and empty state are verified, not populated application lineage recovery.");
    report.schemaObjectCount = after.schema.length;
    report.schemaObjectKinds = Object.fromEntries([...new Set(after.schema.map(row => row.kind))].map(kind => [kind, after.schema.filter(row => row.kind === kind).length]));
    report.scopedQueries = replayAfter;
    report.storage.metadataRestored = true;
    await writeFile(path.join(artifactDirectory, "schema-fingerprints.json"), `${JSON.stringify(after.schema, null, 2)}\n`);
  });
  await timed("storage byte restoration", async () => {
    const saved = await readFile(path.join(artifactDirectory, "synthetic-object-backup.bin"));
    storageObjects.push("restored.bin");
    await storageRequest(`object/${storageBucket}/restored.bin`, { method: "POST", bytes: saved });
    const downloaded = await storageRequest(`object/authenticated/${storageBucket}/restored.bin`);
    if (sha256(downloaded) !== report.storage.sha256) throw Error("Restored synthetic Storage bytes failed integrity verification.");
    report.storage.restoredBytesVerified = true;
  });
  report.verified = true;
} catch (error) {
  report.verified = false;
  report.failure = { phase, message: error.message };
  process.exitCode = 1;
} finally {
  report.cleanup = {};
  if (report.targetCreationAttempted && !databaseCreated) report.cleanup.targetCreationOutcomeUncertain = true;
  if (report.storage?.bucketCreationAttempted && !storageBucketCreated) report.cleanup.storageCreationOutcomeUncertain = true;
  if (databaseCreated) {
    try {
      await timed("cleanup owned clone", async () => {
        await verifyContainer();
        assertRecoveryCleanup(identity, await databaseRecord());
        await docker(["exec", sourceContainerId, "dropdb", "-U", "supabase_admin", identity.database]);
        if (await databaseRecord()) throw Error("Generated clone still exists after drop.");
        report.cleanup.databaseDropped = true;
      });
    } catch (error) { report.cleanup.databaseError = error.message; process.exitCode = 1; }
  }
  if (dumpAttempted) {
    try {
      await verifyContainer();
      await docker(["exec", sourceContainerId, "rm", "-f", "--", identity.dumpPath]);
      report.cleanup.dumpRemoved = true;
    } catch (error) { report.cleanup.dumpError = error.message; process.exitCode = 1; }
  }
  if (storageBucketCreated) {
    try {
      await verifyContainer();
      if (storageObjects.length) await storageRequest(`object/${storageBucket}`, { method: "DELETE", json: { prefixes: storageObjects } });
      await storageRequest(`bucket/${storageBucket}`, { method: "DELETE" });
      report.cleanup.storageRemoved = true;
    } catch (error) { report.cleanup.storageError = error.message; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  report.completed = report.verified === true && report.cleanup.databaseDropped === true && report.cleanup.dumpRemoved === true && report.cleanup.storageRemoved === true;
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(path.join(artifactDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(root, ".codex-artifacts/ips-readiness-recovery/latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ verified: report.verified, failure: report.failure, report: path.join(artifactDirectory, "report.json"), phases: report.phases, cleanup: report.cleanup })}\n`);
}
