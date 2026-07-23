BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(11);

SELECT has_column(
  'public',
  'finance_income_items',
  'payer_person_id',
  'income items can link to a payer person'
);

SELECT is(
  (
    SELECT pg_get_constraintdef(constraint_record.oid)
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'public.finance_income_items'::regclass
      AND constraint_record.conname = 'finance_income_items_payer_person_fk'
  ),
  'FOREIGN KEY (organization_id, payer_person_id) REFERENCES people(organization_id, id) ON DELETE SET NULL (payer_person_id)',
  'payer foreign key enforces organization scope and nulls only the payer on delete'
);

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  party_type
)
VALUES (
  '8f000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Other organization payer',
  'individual'
), (
  '8e000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Disposable same-organization payer',
  'individual'
);

SELECT throws_ok(
  $$INSERT INTO public.finance_income_items (
    id,
    organization_id,
    property_id,
    payer_person_id,
    income_type,
    payer_label,
    due_date,
    amount_due,
    amount_received,
    currency,
    status
  ) VALUES (
    'af000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '8f000000-0000-0000-0000-000000000001',
    'rent',
    'Cross-organization payer',
    '2026-08-01',
    100,
    0,
    'USD',
    'open'
  )$$,
  '23503',
  NULL,
  'direct cross-organization payer insert is rejected'
);

INSERT INTO public.finance_income_items (
  id,
  organization_id,
  property_id,
  payer_person_id,
  income_type,
  payer_label,
  due_date,
  amount_due,
  amount_received,
  currency,
  status
)
VALUES (
  'af000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '8e000000-0000-0000-0000-000000000001',
  'rent',
  'Dara Sok',
  '2026-08-01',
  100,
  0,
  'USD',
  'open'
);

SELECT throws_ok(
  $$UPDATE public.finance_income_items
    SET payer_person_id = '8f000000-0000-0000-0000-000000000001'
    WHERE id = 'af000000-0000-0000-0000-000000000002'$$,
  '23503',
  NULL,
  'direct cross-organization payer update is rejected'
);

CREATE TEMP TABLE income_payer_test_state (
  linked_income_id uuid
) ON COMMIT DROP;

GRANT SELECT, INSERT ON income_payer_test_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO income_payer_test_state (linked_income_id)
    SELECT public.create_finance_income_item(
      p_organization_id => '00000000-0000-0000-0000-000000000001',
      p_property_id => '10000000-0000-0000-0000-000000000001',
      p_unit_id => NULL,
      p_lease_id => NULL,
      p_income_type => 'rent',
      p_payer_label => 'Ignored caller label',
      p_due_date => '2026-08-01',
      p_amount_due => 100,
      p_amount_received => 40,
      p_received_date => '2026-08-01',
      p_description => 'Payer integrity test',
      p_reference => 'PAYER-INTEGRITY',
      p_payer_person_id => '80000000-0000-0000-0000-000000000001'
    )$$,
  'linked active payer is accepted by the income RPC'
);

SELECT is(
  (
    SELECT payer_label
    FROM public.finance_income_items
    WHERE id = (SELECT linked_income_id FROM income_payer_test_state)
  ),
  'Dara Sok',
  'linked payer label is derived from the active person record'
);

SELECT throws_ok(
  $$SELECT public.create_finance_income_item(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_lease_id => NULL,
    p_income_type => 'rent',
    p_payer_label => 'Cross-organization payer',
    p_due_date => '2026-08-01',
    p_amount_due => 100,
    p_amount_received => 0,
    p_received_date => NULL,
    p_description => NULL,
    p_reference => NULL,
    p_payer_person_id => '8f000000-0000-0000-0000-000000000001'
  )$$,
  '23503',
  'Payer person not found',
  'income RPC rejects a payer from another organization'
);

SELECT throws_ok(
  $$SELECT public.post_finance_income_item(
    (SELECT linked_income_id FROM income_payer_test_state),
    '00000000-0000-0000-0000-000000000001'
  )$$,
  '22023',
  'Record the remaining receipt before posting to the ledger',
  'partially received income cannot post before it is fully received'
);

RESET ROLE;

UPDATE public.people
SET archived_at = now()
WHERE id = '80000000-0000-0000-0000-000000000002';

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.create_finance_income_item(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_lease_id => NULL,
    p_income_type => 'rent',
    p_payer_label => 'Archived payer',
    p_due_date => '2026-08-01',
    p_amount_due => 100,
    p_amount_received => 0,
    p_received_date => NULL,
    p_description => NULL,
    p_reference => NULL,
    p_payer_person_id => '80000000-0000-0000-0000-000000000002'
  )$$,
  '23503',
  'Payer person not found',
  'income RPC rejects an archived payer'
);

RESET ROLE;

SELECT throws_ok(
  $$UPDATE public.leases
    SET primary_tenant_person_id = '80100000-0000-0000-0000-000000000001'
    WHERE id = '30000000-0000-0000-0000-000000000001'$$,
  '23503',
  'An active Tenant role is required for the primary tenant',
  'lease primary tenant must have an active Tenant role'
);

DELETE FROM public.people
WHERE id = '8e000000-0000-0000-0000-000000000001';

SELECT is(
  (
    SELECT payer_person_id
    FROM public.finance_income_items
    WHERE id = 'af000000-0000-0000-0000-000000000002'
  ),
  NULL,
  'deleting a payer nulls the payer link without changing organization scope'
);

SELECT * FROM finish();
ROLLBACK;
