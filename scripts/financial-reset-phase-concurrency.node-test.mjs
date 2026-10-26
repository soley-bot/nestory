// Real concurrent sessions against the dedicated synthetic database or disposable CI.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { localRecoveryDocker } from './local-recovery-docker.mjs';
import { selectDepositContainer } from './deposit-candidate-target.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const localProject = process.env.RESET_PHASE_LOCAL_PROJECT_DIR;
if (!localProject) assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use only the dedicated local project or disposable CI');
const execute = (command, args, input) => {
  const result = spawnSync(command, args, { input, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000, cwd: repoRoot });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};
const { docker, endpoint } = await localRecoveryDocker({ execute });
const container = selectDepositContainer(readFileSync(path.join(localProject ?? repoRoot, 'supabase/config.toml'), 'utf8'),
  docker(['ps', '--filter', 'name=^/supabase_db_', '--format', '{{.Names}}']).split(/\r?\n/).filter(Boolean), process.env.SUPABASE_DB_CONTAINER);
if (localProject) assert.match(container, /^supabase_db_nestory-pilot-reset-[0-9]{8}$/);
const psqlArgs = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const sql = body => docker(psqlArgs, body).trim();
const maker = '00000000-0000-0000-0000-000000000101';
const reviewer = '00000000-0000-0000-0000-000000000701';

