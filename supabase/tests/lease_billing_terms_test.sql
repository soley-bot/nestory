BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

SELECT has_table(
  'public',
  'lease_billing_terms',
  'lease billing uses a typed effective-dated authority'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'effective_from',
  'lease billing rules have an effective start date'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'effective_to',
  'lease billing rules preserve a bounded effective range'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'collection_route',
  'the rent collection route is explicit'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'management_fee_mode',
  'management fees distinguish flat and percentage rules'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'management_fee_value',
  'management fee value is stored separately from rent'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'billing_recipient_kind',
  'billing can target an individual or company'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'billing_recipient_person_id',
  'billing resolves to one organization person record'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'first_period_prorated_amount',
  'the agreed first-period amount is explicit when prorated'
);

SELECT has_column(
  'public',
  'lease_billing_terms',
  'final_period_prorated_amount',
  'the agreed final-period amount is explicit when prorated'
);

SELECT has_function(
  'public',
  'resolve_lease_billing_term',
  ARRAY['uuid', 'uuid', 'date'],
  'one checked boundary resolves the applicable lease billing rule'
);

SELECT has_function(
  'public',
  'set_lease_billing_term',
  ARRAY[
    'uuid', 'uuid', 'date', 'text', 'text', 'numeric', 'boolean',
    'boolean', 'text', 'uuid', 'numeric', 'numeric', 'uuid', 'text'
  ],
  'one checked mutation creates or schedules a lease billing rule'
);

SELECT table_privs_are(
  'public',
  'lease_billing_terms',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers cannot bypass the checked billing mutation'
);

SELECT has_index(
  'public',
  'lease_billing_terms',
  'lease_billing_terms_resolution_idx',
  'billing resolution has a lease and effective-date index'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.lease_billing_terms'::regclass
      AND conname = 'lease_billing_terms_billing_recipient_fkey'
      AND contype = 'f'
  ),
  'billing recipients remain organization-scoped people'
);

SELECT * FROM finish();
ROLLBACK;
