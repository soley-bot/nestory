BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(28);

SELECT has_table(
  'public',
  'tenant_invoice_rent_segments',
  'mid-period rent changes retain immutable per-term invoice evidence'
);

SELECT ok(
  coalesce(
    (
      SELECT relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND NOT has_table_privilege('anon', relation.oid, 'SELECT')
        AND has_table_privilege('authenticated', relation.oid, 'SELECT')
        AND NOT has_table_privilege('authenticated', relation.oid, 'INSERT')
        AND NOT has_table_privilege('authenticated', relation.oid, 'UPDATE')
        AND NOT has_table_privilege('authenticated', relation.oid, 'DELETE')
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'tenant_invoice_rent_segments'
    ),
    false
  ),
  'rent-segment evidence is RLS+FORCE with authenticated tenant-read only'
);

CREATE TEMP TABLE ips_rent_runtime (
  full_invoice_id uuid NOT NULL,
  ips_partial_invoice_id uuid NOT NULL,
  direct_partial_invoice_id uuid NOT NULL,
  rent_change_lease_id uuid NOT NULL,
  rent_change_active_term_id uuid NOT NULL,
  payment_line_id uuid NOT NULL,
  reconciliation_source_id uuid NOT NULL,
  central_property_id uuid NOT NULL,
  central_owner_id uuid NOT NULL,
  move_lease_id uuid,
  renewal_lease_id uuid,
  move_term_id uuid,
  renewal_original_term_id uuid,
  renewal_term_id uuid,
  payment_id uuid,
  payment_allocation_id uuid,
  close_revision_id uuid,
  publication_id uuid,
  replacement_term_id uuid
) ON COMMIT DROP;

INSERT INTO ips_rent_runtime (
  full_invoice_id,
  ips_partial_invoice_id,
  direct_partial_invoice_id,
  rent_change_lease_id,
  rent_change_active_term_id,
  payment_line_id,
  reconciliation_source_id,
  central_property_id,
  central_owner_id
)
SELECT
  full_invoice.id,
  ips_partial.id,
  direct_partial.id,
  full_invoice.lease_id,
  active_term.id,
  payment_line.id,
  reconciliation_source.id,
  central_property.id,
  central_owner.person_id
FROM public.tenant_invoices AS full_invoice
JOIN public.properties AS full_property
  ON full_property.organization_id = full_invoice.organization_id
 AND full_property.id = full_invoice.property_id
JOIN public.lease_terms AS active_term
  ON active_term.organization_id = full_invoice.organization_id
 AND active_term.lease_id = full_invoice.lease_id
 AND active_term.status = 'active'
JOIN public.tenant_invoice_balances AS ips_partial
  ON ips_partial.organization_id = full_invoice.organization_id
 AND ips_partial.collection_route = 'through_ips'
 AND ips_partial.payment_status = 'partly_paid'
JOIN public.tenant_invoices AS ips_partial_invoice
  ON ips_partial_invoice.organization_id = ips_partial.organization_id
 AND ips_partial_invoice.id = ips_partial.id
JOIN public.properties AS central_property
  ON central_property.organization_id = ips_partial_invoice.organization_id
 AND central_property.id = ips_partial_invoice.property_id
JOIN public.units AS ips_partial_unit
  ON ips_partial_unit.organization_id = ips_partial_invoice.organization_id
 AND ips_partial_unit.id = ips_partial_invoice.unit_id
JOIN public.tenant_invoice_balances AS direct_partial
  ON direct_partial.organization_id = full_invoice.organization_id
 AND direct_partial.collection_route = 'direct_to_owner'
 AND direct_partial.payment_status = 'partly_paid'
JOIN public.tenant_invoices AS direct_partial_invoice
  ON direct_partial_invoice.organization_id = direct_partial.organization_id
 AND direct_partial_invoice.id = direct_partial.id
JOIN public.units AS direct_partial_unit
  ON direct_partial_unit.organization_id = direct_partial_invoice.organization_id
 AND direct_partial_unit.id = direct_partial_invoice.unit_id
JOIN public.tenant_invoice_lines AS payment_line
  ON payment_line.organization_id = ips_partial_invoice.organization_id
 AND payment_line.invoice_id = ips_partial_invoice.id
 AND payment_line.line_type = 'rent'
JOIN public.financial_reconciliation_sources AS reconciliation_source
  ON reconciliation_source.organization_id = full_invoice.organization_id
 AND reconciliation_source.code = 'IPS_COLLECTIONS'
