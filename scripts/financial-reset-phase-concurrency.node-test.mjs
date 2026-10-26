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
const connectionArgs = role => ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', role, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const psqlArgs = connectionArgs('postgres');
const sql = body => docker(psqlArgs, body).trim();
const adminSql = body => docker(connectionArgs('supabase_admin'), body).trim();
const maker = randomUUID(), reviewer = randomUUID();
const continuationSource = readFileSync(path.join(repoRoot, 'supabase/tests/financial_reset_continuation_test.sql'), 'utf8');
// Reuse the current SQL-only gateway fixture. This does not claim real Auth or
// HTTP ingress: only the disposable superuser may simulate authenticator.
const gatewayFixture = continuationSource.slice(continuationSource.indexOf('CREATE FUNCTION pg_temp.reset_fixture_claims'),
  continuationSource.indexOf('CREATE TEMP TABLE boundary_state'));
assert.match(gatewayFixture, /GRANT SELECT,UPDATE ON reset_operator_fixture TO authenticated;/);
const authorize = (actor, action) => `SELECT pg_temp.reset_fixture_claims('${actor}');
  SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
  UPDATE reset_operator_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'${action}');
  RESET ROLE; RESET SESSION AUTHORIZATION;
  SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
  SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'${action}') FROM reset_operator_fixture;`;

