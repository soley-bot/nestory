BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

-- A deposit holding unreversed activity owns real cash evidence. The Lease
-- header edit path must not rewrite its obligation or archive it away from
-- those events.

DELETE FROM public.lease_deposit_events;

CREATE TEMP TABLE deposit_guard_scope AS
SELECT
  lease.id AS lease_id,
  lease.property_id,
  lease.unit_id,
  lease.primary_tenant_person_id,
  lease.status
FROM public.leases AS lease
WHERE lease.organization_id = '00000000-0000-0000-0000-000000000001'
  AND lease.primary_tenant_person_id = '80000000-0000-0000-0000-000000000001'
  AND lease.archived_at IS NULL
LIMIT 1;

SELECT is(
  (SELECT count(*)::integer FROM deposit_guard_scope),
  1,
  'fixture exposes exactly one lease for the deposit guard scope'
);

DELETE FROM public.lease_deposits
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND lease_id = (SELECT lease_id FROM deposit_guard_scope);

INSERT INTO public.lease_deposits (
  id,
  organization_id,
  lease_id,
  amount,
  currency,
  status,
  created_by,
  updated_by
)
SELECT
  '88000000-0000-0000-0000-000000000009',
  '00000000-0000-0000-0000-000000000001',
  scope.lease_id,
  500,
  'USD',
  'held',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
FROM deposit_guard_scope AS scope;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

SELECT public.record_lease_deposit_event(
  '00000000-0000-0000-0000-000000000001',
  '88000000-0000-0000-0000-000000000009',
  'received',
  '2026-07-10',
  500,
  'GUARD-DEP-RECEIPT'
);

SELECT throws_matching(
  $$SELECT app_private.update_lease_record_internal(
      (SELECT lease_id FROM deposit_guard_scope),
      '00000000-0000-0000-0000-000000000001',
      (SELECT property_id FROM deposit_guard_scope),
      (SELECT unit_id FROM deposit_guard_scope),
      (SELECT primary_tenant_person_id FROM deposit_guard_scope),
      250,
      'USD',
      (SELECT status FROM deposit_guard_scope))$$,
  'recorded activity',
  'settled deposit amount cannot be rewritten through the Lease header'
);

SELECT throws_matching(
  $$SELECT app_private.update_lease_record_internal(
      (SELECT lease_id FROM deposit_guard_scope),
      '00000000-0000-0000-0000-000000000001',
      (SELECT property_id FROM deposit_guard_scope),
      (SELECT unit_id FROM deposit_guard_scope),
      (SELECT primary_tenant_person_id FROM deposit_guard_scope),
      NULL,
      NULL,
      (SELECT status FROM deposit_guard_scope))$$,
  'recorded activity',
  'settled deposit cannot be archived through the Lease header'
);

SELECT is(
  (
    SELECT deposit.amount
    FROM public.lease_deposits AS deposit
    WHERE deposit.id = '88000000-0000-0000-0000-000000000009'
      AND deposit.archived_at IS NULL
  ),
  500::numeric,
  'rejected Lease edits leave the settled deposit intact'
);

SELECT lives_ok(
  $$SELECT app_private.update_lease_record_internal(
      (SELECT lease_id FROM deposit_guard_scope),
      '00000000-0000-0000-0000-000000000001',
      (SELECT property_id FROM deposit_guard_scope),
      (SELECT unit_id FROM deposit_guard_scope),
      (SELECT primary_tenant_person_id FROM deposit_guard_scope),
      500,
      'USD',
      (SELECT status FROM deposit_guard_scope))$$,
  'unchanged deposit values still allow ordinary Lease header edits'
);

SELECT public.reverse_lease_deposit_event(
  '00000000-0000-0000-0000-000000000001',
  (
    SELECT id
    FROM public.lease_deposit_events
    WHERE reference = 'GUARD-DEP-RECEIPT'
  ),
  '2026-07-12',
  'GUARD-DEP-RECEIPT-REV'
);

SELECT lives_ok(
  $$SELECT app_private.update_lease_record_internal(
      (SELECT lease_id FROM deposit_guard_scope),
      '00000000-0000-0000-0000-000000000001',
      (SELECT property_id FROM deposit_guard_scope),
      (SELECT unit_id FROM deposit_guard_scope),
      (SELECT primary_tenant_person_id FROM deposit_guard_scope),
      250,
      'USD',
      (SELECT status FROM deposit_guard_scope))$$,
  'reversing the deposit activity restores the correction path'
);

SELECT * FROM finish();
ROLLBACK;
