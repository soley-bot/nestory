// Retained-stack handoff for this one local journey. Capturing observations is
// read-only and does not approve them; the coordinator supplies the exact hash.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { target } from "./ips-integrated-readiness-fixture.mjs";
import { assertRecoveryContainer } from "./ips-readiness-recovery-core.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import { canonicalMigrationHash, hashGitMigrationBody, isMigrationBodyEffectivelyEmpty, reconstructLocalMigrationDescriptors } from "./hosted-migration-parity-core.mjs";

export const rentArtifactRoot = ".codex-artifacts/ips-followup-20261015/rent";
export const rentManifestMaxAgeMs = 30 * 60_000;
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ownedIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
// Exhaustive local runtime import closure, checked independently by the import
// graph regression. Tests are not executable dependencies of this journey.
export const rentRuntimeSourceFiles = Object.freeze([
  "scripts/daily-workflow-download.mjs",
  "scripts/deposit-candidate-target.mjs",
  "scripts/hosted-migration-parity-core.mjs",
  "scripts/ips-integrated-readiness-fixture.mjs",
  "scripts/ips-readiness-recovery-core.mjs",
  "scripts/local-recovery-docker.mjs",
  "scripts/playwright-form-controls.mjs",
  "scripts/rent-readiness-target.mjs",
  "scripts/smoke-ips-rent-readiness.mjs",
]);
// Integrity checks must not rely on an imported helper being attested.
const sha256 = value => createHash("sha256").update(value).digest("hex");
// Independently mapped and confirmed by the coordinator before this follow-up.
const preservedBaselineSha256 = "7000fc3c1f79bf7b1d8de58abe2e0e40bb243a5e6107c92599e06981887d4148";
const committedMigrationCache = new Map();
const committedSourceCache = new Map();

export function verifyRentSourceFiles(committed, working) {
  for (const rows of [committed, working]) {
    assert.deepEqual(rows.map(row => row.file), rentRuntimeSourceFiles, "Incomplete rent runtime source inventory");
    for (const row of rows) {
      assert.ok(Buffer.isBuffer(row.bytes), "Runtime source bytes are required");
      assert.ok(Buffer.from(row.bytes.toString("utf8"), "utf8").equals(row.bytes), "Runtime source must be valid UTF-8");
    }
  }
  return Object.fromEntries(committed.map((row, index) => {
    const bytes = working[index].bytes;
    assert.equal(sha256(bytes.toString("utf8").replaceAll("\r\n", "\n")),
      sha256(row.bytes.toString("utf8").replaceAll("\r\n", "\n")), `Uncommitted runtime source: ${row.file}`);
    // HEAD permits checkout line endings; manifest approval pins exact bytes.
    return [row.file, sha256(bytes)];
  }));
}