JOIN public.property_owners AS central_owner
  ON central_owner.organization_id = central_property.organization_id
 AND central_owner.property_id = central_property.id
 AND central_owner.is_primary
 AND central_owner.archived_at IS NULL
 AND central_owner.started_on <= '2026-08-31'
 AND (central_owner.ended_on IS NULL OR central_owner.ended_on > '2026-08-01')
WHERE full_invoice.organization_id = '00000000-0000-0000-0000-000000000001'
  AND full_property.code = 'RIV-SHP'
  AND full_invoice.billing_period_start = '2026-08-01'
  AND central_property.code = 'CTR-RES'
  AND ips_partial_unit.unit_number = 'A-01'
  AND direct_partial_invoice.property_id = central_property.id
  AND direct_partial_unit.unit_number = 'A-02';

GRANT SELECT, UPDATE ON ips_rent_runtime TO authenticated;

INSERT INTO public.units (
  id, organization_id, property_id, unit_number, status,
  created_by, updated_by
)
VALUES
  (
    '15000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'TRACK5-MOVE', 'occupied',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '15000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'TRACK5-RENEW', 'occupied',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.people (
  id, organization_id, display_name, party_type, created_by, updated_by
)
VALUES
  (
    '85000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000001',
    'Track 5 Move Tenant', 'individual',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '85000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000001',
    'Track 5 Renewal Tenant', 'individual',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000051',
    'tenant', 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000052',
    'tenant', 'active'
  );

SET LOCAL session_replication_role = replica;

INSERT INTO public.leases (
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  status, created_by, updated_by
)
VALUES
  (
    '88000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000051',
    '85000000-0000-0000-0000-000000000051',
    'active',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '88000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000052',
    '85000000-0000-0000-0000-000000000052',
    'active',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.lease_terms (
  id, organization_id, lease_id, term_sequence, start_date, end_date,
  rent_amount, rent_currency, rent_due_day, payment_frequency, status,
  authority_kind, confirmed_at, confirmed_by, created_by, updated_by
)
VALUES
  (
    '89000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000051',
    1, '2026-09-15', '2026-11-15', 900.00, 'USD', 5, 'monthly',
    'active', 'authoritative', pg_catalog.now(),
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '89000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000052',
    1, '2026-10-01', '2026-11-30', 1000.00, 'USD', 5, 'monthly',
    'active', 'authoritative', pg_catalog.now(),
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.lease_billing_terms (
  organization_id, lease_id, property_id, effective_from, effective_to,
  collection_route, management_fee_mode, management_fee_value,
  charge_management_fee_when_active, full_management_fee_during_proration,
  billing_recipient_kind, billing_recipient_person_id,
  first_period_prorated_amount, final_period_prorated_amount,
  confirmed_at, confirmed_by, created_by, updated_by
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000051',
    '10000000-0000-0000-0000-000000000002',
    '2026-09-15', '2026-11-15', 'through_ips', 'percentage', 0,
    false, false, 'individual',
    '85000000-0000-0000-0000-000000000051',
    480.00, 450.00, pg_catalog.now(),
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000052',
    '10000000-0000-0000-0000-000000000002',
    '2026-10-01', '2027-01-31', 'through_ips', 'percentage', 0,
    false, false, 'individual',
    '85000000-0000-0000-0000-000000000052',
    NULL, NULL, pg_catalog.now(),
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

SET LOCAL session_replication_role = origin;

UPDATE ips_rent_runtime
SET move_lease_id = '88000000-0000-0000-0000-000000000051',
    renewal_lease_id = '88000000-0000-0000-0000-000000000052',
    move_term_id = '89000000-0000-0000-0000-000000000051',
    renewal_original_term_id = '89000000-0000-0000-0000-000000000052';

SELECT results_eq(
  $$
    SELECT property.code, invoice.total_amount, invoice.due_date,
      balance.payment_status, balance.balance_due
    FROM public.tenant_invoices AS invoice
    JOIN public.tenant_invoice_balances AS balance ON balance.id = invoice.id
    JOIN public.properties AS property ON property.id = invoice.property_id
    WHERE invoice.id = (SELECT full_invoice_id FROM ips_rent_runtime)
  $$,
  $$ VALUES ('RIV-SHP'::text, 1450.00::numeric, current_date,
    'unpaid'::text, 1450.00::numeric) $$,
  'the full-month scenario retains one exact unpaid obligation with a due date no earlier than issuance'
);

SELECT results_eq(
  $$
    SELECT balance.collection_route, balance.payment_status,
      balance.paid_through_ips, balance.balance_due
    FROM public.tenant_invoice_balances AS balance
    WHERE balance.id = (SELECT ips_partial_invoice_id FROM ips_rent_runtime)
  $$,
  $$ VALUES ('through_ips'::text, 'partly_paid'::text, 825.00::numeric,
    25.00::numeric) $$,
  'the IPS partial-payment scenario keeps obligation and cash settlement separate'
);

SELECT results_eq(
  $$
    SELECT balance.collection_route, balance.payment_status,
      balance.collected_by_owner, balance.paid_through_ips, balance.balance_due
    FROM public.tenant_invoice_balances AS balance
    WHERE balance.id = (SELECT direct_partial_invoice_id FROM ips_rent_runtime)
  $$,
  $$ VALUES ('direct_to_owner'::text, 'partly_paid'::text, 900.00::numeric,
    0.00::numeric, 25.00::numeric) $$,
  'the direct-owner scenario never pretends IPS received the owner-collected cash'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.recover_lease_rent_period(
      '00000000-0000-0000-0000-000000000001',
      (SELECT rent_change_lease_id FROM ips_rent_runtime),
      '2026-07-01'
    )
  $$,
  'Super Admin can recover exactly one selected historical month'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND lease_id = (SELECT rent_change_lease_id FROM ips_rent_runtime)
      AND billing_period_start = '2026-07-01'
  ),
  1,
  'the selected historical month is generated once'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND lease_id = (SELECT rent_change_lease_id FROM ips_rent_runtime)
      AND billing_period_start = '2026-06-01'
  ),
  0,
  'historical recovery never fills the adjacent earlier month'
);

WITH scheduled AS (
  SELECT public.schedule_authoritative_lease_term(
    '00000000-0000-0000-0000-000000000001',
    (SELECT rent_change_lease_id FROM ips_rent_runtime),
    '2026-09-15', '2027-11-30', 1550.00, 'USD', 5, 'monthly',
    (
      SELECT id FROM public.lease_terms
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND id = (SELECT rent_change_active_term_id FROM ips_rent_runtime)
    ),
    'track-5-mid-period-rent-change'
  ) AS term_id
)
UPDATE ips_rent_runtime
SET replacement_term_id = scheduled.term_id
FROM scheduled;

SELECT ok(
  (SELECT replacement_term_id IS NOT NULL FROM ips_rent_runtime),
  'a checked future rent change preserves a replacement term identity'
);

WITH renewed AS (
  SELECT public.schedule_authoritative_lease_term(
    '00000000-0000-0000-0000-000000000001',
    (SELECT renewal_lease_id FROM ips_rent_runtime),
    '2026-12-01', '2027-01-31', 1100.00, 'USD', 5, 'monthly',
    (SELECT renewal_original_term_id FROM ips_rent_runtime),
    'track-5-renewal'
  ) AS term_id
)
UPDATE ips_rent_runtime
SET renewal_term_id = renewed.term_id
FROM renewed;

RESET ROLE;

SELECT app_private.generate_lease_rent_invoice(
  '00000000-0000-0000-0000-000000000001',
  (SELECT move_lease_id FROM ips_rent_runtime),
  '2026-09-01', '2026-09-01', 'scheduled',
  '00000000-0000-0000-0000-000000000101'
);

SELECT app_private.generate_lease_rent_invoice(
  '00000000-0000-0000-0000-000000000001',
  (SELECT move_lease_id FROM ips_rent_runtime),
  '2026-11-01', '2026-11-01', 'scheduled',
  '00000000-0000-0000-0000-000000000101'
);

SELECT results_eq(
  $$
    SELECT invoice.billing_period_start, invoice.total_amount,
      invoice.is_prorated, segment.amount, segment.proration_rule
    FROM public.tenant_invoices AS invoice
    JOIN public.tenant_invoice_rent_segments AS segment
      ON segment.organization_id = invoice.organization_id
     AND segment.invoice_id = invoice.id
    WHERE invoice.lease_id = (SELECT move_lease_id FROM ips_rent_runtime)
    ORDER BY invoice.billing_period_start
  $$,
  $$ VALUES
    ('2026-09-01'::date, 480.00::numeric, true, 480.00::numeric,
      'billing_override'::text),
    ('2026-11-01'::date, 450.00::numeric, true, 450.00::numeric,
      'billing_override'::text)
  $$,
  'mid-month move-in and move-out retain their exact agreed billing amounts'
);

SELECT app_private.generate_lease_rent_invoice(
  '00000000-0000-0000-0000-000000000001',
  (SELECT renewal_lease_id FROM ips_rent_runtime),
  '2026-12-01', '2026-12-01', 'scheduled',
  '00000000-0000-0000-0000-000000000101'
);

SELECT results_eq(
  $$
    SELECT term.term_sequence, term.supersedes_term_id = original.id,
      invoice.total_amount, invoice.is_prorated, segment.amount
    FROM public.lease_terms AS term
    JOIN public.lease_terms AS original
      ON original.organization_id = term.organization_id
     AND original.lease_id = term.lease_id
     AND original.id = term.supersedes_term_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = term.organization_id
     AND invoice.lease_id = term.lease_id
     AND invoice.lease_term_id = term.id
     AND invoice.billing_period_start = '2026-12-01'
    JOIN public.tenant_invoice_rent_segments AS segment
      ON segment.organization_id = invoice.organization_id
     AND segment.invoice_id = invoice.id
    WHERE term.id = (SELECT renewal_term_id FROM ips_rent_runtime)
  $$,
  $$ VALUES (2, true, 1100.00::numeric, false, 1100.00::numeric) $$,
  'renewal advances the authoritative term sequence and invoices its exact amount'
);

SELECT lives_ok(
  $$
    SELECT app_private.generate_lease_rent_invoice(
      '00000000-0000-0000-0000-000000000001',
      (SELECT rent_change_lease_id FROM ips_rent_runtime),
      '2026-09-01', '2026-09-01', 'scheduled',
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  'a mid-month rent change generates one exact combined lease-month obligation'
);

CREATE OR REPLACE FUNCTION pg_temp.rent_segment_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result text;
BEGIN
  EXECUTE $query$
    SELECT pg_catalog.concat_ws(
      '|',
      pg_catalog.to_char(invoice.total_amount, 'FM999999999990.00'),
      invoice.is_prorated::text,
      count(segment.id)::text,
      pg_catalog.string_agg(
        pg_catalog.to_char(segment.amount, 'FM999999999990.00'),
        ',' ORDER BY segment.segment_start
      )
    )
    FROM public.tenant_invoices AS invoice
    JOIN public.tenant_invoice_rent_segments AS segment
      ON segment.organization_id = invoice.organization_id
     AND segment.invoice_id = invoice.id
    WHERE invoice.organization_id = '00000000-0000-0000-0000-000000000001'
      AND invoice.lease_id = (SELECT rent_change_lease_id FROM ips_rent_runtime)
      AND invoice.billing_period_start = '2026-09-01'
    GROUP BY invoice.total_amount, invoice.is_prorated
  $query$ INTO v_result;
  RETURN coalesce(v_result, 'missing');
EXCEPTION
  WHEN undefined_table THEN RETURN 'missing_table';
END;
$$;

SELECT is(
  pg_temp.rent_segment_probe(),
  '1450.00|false|2|1450.00,0.00',
  'the next-full-period policy freezes both term segments without mislabeling proration'
);

SELECT app_private.generate_lease_rent_invoice(
  '00000000-0000-0000-0000-000000000001',
  (SELECT rent_change_lease_id FROM ips_rent_runtime),
  '2026-10-01', '2026-10-01', 'scheduled',
  '00000000-0000-0000-0000-000000000101'
);

SELECT results_eq(
  $$
    SELECT old_term.end_date, new_term.start_date, new_term.rent_amount,
      new_term.supersedes_term_id = old_term.id,
      invoice.total_amount, segment.amount
    FROM public.lease_terms AS old_term
    JOIN public.lease_terms AS new_term
      ON new_term.organization_id = old_term.organization_id
     AND new_term.supersedes_term_id = old_term.id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = new_term.organization_id
     AND invoice.lease_id = new_term.lease_id
     AND invoice.lease_term_id = new_term.id
     AND invoice.billing_period_start = '2026-10-01'
    JOIN public.tenant_invoice_rent_segments AS segment
      ON segment.organization_id = invoice.organization_id
     AND segment.invoice_id = invoice.id
    WHERE new_term.id = (SELECT replacement_term_id FROM ips_rent_runtime)
  $$,
  $$ VALUES (
    '2026-09-14'::date, '2026-09-15'::date, 1550.00::numeric, true,
    1550.00::numeric, 1550.00::numeric
  ) $$,
  'the superseding rent term keeps an unbroken chain and applies next full period'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true
);
SET LOCAL ROLE authenticated;

WITH paid AS (
  SELECT public.record_tenant_invoice_payment(
    '00000000-0000-0000-0000-000000000001',
    (SELECT ips_partial_invoice_id FROM ips_rent_runtime),
    25.00, '2026-08-11',
    (SELECT reconciliation_source_id FROM ips_rent_runtime),
    'Track 5 late settlement',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'lineId', (SELECT payment_line_id FROM ips_rent_runtime),
      'amount', 25.00
    )),
    'track-5-late-payment'
  ) AS payment_id
)
UPDATE ips_rent_runtime SET payment_id = paid.payment_id FROM paid;

SELECT results_eq(
  $$
    SELECT balance.payment_status, balance.balance_due, payment.received_date,
      payment.received_date > invoice.due_date
    FROM public.tenant_invoice_balances AS balance
    JOIN public.tenant_invoices AS invoice ON invoice.id = balance.id
    JOIN public.tenant_invoice_payments AS payment
      ON payment.id = (SELECT payment_id FROM ips_rent_runtime)
    WHERE balance.id = (SELECT ips_partial_invoice_id FROM ips_rent_runtime)
  $$,
  $$ VALUES ('paid'::text, 0.00::numeric, '2026-08-11'::date, false) $$,
  'payment closes the exact tenant balance while preserving its settlement date and issuance-floor timing'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.ledger_entries AS ledger
    JOIN public.tenant_invoice_payment_allocations AS allocation
      ON allocation.payment_id = (SELECT payment_id FROM ips_rent_runtime)
    JOIN public.finance_receipt_allocations AS receipt_allocation
      ON receipt_allocation.organization_id = allocation.organization_id
     AND receipt_allocation.receipt_id = allocation.finance_receipt_id
     AND receipt_allocation.ledger_entry_id = ledger.id
    WHERE allocation.payment_id = (SELECT payment_id FROM ips_rent_runtime)
      AND allocation.signed_amount = 25.00
  ),
  1,
  'the late settlement has exactly one linked Ledger effect'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.get_property_cash_events_page(
      '00000000-0000-0000-0000-000000000001',
      (SELECT central_property_id FROM ips_rent_runtime),
      'USD', '2026-08-01', '2026-08-31', NULL, NULL, NULL, 200
    ) AS cash
    WHERE cash.source_type = 'receipt_allocation'
      AND cash.source_parent_id = (
        SELECT allocation.finance_receipt_id
        FROM public.tenant_invoice_payment_allocations AS allocation
        WHERE allocation.payment_id = (SELECT payment_id FROM ips_rent_runtime)
          AND allocation.signed_amount = 25.00
      )
      AND cash.amount = 25.00
  ),
  1,
  'the same settlement appears once in property cash'
);

