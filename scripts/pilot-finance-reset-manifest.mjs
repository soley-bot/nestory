// Read-only inventory of the already-validated disposable local fixture.
// No target, URL, credentials, reset flag or arbitrary SQL is accepted.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { schemaCensusSql, compareEvidence, parseJsonLines } from './ips-readiness-recovery-core.mjs';
import { reconstructLocalMigrationDescriptors } from './hosted-migration-parity-core.mjs';
import { TARGET, RESET_TOOL_SOURCE_FILES, sha256, json, assertLocalSource, assertLocalContainer, normalizedSource, buildManifest, identitySql, catalogSql, rowInventorySql } from './pilot-finance-reset-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const projectRoot = path.join(os.tmpdir(), 'nestory-pilot-reset-db-20261022');
const operationId = randomUUID();
let phase = 'local preflight';
function execute(file, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: root, windowsHide: true, shell: false, timeout: 60_000, maxBuffer: 64 * 1024 ** 2, ...options }, (error, stdout) => {
      if (error) reject(Error(`${phase}: bounded local command failed.`)); else resolve(stdout);
    });
    child.stdin.on('error', () => {}); child.stdin.end(input ?? '');
  });
}
const normalized = normalizedSource;
try {
  if (process.argv.length !== 2) throw Error('Local inventory accepts no arguments, targets or credentials.');
  for (const key of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'DATABASE_URL', 'SUPABASE_DB_CONTAINER']) {
    if (process.env[key]) throw Error('Local inventory refuses database target or credential environment overrides.');
  }
  if (process.platform !== 'win32') throw Error('This reviewed adapter is fixed to the Windows dedicated local project.');
  if (await realpath(projectRoot) !== projectRoot) throw Error('Dedicated project may not be redirected through a junction.');
  const config = await readFile(path.join(projectRoot, 'supabase/config.toml'), 'utf8');
  const fixtureBody = await readFile(path.join(root, 'supabase/test-fixtures/baseline.sql'));
  const candidateHead = (await execute('git', ['rev-parse', 'HEAD'])).trim();
  await execute('git', ['merge-base', '--is-ancestor', TARGET.baseSha, candidateHead]);
  const baseSha = TARGET.baseSha;
  const captureSources = async () => Promise.all(RESET_TOOL_SOURCE_FILES.map(async name => ({name,sha256:sha256(normalized(await readFile(path.join(root,name),'utf8')))})));
  const candidateSources = await captureSources();
  const { docker, endpoint } = await localRecoveryDocker({ execute });
  const inspect = async () => JSON.parse(await docker(['inspect', TARGET.container, '--format', '{"name":{{json .Name}},"id":{{json .Id}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"image":{{json .Image}}}']));
  const container = await inspect();
  assertLocalContainer({config, inspect:container, baseSha, fixtureSha256:sha256(fixtureBody)});
  // Pin the inspected immutable container ID for every query.
  const sql = body => docker(['exec', '-i', container.id, 'psql', '-X', '-qAt', '-h', '127.0.0.1', '-U', 'postgres', '-d', TARGET.database, '-v', 'ON_ERROR_STOP=1'], body);
  const read = body => sql(`BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; SET LOCAL timezone='UTC';\n${body}\nCOMMIT;`).then(parseJsonLines);
  const identities = (await read(identitySql))[0];
  assertLocalSource({ config, inspect: container, baseSha, fixtureSha256: sha256(fixtureBody), identities });
  phase = 'candidate and fixture binding';
  const sourceEvidence = JSON.parse(normalized(await readFile(path.join(projectRoot, 'validation-source-hashes.json'), 'utf8')));
  if (!Array.isArray(sourceEvidence) || sourceEvidence.length !== 10) throw Error('Final synthetic validation source evidence is missing.');
  const evidence = [];
  const seen = new Set();
  for (const item of sourceEvidence) {
    const name = path.basename(item.path);
    const expected = name === 'lease-deposit-chronology-concurrency.node-test.mjs' ? path.join(root, 'scripts', name)
      : name === 'baseline.sql' ? path.join(projectRoot, 'supabase/test-fixtures', name)
      : /^2026\d{10}_[a-z0-9_]+\.sql$/.test(name) ? path.join(projectRoot, 'supabase/migrations', name)
      : ['load-paid-cost-scenarios-fixture.ts', 'load-owner-statement-publication-fixture.ts'].includes(name) ? path.join(projectRoot, 'scripts', name) : null;
    if (!expected || path.resolve(item.path) !== expected || seen.has(name)) throw Error('Unexpected validation source artifact.');
    seen.add(name);
    const actual = sha256(await readFile(expected));
    if (actual !== item.sha256) throw Error('Validated synthetic source artifact changed.');
    evidence.push({ name, sha256: actual });
  }
  const names = (await readdir(path.join(root, 'supabase/migrations'))).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const ledger = await read(`SELECT jsonb_build_object('version',m.version,'name',m.name,'statements',coalesce((SELECT jsonb_agg(jsonb_build_object('byteLength',octet_length(replace(s.statement,E'\\r\\n',E'\\n')),'sha256',encode(extensions.digest(replace(s.statement,E'\\r\\n',E'\\n'),'sha256'),'hex')) ORDER BY s.ordinality) FROM unnest(m.statements) WITH ORDINALITY s(statement,ordinality)),'[]'::jsonb)) FROM supabase_migrations.schema_migrations m ORDER BY m.version;`);
  if (names.length !== ledger.length) throw Error('Migration ledger count differs from candidate files.');
  const migrations = [];
  for (let index = 0; index < names.length; index++) {
    const name = names[index], version = name.slice(0, 14), migrationName = name.slice(15, -4), entry = ledger[index];
    const body = normalized(await readFile(path.join(root, 'supabase/migrations', name), 'utf8'));
    if (entry.version !== version || entry.name !== migrationName || reconstructLocalMigrationDescriptors(body, entry.statements).issue) throw Error(`Installed migration content differs: ${version}`);
    migrations.push({ name, sha256: sha256(body), statements: entry.statements });
  }
  phase = 'read-only exact row inventory';
  const schemaBefore = parseJsonLines(await sql(schemaCensusSql));
  const tables = await read(catalogSql);
  const inventorySql = rowInventorySql(tables);
  const before = parseJsonLines(await sql(inventorySql));
  const storageSql = `SELECT jsonb_build_object('id',id,'bucket',bucket_id,'name',name,'version',version,'metadataSha256',encode(extensions.digest(to_jsonb(o)::text,'sha256'),'hex')) FROM storage.objects o ORDER BY id;`;
  const storageObjects = await read(storageSql);
  const after = parseJsonLines(await sql(inventorySql));
  compareEvidence(storageObjects, await read(storageSql), 'Storage metadata during capture');
  const schemaAfter = parseJsonLines(await sql(schemaCensusSql));
  compareEvidence(before, after, 'Exact source rows during capture');
  compareEvidence(schemaBefore, schemaAfter, 'Schema during capture');
  if ((await inspect()).id !== container.id) throw Error('Container changed during capture.');
  const identitiesAfter = (await read(identitySql))[0];
  if (json(identities) !== json(identitiesAfter)) throw Error('Synthetic source identity changed during capture.');
  const withoutKind = ({ ...row }) => { delete row.kind; return row; };
  const census = before.filter(row => row.kind === 'census').map(withoutKind);
  if (json(candidateSources) !== json(await captureSources()) || candidateHead !== (await execute('git',['rev-parse','HEAD'])).trim()) throw Error('Candidate source changed during capture.');
  for (const migration of migrations) if (migration.sha256 !== sha256(normalized(await readFile(path.join(root,'supabase/migrations',migration.name),'utf8')))) throw Error('Migration source changed during capture.');
  const manifest = buildManifest({ operationId, binding: { organization: TARGET.organization, cutoff: TARGET.cutoff, baseSha, candidateHead, candidateSources, capturedAt: new Date().toISOString(),
    fixtureSha256: sha256(fixtureBody), project: TARGET.project, containerId: container.id, image: container.image, endpoint,
    authUsers: identities.authUsers, cronLaunch: identities.cronLaunch, migrationsSha256: sha256(json(migrations.map(({name,sha256}) => ({name,sha256})))),
    migrations, fixtureArtifacts: evidence, globalCensusSha256: sha256(json(census)), globalCensus: census,
    capturedGeneration: null, expectedNextGeneration: null, generationSelectionRequiresFrozenCheckpoint: true },
    inbound: before.filter(row => row.kind === 'inbound').map(withoutKind), tables, rows: before.filter(row => row.kind === 'row'), schema: schemaBefore, storageObjects });
  phase = 'controlled local artifact';
  const output = path.join(projectRoot, 'pilot-finance-reset-manifests');
  await mkdir(output, { recursive: true });
  if (await realpath(output) !== output) throw Error('Artifact directory may not be redirected.');
  const destination = path.join(output, `${operationId}.json`);
  await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ operationId, path: destination, manifestSha256: manifest.manifestSha256, inventoryAccepted: manifest.inventoryAccepted,
    selectedRows: before.filter(row => row.kind === 'row').length, tables: tables.length, issues: manifest.issues.length, executionSupported: false })}\n`);
  if (!manifest.inventoryAccepted) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ phase, message: error instanceof SyntaxError ? 'Malformed local JSON; contents withheld.' : error.message, operationId, executionSupported: false })}\n`);
  process.exitCode = 1;
}