export function validateRentEnvironment({ cwd, config, env }) {
  assert.equal(path.basename(cwd), "ips-production-readiness-20261014", "Wrong rent worktree");
  assert.deepEqual([...config.matchAll(/^project_id\s*=\s*"([^"]+)"\s*$/gm)].map(row => row[1]), [target.project]);
  for (const [section, port] of [["api", 59321], ["db", 59322]]) {
    const body = config.match(new RegExp(`^\\[${section}\\]\\r?\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, "m"))?.[1];
    assert.ok(body, "Missing local port configuration");
    assert.deepEqual([...body.matchAll(/^port\s*=\s*(\d+)\s*$/gm)].map(row => Number(row[1])), [port], "Wrong local port");
  }
  for (const key of ["IPS_LOCAL_HANDOFF", "IPS_RENT_HANDOFF", "IPS_RENT_RETAINED_HANDOFF"]) assert.equal(env[key], target.project, "Explicit retained-stack handoff required");
  assert.equal(env.NESTORY_BASE_URL, target.app, "Wrong local app origin");
  assert.equal(env.SUPABASE_DB_CONTAINER, target.container, "Wrong local container name");
  assert.match(env.IPS_RENT_CONTAINER_ID ?? "", hashPattern, "Explicit full container ID required");
}

function exactIds(ids, label) {
  assert.ok(Array.isArray(ids) && ids.every(id => typeof id === "string" && idPattern.test(id)), `${label} identity census is malformed`);
  assert.equal(new Set(ids).size, ids.length, `${label} identity census contains duplicates`);
  assert.deepEqual(ids, [...ids].sort(), `${label} identity census must be complete and ordered`);
  return ids;
}
export function censusHash(census) {
  assert.deepEqual(Object.keys(census).sort(), ["authUserIds", "organizationIds"]);
  return sha256(JSON.stringify({ organizationIds: exactIds(census.organizationIds, "Organization"), authUserIds: exactIds(census.authUserIds, "Auth") }));
}

export function verifyRentMigrations(local, observed) {
  assert.ok(Array.isArray(local) && local.length > 0 && Array.isArray(observed));
  for (const rows of [local, observed]) {
    assert.ok(rows.every(row => /^\d{14}$/.test(row.version) && /^[a-z0-9_]+$/.test(row.name)), "Malformed migration identity");
    assert.equal(new Set(rows.map(row => row.version)).size, rows.length, "Duplicate migration identity");
    assert.deepEqual(rows.map(row => row.version), rows.map(row => row.version).sort(), "Unordered migration identity");
  }
  assert.deepEqual(observed.map(row => [row.version, row.name]), local.map(row => [row.version, row.name]), "Live migration ledger differs from this checkout");
  return local.map((row, index) => {
    const descriptors = observed[index].statements;
    assert.ok(Array.isArray(descriptors), "Missing migration statement descriptors");
    const reconstructed = descriptors.length === 0 && isMigrationBodyEffectivelyEmpty(row.body)
      ? { statements: [] } : reconstructLocalMigrationDescriptors(row.body, descriptors);
    assert.equal(reconstructed.issue, undefined, `Migration payload differs from Git: ${row.version}`);
    return { version: row.version, name: row.name, gitSqlSha256: hashGitMigrationBody(row.body),
      canonicalSha256: canonicalMigrationHash({ version: row.version, name: row.name, statements: reconstructed.statements }) };
  });
}

export function verifyWorkingRentMigrations(committed, working) {
  assert.deepEqual(working.map(row => [row.version, row.name]), committed.map(row => [row.version, row.name]), "Working migration list differs from committed Git");
  for (let index = 0; index < committed.length; index++) {
    // Checkout line endings are the only accepted disk difference. Do not
    // silently accept added whitespace, a BOM, edited SQL or untracked files.
    assert.equal(sha256(working[index].body.replaceAll("\r\n", "\n")), sha256(committed[index].body.replaceAll("\r\n", "\n")),
      `Uncommitted migration content: ${committed[index].version}`);
  }
}

export function approveRentManifest({ bytes, approvedSha256, baselineBytes, gitSha, sourceHashes, now = Date.now() }) {
  assert.match(approvedSha256 ?? "", hashPattern, "Coordinator-approved manifest hash required");
  assert.equal(sha256(bytes), approvedSha256, "Retained manifest bytes are not the approved observation");
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); } catch { throw Error("Retained manifest is invalid JSON"); }
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.sourceKind, "retained-readiness-stack");
  assert.deepEqual(manifest.target, target); assert.match(manifest.containerId ?? "", hashPattern);
  assert.match(manifest.apiContainerId ?? "", hashPattern, "Missing owned API container identity");
  assert.equal(manifest.baselineManifestSha256, sha256(baselineBytes), "Original baseline provenance changed");
  assert.match(gitSha, /^[a-f0-9]{40}$/); assert.equal(manifest.gitSha, gitSha, "Checkout changed after retained-stack capture");
  assert.deepEqual(Object.keys(sourceHashes).sort(), rentRuntimeSourceFiles, "Incomplete rent runtime source hashes");
  assert.ok(Object.values(sourceHashes).every(hash => hashPattern.test(hash)), "Malformed rent runtime source hash");
  assert.deepEqual(manifest.sourceHashes, sourceHashes, "Harness changed after retained-stack capture");
  const age = now - Date.parse(manifest.checkedAt);
  assert.ok(Number.isFinite(age) && age >= 0 && age <= rentManifestMaxAgeMs, "Retained-stack observation is stale or future dated");
  assert.equal(manifest.censusSha256, censusHash(manifest.census), "Census fingerprint is inconsistent");
  assert.ok(manifest.census.organizationIds.length > 0 && manifest.census.authUserIds.length > 0, "Empty retained census");
  return manifest;
}

export function verifyRentApiContainer(container, pinnedId) {
  assert.equal(container.name, `/supabase_kong_${target.project}`);
  assert.equal(container.project, target.project); assert.equal(container.running, true);
  assert.match(container.id ?? "", hashPattern);
  if (pinnedId) assert.equal(container.id, pinnedId, "Owned API container changed");
  assert.ok(container.ports?.length > 0 && container.ports.every(port => port.HostPort === "59321" &&
    ["127.0.0.1", "::1", "0.0.0.0", "::"].includes(port.HostIp)), "Wrong local API port binding");
}

export function verifyRentBoundary({ manifest, observed, localMigrations, additions = { organizationIds: [], authUserIds: [] }, now = Date.now() }) {
  const age = now - Date.parse(manifest.checkedAt);
  assert.ok(Number.isFinite(age) && age >= 0 && age <= rentManifestMaxAgeMs, "Retained-stack observation expired before write");
  assert.equal(observed.database, "postgres"); assert.equal(observed.versionMajor, 17);
  assert.deepEqual(verifyRentMigrations(localMigrations, observed.migrations), manifest.migrations, "Migration payload changed since capture");
  assert.equal(manifest.migrationHead, manifest.migrations.at(-1)?.version);
  const expected = {};
  for (const key of ["organizationIds", "authUserIds"]) {
    const added = exactIds(additions[key], `Owned ${key}`);
    assert.ok(added.every(id => ownedIdPattern.test(id) && !manifest.census[key].includes(id)), "Owned census additions must be fresh UUIDs");
    expected[key] = [...manifest.census[key], ...added].sort();
  }
  censusHash(observed.census);
  assert.deepEqual(observed.census, expected, "Live organization/Auth census drifted outside this run");
}

// Full identity arrays come from PostgreSQL, not a capped PostgREST list. No Auth
// password, token, session, private key or user metadata is returned or saved.
export const rentBoundarySql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
WITH migrations AS (
 SELECT version,name,coalesce((SELECT jsonb_agg(jsonb_build_object('byteLength',octet_length(statement),'sha256',encode(extensions.digest(convert_to(statement,'UTF8'),'sha256'),'hex')) ORDER BY ordinal)
 FROM (SELECT ordinality ordinal,btrim(replace(replace(item,E'\\r\\n',E'\\n'),E'\\r',E'\\n'),E' \\t\\n\\r\\f'||chr(11)) statement FROM unnest(m.statements) WITH ORDINALITY s(item,ordinality)) q),'[]'::jsonb) statements
 FROM supabase_migrations.schema_migrations m)
SELECT jsonb_build_object('database',current_database(),'versionMajor',current_setting('server_version_num')::int/10000,
 'migrations',(SELECT jsonb_agg(to_jsonb(migrations) ORDER BY version) FROM migrations),
 'census',jsonb_build_object('organizationIds',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM public.organizations),'[]'::jsonb),
 'authUserIds',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM auth.users),'[]'::jsonb)));
COMMIT;`;

const read = file => readFileSync(file);
function gitRead(cwd, args, input) {
  const result = spawnSync("git", args, { cwd, input, shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, "Cannot read immutable Git evidence"); return result.stdout;
}
function committedFileBytes(cwd, gitSha, files) {
  const batch = gitRead(cwd, ["cat-file", "--batch"], files.map(file => `${gitSha}:${file}\n`).join(""));
  let cursor = 0;
  const rows = files.map(file => {
    const end = batch.indexOf(10, cursor); assert.ok(end >= cursor, "Truncated Git blob header");
    const match = batch.subarray(cursor, end).toString("ascii").match(/^[a-f0-9]{40} blob (\d+)$/);
    assert.ok(match, "Missing or invalid Git source blob");
    const length = Number(match[1]); cursor = end + 1;
    assert.ok(Number.isSafeInteger(length) && cursor + length < batch.length && batch[cursor + length] === 10, "Truncated Git source body");
    const bytes = batch.subarray(cursor, cursor + length); cursor += length + 1;
    return { file, bytes };
  });
  assert.equal(cursor, batch.length, "Unexpected extra Git blob output");
  return rows;
}
function committedMigrations(cwd, gitSha) {
  if (committedMigrationCache.has(gitSha)) return committedMigrationCache.get(gitSha);
  const files = gitRead(cwd, ["ls-tree", "-r", "--name-only", gitSha, "--", "supabase/migrations"]).toString("utf8").trim().split("\n").sort();
  assert.ok(files.length > 0 && files.every(file => /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(file)), "Unknown committed migration path");
  const rows = committedFileBytes(cwd, gitSha, files).map(({ file, bytes }) => {
    const name = path.basename(file); return { version: name.slice(0, 14), name: name.slice(15, -4), body: bytes.toString("utf8") };
  });
  committedMigrationCache.set(gitSha, rows); return rows;
}
function readLocalInputs(cwd) {
  const gitSha = gitRead(cwd, ["rev-parse", "HEAD"]).toString("ascii").trim();
  assert.match(gitSha, /^[a-f0-9]{40}$/);
  if (!committedSourceCache.has(gitSha)) committedSourceCache.set(gitSha, committedFileBytes(cwd, gitSha, rentRuntimeSourceFiles));
  // Re-read every working dependency at capture and before each later write.
  const sourceHashes = verifyRentSourceFiles(committedSourceCache.get(gitSha),
    rentRuntimeSourceFiles.map(file => ({ file, bytes: read(path.join(cwd, file)) })));
  const migrationFiles = readdirSync(path.join(cwd, "supabase/migrations")).filter(name => name.endsWith(".sql")).sort();
  assert.ok(migrationFiles.every(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)), "Unknown migration filename");
  const workingMigrations = migrationFiles.map(file => ({
    version: file.slice(0, 14), name: file.slice(15, -4), body: readFileSync(path.join(cwd, "supabase/migrations", file), "utf8") }));
  const localMigrations = committedMigrations(cwd, gitSha);
  verifyWorkingRentMigrations(localMigrations, workingMigrations);
  const baselineBytes = read(path.join(cwd, ".codex-artifacts/ips-readiness-source-manifest.json"));
  assert.equal(sha256(baselineBytes), preservedBaselineSha256, "Historical baseline provenance bytes changed");
  return { gitSha, localMigrations, baselineBytes, sourceHashes };
}

async function rentRuntime(cwd, env) {
  validateRentEnvironment({ cwd, env, config: readFileSync(path.join(cwd, "supabase/config.toml"), "utf8") });
  const execute = (command, args, input, options = {}) => {
    const result = spawnSync(command, args, { input, encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024, ...options });
    assert.equal(result.status, 0, "Verified local rent target inspection failed"); return result.stdout;
  };
  const { docker, endpoint } = await localRecoveryDocker({ execute, env });
  let apiContainerId;
  const inspect = () => {
    validateRentEnvironment({ cwd, env, config: readFileSync(path.join(cwd, "supabase/config.toml"), "utf8") });
    const format = '{"name":{{json .Name}},"id":{{json .Id}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"image":{{json .Image}},"ports":{{json (index .NetworkSettings.Ports "5432/tcp")}}}';
    const container = JSON.parse(docker(["inspect", target.container, "--format", format]));
    assertRecoveryContainer(container, env.IPS_RENT_CONTAINER_ID);
    assert.ok(container.ports?.length > 0 && container.ports.every(port => port.HostPort === "59322" && ["127.0.0.1", "::1", "0.0.0.0", "::"].includes(port.HostIp)), "Wrong local database port binding");
    const apiFormat = format.replace("5432/tcp", "8000/tcp");
    const api = JSON.parse(docker(["inspect", `supabase_kong_${target.project}`, "--format", apiFormat]));
    verifyRentApiContainer(api, apiContainerId); apiContainerId = api.id;
    return container;
  };
  const rawSql = statement => { inspect(); return docker(["exec", "-i", env.IPS_RENT_CONTAINER_ID, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], statement).trim(); };
  const observe = () => JSON.parse(rawSql(rentBoundarySql));
  return { rawSql, observe, endpoint, inspect, get apiContainerId() { return apiContainerId; } };
}

export async function openRetainedRentTarget({ cwd, env = process.env }) {
  const approvedRoot = realpathSync(path.join(cwd, rentArtifactRoot));
  const manifestPath = realpathSync(env.IPS_RENT_MANIFEST_PATH ?? "");
  assert.equal(path.dirname(manifestPath), approvedRoot, "Manifest must stay in this follow-up artifact directory");
  assert.match(path.basename(manifestPath), /^retained-stack-manifest-[a-f0-9-]{36}\.json$/);
  const bytes = read(manifestPath), original = readLocalInputs(cwd);
  const manifest = approveRentManifest({ bytes, approvedSha256: env.IPS_RENT_MANIFEST_SHA256, ...original });
  assert.equal(manifest.containerId, env.IPS_RENT_CONTAINER_ID);
  const runtime = await rentRuntime(cwd, env);
  runtime.inspect(); assert.equal(runtime.apiContainerId, manifest.apiContainerId, "API container differs from approved capture");
  const additions = { organizationIds: [], authUserIds: [] };
  const check = () => {
    const current = readLocalInputs(cwd);
    approveRentManifest({ bytes: read(manifestPath), approvedSha256: env.IPS_RENT_MANIFEST_SHA256, ...current });
    verifyRentBoundary({ manifest, observed: runtime.observe(), localMigrations: current.localMigrations, additions });
  };
  check();
  return { manifest, manifestPath, check, additions, rawSql: runtime.rawSql, endpoint: runtime.endpoint };
}

export async function captureRetainedRentManifest({ cwd, env = process.env }) {
  const input = readLocalInputs(cwd), runtime = await rentRuntime(cwd, env), observed = runtime.observe();
  const migrations = verifyRentMigrations(input.localMigrations, observed.migrations);
  assert.equal(observed.database, "postgres"); assert.equal(observed.versionMajor, 17);
  const manifest = { schemaVersion: 1, sourceKind: "retained-readiness-stack", checkedAt: new Date().toISOString(),
    target, containerId: env.IPS_RENT_CONTAINER_ID, apiContainerId: runtime.apiContainerId, gitSha: input.gitSha, sourceHashes: input.sourceHashes,
    baselineManifestSha256: sha256(input.baselineBytes), migrationHead: migrations.at(-1).version, migrations,
    census: observed.census, censusSha256: censusHash(observed.census) };
  const directory = path.join(cwd, rentArtifactRoot); mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `retained-stack-manifest-${randomUUID()}.json`);
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n"); writeFileSync(destination, bytes, { flag: "wx" });
  return { path: destination, sha256: sha256(bytes), migrationCount: migrations.length,
    organizationCount: manifest.census.organizationIds.length, authUserCount: manifest.census.authUserIds.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ["--capture"], "Only explicit read-only manifest capture is supported");
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const captured = await captureRetainedRentManifest({ cwd });
  console.log(JSON.stringify({ ...captured, approved: false, next: "Coordinator must independently reconcile the census before approving this exact manifest hash." }));
}
