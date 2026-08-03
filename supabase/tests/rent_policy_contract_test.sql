BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(11);

SELECT has_table(
  'public',
  'rent_policy_versions',
  'rent policy uses a normalized versioned authority'
);

SELECT has_column(
  'public',
  'rent_policy_versions',
  'effective_from',
  'rent policy versions are effective dated'
);

SELECT has_column(
  'public',
  'rent_policy_versions',
  'supported_frequencies',
  'rent policy records explicitly supported frequencies'
);

SELECT has_column(
  'public',
  'rent_policy_versions',
  'rent_calculation_timezone',
  'rent policy records its calculation timezone'
);

SELECT has_column(
  'public',
  'rent_policy_versions',
  'short_month_due_day_rule',
  'rent policy records the short-month due-day rule'
);

SELECT has_column(
  'public',
  'rent_policy_versions',
  'lease_start_proration_rule',
  'rent policy records the lease-start proration rule'
);

SELECT has_column(
  'public',
  'rent_policy_versions',
  'lease_end_proration_rule',
  'rent policy records the lease-end proration rule'
);

SELECT has_function(
  'public',
  'resolve_lease_rent_readiness',
  ARRAY['uuid', 'uuid', 'date'],
  'one checked boundary returns typed lease rent readiness'
);

SELECT has_function(
  'public',
  'create_rent_policy_draft',
  ARRAY['uuid', 'date', 'text'],
  'admins can create unresolved draft policy versions without defaults'
);

SELECT has_function(
  'public',
  'approve_rent_policy_version',
  ARRAY['uuid', 'uuid'],
  'admins approve only complete policy versions'
);

SELECT table_privs_are(
  'public',
  'rent_policy_versions',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers cannot bypass checked policy mutations'
);

SELECT * FROM finish();
ROLLBACK;
