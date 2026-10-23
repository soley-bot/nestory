// Database-clone proof only. Never resets the source, changes service routing,
// publishes files, or executes financial deletion/normalization.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { reconstructLocalMigrationDescriptors } from './hosted-migration-parity-core.mjs';
import { TARGET, RESET_TOOL_SOURCE_FILES, assertLocalSource, assertLocalContainer, identitySql, json, sha256, normalizedSource } from './pilot-finance-reset-core.mjs';
import { schemaCensusSql, tableCensusSql, parseJsonLines, compareEvidence, assertUniqueObjectKeys } from './ips-readiness-recovery-core.mjs';
import { assertInventoryManifest, cloneIdentity, assertOwnedClone, assertSourceContainer, assertDiskSpace, assertDump, assertManifestRows, safeFailureMessage } from './pilot-finance-reset-recovery-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = randomUUID(), identity = cloneIdentity(runId);
const directory = path.join(root, '.codex-artifacts', 'pilot-finance-reset-recovery', runId);
const report = { format: 'nestory-local-database-clone-proof-v1', runId, startedAt: new Date().toISOString(),
  sourceProject: TARGET.project, sourceDatabase: 'postgres', cloneDatabase: identity.database,
  databaseCloneProven: false, actualResetRecoveryProven: false, storageBytesRecoveryProven: false,
  authServiceRecoveryProven: false, hostedPitrProven: false, productionRecoveryProven: false,
  exclusions: ['pg_cron and cron schema', 'pg_net and net schema', 'physical Storage bytes', 'cluster globals/password restoration', 'service routing and Auth sign-in', 'financial reset execution'], phases: {} };