function fixture() {
  const [org, branch, property, person, owner, operation, event, sourceRow, action] = Array.from({ length: 9 }, randomUUID);
  adminSql(`BEGIN;
    ${gatewayFixture}
    INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
      VALUES('${maker}','authenticated','authenticated','phase-${maker}@test.invalid','{"provider":"email"}','{}'),
        ('${reviewer}','authenticated','authenticated','phase-${reviewer}@test.invalid','{"provider":"email"}','{}') ON CONFLICT(id) DO NOTHING;
    INSERT INTO auth.sessions(id,user_id,created_at,updated_at,not_after,aal)
      SELECT md5(actor::text||':reset-fixture')::uuid,actor,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour','aal1'
      FROM (VALUES('${maker}'::uuid),('${reviewer}'::uuid)) actors(actor) ON CONFLICT(id) DO NOTHING;
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
    -- Reuse the known-zero fixture's real one-row archive/delete prerequisite.
    INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
      VALUES('${sourceRow}','${org}','2026-09-01','${maker}','Synthetic phase concurrency archive source');
    CREATE TEMP TABLE reset_archive_fixture AS SELECT to_jsonb(f) AS image FROM public.financial_month_locks f WHERE id='${sourceRow}';
    CREATE TEMP TABLE reset_action_fixture AS SELECT jsonb_build_array(jsonb_build_object('action_id','${action}','ordinal',1,
      'relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',image->'id'),'kind','archive-delete',
      'before_row_text',image::text,'before_sha256',app_private.financial_reset_hash(image),'after_row_text',NULL,'after_sha256',NULL)) AS actions FROM reset_archive_fixture;
    INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date) VALUES('${org}',1,'frozen','2026-10-01');
    SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id','${operation}','organization_id','${org}',
      'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),
      'schema_sha256',repeat('c',64),'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_build_array(jsonb_build_object(
        'relation_name','public.financial_month_locks','primary_key',jsonb_build_object('id',image->'id'),'row_sha256',app_private.financial_reset_hash(image)))) FROM reset_archive_fixture),
      'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
        FROM reset_action_fixture CROSS JOIN LATERAL jsonb_array_elements(actions) a),
      'archive_count',1,'action_count',1,'audit_timestamp',now(),'audit_actor',NULL));
    SELECT app_private.archive_financial_reset_rows('${operation}',jsonb_build_array(jsonb_build_object('relation_name','public.financial_month_locks',
      'primary_key',jsonb_build_object('id',image->'id'),'row_text',image::text,'row_sha256',app_private.financial_reset_hash(image)))) FROM reset_archive_fixture;
    SELECT app_private.prepare_financial_reset_actions('${operation}',actions) FROM reset_action_fixture;
    WITH plan AS (SELECT jsonb_build_object('operation_id','${operation}','organization_id','${org}','manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
      'maker_actor_id','${maker}','reviewer_actor_id','${reviewer}','effective_date','2026-10-01','currencies','["USD"]'::jsonb,
      'scopes',app_private.financial_reset_known_zero_scope('${operation}')) AS value)
    SELECT app_private.prepare_financial_reset_zero_plan('${operation}',value,app_private.financial_reset_hash(value)) FROM plan;
    SELECT set_config('test.zero_review',(SELECT review_sha256 FROM app_private.financial_reset_zero_plans WHERE operation_id='${operation}'),true);
    SELECT pg_temp.reset_fixture_claims('${maker}'); SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
    SELECT public.approve_financial_reset_zero_plan('${operation}',current_setting('test.zero_review'));
    RESET ROLE; RESET SESSION AUTHORIZATION;
    SELECT pg_temp.reset_fixture_claims('${reviewer}'); SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
    SELECT public.approve_financial_reset_zero_plan('${operation}',current_setting('test.zero_review'));
    RESET ROLE; RESET SESSION AUTHORIZATION;
    SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
    SELECT app_private.seal_financial_reset_operation('${operation}');
    COMMIT;`);
  return { org, property, operation, event, sourceRow, action };
}
function session(body, name, role = 'postgres') {
  const child = spawn('docker', ['--host', endpoint, ...connectionArgs(role)], { cwd: repoRoot, shell: false, windowsHide: true });
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
const phase = ({ operation, sourceRow, action }) => `${gatewayFixture}
  INSERT INTO reset_operator_fixture(binding)
  SELECT pg_temp.reset_fixture_binding('${operation}',jsonb_build_object('version',3,'actor_id','${maker}',
    'billing_period_start','2026-10-01','issue_date','2026-10-01','execution_business_date',
    app_private.rent_business_date(organization_id,statement_timestamp()),'invoice_date_policy','original-reviewed-october',
    'original_invoice_sources','[]'::jsonb,'leases','[]'::jsonb))
    FROM app_private.financial_reset_operations WHERE operation_id='${operation}';
  ${authorize(maker, 'execute')}
  SELECT app_private.start_financial_reset_actions('${operation}');
  SELECT app_private.arm_financial_reset_action('${operation}','${action}');
  DELETE FROM public.financial_month_locks WHERE id='${sourceRow}';
  SELECT app_private.complete_financial_reset_actions('${operation}'); SELECT app_private.apply_financial_reset_known_zero('${operation}');`;
const context = org => JSON.parse(sql(`BEGIN; SET LOCAL request.jwt.claim.sub='${maker}'; SET LOCAL ROLE authenticated;
  SELECT public.get_financial_write_context('${org}'); COMMIT;`));

for (const commit of [true, false]) {
  test(`checked zero phase keeps other sessions frozen through ${commit ? 'refused partial commit' : 'rollback'}`, async () => {
    const state = fixture();
    const { org, property, operation, event, sourceRow } = state;
    // Hold the real downstream lock. This parks the helper after its local open,
    // without test triggers, altered business functions or disabled validation.
    const holder = session(`SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':','owner_opening_property_month_v1','${org}','${property}','USD','2026-10-01'),0));`, `phase-holder-${org}`);
    let helper; let writer;
    try {
      await waitFor(() => holder.stdout.includes('PHASE_READY'), holder, 'downstream lock');
      helper = session(`${commit ? 'SET CONSTRAINTS app_private.financial_reset_checkpoint_operation_commit,app_private.financial_reset_checkpoint_evidence_commit,app_private.financial_reset_checkpoint_control_commit IMMEDIATE;' : ''}
        ${phase(state)}`, `phase-helper-${org}`, 'supabase_admin');
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
      assert.equal(sql(`SELECT count(*) FROM public.financial_month_locks WHERE id='${sourceRow}';`), '1', 'refused commit or rollback preserves the archived source');
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
  const source = continuationSource;
  const fixtureMarker = '-- CHECKPOINT_CONCURRENCY_FIXTURE_READY:', reportMarker = '-- CHECKPOINT_CONCURRENCY_REPORT_READY:';
  assert.equal(source.split(fixtureMarker).length, 2); assert.equal(source.split(reportMarker).length, 2);
  const fixtureUuid = /fa231050-0000-(?:0000-0000|4000-8000)-[0-9]{12}/g;
  const identifiers = new Map([...source.matchAll(fixtureUuid)].map(match => [match[0], randomUUID()]));
  const fixtureSuffix = randomUUID();
  const remap = text => text.replace(fixtureUuid, value => identifiers.get(value))
    .replaceAll("'reset-continuation-fixture'", `'reset-continuation-${fixtureSuffix}'`)
    .replaceAll("'reset-report-foreign-contact'", `'reset-report-contact-${fixtureSuffix}'`)
    .replaceAll('reset-continuation@test.invalid', `reset-continuation-${fixtureSuffix}@test.invalid`)
    .replaceAll('reset-continuation-checker@test.invalid', `reset-checker-${fixtureSuffix}@test.invalid`);
  const original = suffix => identifiers.get(`fa231050-0000-0000-0000-${suffix.padStart(12, '0')}`);
  const org = original('2'), operation = identifiers.get('fa231050-0000-4000-8000-000000000200'), contact = original('301'), actor = original('1');
  assert.ok(operation, 'the current v4 operation UUID must be remapped');
  const property = original('3'), owner = original('6'), foreignOrg = original('302'), foreignPerson = original('303');
  const foreignContact = original('304'), tenant = original('5');
  const fixtureEnd = source.indexOf(fixtureMarker), reportEnd = source.indexOf(reportMarker);
  const fixtureBody = source.slice(0, fixtureEnd).replace(/^BEGIN;\s*/, '').replace('ON COMMIT DROP', 'ON COMMIT PRESERVE ROWS');
  const resetBody = source.slice(fixtureEnd, reportEnd);
  const continuationStart = resetBody.indexOf('CREATE TEMP TABLE continuation_plan AS');
  const continuationEnd = resetBody.indexOf('INSERT INTO reset_operator_fixture(binding)');
  const actionStart = resetBody.indexOf('SELECT app_private.start_financial_reset_actions(');
  const archiveEnd = resetBody.indexOf('INSERT INTO app_private.financial_write_controls(');
  const zeroStart = resetBody.indexOf('SELECT app_private.apply_financial_reset_known_zero(');
  assert.ok(archiveEnd > 0 && actionStart > archiveEnd && continuationStart > actionStart && continuationEnd > continuationStart && zeroStart > continuationEnd);
  const continuationPlan = resetBody.slice(continuationStart, continuationEnd);
  // Move the existing plan construction ahead of reservation and authorize
  // execution before its first action. The SQL fixture's phase assertions stay.
  const execution = resetBody.slice(actionStart, continuationStart) + resetBody.slice(zeroStart);
  const restart = `COMMIT; BEGIN; SET LOCAL application_name='checkpoint-reset-${org}';
    SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='30s';`;
  // This is a disposable SQL fixture with synthetic external review inputs, not
  // a protected-runner or customer approval proof. Real guard APIs create every
  // reservation, source checkpoint, stage receipt and reopening receipt.
  const stages = `${remap(resetBody.slice(0, archiveEnd))}
    ${remap(continuationPlan)}
    CREATE TEMP TABLE phase_stage_fixture AS SELECT jsonb_build_object(
      'operation_id','${operation}','organization_id',organization_id,'operation_kind','reset','restore_of',NULL,
      'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
      'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,'row_sha256',hash)
        ORDER BY relation_name,pk::text)) FROM boundary_archive),
      'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
        FROM boundary_actions CROSS JOIN LATERAL jsonb_array_elements(value) a),
      'archive_count',(SELECT count(*) FROM boundary_archive),'action_count',(SELECT count(*) FROM boundary_archive),
      'audit_timestamp',statement_timestamp(),'audit_actor',admin_id) AS operation_binding,
      jsonb_build_object('operation_id','${operation}','organization_id',organization_id,'manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
        'maker_actor_id',admin_id,'reviewer_actor_id','${original('7')}','effective_date',billing_month,'currencies','["USD"]'::jsonb,
        'scopes',app_private.financial_reset_zero_scope_on_date(organization_id,billing_month)) AS zero_plan, NULL::jsonb AS binding
      FROM boundary_state;
    UPDATE phase_stage_fixture f SET binding=jsonb_build_object('version',1,'operation_id','${operation}','project_ref','syntheticprojectrefa','organization_id','${org}',
      'packet_sha256',repeat('1',64),'main_sha',repeat('a',40),'sources_sha256',repeat('2',64),'schema_sha256',f.operation_binding->>'schema_sha256',
      'ledger_sha256',repeat('3',64),'source_snapshot_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot('${org}')),
      'source_generation',0,'target_generation',1,'cutoff','2026-10-01','issue_date','2026-10-01',
      'timezone',(SELECT operational_timezone FROM public.organizations WHERE id='${org}'),
      'execution_business_date',app_private.rent_business_date('${org}',statement_timestamp()),'invoice_date_policy','original-reviewed-october',
      'manifest_sha256',f.operation_binding->>'manifest_sha256','plan_sha256',f.operation_binding->>'plan_sha256',
      'archive_sha256',f.operation_binding->>'archive_sha256','action_sha256',f.operation_binding->>'action_sha256',
      'archive_artifact_sha256',repeat('5',64),'archive_count',f.operation_binding->'archive_count','action_count',f.operation_binding->'action_count',
      'zero_review_sha256',app_private.financial_reset_hash(f.zero_plan),'report_review_sha256',repeat('6',64),
      'continuation_semantic',(SELECT value-'source_sha256' FROM continuation_plan),
      'continuation_semantic_sha256',(SELECT app_private.financial_reset_hash(value-'source_sha256') FROM continuation_plan));
    INSERT INTO reset_operator_fixture(binding) SELECT binding FROM phase_stage_fixture;
    ${restart}
    ${authorize(actor, 'freeze')}
    SELECT app_private.reserve_financial_reset_hosted_operation(binding) FROM phase_stage_fixture;
    ${restart}
    ${authorize(actor, 'checkpoint')}
    SELECT app_private.checkpoint_financial_reset_hosted_operation(binding,app_private.financial_reset_hash(jsonb_build_object('synthetic_review_input','checkpoint','binding',binding))) FROM phase_stage_fixture;
    ${restart}
    ${authorize(actor, 'prepare')}
    SELECT app_private.prepare_financial_reset_operation(operation_binding) FROM phase_stage_fixture;
    SELECT app_private.archive_financial_reset_rows('${operation}',(SELECT jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,
      'row_text',image::text,'row_sha256',hash) ORDER BY ordinal) FROM boundary_archive));
    SELECT app_private.prepare_financial_reset_actions('${operation}',value) FROM boundary_actions;
    SELECT app_private.record_financial_reset_hosted_action_receipt(binding,'prepare',authorization_id,
      app_private.financial_reset_hash(jsonb_build_object('synthetic_review_input','prepare','binding',binding))) FROM reset_operator_fixture;
    ${restart}
    ${authorize(actor, 'seal')}
    SELECT app_private.seal_financial_reset_operation('${operation}');
    SELECT app_private.prepare_financial_reset_zero_plan('${operation}',zero_plan,binding->>'zero_review_sha256') FROM phase_stage_fixture;
    SELECT app_private.record_financial_reset_hosted_action_receipt(binding,'seal',authorization_id,
      app_private.financial_reset_hash(jsonb_build_object('synthetic_review_input','seal','binding',binding))) FROM reset_operator_fixture;
    ${restart}
    SELECT set_config('test.zero_review',(SELECT binding->>'zero_review_sha256' FROM phase_stage_fixture),true);
    SELECT pg_temp.reset_fixture_claims('${actor}'); SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
    SELECT public.approve_financial_reset_zero_plan('${operation}',current_setting('test.zero_review'));
    RESET ROLE; RESET SESSION AUTHORIZATION;
    SELECT pg_temp.reset_fixture_claims('${original('7')}'); SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
    SELECT public.approve_financial_reset_zero_plan('${operation}',current_setting('test.zero_review'));
    RESET ROLE; RESET SESSION AUTHORIZATION;
    SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
    ${restart}
    ${authorize(actor, 'execute')}
    SELECT app_private.assert_financial_reset_hosted_reservation(binding,'execute') FROM phase_stage_fixture;`;
  const reset = session(`${remap(fixtureBody)} COMMIT; BEGIN;
    SET LOCAL application_name='checkpoint-reset-${org}'; SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='30s';
    ${stages} ${remap(execution)} SET CONSTRAINTS ALL IMMEDIATE;`, `checkpoint-reset-${org}`, 'supabase_admin');
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
    // The review/artifact references below are explicitly synthetic test
    // inputs. Database receipts come only from the fresh API calls above and
    // the actual checked-reopening function, never historical fixture records.
    adminSql(`BEGIN;
      ${gatewayFixture}
      CREATE TEMP TABLE reopening_fixture AS
      SELECT h.binding AS base,c.checkpoint_sha256,c.result_json->>'after_sha256' AS after_sha256,h.foreign_sha256,
        NULL::jsonb AS evidence,NULL::text AS evidence_text
      FROM app_private.financial_reset_hosted_reservations h JOIN app_private.financial_reset_verification_checkpoints c USING(operation_id)
      WHERE h.operation_id='${operation}';
      UPDATE reopening_fixture SET evidence=jsonb_build_object('format','nestory-reset-reopening-evidence-v1',
        'operation_id','${operation}','organization_id','${org}','packet_sha256',base->>'packet_sha256',
        'checkpoint_sha256',checkpoint_sha256,'after_sha256',after_sha256,'review_sha256',base->>'report_review_sha256',
        'completion_intent_sha256',app_private.financial_reset_hash(jsonb_build_object('synthetic_review_input','completion-intent','binding',base)),
        'completion_reconciliation_sha256',app_private.financial_reset_hash(jsonb_build_object('checkpoint',checkpoint_sha256,'after',after_sha256)),
        'authority_receipt',jsonb_build_object('synthetic_review_input',true,'not_customer_or_protected_runner_authority',true,'operation_id','${operation}'),
        'artifact_receipts',(SELECT jsonb_object_agg(kind,jsonb_build_object('artifact_sha256',CASE WHEN kind='archive' THEN base->>'archive_artifact_sha256'
          ELSE app_private.financial_reset_hash(jsonb_build_object('synthetic_artifact',kind,'operation_id','${operation}')) END,
          'receipt_sha256',app_private.financial_reset_hash(jsonb_build_object('synthetic_artifact_receipt',kind,'operation_id','${operation}'))))
          FROM unnest(ARRAY['archive','containmentProof','liveConsent','restoreProof','storageProof']) kind));
      UPDATE reopening_fixture SET evidence_text=evidence::text;
      INSERT INTO reset_operator_fixture(binding) SELECT base||jsonb_build_object('reopening',jsonb_build_object('version',1,'request_id','${randomUUID()}',
        'operation_id','${operation}','generation',base->'target_generation','cutoff',base->>'cutoff','checkpoint_sha256',checkpoint_sha256,
        'after_sha256',after_sha256,'foreign_sha256',foreign_sha256,'review_sha256',base->>'report_review_sha256',
        'evidence_sha256',encode(extensions.digest(evidence_text,'sha256'),'hex'),
        'execution_business_date',app_private.rent_business_date('${org}',statement_timestamp()))) FROM reopening_fixture;
      ${authorize(actor, 'reopen')}
      SELECT app_private.reopen_financial_reset_checked(binding,evidence_text) FROM reset_operator_fixture CROSS JOIN reopening_fixture;
      COMMIT;`);
    assert.equal(sql(`SELECT count(*) FROM app_private.financial_reset_reopening_receipts WHERE operation_id='${operation}';`), '1');
    assert.equal(sql(`SELECT count(*) FROM app_private.financial_reset_hosted_action_receipts WHERE operation_id='${operation}' AND action IN ('prepare','seal');`), '2');
    assert.equal(sql(`SELECT status FROM app_private.financial_write_controls WHERE organization_id='${org}';`), 'open');
    // Normal entry requires a new transaction after checked reopening commits.
    sql(`BEGIN;
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