UPDATE ips_rent_runtime
SET payment_allocation_id = allocation.id
FROM public.tenant_invoice_payment_allocations AS allocation
WHERE allocation.payment_id = ips_rent_runtime.payment_id
  AND allocation.signed_amount = 25.00;

SELECT lives_ok(
  $$
    SELECT public.allocate_owner_event(
      '00000000-0000-0000-0000-000000000001',
      'tenant_rent_receipt',
      (SELECT payment_allocation_id FROM ips_rent_runtime),
      'track-5-late-payment-allocation'
    )
  $$,
  'the late IPS rent receipt allocates through the authoritative owner roster'
);

SELECT results_eq(
  $$
    SELECT allocation.allocated_gross_signed_amount, movement.component,
      movement.signed_amount
    FROM public.owner_event_owner_allocations AS allocation
    JOIN public.owner_component_movements AS movement
      ON movement.owner_event_owner_allocation_id = allocation.id
    WHERE allocation.allocation_set_id = (
      SELECT allocation_set.id
      FROM public.owner_event_allocation_sets AS allocation_set
      WHERE allocation_set.source_type = 'tenant_rent_receipt'
        AND allocation_set.source_line_id = (
          SELECT payment_allocation_id FROM ips_rent_runtime
        )
    )
  $$,
  $$ VALUES (25.00::numeric, 'ips_held_owner_cash'::public.owner_balance_component,
    25.00::numeric) $$,
  'owner allocation records the exact held-cash component movement once'
);

