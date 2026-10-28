import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredDepositContainer } from './deposit-candidate-target.mjs';
import { localRecoveryDocker } from './local-recovery-docker.mjs';

// Only these rollback-only fixtures need an authentic session_user transition.
// Ordinary tests retain the CLI's postgres connection. No role is granted or
// altered, and the application session checks remain enabled.
export const SESSION_TESTS = Object.freeze([
  'financial_reset_archived_property_known_zero_test.sql',
  'financial_reset_checked_reopening_test.sql',
  'financial_reset_continuation_test.sql',
  'financial_reset_empty_books_test.sql',
  'financial_reset_execute_resume_test.sql',
  'financial_reset_explicit_no_backup_binding_test.sql',
  'financial_reset_genuine_session_actor_bridge_test.sql',
  'financial_reset_held_deposit_forward_test.sql',
  'financial_reset_known_zero_checked_phase_test.sql',
  'financial_reset_original_invoice_dates_test.sql',
  'financial_reset_reviewed_dispositions_test.sql',
  'financial_reset_scoped_session_commands_test.sql',
  'financial_reset_single_admin_test.sql',
]);

export function databaseTestPlan(files) {
  const ordinary = [], session = [];
  const wrapperName='financial_reset_single_admin_test.sql';
  const wrapper='-- Fixed single-admin variant of the complete rollback-only native fixture.\n\\set empty_books_single_admin true\n\\ir financial_reset_empty_books_test.sql\n';
  for (const file of files) {
    let source=file.source;
    if(file.name===wrapperName){
      assert.equal(source.replaceAll('\r\n','\n'),wrapper,'Only the exact reviewed single-admin fixture include is allowed.');
      const bases=files.filter(f=>f.name==='financial_reset_empty_books_test.sql');
      assert.equal(bases.length,1,'The single-admin variant requires exactly one native base fixture.');
      assert.doesNotMatch(bases[0].source,/^\s*\\(?:i|ir)\s/m,'The native base fixture cannot include other files.');
      source='\\set empty_books_single_admin true\n'+bases[0].source;
    }
    const privileged = SESSION_TESTS.includes(file.name);
    assert.equal(/\bSET\s+SESSION\s+AUTHORIZATION\b/i.test(source), privileged,
      `Session-authorization fixture must have an explicit reviewed classification: ${file.name}`);
    if (privileged) {
      assert.match(source, /\bBEGIN\s*;/i);
      assert.match(source, /CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;/);
      assert.match(source, /\bROLLBACK\s*;\s*$/i);
      assert.doesNotMatch(source, /^\s*COMMIT\s*;/im);
      session.push({...file,source});
    } else ordinary.push(file);
  }
  assert.deepEqual(session.map(file => file.name).sort(), [...SESSION_TESTS].sort(),
    'Every reviewed session-authority fixture must run exactly once.');
  assert.ok(ordinary.length, 'The ordinary database suite must not be empty.');
  return { ordinary, session };
}

