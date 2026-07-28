BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(31);

SELECT is(
  (SELECT count(*) FROM public.organizations),
  2::bigint,
  'the local seed has one populated organization and one empty demo workspace'
);

SELECT is(
  (
    SELECT count(*)
    FROM auth.users
    WHERE email IN (
      'nestory@gmail.com',
      'manager@nestory.com',
      'member@nestory.com',
      'demo@nestory.com'
    )
  ),
  4::bigint,
  'all four documented local logins are preserved'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.properties
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  3::bigint,
  'the visible sample portfolio has exactly three properties'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.units
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  18::bigint,
  'the visible sample portfolio has exactly eighteen units'
);

SELECT is(
  (
    SELECT count(DISTINCT owners.person_id)
    FROM public.property_owners AS owners
    JOIN public.properties AS properties
      ON properties.id = owners.property_id
    WHERE owners.organization_id = '00000000-0000-0000-0000-000000000001'
      AND owners.archived_at IS NULL
      AND owners.ended_on IS NULL
      AND properties.archived_at IS NULL
  ),
  2::bigint,
  'the visible sample portfolio has exactly two current owners'
);

SELECT is(
  (
    SELECT count(*)
    FROM (
      SELECT owners.property_id
      FROM public.property_owners AS owners
      JOIN public.properties AS properties
        ON properties.id = owners.property_id
      WHERE owners.organization_id = '00000000-0000-0000-0000-000000000001'
        AND owners.archived_at IS NULL
        AND owners.ended_on IS NULL
        AND properties.archived_at IS NULL
      GROUP BY owners.property_id
      HAVING sum(owners.ownership_percent) = 100
        AND count(*) FILTER (WHERE owners.is_primary) = 1
    ) AS complete_ownership
  ),
  3::bigint,
  'each visible property has complete and unambiguous ownership'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  3::bigint,
  'the populated organization has admin, manager, and member access'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_members
    WHERE organization_id = '00000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'the empty demo workspace keeps its admin login'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  13::bigint,
  'the visible portfolio has a compact thirteen-lease book'
);

SELECT is(
  (
    SELECT count(DISTINCT status)
    FROM public.leases
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
      AND status IN ('active', 'notice_given', 'draft', 'ended')
  ),
  4::bigint,
  'lease fixtures cover active, notice, upcoming draft, and ended states'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases AS leases
    WHERE leases.organization_id = '00000000-0000-0000-0000-000000000001'
      AND leases.archived_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.lease_terms AS terms
        WHERE terms.organization_id = leases.organization_id
          AND terms.lease_id = leases.id
          AND terms.archived_at IS NULL
          AND terms.authority_kind = 'authoritative'
      )
  ),
  13::bigint,
  'every visible lease is backed by an authoritative term'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases AS leases
    JOIN public.lease_terms AS terms
      ON terms.organization_id = leases.organization_id
     AND terms.lease_id = leases.id
     AND terms.archived_at IS NULL
     AND terms.authority_kind = 'authoritative'
    WHERE leases.organization_id = '00000000-0000-0000-0000-000000000001'
      AND leases.archived_at IS NULL
      AND (
        leases.lease_start_date,
        leases.lease_end_date,
        leases.monthly_rent_amount,
        leases.monthly_rent_currency
      ) = (
        terms.start_date,
        terms.end_date,
        terms.rent_amount,
        terms.rent_currency
      )
  ),
  13::bigint,
  'lease projections agree with their authoritative terms'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_occupancies
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
      AND status IN ('occupied', 'notice_given', 'reserved', 'vacated')
  ),
  13::bigint,
  'each visible lease has a coherent occupancy state'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_income_items
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  8::bigint,
  'the demo book has eight normalized income items'
);

SELECT is(
  (
    SELECT count(DISTINCT status)
    FROM public.finance_income_items
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
      AND status IN ('open', 'partially_received', 'received', 'posted')
  ),
  4::bigint,
  'income fixtures cover open, partial, received, and posted states'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_receipts
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  4::bigint,
  'the demo book has four receipt events'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_receipt_allocations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  4::bigint,
  'every demo receipt is allocated'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.finance_receipts AS receipts
    LEFT JOIN public.finance_receipt_allocations AS allocations
      ON allocations.receipt_id = receipts.id
    WHERE receipts.organization_id = '00000000-0000-0000-0000-000000000001'
    GROUP BY receipts.id, receipts.amount
    HAVING coalesce(sum(allocations.amount), 0) > receipts.amount
  ),
  'receipt allocations never exceed their receipt'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_expense_items
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  6::bigint,
  'the demo book has six normalized expense items'
);

SELECT is(
  (
    SELECT count(DISTINCT status)
    FROM public.finance_expense_items
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
      AND status IN ('draft', 'approved', 'posted', 'paid')
  ),
  4::bigint,
  'expense fixtures cover draft, approved, posted, and paid states'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_payments
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'the demo book has two payment events'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_payment_allocations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'every demo payment is allocated'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.lease_deposit_events
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  4::bigint,
  'deposit fixtures include receipt and disposition events'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.petty_cash_accounts
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  1::bigint,
  'the demo book has one active petty-cash account'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.petty_cash_entries
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  4::bigint,
  'petty cash includes four representative entries'
);

SELECT ok(
  (
    SELECT count(DISTINCT status) >= 5
    FROM public.tasks
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
  ),
  'maintenance tasks retain a useful spread of workflow states'
);

SELECT ok(
  (
    SELECT count(*) >= 6
    FROM public.tasks
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND archived_at IS NULL
      AND due_date BETWEEN current_date - 30 AND current_date + 30
  ),
  'maintenance due dates stay useful around the reset date'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.documents
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'documents are intentionally empty instead of pointing at broken objects'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.asset_photos
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'asset photos are intentionally empty instead of pointing at broken objects'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.properties
    WHERE organization_id = '00000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'the demo workspace remains truly empty'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.finance_income_items AS income
    WHERE income.organization_id = '00000000-0000-0000-0000-000000000001'
      AND income.status IN ('received', 'posted')
      AND income.ledger_entry_id IS NULL
  ),
  'settled income remains traceable to ledger rows'
);

SELECT * FROM finish();
ROLLBACK;
