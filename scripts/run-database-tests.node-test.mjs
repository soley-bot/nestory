import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { SESSION_TESTS, SINGLE_ADMIN_RUNTIME_BOOTSTRAP_SQL, databaseTestPlan, localDatabaseTestTarget, runSessionTest, syntheticFixtureDiagnostics, verifyPgTapOutput } from './run-database-tests.mjs';

test('all fourteen privileged tests stay classified and every other SQL test remains ordinary', () => {
  const root = new URL('../supabase/tests/', import.meta.url);
  const files = readdirSync(root).filter(name => name.endsWith('.sql')).map(name => ({ name, source: readFileSync(new URL(name, root), 'utf8') }));
  const plan = databaseTestPlan(files);
  assert.equal(plan.session.length, 14);
  assert.ok(plan.session.some(file => file.name === 'financial_reset_empty_books_test.sql'));
  assert.equal(plan.ordinary.length + plan.session.length, files.length);
  assert.throws(() => databaseTestPlan(files.filter(file => file.name !== SESSION_TESTS[0])), /exactly once/);
  assert.throws(() => databaseTestPlan([...files, { name: 'unexpected.sql', source: 'SET SESSION AUTHORIZATION authenticator;' }]), /classification/);
  assert.throws(() => databaseTestPlan([...files, files.find(file => file.name === SESSION_TESTS[0])]), /exactly once/);
});