export function verifyPgTapOutput(output, name) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  assert.ok(!lines.some(line => /^(?:not ok\b|Bail out!)/i.test(line)), `${name}: pgTAP failure or bailout`);
  const plans = lines.filter(line => /^1\.\./.test(line));
  assert.equal(plans.length, 1, `${name}: exactly one pgTAP plan is required`);
  assert.match(plans[0], /^1\.\.[1-9][0-9]*$/, `${name}: an unskipped positive plan is required`);
  const planned = Number(plans[0].slice(3));
  const results = lines.filter(line => /^ok\b/.test(line));
  assert.equal(results.length, planned, `${name}: every planned assertion must execute`);
  results.forEach((line, index) => {
    const knownDateSkips = {
      'financial_reset_held_deposit_forward_test.sql': 'Forward original-date success is eligible only in October 2026; the real clock is not changed.',
      'financial_reset_original_invoice_dates_test.sql': 'Original-date success path is eligible only during October 2026; no clock override is used.',
      'financial_reset_empty_books_test.sql': 'October-only success path is not executed with a fabricated database clock.',
      'financial_reset_single_admin_test.sql': 'October-only success path is not executed with a fabricated database clock.',
    };
    const skip = line.match(/\s+#\s*SKIP\s+(.*)$/i);
    if (skip) assert.equal(skip[1], knownDateSkips[name], `${name}: only the existing date-bound skip is allowed`);
    const assertion = skip ? line.slice(0, skip.index) : line;
    assert.match(assertion, new RegExp(`^ok ${index + 1}(?: - .*)?$`), `${name}: assertion numbering must be contiguous`);
    assert.doesNotMatch(line, /#\s*TODO\b/i, `${name}: TODO assertions are not release evidence`);
  });
  return planned;
}

export async function localDatabaseTestTarget({ config, execute, env = process.env, platform = process.platform }) {
  const container = configuredDepositContainer(config);
  assert.ok(!env.SUPABASE_DB_CONTAINER || env.SUPABASE_DB_CONTAINER === container,
    'Database test target must match the configured local project.');
  for (const key of ['DATABASE_URL', 'SUPABASE_DB_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) {
    assert.ok(!env[key], 'Database tests refuse connection/session overrides.');
  }
  const { docker } = await localRecoveryDocker({ execute, env, platform });
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}}}';
  const inspect = () => JSON.parse(docker(['inspect', container, '--format', format]));
  const verify = (value, expectedId) => {
    assert.match(value.id, /^[a-f0-9]{64}$/);
    if (expectedId) assert.equal(value.id, expectedId, 'Database test container was replaced.');
    assert.equal(value.name, `/${container}`);
    assert.equal(value.project, container.slice('supabase_db_'.length));
    assert.equal(value.running, true);
  };
  const initial = inspect(); verify(initial);
  const args = ['exec', '-i', initial.id, 'psql', '-X', '-qAt', '-h', '/var/run/postgresql',
    '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const run = (sql) => {
    verify(inspect(), initial.id);
    return docker(args, sql);
  };
  assert.equal(run("SELECT session_user='supabase_admin' AND current_user=session_user AND inet_server_addr() IS NULL AND (SELECT rolsuper FROM pg_roles WHERE rolname=session_user);").trim(), 't',
    'Session tests require the existing local socket administrator; no role changes are permitted.');
  const runSingleAdmin = (file) => {
    assert.ok(['financial_reset_single_admin_test.sql', 'financial_reset_execute_resume_test.sql'].includes(file.name));
    const database = `single_admin_test_${randomUUID().replaceAll('-', '')}`;
    const checkedDocker = (arguments_, input) => { verify(inspect(), initial.id); return docker(arguments_, input); };
    const cloneRun = (source) => checkedDocker(args.map((value, index) => args[index - 1] === '-d' ? database : value), source);
    const dump = (extra) => checkedDocker(['exec', initial.id, 'pg_dump', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres',
      '--exclude-extension=pg_cron', '--exclude-extension=pg_net', '--exclude-schema=cron', '--exclude-schema=net', '--no-publications', '--no-subscriptions', ...extra]);
    const relations = JSON.parse(run("SELECT coalesce(json_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private','auth') AND c.relkind='r';"));
    assert.ok(relations.length > 0);
    relations.forEach(name => assert.match(name, /^(?:public|app_private|auth)\.[a-z][a-z0-9_]*$/));
    const census = `SELECT jsonb_build_object('rows',to_jsonb(ARRAY[${relations.map(name => `(SELECT count(*) FROM ${name})`).join(',')}]),'organizations',
      (SELECT encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]')::text,'sha256'),'hex') FROM public.organizations o))::text;`;
    const sourceBefore = run(census);
    let created = false;
    try {
      run(`CREATE DATABASE ${database} TEMPLATE template0;`); created = true;
      cloneRun(dump(['--schema-only', '--section=pre-data']));
      // Only this immutable non-tenant policy roster is copied. Normal dump
      // pre/data/post ordering creates its immutable guard after initial data.
      cloneRun(dump(['--data-only', '--table=app_private.financial_reset_relation_rules']));
      cloneRun(dump(['--schema-only', '--section=post-data']));
      cloneRun(SINGLE_ADMIN_RUNTIME_BOOTSTRAP_SQL);
      assert.equal(cloneRun("SELECT session_user='supabase_admin' AND current_user=session_user AND inet_server_addr() IS NULL AND (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AND NOT EXISTS(SELECT 1 FROM public.organizations) AND NOT EXISTS(SELECT 1 FROM auth.users) AND NOT EXISTS(SELECT 1 FROM auth.sessions) AND NOT EXISTS(SELECT 1 FROM public.organization_members);").trim(), 't');
      const cleanBefore = cloneRun(census);
      const output = cloneRun(file.source);
      assert.equal(cloneRun(census), cleanBefore, 'Single-admin fixture must roll back its complete row census and organizations.');
      return output;
    } finally {
      let cleanupFailed = false, absent = false, sourceUnchanged = false;
      try { if (created) run(`DROP DATABASE ${database};`); } catch { cleanupFailed = true; }
      try { absent = run(`SELECT count(*) FROM pg_database WHERE datname='${database}';`).trim() === '0'; } catch { cleanupFailed = true; }
      try { sourceUnchanged = run(census) === sourceBefore; } catch { cleanupFailed = true; }
      assert.ok(!cleanupFailed && absent && sourceUnchanged,
        `Single-admin fixture cleanup verification failed (databaseAbsent=${absent}, sourceUnchanged=${sourceUnchanged}).`);
    }
  };
  return Object.freeze({ run, runSingleAdmin });
}

