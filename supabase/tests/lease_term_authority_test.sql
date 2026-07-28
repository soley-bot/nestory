BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(19);

SELECT has_column(
  'public',
  'lease_terms',
  'authority_kind',
  'lease terms distinguish authoritative rows from legacy inferred evidence'
);

SELECT has_column(
  'public',
  'lease_terms',
  'supersedes_term_id',
  'lease terms preserve replacement lineage'
);

SELECT has_column(
  'public',
  'lease_terms',
  'confirmed_at',
  'lease terms record explicit confirmation time'
);

SELECT has_column(
  'public',
  'lease_terms',
  'confirmed_by',
  'lease terms record the confirming actor'
);

SELECT has_function(
  'public',
  'resolve_authoritative_lease_term',
  ARRAY['uuid', 'uuid', 'date'],
  'one checked boundary resolves authoritative lease terms'
);

SELECT has_function(
  'public',
  'create_authoritative_lease_term',
  ARRAY[
    'uuid', 'uuid', 'date', 'date', 'numeric', 'currency_code', 'integer',
    'text', 'text', 'uuid', 'text'
  ],
  'one checked boundary creates explicit authoritative lease terms'
);

SELECT has_function(
  'public',
  'schedule_authoritative_lease_term',
  ARRAY[
    'uuid', 'uuid', 'date', 'date', 'numeric', 'currency_code', 'integer',
    'text', 'uuid', 'text'
  ],
  'one checked boundary schedules future authoritative terms'
);

SELECT has_function(
  'public',
  'correct_authoritative_lease_term',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric', 'currency_code',
    'integer', 'text', 'text', 'text'
  ],
  'draft and future corrections preserve term lineage'
);

SELECT has_function(
  'public',
  'confirm_legacy_lease_term',
  ARRAY['uuid', 'uuid', 'uuid', 'integer', 'text', 'text', 'text'],
  'legacy evidence requires explicit checked confirmation'
);

SELECT has_function(
  'public',
  'terminate_authoritative_lease_term',
  ARRAY['uuid', 'uuid', 'uuid', 'date', 'text'],
  'authoritative term termination preserves history'
);

SELECT has_function(
  'app_private',
  'lock_open_lease_term_periods',
  ARRAY['uuid', 'uuid', 'currency_code', 'date', 'date'],
  'term mutations share Plan 03 authority across every affected month'
);

SELECT function_privs_are(
  'app_private',
  'lock_open_lease_term_periods',
  ARRAY['uuid', 'uuid', 'currency_code', 'date', 'date'],
  'authenticated',
  ARRAY[]::text[],
  'callers cannot bypass checked term mutations through the private lock helper'
);

SELECT table_privs_are(
  'public',
  'lease_terms',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers cannot bypass checked term mutations'
);

SELECT table_privs_are(
  'public',
  'lease_terms',
  'service_role',
  ARRAY['SELECT'],
  'service-role callers cannot bypass checked term mutations'
);

SELECT hasnt_table(
  'app_private',
  'lease_authority_idempotency_requests',
  'lease authority reuses the shared Plan 03 financial idempotency kernel'
);

SELECT is(
  position(
    'test-fixture-v1' IN (
      SELECT pg_get_functiondef(
        'app_private.guard_checked_lease_creation()'::regprocedure
      )
    )
  ),
  0,
  'lease creation guard has no fixture-only bypass context'
);

SELECT is(
  (
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lease_terms'
      AND column_name = 'authority_kind'
  ),
  '''legacy_inferred''::text',
  'pre-existing and compatibility-derived terms default to legacy inferred'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_trigger
    WHERE tgrelid = 'public.leases'::regclass
      AND tgname = 'sync_leases_backbone_records'
      AND NOT tgisinternal
  ),
  1,
  'the existing lease backbone trigger remains present for non-economic records'
);

SELECT is_empty(
  $$
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'lease_charge_occurrences'
  $$,
  'Plan 04 does not introduce rent charge occurrences'
);

SELECT * FROM finish();
ROLLBACK;