test('committed restart composes only the fixed native fixture and stays in the owned clone lane',()=>{
 const root=new URL('../supabase/tests/',import.meta.url);
 const files=readdirSync(root).filter(name=>name.endsWith('.sql')).map(name=>({name,source:readFileSync(new URL(name,root),'utf8')}));
 const selected=databaseTestPlan(files).session.find(f=>f.name==='financial_reset_manual_restart_test.sql');
 assert.match(selected.source,/'7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid AS operation/);
 assert.match(selected.source,/WHERE operation_id='7c70e27f-ba37-48cc-8f93-d32badcb2fb7' ORDER BY ordinal LOOP/);
 assert.doesNotMatch(selected.source,/eb270056-0000-4000-8000-000000000700|pg_temp\.empty_books_id\(700\)/);
 assert.equal((selected.source.match(/^COMMIT;$/gm)??[]).length,2);
 assert.match(selected.source,/\\endif\n\\if :empty_month\nCOMMIT;\nBEGIN;/);
 assert.equal((selected.source.match(/SELECT \* FROM finish\(\);/g)??[]).length,1);
 assert.doesNotMatch(selected.source,/^\s*\\(?:i|ir)\s/m);
 assert.equal(runSessionTest(selected,{run:()=>{throw Error('committed fixture must not reach source database');},
  runSingleAdmin:file=>{assert.equal(file,selected);return 'ok 1 - native committed reset and restart\n1..1\n';}}),1);
 for(const edit of [source=>source.replace('pg_temp.empty_books_id(700) AS operation','changed AS operation'),
   source=>source.replace("WHERE operation_id='eb270056-0000-4000-8000-000000000700' ORDER BY ordinal LOOP",'WHERE true ORDER BY ordinal LOOP'),
   source=>source.replace('SELECT * FROM finish();\nROLLBACK;','COMMIT;')]) {
  assert.throws(()=>databaseTestPlan(files.map(f=>f.name==='financial_reset_empty_books_test.sql'?{...f,source:edit(f.source.replaceAll('\r\n','\n'))}:f)));
 }
 assert.throws(()=>databaseTestPlan(files.map(f=>f.name==='financial_reset_manual_restart_test.sql'?{...f,source:f.source+'\\ir secret.sql\n'}:f)),/cannot include/);
});

test('owned synthetic fixture failures retain bounded TAP evidence without raw selected documents',()=>{
 const source='{"binding":"not-for-output","token":"secret"}\nok 1 - prepared\nnot ok 2 - expected checked action\n# caught: rejected\n';
 const diagnostic=syntheticFixtureDiagnostics(source,'financial_reset_manual_restart_test.sql');
 assert.match(diagnostic,/not ok 2 - expected checked action/);
 assert.match(diagnostic,/# caught: rejected/);
 assert.doesNotMatch(diagnostic,/not-for-output|secret|token/);
 assert.equal(syntheticFixtureDiagnostics(source,'ordinary.sql'),'');
 assert.ok(syntheticFixtureDiagnostics('#'.repeat(50000),'financial_reset_manual_restart_test.sql').length<16200);
 assert.throws(()=>verifyPgTapOutput(source+'1..2\n','financial_reset_manual_restart_test.sql'),/caught: rejected/);
});

test('fixed execute-resume fixture uses the existing clean-schema lane', () => {
  const calls=[];
  const file={name:'financial_reset_execute_resume_test.sql',source:'synthetic'};
  assert.equal(runSessionTest(file,{run:()=>{throw Error('ordinary database must not receive fixed Pilot fixture');},
    runSingleAdmin:value=>{calls.push(value);return 'ok 1 - isolated\n1..1\n';}}),1);
  assert.deepEqual(calls,[file]);
});

test('only the fixed single-admin include expands before streamed session execution',()=>{
 const root=new URL('../supabase/tests/',import.meta.url);
 const files=readdirSync(root).filter(name=>name.endsWith('.sql')).map(name=>({name,source:readFileSync(new URL(name,root),'utf8')}));
 const selected=databaseTestPlan(files).session.find(f=>f.name==='financial_reset_single_admin_test.sql');
 assert.ok(selected.source.startsWith('\\set empty_books_single_admin true\n'));
 assert.match(selected.source,/SET SESSION AUTHORIZATION authenticator/);
 assert.match(selected.source,/ROLLBACK;\s*$/);
 assert.doesNotMatch(selected.source,/^\s*\\(?:i|ir)\s/m);
 for(const source of ['\\ir ../../private.sql\n','\\ir financial_reset_empty_books_test.sql\n',
  files.find(f=>f.name==='financial_reset_single_admin_test.sql').source+'SELECT 1;\n']){
  assert.throws(()=>databaseTestPlan(files.map(f=>f.name==='financial_reset_single_admin_test.sql'?{...f,source}:f)),/exact reviewed/);
 }
 assert.throws(()=>databaseTestPlan(files.filter(f=>f.name!=='financial_reset_empty_books_test.sql')),/exactly one/);
 assert.throws(()=>databaseTestPlan(files.map(f=>f.name==='financial_reset_empty_books_test.sql'?{...f,source:f.source+'\n\\ir forbidden.sql\n'}:f)),/include other files|rollback/i);
});

test('strict TAP validation rejects failures, missing assertions and missing plans', () => {
  assert.equal(verifyPgTapOutput('ok 1 - first\nok 2 - second\n1..2\n', 'proof'), 2);
  assert.equal(verifyPgTapOutput('1..2\nok 1 - first\nok 2 # SKIP Original-date success path is eligible only during October 2026; no clock override is used.\n', 'financial_reset_original_invoice_dates_test.sql'), 2);
  assert.equal(verifyPgTapOutput('1..2\nok 1 - first\nok 2 # SKIP October-only success path is not executed with a fabricated database clock.\n', 'financial_reset_empty_books_test.sql'), 2);
  assert.throws(() => verifyPgTapOutput('1..1\nok 1 # SKIP unexpected\n', 'financial_reset_empty_books_test.sql'));
  for (const bad of ['ok 1 - first', '1..2\nok 1 - first', '1..1\nnot ok 1 - failed', '1..1\nBail out! denied', '1..1\nok 2 - wrong', '1..1\nok 1 - ignored # TODO later', '1..0 # SKIP all', '1..1\n1..1\nok 1 - first', '1..1\nok 1 # SKIP unexpected']) {
    assert.throws(() => verifyPgTapOutput(bad, 'proof'));
  }
});

function fixture(overrides = {}) {
  const calls = [];
  let identity = { id: 'a'.repeat(64), name: '/supabase_db_owned', project: 'owned', running: true };
  const execute = (command, args, input) => {
    calls.push({ command, args, input });
    if (args[0] === 'context' && args[1] === 'show') return 'default';
    if (args[0] === 'context') return '"unix:///var/run/docker.sock"';
    if (args[2] === 'inspect') return JSON.stringify(identity);
    return 't\n';
  };
  return { calls, setIdentity: value => { identity = value; }, options: { config: 'project_id = "owned"', execute, env: {}, platform: 'linux', ...overrides } };
}

test('target binds configured local project, immutable container ID and existing Unix-socket administrator', async () => {
  const f = fixture(); const target = await localDatabaseTestTarget(f.options); target.run('SELECT 1;');
  const psql = f.calls.find(call => call.args.includes('psql'));
  assert.deepEqual(psql.args.slice(-10), ['-X', '-qAt', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']);
  assert.ok(f.calls.every(call => !call.args.includes('ALTER ROLE')));
  f.setIdentity({ id: 'b'.repeat(64), name: '/supabase_db_owned', project: 'owned', running: true });
  assert.throws(() => target.run('SELECT 1;'), /replaced/);
});

test('target rejects remote or conflicting connections before SQL', async () => {
  for (const env of [{ DATABASE_URL: 'forbidden' }, { PGHOST: 'remote' }, { PGUSER: 'other' }, { PGPASSWORD: 'not-read' }, { PGOPTIONS: 'override' }, { DOCKER_HOST: 'tcp://remote' }, { SUPABASE_DB_CONTAINER: 'supabase_db_other' }]) {
    const f = fixture({ env }); await assert.rejects(localDatabaseTestTarget(f.options));
    assert.ok(!f.calls.some(call => call.args.includes('psql')));
  }
  const f = fixture(); f.setIdentity({ id: 'a'.repeat(64), name: '/supabase_db_owned', project: 'other', running: true });
  await assert.rejects(localDatabaseTestTarget(f.options));
  assert.ok(!f.calls.some(call => call.args.includes('psql')));
});

test('single-admin fixture uses a clean isolated schema and fresh capability bootstrap, then verifies cleanup and source census', async () => {
  for (const failFixture of [false, true]) {
    const f = fixture(); const execute = f.options.execute;
    f.options.execute = (command, args, input) => {
      const result = execute(command, args, input);
      if (args.includes('pg_dump')) return '-- synthetic dump';
      if (input?.startsWith('SELECT coalesce(json_agg')) return '["public.organizations","auth.users"]';
      if (input?.startsWith("SELECT jsonb_build_object('rows'")) return '{"rows":[0,0],"organizations":"digest"}';
      if (input?.startsWith('SELECT count(*) FROM pg_database')) return '0';
      if (input === 'ROLLBACK;') { if (failFixture) throw Error('synthetic fixture failure'); return 'ok 1 - native\n1..1\n'; }
      return result;
    };
    const target = await localDatabaseTestTarget(f.options);
    const file = { name: 'financial_reset_single_admin_test.sql', source: 'ROLLBACK;' };
    if (failFixture) assert.throws(() => runSessionTest(file, target), /synthetic fixture failure/);
    else assert.equal(runSessionTest(file, target), 1);
    const dumps = f.calls.filter(c => c.args.includes('pg_dump'));
    assert.equal(dumps.length, 3);
    assert.ok(dumps[0].args.includes('--section=pre-data'));
    assert.ok(dumps[1].args.includes('--table=app_private.financial_reset_relation_rules'));
    assert.ok(dumps[1].args.includes('--data-only'));
    assert.ok(dumps[2].args.includes('--section=post-data'));
    const creation = f.calls.find(c => c.input?.startsWith('CREATE DATABASE'));
    assert.match(creation.input, /^CREATE DATABASE single_admin_test_[a-f0-9]{32} TEMPLATE template0;$/);
    assert.ok(f.calls.some(c => c.input === creation.input.replace('CREATE', 'DROP').replace(' TEMPLATE template0', '')));
    assert.equal(f.calls.filter(c => c.input?.startsWith("SELECT jsonb_build_object('rows'")).length, failFixture ? 3 : 4);
    assert.ok(f.calls.some(c => c.input === SINGLE_ADMIN_RUNTIME_BOOTSTRAP_SQL));
    assert.doesNotMatch(f.calls.map(c => c.input ?? '').join('\n'), /DISABLE TRIGGER|session_replication_role|TRUNCATE|ALTER ROLE/);
    assert.equal((SINGLE_ADMIN_RUNTIME_BOOTSTRAP_SQL.match(/INSERT INTO/g) ?? []).length, 8);
    assert.doesNotMatch(SINGLE_ADMIN_RUNTIME_BOOTSTRAP_SQL, /auth\.|organization_members|capability_token\s*\)\s*SELECT/);
    assert.ok(f.calls.filter(c => c.input?.startsWith("SELECT jsonb_build_object('rows'")).every(c => /extensions\.digest/.test(c.input)));
  }
});

test('single-admin cleanup still checks absence and source after a failed drop', async () => {
  const f = fixture(); const execute = f.options.execute;
  f.options.execute = (command, args, input) => {
    const result = execute(command, args, input);
    if (args.includes('pg_dump')) return '-- synthetic dump';
    if (input?.startsWith('SELECT coalesce(json_agg')) return '["public.organizations"]';
    if (input?.startsWith("SELECT jsonb_build_object('rows'")) return 'same bounded census';
    if (input?.startsWith('DROP DATABASE')) throw Error('synthetic drop denied');
    if (input?.startsWith('SELECT count(*) FROM pg_database')) return '1';
    return result;
  };
  const target = await localDatabaseTestTarget(f.options);
  assert.throws(() => target.runSingleAdmin({name:'financial_reset_single_admin_test.sql',source:'ROLLBACK;'}), /databaseAbsent=false, sourceUnchanged=true/);
  assert.ok(f.calls.at(-1).input.startsWith("SELECT jsonb_build_object('rows'"));
});

test('committed restart retains only synthetic clone rows and still fails if source census changes', async () => {
  for(const sourceChanged of [false,true]) {
    const f=fixture(); const execute=f.options.execute; let committed=false;
    f.options.execute=(command,args,input)=>{
      const result=execute(command,args,input);
      if(args.includes('pg_dump')) return '-- synthetic schema';
      if(input?.startsWith('SELECT coalesce(json_agg')) return '["public.organizations"]';
      if(input?.startsWith("SELECT jsonb_build_object('rows'")) {
        const source=args[args.indexOf('-d')+1]==='postgres';
        return committed && (!source || sourceChanged) ? 'synthetic rows changed' : 'empty census';
      }
      if(input?.startsWith('SELECT count(*) FROM pg_database')) return '0';
      if(input==='COMMIT;') { committed=true; return 'ok 1 - committed synthetic restart\n1..1\n'; }
      return result;
    };
    const target=await localDatabaseTestTarget(f.options);
    const file={name:'financial_reset_manual_restart_test.sql',source:'COMMIT;'};
    if(sourceChanged) assert.throws(()=>runSessionTest(file,target),/sourceUnchanged=false/);
    else assert.equal(runSessionTest(file,target),1);
    const run=f.calls.find(call=>call.input==='COMMIT;');
    assert.match(run.args[run.args.indexOf('-d')+1],/^single_admin_test_[a-f0-9]{32}$/);
    assert.ok(f.calls.some(call=>call.input?.startsWith('DROP DATABASE single_admin_test_')));
    assert.ok(f.calls.at(-1).input.startsWith("SELECT jsonb_build_object('rows'"));
  }
});