// These are the existing migration bootstrap forms, with fresh synthetic secrets.
// No source capability tokens, Auth sessions, members or tenant rows are copied.
export const SINGLE_ADMIN_RUNTIME_BOOTSTRAP_SQL = [
  ...['finance_settlement_context_capability', 'financial_projection_context_capability',
    'tenant_invoice_settlement_context_capability', 'property_branch_assignment_context_capability',
    'finance_branch_authority_capability', 'maintenance_branch_authority_capability']
    .map(name => `INSERT INTO app_private.${name}(singleton,capability_token) VALUES(true,encode(extensions.gen_random_bytes(32),'hex'));`),
  "INSERT INTO app_private.expense_transaction_capability(singleton,secret) VALUES(true,encode(extensions.gen_random_bytes(32),'hex'));",
  'INSERT INTO app_private.financial_scheduler_capability(singleton) VALUES(true);',
].join('\n');

export function runSessionTest(file, target) {
  assert.ok(SESSION_TESTS.includes(file.name));
  return verifyPgTapOutput(['financial_reset_single_admin_test.sql', 'financial_reset_execute_resume_test.sql'].includes(file.name) ? target.runSingleAdmin(file) : target.run(file.source), file.name);
}

export async function main(repository = path.resolve(import.meta.dirname, '..')) {
  const execute = (command, args, input, options = {}) => {
    const result = spawnSync(command, args, { cwd: repository, input, encoding: 'utf8',
      windowsHide: true, shell: false, timeout: 600_000, maxBuffer: 32 * 1024 * 1024, ...options });
    if (result.error || result.status !== 0) throw Error(`${command} failed: ${result.stderr || result.error?.message || result.status}`);
    return result.stdout;
  };
  const directory = path.join(repository, 'supabase/tests');
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => {
      const filePath = path.join(entry.parentPath, entry.name);
      return { name: path.relative(directory, filePath).replaceAll(path.sep, '/'), path: filePath, source: readFileSync(filePath, 'utf8') };
    }).sort((a, b) => a.name.localeCompare(b.name));
  const plan = databaseTestPlan(files);
  const target = await localDatabaseTestTarget({ config: readFileSync(path.join(repository, 'supabase/config.toml'), 'utf8'), execute });
  execute(process.execPath, [path.join(repository, 'node_modules/supabase/dist/supabase.js'),
    'test', 'db', '--local', ...plan.ordinary.map(file => path.relative(repository, file.path).replaceAll(path.sep, '/'))], undefined, { stdio: 'inherit' });
  let assertions = 0;
  for (const file of plan.session) {
    const count = runSessionTest(file, target); assertions += count;
    console.log(`${file.name}: ${count} pgTAP assertions verified (local session-authority fixture; only explicitly reviewed calendar-bound skips are permitted).`);
  }
  console.log(`${plan.session.length} session-authority files, ${assertions} assertions passed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