SELECT lives_ok(
  $$
    SELECT public.generate_owner_balance_period(
      '00000000-0000-0000-0000-000000000001',
      (SELECT central_property_id FROM ips_rent_runtime),
      (SELECT central_owner_id FROM ips_rent_runtime),
      'USD', '2026-08-01', 'track-5-owner-period'
    )
  $$,
  'the changed rent source rerolls the authoritative owner period'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);

SELECT lives_ok(
  $$
    SELECT public.set_financial_month_lock(
      '00000000-0000-0000-0000-000000000001',
      '2026-08-01', true, 'Track 5 rent lifecycle close'
    )
  $$,
  'Super Admin locks the reconciled rent month before close'
);

SELECT public.review_owner_opening_balance(
  request.organization_id,
  request.id,
  'reject',
  'Resolve pending fixture correction before Track 5 close',
  'track-5-reject-pending-opening-correction'
)
FROM public.owner_opening_balance_requests AS request
WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
  AND request.property_id = (SELECT central_property_id FROM ips_rent_runtime)
  AND request.owner_person_id = (SELECT central_owner_id FROM ips_rent_runtime)
  AND request.status = 'submitted';

WITH closed AS (
  SELECT public.close_owner_month(
    '00000000-0000-0000-0000-000000000001',
    (SELECT central_property_id FROM ips_rent_runtime),
    (SELECT central_owner_id FROM ips_rent_runtime),
    'USD', '2026-08-01', 'Track 5 rent-to-statement acceptance',
    'track-5-owner-close'
  ) AS result
)
UPDATE ips_rent_runtime
SET close_revision_id = (closed.result ->> 'revision_id')::uuid
FROM closed;

