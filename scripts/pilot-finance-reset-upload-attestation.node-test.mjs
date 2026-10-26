import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const migration = new URL('20261026000100_financial_reset_retired_upload_attestations.sql', migrations);
const read = file => readFileSync(new URL(file, migrations), 'utf8').replaceAll('\r\n', '\n');
function forwardSql() {
  assert.ok(existsSync(migration), 'forward upload attestation retirement migration must exist');
  return readFileSync(migration, 'utf8').replaceAll('\r\n', '\n');
}

// No database is accessed. Reconstruct the committed body transformations, then
// apply the new migration's literal replacement to check its exact SQL output.
function transformedBody() {
  const original = read('20260820194951_tenant_commercial_document_artifacts.sql');
  let body = original.slice(original.indexOf('CREATE OR REPLACE FUNCTION public.attest_tenant_commercial_document_upload('));
  body = body.slice(body.indexOf('AS $$') + 5, body.indexOf('\n$$;'));
  body = body.replace('app_private.can_attest_tenant_commercial_document_as_actor(\n    p_organization_id,\n    p_actor_id\n  )',
    'app_private.can_attest_tenant_commercial_document_source_as_actor(\n    p_organization_id,p_actor_id,p_source_kind,p_source_id\n  )');
  body = body.replace(/\bBEGIN\b/i, 'BEGIN\n PERFORM app_private.assert_financial_write_allowed(p_organization_id);');
  const sql = forwardSql();
  const literal = name => {
    const match = sql.match(new RegExp(`${name} text := E'((?:[^']|'')*)';`));
    assert.ok(match, `${name} SQL literal must be reviewable`);
    return match[1].replaceAll("''", "'").replaceAll('\\n', '\n').replaceAll('\\t', '\t');
  };
  const anchor = literal('v_anchor'), insertion = literal('v_guard');
  assert.equal(body.split(anchor).length - 1, 1, 'committed predecessor has one consumed replay branch');
  return { before: body, after: body.replaceAll(anchor, insertion + anchor), anchor, insertion, sql };
}

test('retirement adds only a nonmutating, nonrestorable attestation rule and restores catalogue immutability', () => {
  const sql = forwardSql();
  assert.match(sql, /\('app_private\.tenant_commercial_document_upload_attestations',false,'\{\}','\{\}',false\)/);
  assert.match(sql, /DROP TRIGGER financial_reset_rules_immutable ON app_private\.financial_reset_relation_rules/);
  assert.match(sql, /CREATE TRIGGER financial_reset_rules_immutable BEFORE INSERT OR UPDATE OR DELETE\s+ON app_private\.financial_reset_relation_rules\s+FOR EACH ROW EXECUTE FUNCTION app_private\.guard_financial_reset_immutable\(\)/);
  assert.doesNotMatch(sql, /\b(?:DELETE FROM|ALTER TABLE|GRANT|REVOKE|CREATE POLICY|DISABLE TRIGGER|set_config)\b/i);
  assert.doesNotMatch(sql, /UPDATE\s+(?:app_private\.tenant_commercial_document_upload_attestations|public\.expense_transactions)/i);
  assert.equal((sql.match(/INSERT INTO/g) ?? []).length, 1);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;\s*$/);
});

test('expense cycle staging admits only replaces_transaction_id and preserves all other rule attributes', () => {
  const sql = forwardSql();
  assert.match(sql, /UPDATE app_private\.financial_reset_relation_rules\s+SET normalize_columns=ARRAY\['replaces_transaction_id'\]\s+WHERE relation_name='public\.expense_transactions'\s+AND archive_remove AND normalize_columns='\{\}'::text\[\]/);
  assert.match(sql, /GET DIAGNOSTICS v_changed=ROW_COUNT;\s+IF v_changed<>1 THEN RAISE EXCEPTION 'financial_expense_reset_rule_predecessor_changed'/);
  assert.equal((sql.match(/\bUPDATE app_private\.financial_reset_relation_rules/g) ?? []).length, 1);
});

test('new guard rejects every existing stale attestation before consumed replay, update, or insert', () => {
  const { after, insertion } = transformedBody();
  assert.match(insertion, /IF FOUND AND NOT app_private\.financial_row_is_current\(\s*p_organization_id,v_attestation\.financial_generation\) THEN/);
  assert.match(insertion, /RAISE EXCEPTION 'financial_intent_retired' USING ERRCODE='55000'/);
  const guardAt = after.indexOf(insertion);
  assert.ok(after.indexOf('FOR UPDATE;') < guardAt);
  for (const target of ['IF FOUND AND v_attestation.consumed_at IS NOT NULL THEN', 'RETURN v_attestation.id;',
    'UPDATE app_private.tenant_commercial_document_upload_attestations', 'INSERT INTO app_private.tenant_commercial_document_upload_attestations']) {
    assert.ok(guardAt < after.indexOf(target), target);
  }
  assert.doesNotMatch(insertion, /consumed_at|consumed_by|UPDATE|DELETE|RETURN|PERFORM/);
});

test('forward replacement preserves every predecessor authorization, Storage, input, conflict and current replay check', () => {
  const { before, after, insertion } = transformedBody();
  assert.equal(after.replace(insertion, ''), before, 'only the generation guard changes the existing body');
  const guardAt = after.indexOf(insertion);
  for (const target of ['assert_financial_write_allowed(p_organization_id)', 'can_attest_tenant_commercial_document_source_as_actor(',
    'tenant_commercial_document_upload_attestation_forbidden', 'tenant_commercial_document_upload_attestation_invalid',
    'tenant_commercial_document_cleanup_in_progress', 'tenant_commercial_document_upload_attestation_object_invalid']) {
    assert.ok(after.indexOf(target) >= 0 && after.indexOf(target) < guardAt, target);
  }
  assert.ok(after.indexOf('tenant_commercial_document_upload_attestation_conflict') > guardAt);
});

test('migration fails closed on an absent or ambiguous predecessor and preserves the existing function identity and ACL', () => {
  const { sql } = transformedBody();
  assert.match(sql, /public\.attest_tenant_commercial_document_upload\(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb\)'::regprocedure/);
  assert.match(sql, /pg_catalog\.pg_get_functiondef\(v_signature\)/);
  assert.match(sql, /pg_catalog\.length\(v_body\)-pg_catalog\.length\(pg_catalog\.replace\(v_body,v_anchor,''\)\)/);
  assert.match(sql, /<>pg_catalog\.length\(v_anchor\)/);
  assert.match(sql, /financial_upload_attestation_predecessor_changed/);
  assert.match(sql, /EXECUTE pg_catalog\.replace\(v_definition,v_body,pg_catalog\.replace\(v_body,v_anchor,v_guard\|\|v_anchor\)\)/);
  assert.doesNotMatch(sql, /DROP FUNCTION|ALTER FUNCTION|CREATE (?:OR REPLACE )?FUNCTION|\bGRANT\b|\bREVOKE\b/i);
});
