BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT is(
  (SELECT count(*) FROM public.organizations),
  1::bigint,
  'the fixture contains one coherent company'
);

SELECT is(
  (
    SELECT count(*)
    FROM auth.users
    WHERE email IN (
      'nestory@gmail.com',
      'finance.manager@nestory.com',
      'finance.member@nestory.com',
      'operations.manager@nestory.com',
      'operations.member@nestory.com'
    )
  ),
  5::bigint,
  'all five documented development logins exist'
);

SELECT is(
  (
    SELECT count(*)
    FROM auth.users
    WHERE email IN (
      'manager@nestory.com',
      'member@nestory.com',
      'demo@nestory.com'
    )
  ),
  0::bigint,
  'deprecated fixture personas are absent'
);

SELECT results_eq(
  $$
    SELECT role, count(*)::integer
    FROM public.organization_members
    GROUP BY role
    ORDER BY role
  $$,
  $$
    VALUES
      ('finance_manager'::text, 1),
      ('finance_member'::text, 1),
      ('operations_manager'::text, 1),
      ('operations_member'::text, 1),
      ('super_admin'::text, 1)
  $$,
  'the company has exactly one membership for each fixed role'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE role IN ('super_admin', 'finance_manager', 'finance_member')
      AND (person_id IS NOT NULL OR branch_id IS NOT NULL)
  ),
  'company-wide roles do not carry operational person or branch scope'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    LEFT JOIN public.person_roles AS person_role
      ON person_role.organization_id = membership.organization_id
     AND person_role.person_id = membership.person_id
     AND person_role.role = 'staff'
     AND person_role.status = 'active'
     AND person_role.archived_at IS NULL
    WHERE membership.role IN ('operations_manager', 'operations_member')
      AND (
        membership.person_id IS NULL
        OR membership.branch_id IS NULL
        OR person_role.id IS NULL
      )
  ),
  'Operations roles have active staff identities and a branch'
);

SELECT results_eq(
  $$
    SELECT code, status
    FROM public.properties
    WHERE archived_at IS NULL
    ORDER BY code
  $$,
  $$
    VALUES
      ('CTR-RES'::text, 'active'::text),
      ('GDN-CRT'::text, 'active'::text),
      ('RIV-SHP'::text, 'active'::text)
  $$,
  'the compact fixture contains the three named operating stories'
);

SELECT is(
  (SELECT count(*) FROM public.units WHERE archived_at IS NULL),
  10::bigint,
  'the compact fixture contains ten active units'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.people
    WHERE display_name = 'Dara Chan' AND archived_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.people
    WHERE display_name = 'Mara Sovan' AND archived_at IS NULL
  ),
  'route-smoke search records for Dara and Mara exist'
);

SELECT is(
  (
    SELECT count(*)
    FROM (
      SELECT owners.property_id
      FROM public.property_owners AS owners
      WHERE owners.archived_at IS NULL
        AND owners.ended_on IS NULL
      GROUP BY owners.property_id
      HAVING sum(owners.ownership_percent) = 100
        AND count(*) FILTER (WHERE owners.is_primary) = 1
    ) AS complete_ownership
  ),
  3::bigint,
  'each property has one complete current ownership record'
);

SELECT is(
  (SELECT count(*) FROM public.leases WHERE archived_at IS NULL),
  5::bigint,
  'the fixture contains five current leases'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases AS lease
    WHERE lease.archived_at IS NULL
      AND (
        SELECT count(*)
        FROM public.lease_terms AS term
        WHERE term.organization_id = lease.organization_id
          AND term.lease_id = lease.id
          AND term.authority_kind = 'authoritative'
          AND term.archived_at IS NULL
      ) = 1
  ),
  5::bigint,
  'every lease has one authoritative term'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.lease_terms
    WHERE authority_kind <> 'authoritative'
  ),
  'the fixture contains no inferred lease authority'
);

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer FROM public.lease_parties),
      (SELECT count(*)::integer FROM public.lease_occupancies),
      (SELECT count(*)::integer FROM public.lease_occupancy_participants)
  $$,
  $$VALUES (5, 5, 4)$$,
  'lease parties, occupancy, and individual participation are explicit'
);

