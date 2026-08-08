BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(20);

SELECT has_view(
  'public',
  'current_leases',
  'current_leases is the canonical read model'
);

SELECT has_column(
  'public',
  'leases',
  'primary_tenant_person_id',
  'the Lease backbone keeps the canonical Tenant identity'
);

SELECT col_not_null(
  'public',
  'leases',
  'primary_tenant_person_id',
  'every Lease has a canonical primary Tenant'
);

SELECT hasnt_column('public', 'leases', 'tenant_name', 'Lease identity does not duplicate the Person display name');
SELECT hasnt_column('public', 'leases', 'lease_start_date', 'Lease identity does not duplicate term start');
SELECT hasnt_column('public', 'leases', 'lease_end_date', 'Lease identity does not duplicate term end');
SELECT hasnt_column('public', 'leases', 'rent_amount', 'Lease identity does not duplicate term rent');
SELECT hasnt_column('public', 'leases', 'rent_currency', 'Lease identity does not duplicate term currency');

SELECT is(
  (
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lease_terms'
      AND column_name = 'authority_kind'
  ),
  '''authoritative''::text',
  'new Lease terms are authoritative by default'
);

SELECT is_empty(
  $$
    SELECT 1
    FROM public.lease_terms
    WHERE authority_kind <> 'authoritative'
  $$,
  'all Lease terms use one authority model'
);

SELECT is_empty(
  $$
    SELECT 1
    FROM public.lease_parties
    WHERE evidence_state NOT IN ('accepted', 'superseded', 'voided')
  $$,
  'Lease parties use canonical evidence states'
);

SELECT is_empty(
  $$
    SELECT 1
    FROM public.lease_occupancies
    WHERE evidence_state NOT IN ('accepted', 'superseded', 'voided')
  $$,
  'Lease occupancies use canonical evidence states'
);

SELECT has_function(
  'public',
  'create_lease_with_relationships',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric',
    'currency_code', 'integer', 'text', 'text', 'numeric',
    'currency_code', 'text', 'jsonb', 'text'
  ],
  'Lease creation atomically accepts identity, term, and relationships'
);

SELECT has_function(
  'public',
  'create_authoritative_lease_term',
  ARRAY[
    'uuid', 'uuid', 'date', 'date', 'numeric', 'currency_code',
    'integer', 'text', 'text', 'uuid', 'text'
  ],
  'term creation has one checked command'
);

SELECT has_function(
  'public',
  'schedule_authoritative_lease_term',
  ARRAY[
    'uuid', 'uuid', 'date', 'date', 'numeric', 'currency_code',
    'integer', 'text', 'uuid', 'text'
  ],
  'future rent changes have one checked command'
);

SELECT has_function(
  'public',
  'correct_authoritative_lease_term',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric', 'currency_code',
    'integer', 'text', 'text', 'text'
  ],
  'term correction preserves explicit lineage'
);

SELECT has_function(
  'public',
  'terminate_authoritative_lease_term',
  ARRAY['uuid', 'uuid', 'uuid', 'date', 'text'],
  'term termination has one checked command'
);

SELECT has_function(
  'public',
  'resolve_authoritative_lease_term',
  ARRAY['uuid', 'uuid', 'date'],
  'term resolution uses explicit effective dates'
);

SELECT table_privs_are(
  'public',
  'lease_terms',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers cannot bypass Lease term commands'
);

SELECT function_privs_are(
  'app_private',
  'create_lease_record_internal',
  ARRAY['uuid', 'uuid', 'uuid', 'uuid', 'numeric', 'currency_code', 'text'],
  'authenticated',
  ARRAY[]::text[],
  'the Lease identity writer stays behind checked commands'
);

SELECT * FROM finish();
ROLLBACK;