SELECT ok(
  (SELECT close_revision_id IS NOT NULL FROM ips_rent_runtime),
  'the reconciled owner month closes to an immutable revision'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.owner_close_line_sources AS source
    WHERE source.owner_close_revision_id = (
      SELECT close_revision_id FROM ips_rent_runtime
    )
      AND source.source_type = 'tenant_rent_receipt'
      AND source.source_line_id = (
        SELECT payment_allocation_id FROM ips_rent_runtime
      )
  ),
  1,
  'the late rent receipt freezes once into Owner Statement source lineage'
);

WITH published AS (
  SELECT public.publish_owner_statement(
    '00000000-0000-0000-0000-000000000001',
    (SELECT close_revision_id FROM ips_rent_runtime),
    'track-5-owner-statement'
  ) AS result
)
UPDATE ips_rent_runtime
SET publication_id = (published.result ->> 'publication_id')::uuid
FROM published;

SELECT matches(
  (
    SELECT publication.statement_number
    FROM public.owner_statement_publications AS publication
    WHERE publication.id = (SELECT publication_id FROM ips_rent_runtime)
  ),
  '^OS-[0-9]{6}-[0-9A-F]{12}$',
  'the reconciled rent source reaches one official numbered Owner Statement'
);

RESET ROLE;

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.schedule_authoritative_lease_term(
      '00000000-0000-0000-0000-000000000001',
      (SELECT move_lease_id FROM ips_rent_runtime),
      '2026-09-20', '2026-11-15', 950.00, 'USD', 5, 'monthly',
      (SELECT move_term_id FROM ips_rent_runtime),
      'track-5-generated-obligation-drift'
    )
  $$,
  '23514',
  'rent_obligation_already_generated',
  'a generated immutable obligation blocks a later same-period rent split'
);

RESET ROLE;

SELECT throws_ok(
  $$
    UPDATE public.tenant_invoice_rent_segments
    SET amount = amount + 0.01
    WHERE invoice_id = (SELECT full_invoice_id FROM ips_rent_runtime)
  $$,
  '55000',
  'tenant_invoice_rent_segments_immutable',
  'frozen per-term rent evidence rejects direct mutation'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.tenant_invoice_rent_segments),
  0,
  'Operations cannot read Finance rent-segment evidence'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM app_private.financial_idempotency_requests AS request
    WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
      AND request.idempotency_key LIKE 'track-5-%'
      AND request.status = 'pending'
  ),
  0,
  'the complete rent lifecycle leaves no pending financial idempotency request'
);

SELECT * FROM finish();
ROLLBACK;