SELECT is(
  (SELECT count(*) FROM public.lease_deposits WHERE archived_at IS NULL),
  5::bigint,
  'each lease carries its operational deposit record'
);

SELECT results_eq(
  $$
    SELECT collection_route, count(*)::integer
    FROM public.lease_billing_terms
    WHERE archived_at IS NULL
    GROUP BY collection_route
    ORDER BY collection_route
  $$,
  $$
    VALUES
      ('direct_to_owner'::text, 1),
      ('through_ips'::text, 3)
  $$,
  'billing terms cover both supported collection routes'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.rent_policy_versions
    WHERE lifecycle = 'approved'
  ),
  1::bigint,
  'one approved rent policy drives the fixture'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.tenant_invoices
    WHERE billing_period_start = date_trunc('month', current_date)::date
      AND lifecycle = 'issued'
  ),
  4::bigint,
  'automatic generation created current-month invoices for configured leases'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.tenant_invoices
    WHERE lease_term_id IS NULL
      OR rent_policy_version_id IS NULL
      OR generation_source IS NULL
      OR generated_at IS NULL
  ),
  'every rent invoice snapshots its term, policy, and generation source'
);

SELECT results_eq(
  $$
    SELECT collection_route, payment_status, count(*)::integer
    FROM public.tenant_invoice_balances
    GROUP BY collection_route, payment_status
    ORDER BY collection_route, payment_status
  $$,
  $$
    VALUES
      ('direct_to_owner'::text, 'paid'::text, 1),
      ('through_ips'::text, 'paid'::text, 1),
      ('through_ips'::text, 'unpaid'::text, 2)
  $$,
  'rent balances include IPS-paid, owner-collected, and open obligations'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.rent_generation_exceptions AS exception
    JOIN public.leases AS lease
      ON lease.organization_id = exception.organization_id
     AND lease.id = exception.lease_id
    JOIN public.properties AS property
      ON property.organization_id = lease.organization_id
     AND property.id = lease.property_id
    WHERE property.code = 'GDN-CRT'
      AND exception.resolved_at IS NULL
  ),
  'Garden Court exposes one recoverable rent setup exception'
);

SELECT is(
  (SELECT count(*) FROM public.management_fee_occurrences),
  4::bigint,
  'each generated invoice creates one management-fee occurrence'
);

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer FROM public.tenant_invoice_payments),
      (SELECT count(*)::integer FROM public.owner_collection_confirmations)
  $$,
  $$VALUES (1, 1)$$,
  'rent settlement uses one IPS payment and one owner confirmation'
);