let docker, sourceId, phase = 'preflight', created = false, dumpAttempted = false;
function execute(file, args, input, { timeoutMs = 60_000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: root, env, timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      // Command arguments, dump data and authentication rows are never emitted.
      if (error) reject(Error(`${phase}: local command failed.`)); else resolve(stdout);
    });
    child.stdin.on('error', () => {}); child.stdin.end(input ?? '');
  });
}
const sql = (database, input) => docker(['exec', '-i', sourceId, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], input);
const rows = async (database, input) => parseJsonLines(await sql(database, input));
async function timed(name, task) { phase = name; const start = performance.now(); try { return await task(); } finally { report.phases[name] = Math.round(performance.now() - start); } }
async function inspect() {
  const value = JSON.parse(await docker(['inspect', TARGET.container, '--format', '{"name":{{json .Name}},"id":{{json .Id}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"image":{{json .Image}}}']));
  assertSourceContainer(value, sourceId); return value;
}
async function diskSpace() {
  const columns = (await docker(['exec', sourceId, 'df', '-Pk', '/var/lib/postgresql/data'])).trim().split(/\r?\n/).at(-1).trim().split(/\s+/);
  const bytes = Number(columns[3]) * 1024; assertDiskSpace(bytes); return bytes;
}
const record = async () => (await rows('postgres', `SELECT jsonb_build_object('name',datname,'oid',oid::bigint,'owner',pg_get_userbyid(datdba),'comment',shobj_description(oid,'pg_database')) FROM pg_database WHERE datname='${identity.database}';`))[0];
async function census(database) {
  const result = { tables: await rows(database, tableCensusSql), schema: await rows(database, schemaCensusSql),
    sequenceDefinitions: await rows(database, `BEGIN READ ONLY; SELECT jsonb_build_object('schema',n.nspname,'name',c.relname,
      'type',format_type(s.seqtypid,NULL),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,
      'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle) FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','app_private','auth','storage','supabase_migrations') ORDER BY n.nspname,c.relname; COMMIT;`) };
  assertUniqueObjectKeys(result.schema); return result;
}
const schemaHash = schema => sha256(json([...schema].sort((a, b) => json(a) < json(b) ? -1 : json(a) > json(b) ? 1 : 0)));
async function ensureArtifactDirectory() {
  if (await realpath(root) !== root) throw Error('Artifact workspace may not be redirected.');
  let current = root;
  for (const component of ['.codex-artifacts', 'pilot-finance-reset-recovery', runId]) {
    current = path.join(current, component);
    try { if (await realpath(current) !== current) throw Error('Artifact directory may not be redirected.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(current); if (await realpath(current) !== current) throw Error('Artifact directory may not be redirected.'); }
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--manifest' || args[2] !== '--local-project') throw Error('Usage: --manifest <accepted inventory JSON> --local-project <dedicated project directory>');
  const projectRoot = path.join(os.tmpdir(), 'nestory-pilot-reset-db-20261022');
  if (path.resolve(args[3]) !== projectRoot || await realpath(projectRoot) !== projectRoot) throw Error('Dedicated local project path may not be changed or redirected.');
  for (const key of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'DATABASE_URL', 'SUPABASE_DB_CONTAINER']) {
    if (process.env[key]) throw Error('Clone runner refuses database target or credential environment overrides.');
  }
  const [manifestText, config, fixture, candidateHead] = await Promise.all([
    readFile(path.resolve(args[1]), 'utf8'), readFile(path.join(path.resolve(args[3]), 'supabase/config.toml'), 'utf8'),
    readFile(path.join(root, 'supabase/test-fixtures/baseline.sql')), execute('git', ['rev-parse', 'HEAD']),
  ]);
  const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, '')), binding = assertInventoryManifest(manifest);
  await execute('git', ['merge-base', '--is-ancestor', TARGET.baseSha, 'HEAD']);
  if (binding.candidateHead !== candidateHead.trim()) throw Error('Candidate HEAD differs from captured inventory.');
  const captureSources = async () => Promise.all(RESET_TOOL_SOURCE_FILES.map(async name => ({ name, sha256: sha256(normalizedSource(await readFile(path.join(root, name), 'utf8'))) })));
  const candidateSources = await captureSources();
  compareEvidence(candidateSources, binding.candidateSources, 'Captured inventory implementation');
  sourceId = binding.containerId;
  const local = await localRecoveryDocker({ execute }); docker = local.docker; report.dockerEndpoint = local.endpoint;
  const source = await inspect();
  assertLocalContainer({ config, inspect: source, baseSha: TARGET.baseSha, fixtureSha256: sha256(fixture) });
  if (binding.endpoint !== local.endpoint || binding.image !== source.image) throw Error('Captured Docker endpoint or image differs.');
  const identities = (await rows('postgres', `BEGIN READ ONLY; ${identitySql} COMMIT;`))[0];
  assertLocalSource({ config, inspect: source, baseSha: TARGET.baseSha, fixtureSha256: sha256(fixture), identities });
  const names = (await readdir(path.join(root, 'supabase/migrations'))).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(async name => ({ name, sha256: sha256(normalizedSource(await readFile(path.join(root, 'supabase/migrations', name), 'utf8'))) })));
  if (sha256(json(migrations)) !== binding.migrationsSha256) throw Error('Current migration files differ from inventory.');
  const ledger = await rows('postgres', `BEGIN READ ONLY; SELECT jsonb_build_object('version',m.version,'name',m.name,'statements',coalesce((SELECT jsonb_agg(jsonb_build_object('byteLength',octet_length(replace(s.statement,E'\\r\\n',E'\\n')),'sha256',encode(extensions.digest(replace(s.statement,E'\\r\\n',E'\\n'),'sha256'),'hex')) ORDER BY s.ordinality) FROM unnest(m.statements) WITH ORDINALITY s(statement,ordinality)),'[]'::jsonb)) FROM supabase_migrations.schema_migrations m ORDER BY m.version; COMMIT;`);
  if (ledger.length !== names.length) throw Error('Source migration ledger count differs.');
  for (let index = 0; index < names.length; index++) {
    const name = names[index], entry = ledger[index];
    const body = normalizedSource(await readFile(path.join(root, 'supabase/migrations', name), 'utf8'));
    if (entry.version !== name.slice(0, 14) || entry.name !== name.slice(15, -4) || reconstructLocalMigrationDescriptors(body, entry.statements).issue) throw Error('Installed migration content differs from candidate.');
  }
  report.manifestSha256 = manifest.manifestSha256; report.binding = binding;
  report.recoverySources = candidateSources;
  report.freeBytesBefore = await diskSpace();
  const preflight = (await rows('postgres', `BEGIN READ ONLY; SELECT jsonb_build_object('version',current_setting('server_version_num')::int,'bytes',pg_database_size(current_database()),'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension)); COMMIT;`))[0];
  if (Math.floor(preflight.version / 10000) !== 17 || preflight.bytes > 1024 ** 3) throw Error('Source version or bounded size check failed.');
  const before = await timed('source census', () => census('postgres'));
  if (schemaHash(before.schema) !== binding.schemaSha256) throw Error('Source schema differs from accepted inventory.');
  assertManifestRows(manifest, before.tables);
  await ensureArtifactDirectory();
  await timed('dump source', async () => {
    await inspect(); await diskSpace(); dumpAttempted = true;
    await docker(['exec', sourceId, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--format=custom', `--file=${identity.dumpPath}`, '--exclude-extension=pg_cron', '--exclude-schema=cron', '--exclude-extension=pg_net', '--exclude-schema=net'], undefined, { timeoutMs: 120_000 });
    report.dump = { sha256: (await docker(['exec', sourceId, 'sha256sum', identity.dumpPath])).split(/\s/)[0], bytes: Number((await docker(['exec', sourceId, 'stat', '-c', '%s', identity.dumpPath])).trim()) }; assertDump(report.dump);
  });
  await timed('create owned clone', async () => {
    await inspect(); await diskSpace(); if (await record()) throw Error('Generated clone already exists.');
    report.creationAttempted = true;
    await sql('postgres', `CREATE DATABASE "${identity.database}" OWNER postgres TEMPLATE template0;`); created = true;
    await sql('postgres', `COMMENT ON DATABASE "${identity.database}" IS '${identity.marker}';`);
    const actual = await record(); identity.oid = actual?.oid; assertOwnedClone(identity, actual); report.cloneOid = identity.oid;
  });
  await timed('restore clone', async () => {
    await inspect(); assertOwnedClone(identity, await record());
    await docker(['exec', sourceId, 'pg_restore', '-U', 'supabase_admin', '-d', identity.database, '--exit-on-error', '--single-transaction', '--clean', '--if-exists', identity.dumpPath], undefined, { timeoutMs: 120_000 });
  });
  await timed('verify clone and unchanged source', async () => {
    await inspect(); assertOwnedClone(identity, await record());
    const after = await census(identity.database), sourceAfter = await census('postgres');
    const extensions = await rows(identity.database, 'SELECT jsonb_build_object(\'name\',extname,\'version\',extversion) FROM pg_extension ORDER BY extname;');
    report.extensionsSha256 = compareEvidence(preflight.extensions.filter(item => !['pg_cron', 'pg_net'].includes(item.name)), extensions, 'Clone extensions');
    report.tablesSha256 = compareEvidence(before.tables, after.tables, 'Clone data and sequences');
    report.schemaSha256 = compareEvidence(before.schema, after.schema, 'Clone schema, ACLs and constraints');
    report.sequenceDefinitionsSha256 = compareEvidence(before.sequenceDefinitions, after.sequenceDefinitions, 'Clone sequence definitions');
    compareEvidence(before.tables, sourceAfter.tables, 'Source data and sequences unchanged');
    compareEvidence(before.schema, sourceAfter.schema, 'Source schema unchanged');
    compareEvidence(before.sequenceDefinitions, sourceAfter.sequenceDefinitions, 'Source sequence definitions unchanged');
    assertManifestRows(manifest, sourceAfter.tables);
    compareEvidence(candidateSources, await captureSources(), 'Tool dependencies during clone rehearsal');
    if (candidateHead.trim() !== (await execute('git', ['rev-parse', 'HEAD'])).trim()) throw Error('Candidate HEAD changed during clone rehearsal.');
    for (const migration of migrations) if (migration.sha256 !== sha256(normalizedSource(await readFile(path.join(root, 'supabase/migrations', migration.name), 'utf8')))) throw Error('Migration source changed during clone rehearsal.');
    report.tableCount = after.tables.filter(row => row.kind === 'table').length; report.schemaObjectCount = after.schema.length;
    await writeFile(path.join(directory, 'fingerprints.json'), `${JSON.stringify({ before, after, sourceAfter }, null, 2)}\n`, { flag: 'wx' });
    report.databaseCloneProven = true;
  });
} catch (error) { report.failure = { phase, message: safeFailureMessage(error) }; process.exitCode = 1; }
finally {
  report.cleanup = {};
  if (report.creationAttempted && !created) report.cleanup.creationOutcomeUncertain = true;
  if (created) {
    try { await inspect(); assertOwnedClone(identity, await record()); await docker(['exec', sourceId, 'dropdb', '-U', 'supabase_admin', identity.database]); if (await record()) throw Error('Clone remains after cleanup.'); report.cleanup.cloneDropped = true; }
    catch (error) { report.cleanup.cloneError = error.message; process.exitCode = 1; }
  }
  if (dumpAttempted) {
    try { await inspect(); await docker(['exec', sourceId, 'rm', '-f', '--', identity.dumpPath]); report.cleanup.dumpRemoved = true; }
    catch (error) { report.cleanup.dumpError = error.message; process.exitCode = 1; }
  }
  report.completed = report.databaseCloneProven === true && report.cleanup.cloneDropped === true && report.cleanup.dumpRemoved === true;
  report.finishedAt = new Date().toISOString();
  await ensureArtifactDirectory(); await writeFile(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ completed: report.completed, databaseCloneProven: report.databaseCloneProven, failure: report.failure, cleanup: report.cleanup, report: path.join(directory, 'report.json') })}\n`);
}
