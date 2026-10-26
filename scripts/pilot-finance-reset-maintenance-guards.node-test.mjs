import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaintenanceGuardSql, MAINTENANCE_GUARDS, MAINTENANCE_ORGANIZATION } from './pilot-finance-reset-maintenance-guards.mjs';

const fixture = () => ({ operationId: '10101010-1010-4010-8010-101010101010', manifestSha256: 'a'.repeat(64),
  expectedGuards: MAINTENANCE_GUARDS.map(signature => ({ signature, definitionSha256: 'b'.repeat(64) })) });

test('fixed generator accepts hashes only and does not begin or commit the containing transaction', () => {
  const f = buildMaintenanceGuardSql(fixture());
  assert.match(f.installSql, /pg_trigger_depth\(\)=1/);
  assert.match(f.installSql, new RegExp(MAINTENANCE_ORGANIZATION));
  assert.match(f.installSql, /current_action_id/); assert.match(f.installSql, /a\.before_row/); assert.match(f.installSql, /a\.after_row/);
  assert.match(f.installSql, /s\.backend_pid=pg_catalog\.pg_backend_pid\(\)/);
  assert.match(f.installSql, /s\.transaction_id=pg_catalog\.txid_current\(\)::text/);
  assert.match(f.installSql, /s\.database_principal=SESSION_USER/);
  assert.match(f.installSql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.ok(f.installSql.indexOf('INSERT INTO pg_temp.nestory_maintenance_restore_obligation') < f.installSql.lastIndexOf('$maintenance_install$;'));
  assert.equal(f.installSql.split('$maintenance_install$;').length, 2);
  for (const sql of [f.installSql, f.restoreSql, f.assertRestoredSql]) {
    assert.doesNotMatch(sql, /(?:DISABLE TRIGGER|DISABLE ROW LEVEL SECURITY|SET(?: LOCAL)? ROLE|set_config|GRANT|^COMMIT;)/im);
  }
});

test('restoration checks exact definition, OID, proc ACL/config/owner, trigger catalog and RLS policy census', () => {
  const f = buildMaintenanceGuardSql(fixture());
  assert.match(f.installSql, /to_jsonb\(p\)/); assert.match(f.installSql, /pg_get_triggerdef/); assert.match(f.installSql, /relforcerowsecurity/);
  assert.match(f.restoreSql, /to_regprocedure\(v_original.signature\) IS DISTINCT FROM v_original.function_oid/);
  assert.match(f.restoreSql, /EXECUTE v_original.definition/);
  assert.match(f.restoreSql, /pg_get_functiondef\(p.oid\) IS DISTINCT FROM s.definition/);
  assert.match(f.assertRestoredSql, /maintenance_guard_original_definition_not_restored/);
});

test('deposit projection exception is restricted to the exact AFTER DELETE source event', () => {
  assert.deepEqual(MAINTENANCE_GUARDS, [
    'app_private.enforce_canonical_income_settlement()',
    'app_private.enforce_reserved_ledger_projection()',
    'app_private.derive_lease_deposit_status_from_events()',
    'app_private.guard_owner_balance_append_only()',
    'app_private.guard_tenant_invoice_rent_segments()',
    'app_private.guard_owner_balance_period_write()',
    'app_private.guard_tenant_commercial_document_artifact_write()',
    'app_private.guard_tenant_invoice_correction_occurrence()',
    'app_private.guard_lease_derived_rent_receipt_allocation()',
  ]);
  const sql = buildMaintenanceGuardSql(fixture()).installSql;
  const projection = sql.slice(sql.indexOf('-- Only the selected event deletion'), sql.indexOf("WHEN v_pin.signature='app_private.guard_owner_balance_append_only()'"));
  assert.match(projection, /pg_trigger_depth\(\)=1 AND TG_WHEN=''AFTER'' AND TG_LEVEL=''ROW'' AND TG_OP=''DELETE''/);
  assert.match(projection, /TG_RELID=''public.lease_deposit_events''::regclass/);
  assert.match(projection, /a\.applied IS FALSE AND a\.relation_oid=TG_RELID AND a\.kind=''DELETE''/);
  assert.match(projection, /to_jsonb\(OLD\)=a\.before_row/);
  assert.match(projection, /s\.transaction_id=pg_catalog\.txid_current\(\)::text/);
  assert.match(projection, /THEN RETURN NULL; END IF/);
  assert.doesNotMatch(projection, /TG_OP IN|RETURN NEW|UPDATE public\.lease_deposits|INSERT INTO public/);
});

test('owner-history exception only admits exact BEFORE DELETE on its fixed financial relations', () => {
  const sql = buildMaintenanceGuardSql(fixture()).installSql;
  const start = sql.indexOf("WHEN v_pin.signature='app_private.guard_owner_balance_append_only()'");
  const owner = sql.slice(start, sql.indexOf("WHEN v_pin.signature='app_private.guard_tenant_invoice_rent_segments()'", start));
  assert.match(owner, /TG_WHEN=''BEFORE'' AND TG_LEVEL=''ROW'' AND TG_OP=''DELETE''/);
  assert.match(owner, /TG_RELID IN \(''public.owner_event_allocation_sets''::regclass/);
  assert.match(owner, /''public.fee_payment_date_corrections''::regclass/);
  assert.match(owner, /to_jsonb\(OLD\)=a\.before_row/);
  assert.match(owner, /g\.before_sha256=a\.before_sha256/);
  assert.doesNotMatch(owner, /TG_OP IN|activity_logs|organization_members|privileged_email/);
});

test('rent-segment exception only admits the exact original row BEFORE DELETE', () => {
  const sql = buildMaintenanceGuardSql(fixture()).installSql;
  const start = sql.indexOf("WHEN v_pin.signature='app_private.guard_tenant_invoice_rent_segments()'");
  const segment = sql.slice(start, sql.indexOf("WHEN v_pin.signature='app_private.guard_owner_balance_period_write()'", start));
  assert.match(segment, /TG_WHEN=''BEFORE'' AND TG_LEVEL=''ROW'' AND TG_OP=''DELETE'' AND TG_RELID=''public.tenant_invoice_rent_segments''::regclass/);
  assert.match(segment, /a\.applied IS FALSE AND a\.relation_oid=TG_RELID AND a\.kind=TG_OP/);
  assert.match(segment, /to_jsonb\(OLD\)=a\.before_row/);
  assert.match(segment, /g\.before_sha256=a\.before_sha256/);
  assert.match(segment, /s\.transaction_id=pg_catalog\.txid_current\(\)::text/);
  assert.doesNotMatch(segment, /TG_OP IN|app\.rent_generation_context|app\.rent_segment_repair_context/);
});

for (const [name, relation] of [
  ['guard_owner_balance_period_write', 'owner_balance_periods'],
  ['guard_tenant_commercial_document_artifact_write', 'tenant_commercial_document_artifacts'],
  ['guard_tenant_invoice_correction_occurrence', 'tenant_invoice_corrections'],
]) test(`${name} admits DELETE only on its fixed financial table`, () => {
  const sql = buildMaintenanceGuardSql(fixture()).installSql;
  const start = sql.indexOf(`WHEN v_pin.signature='app_private.${name}()'`);
  const next = sql.indexOf('WHEN v_pin.signature=', start + 1);
  const end = next >= 0 ? next : sql.indexOf("ELSE '\n  -- Exact maintenance exception", start);
  const fixed = sql.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.ok(fixed.includes(`TG_WHEN=''BEFORE'' AND TG_LEVEL=''ROW'' AND TG_OP=''DELETE'' AND TG_RELID=''public.${relation}''::regclass`));
  assert.match(fixed, /a\.applied IS FALSE AND a\.relation_oid=TG_RELID AND a\.kind=TG_OP/);
  assert.match(fixed, /to_jsonb\(OLD\)=a\.before_row/);
  assert.match(fixed, /g\.before_sha256=a\.before_sha256/);
  assert.match(fixed, /s\.transaction_id=pg_catalog\.txid_current\(\)::text/);
  assert.doesNotMatch(fixed, /TG_OP IN|TG_RELID IN|activity_logs|organization_members|privileged_email|set_config/);
});

test('installation refuses disabled and replica-only triggers under origin execution', () => {
  const sql = buildMaintenanceGuardSql(fixture()).installSql;
  assert.match(sql, /t\.tgenabled NOT IN \('O','A'\)/);
  assert.match(sql, /maintenance_guard_disabled_trigger_refused/);
});

test('rent-allocation exception keeps exact UPDATE/DELETE and DELETE-only table split', () => {
  const sql = buildMaintenanceGuardSql(fixture()).installSql;
  const start = sql.indexOf("WHEN v_pin.signature='app_private.guard_lease_derived_rent_receipt_allocation()'");
  const allocation = sql.slice(start, sql.indexOf("ELSE '\n  -- Exact maintenance exception", start));
  assert.match(allocation, /TG_WHEN=''BEFORE'' AND TG_LEVEL=''ROW''/);
  assert.match(allocation, /TG_RELID=''public.finance_receipt_allocations''::regclass AND TG_OP IN \(''DELETE'',''UPDATE''\)/);
  assert.match(allocation, /TG_RELID=''public.owner_collection_confirmation_allocations''::regclass AND TG_OP=''DELETE''/);
  assert.match(allocation, /to_jsonb\(OLD\)=a\.before_row/);
  assert.match(allocation, /to_jsonb\(NEW\)=a\.after_row/);
  assert.match(allocation, /g\.after_sha256 IS NOT DISTINCT FROM a\.after_sha256/);
  assert.doesNotMatch(allocation, /TG_OP=''INSERT''|TG_RELID IN|guard_expense|activity_logs|set_config/);
});

test('deposit projection requires captured header hash or completed exact normalized afterimage', () => {
  const sql = buildMaintenanceGuardSql(fixture()).installSql;
  assert.match(sql, /nestory_maintenance_materialized m CROSS JOIN LATERAL jsonb_array_elements\(m\.archive\)/);
  assert.match(sql, /maintenance_guard_deposit_header_archive_required/);
  assert.match(sql, /a\.before_row=\(x->>'row_text'\)::jsonb AND a\.before_sha256=x->>'row_sha256'/);
  assert.match(sql, /ha\.action_id=h\.normalization_action_id AND ha\.applied IS TRUE/);
  assert.match(sql, /ha\.before_sha256=h\.before_sha256 AND hg\.before_sha256=ha\.before_sha256/);
  assert.match(sql, /ha\.after_sha256=h\.after_sha256 AND hg\.after_sha256=ha\.after_sha256/);
  assert.match(sql, /to_jsonb\(d\)=ha\.after_row/);
});

for (const [name, mutate] of [
  ['foreign organization argument', f => { f.organizationId = '20202020-2020-4020-8020-202020202020'; }],
  ['raw rows', f => { f.allowedActions = [{ id: 'customer-row' }]; }],
  ['arbitrary SQL', f => { f.sql = 'SELECT 1'; }],
  ['unknown guard', f => { f.expectedGuards[0].signature = 'public.other()'; }],
  ['duplicate guard', f => { f.expectedGuards[1] = f.expectedGuards[0]; }],
  ['missing guard', f => { f.expectedGuards.pop(); }],
  ['injected operation', f => { f.operationId = "'; SELECT 1; --"; }],
  ['unhashed manifest', f => { f.manifestSha256 = 'approved'; }],
  ['caller definition', f => { f.expectedGuards[0].definition = 'CREATE FUNCTION'; }],
]) test(`refuses ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => buildMaintenanceGuardSql(f), /request_invalid/); });