SELECT results_eq(
  $$
    SELECT source_type, status, count(*)::integer
    FROM public.expense_submissions
    GROUP BY source_type, status
    ORDER BY source_type, status
  $$,
  $$
    VALUES
      ('general'::text, 'rejected'::text, 1),
      ('general'::text, 'reversed'::text, 1),
      ('general'::text, 'submitted'::text, 1),
      ('maintenance_task'::text, 'approved'::text, 1),
      ('maintenance_task'::text, 'submitted'::text, 1)
  $$,
  'the Finance queue contains approved, rejected, and reversed outcomes'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.expense_submissions
    WHERE source_type = 'general'
      AND status = 'submitted'
  ),
  'Finance Manager has a submitted general expense to review'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.expense_submissions
    WHERE source_type = 'maintenance_task'
      AND status = 'submitted'
  ),
  'Finance Manager has a submitted maintenance cost to review'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.expense_submissions
    WHERE supporting_document_id IS NULL
      AND NULLIF(btrim(reference), '') IS NULL
  ),
  'every fixture expense carries honest evidence'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    JOIN public.tasks AS task
      ON task.organization_id = submission.organization_id
     AND task.id = submission.source_id
    WHERE submission.source_type = 'maintenance_task'
      AND submission.status = 'approved'
      AND task.title = 'Kitchen sink repair'
      AND task.actual_cost_amount = submission.internal_cost_amount
      AND submission.approved_ledger_entry_id IS NOT NULL
  ),
  'the approved maintenance cost retains exact task and Ledger identity'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.expense_submissions
    WHERE status = 'rejected'
      AND approved_finance_expense_item_id IS NULL
      AND approved_payment_id IS NULL
      AND approved_ledger_entry_id IS NULL
  ),
  'a rejected submission creates no financial effect'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    JOIN public.ledger_entries AS original
      ON original.id = submission.approved_ledger_entry_id
    JOIN public.ledger_entries AS reversal
      ON reversal.id = submission.reversal_ledger_entry_id
     AND reversal.reversal_of_ledger_entry_id = original.id
    WHERE submission.status = 'reversed'
      AND original.direction = 'expense'
      AND reversal.direction = 'income'
      AND original.amount = reversal.amount
  ),
  'expense reversal is an exact append-only opposite Ledger event'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.ledger_entries
    WHERE source_type IS NULL OR source_id IS NULL
  ),
  'all Ledger rows have immutable operational source identity'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.ledger_entries
    GROUP BY organization_id, source_type, source_id
    HAVING count(*) > 1
  ),
  'one Ledger event exists per operational source'
);

SELECT results_eq(
  $$
    SELECT status, count(*)::integer
    FROM public.tasks
    GROUP BY status
    ORDER BY status
  $$,
  $$
    VALUES
      ('blocked'::text, 1),
      ('completed'::text, 1),
      ('in_progress'::text, 1),
      ('pending'::text, 2),
      ('scheduled'::text, 1)
  $$,
  'maintenance work covers actionable and historical states'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE recurrence_frequency = 'monthly'
  ),
  'recurrence is represented as metadata on an existing task'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.petty_cash_entries AS entry
    JOIN public.petty_cash_accounts AS account
      ON account.id = entry.account_id
    JOIN public.ledger_entries AS ledger
      ON ledger.id = entry.ledger_entry_id
     AND ledger.source_type = 'petty_cash_entry'
     AND ledger.source_id = entry.id
    WHERE account.account_number = 'PC-PP-01'
      AND account.custodian_person_id =
        '80000000-0000-0000-0000-000000000008'
      AND entry.status = 'posted'
      AND entry.out_amount = 35
  ),
  'posted petty cash is linked to its custodian and exact Ledger event'
);

SELECT results_eq(
  $$
    SELECT status, count(*)::integer
    FROM public.petty_cash_entries
    WHERE archived_at IS NULL
    GROUP BY status
    ORDER BY status
  $$,
  $$
    VALUES
      ('draft'::text, 1),
      ('posted'::text, 1)
  $$,
  'petty cash includes one actionable draft and one posted history item'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.financial_reconciliation_sources
    WHERE code = 'OPS-USD'
      AND scope_kind = 'organization_pooled'
      AND archived_at IS NULL
  ),
  1::bigint,
  'one active pooled source supports IPS and approved-cost cash flows'
);

SELECT is(
  (SELECT count(*) FROM public.financial_month_locks),
  0::bigint,
  'the fixture starts with every financial month open'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000801',
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_property_cash_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD',
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      NULL,
      NULL,
      NULL,
      100
    ) AS event
    WHERE event.resolution_state <> 'resolved'
  ),
  'Finance reads only resolved canonical cash events for Central Residence'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.get_property_cash_events_page(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'USD',
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      NULL,
      NULL,
      NULL,
      100
    ) AS event
    WHERE event.is_reversal
  ),
  'the canonical cash projection exposes the reportable reversal'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