function fixture() {
  const [org, branch, property, person, owner, operation, event] = Array.from({ length: 7 }, randomUUID);
  sql(`BEGIN;
    INSERT INTO public.organizations(id,name,slug) VALUES('${org}','Reset phase isolation','reset-phase-${org}');
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES('${org}','${maker}','super_admin'),('${org}','${reviewer}','super_admin');
    UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id='${org}';
    INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES('${branch}','${org}','Phase branch','PHASE','active');
    SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
    INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id) VALUES('${property}','${org}','Phase property','PHASE','Apartment','${branch}');
    SELECT set_config('app.property_branch_assignment_context','',true);
    INSERT INTO public.people(id,organization_id,display_name) VALUES('${person}','${org}','Phase owner');
    INSERT INTO public.person_roles(organization_id,person_id,role,status) VALUES('${org}','${person}','owner','active');
    INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on) VALUES('${owner}','${org}','${property}','${person}',100,'2026-01-01');
    INSERT INTO public.timeline_events(id,organization_id,property_id,event_date,event_type,title) VALUES('${event}','${org}','${property}','2026-10-01','Inspection','Original title');
    INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date) VALUES('${org}',1,'frozen','2026-10-01');
    SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id','${operation}','organization_id','${org}',
      'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),
      'schema_sha256',repeat('c',64),'archive_sha256',app_private.financial_reset_hash('[]'),'action_sha256',app_private.financial_reset_hash('[]'),
      'archive_count',0,'action_count',0,'audit_timestamp',now(),'audit_actor',NULL));
    WITH plan AS (SELECT jsonb_build_object('operation_id','${operation}','organization_id','${org}','manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
      'maker_actor_id','${maker}','reviewer_actor_id','${reviewer}','effective_date','2026-10-01','currencies','["USD"]'::jsonb,
      'scopes',app_private.financial_reset_known_zero_scope('${operation}')) AS value)
    SELECT app_private.prepare_financial_reset_zero_plan('${operation}',value,app_private.financial_reset_hash(value)) FROM plan;
    SELECT set_config('test.zero_review',(SELECT review_sha256 FROM app_private.financial_reset_zero_plans WHERE operation_id='${operation}'),true);
    SET LOCAL request.jwt.claim.sub='${maker}'; SET LOCAL ROLE authenticated;
    SELECT public.approve_financial_reset_zero_plan('${operation}',current_setting('test.zero_review'));
    RESET ROLE;
    SET LOCAL request.jwt.claim.sub='${reviewer}'; SET LOCAL ROLE authenticated;
    SELECT public.approve_financial_reset_zero_plan('${operation}',current_setting('test.zero_review'));
    RESET ROLE;
    SELECT app_private.seal_financial_reset_operation('${operation}');
    COMMIT;`);
  return { org, property, operation, event };
}
function session(body, name) {
  const child = spawn('docker', ['--host', endpoint, ...psqlArgs], { cwd: repoRoot, shell: false, windowsHide: true });
  const worker = { child, name, stdout: '', stderr: '', closed: false };
  child.stdout.on('data', chunk => { worker.stdout += chunk; });
  child.stderr.on('data', chunk => { worker.stderr += chunk; });
  worker.done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', status => { worker.closed = true; resolve({ status, stderr: worker.stderr }); });
  });
  child.stdin.write(`BEGIN; SET LOCAL application_name='${name}'; SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='30s';
    ${body}
    \\echo PHASE_READY
  `);
  return worker;
}
async function waitFor(predicate, worker, label) {
  const deadline = performance.now() + 12_000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    if (worker.closed) assert.fail(`${label}: ${worker.stderr}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`${label}: bounded wait expired: ${worker.stderr}`);
}
const blockedBy = (waiting, holder) => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(w.pid))
  WHERE w.application_name='${waiting.name}' AND h.application_name='${holder.name}');`) === 't';
const phase = operation => `SELECT app_private.start_financial_reset_actions('${operation}');
  SELECT app_private.complete_financial_reset_actions('${operation}'); SELECT app_private.apply_financial_reset_known_zero('${operation}');`;
const context = org => JSON.parse(sql(`BEGIN; SET LOCAL request.jwt.claim.sub='${maker}'; SET LOCAL ROLE authenticated;
  SELECT public.get_financial_write_context('${org}'); COMMIT;`));

for (const commit of [true, false]) {
  test(`checked zero phase keeps other sessions frozen through ${commit ? 'refused partial commit' : 'rollback'}`, async () => {
    const { org, property, operation, event } = fixture();
    // Hold the real downstream lock. This parks the helper after its local open,
    // without test triggers, altered business functions or disabled validation.
    const holder = session(`SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':','owner_opening_property_month_v1','${org}','${property}','USD','2026-10-01'),0));`, `phase-holder-${org}`);
    let helper; let writer;
    try {
      await waitFor(() => holder.stdout.includes('PHASE_READY'), holder, 'downstream lock');
      helper = session(`${commit ? 'SET CONSTRAINTS app_private.financial_reset_checkpoint_operation_commit,app_private.financial_reset_checkpoint_evidence_commit,app_private.financial_reset_checkpoint_control_commit IMMEDIATE;' : ''}
        ${phase(operation)}`, `phase-helper-${org}`);
      await waitFor(() => blockedBy(helper, holder), helper, 'helper reaches ordinary opening lock');
      assert.equal(context(org).status, 'frozen', 'separate ordinary reader sees committed frozen state');
      writer = session(`SET LOCAL request.jwt.claim.sub='${maker}'; SET LOCAL request.headers='{"x-nestory-financial-generation":"1"}'; SET LOCAL ROLE authenticated;
        SELECT public.update_timeline_event('${event}','${org}','${property}',NULL,'2026-10-01','Inspection','Unwanted title',NULL,NULL,NULL);`, `phase-writer-${org}`);
      writer.child.stdin.end('COMMIT;\n');
      await waitFor(() => blockedBy(writer, helper), writer, 'ordinary writer waits behind reset lifecycle lock');
      holder.child.stdin.end('COMMIT;\n');
      assert.equal((await holder.done).status, 0);
      await waitFor(() => helper.stdout.includes('PHASE_READY'), helper, 'known-zero completes while transaction remains private');
      assert.equal(context(org).status, 'frozen');
      helper.child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
      const completed = await helper.done;
      if (commit) {
        assert.notEqual(completed.status, 0);
        assert.match(completed.stderr, /financial_reset_checkpoint_must_commit/);
      } else assert.equal(completed.status, 0, helper.stderr);
      const denied = await writer.done;
      assert.notEqual(denied.status, 0);
      assert.match(denied.stderr, /financial_writes_frozen/);
      assert.equal(sql(`SELECT title FROM public.timeline_events WHERE id='${event}';`), 'Original title');
      assert.equal(sql(`SELECT count(*) FROM public.owner_opening_balance_entries WHERE organization_id='${org}';`), '0');
      assert.equal(sql(`SELECT status FROM app_private.financial_reset_zero_plans WHERE operation_id='${operation}';`), 'prepared');
      assert.equal(context(org).status, 'frozen');
    } finally {
      for (const worker of [holder, helper, writer].filter(Boolean)) {
        if (!worker.closed && !worker.child.stdin.writableEnded) worker.child.stdin.end('ROLLBACK;\n');
      }
      await Promise.allSettled([holder, helper, writer].filter(Boolean).map(worker => worker.done));
    }
  });
}

test('an early-flushed report checkpoint excludes concurrent contact writes and later normal cash is preserved on recovery refusal', async () => {
  // Reuse the reviewed SQL fixture and its real reset/continuation/report path.
  // Commit only fixture construction, so another backend can see the contact
  // while the reset transaction retains its exclusive lifecycle lock.
  const source = readFileSync(path.join(repoRoot, 'supabase/tests/financial_reset_continuation_test.sql'), 'utf8');
  const fixtureMarker = '-- CHECKPOINT_CONCURRENCY_FIXTURE_READY:', reportMarker = '-- CHECKPOINT_CONCURRENCY_REPORT_READY:';
  assert.equal(source.split(fixtureMarker).length, 2); assert.equal(source.split(reportMarker).length, 2);
  const identifiers = new Map([...source.matchAll(/fa231050-0000-0000-0000-[0-9]{12}/g)].map(match => [match[0], randomUUID()]));
  const fixtureSuffix = randomUUID();
  const remap = text => text.replace(/fa231050-0000-0000-0000-[0-9]{12}/g, value => identifiers.get(value))
    .replaceAll("'reset-continuation-fixture'", `'reset-continuation-${fixtureSuffix}'`)
    .replaceAll("'reset-report-foreign-contact'", `'reset-report-contact-${fixtureSuffix}'`)
    .replaceAll('reset-continuation@test.invalid', `reset-continuation-${fixtureSuffix}@test.invalid`)
    .replaceAll('reset-continuation-checker@test.invalid', `reset-checker-${fixtureSuffix}@test.invalid`);
  const original = suffix => identifiers.get(`fa231050-0000-0000-0000-${suffix.padStart(12, '0')}`);
  const org = original('2'), operation = original('200'), contact = original('301'), actor = original('1');
  const property = original('3'), owner = original('6'), foreignOrg = original('302'), foreignPerson = original('303');
  const foreignContact = original('304'), tenant = original('5');
  const fixtureEnd = source.indexOf(fixtureMarker), reportEnd = source.indexOf(reportMarker);
  const fixtureBody = source.slice(0, fixtureEnd).replace(/^BEGIN;\s*/, '').replace('ON COMMIT DROP', 'ON COMMIT PRESERVE ROWS');
  const resetBody = source.slice(fixtureEnd, reportEnd);
  const reset = session(`${remap(fixtureBody)} COMMIT; BEGIN;
    SET LOCAL application_name='checkpoint-reset-${org}'; SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='30s';
    ${remap(resetBody)} SET CONSTRAINTS ALL IMMEDIATE;`, `checkpoint-reset-${org}`);
  try {
    await waitFor(() => reset.stdout.includes('PHASE_READY'), reset, 'real report checkpoint reaches early constraint flush');
    assert.doesNotMatch(reset.stdout, /not ok [0-9]+/);
    for (const mutation of [
      `UPDATE public.person_contacts SET contact_name='Concurrent change' WHERE id='${contact}';`,
      `UPDATE public.person_contacts SET organization_id='${foreignOrg}',person_id='${foreignPerson}' WHERE id='${contact}';`,
      `UPDATE public.person_contacts SET organization_id='${org}',person_id='${tenant}' WHERE id='${foreignContact}';`,
    ]) {
      const writer = session(mutation, `checkpoint-contact-${randomUUID()}`);
      writer.child.stdin.end('COMMIT;\n');
      const refused = await writer.done;
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /40001:.*financial_reset_checkpoint_writer_conflict/);
    }
    reset.child.stdin.end('COMMIT;\n');
    assert.equal((await reset.done).status, 0, reset.stderr);
    assert.equal(sql(`SELECT contact_name FROM public.person_contacts WHERE id='${contact}';`), 'Preserved contact');
    sql(`SELECT app_private.assert_financial_reset_report_recovery_boundary('${operation}');`);
    // A different transaction can reopen and post real ordinary cash. The
    // completed checkpoint must not block future business or adopt its rows.
    sql(`BEGIN;
      UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='${org}';
      SET LOCAL request.jwt.claim.sub='${actor}'; SET LOCAL request.headers='{"x-nestory-financial-generation":"1"}';
      SELECT public.record_owner_contribution('${org}','${property}','${owner}','USD',
        app_private.rent_business_date('${org}',statement_timestamp()),1,'Synthetic post-checkpoint cash','checkpoint-later-cash');
      UPDATE public.person_contacts SET contact_name='Later valid contact' WHERE id='${contact}';
      UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id='${org}';
      COMMIT;`);
    const beforeRefusal = sql(`SELECT app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot('${org}'));`);
    const recovery = session(`SELECT app_private.financial_reset_recovery_candidates('${operation}');`, `checkpoint-recovery-${org}`);
    recovery.child.stdin.end('COMMIT;\n');
    const refused = await recovery.done;
    assert.notEqual(refused.status, 0); assert.match(refused.stderr, /financial_reset_report_checkpoint_drift/);
    assert.equal(sql(`SELECT app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot('${org}'));`), beforeRefusal);
    assert.equal(sql(`SELECT count(*) FROM public.owner_cash_events WHERE organization_id='${org}' AND idempotency_key='checkpoint-later-cash';`), '1');
    assert.equal(sql(`SELECT contact_name FROM public.person_contacts WHERE id='${contact}';`), 'Later valid contact');
    assert.equal(sql(`SELECT status FROM app_private.financial_write_controls WHERE organization_id='${org}';`), 'frozen');
  } finally {
    if (!reset.closed && !reset.child.stdin.writableEnded) reset.child.stdin.end('ROLLBACK;\n');
    await Promise.allSettled([reset.done]);
  }
});
