BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(32);

SELECT table_privs_are(
  'public',
  'lease_parties',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers have read-only Lease-party privileges'
);

SELECT table_privs_are(
  'public',
  'lease_parties',
  'service_role',
  ARRAY['SELECT'],
  'service role has read-only Lease-party privileges'
);

SELECT table_privs_are(
  'public',
  'lease_parties',
  'anon',
  ARRAY[]::text[],
  'anonymous callers have no Lease-party privileges'
);

SELECT table_privs_are(
  'public',
  'lease_occupancies',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated callers have read-only Lease-occupancy privileges'
);

SELECT table_privs_are(
  'public',
  'lease_occupancies',
  'service_role',
  ARRAY['SELECT'],
  'service role has read-only Lease-occupancy privileges'
);

SELECT table_privs_are(
  'public',
  'lease_occupancies',
  'anon',
  ARRAY[]::text[],
  'anonymous callers have no Lease-occupancy privileges'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.leases', 'DELETE'),
  'authenticated callers cannot delete Lease history'
);

SELECT ok(
  NOT has_table_privilege('service_role', 'public.leases', 'DELETE'),
  'service role cannot delete Lease history'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.leases', 'TRUNCATE'),
  'authenticated callers cannot truncate Lease history'
);

SELECT ok(
  NOT has_table_privilege('service_role', 'public.leases', 'TRUNCATE'),
  'service role cannot truncate Lease history'
);

SELECT function_privs_are(
  'public',
  'update_lease',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric',
    'currency_code', 'numeric', 'currency_code', 'text'
  ],
  'authenticated',
  ARRAY[]::text[],
  'authenticated callers cannot execute the legacy Lease update'
);

SELECT function_privs_are(
  'public',
  'update_lease',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'numeric',
    'currency_code', 'numeric', 'currency_code', 'text'
  ],
  'service_role',
  ARRAY[]::text[],
  'service role cannot execute the legacy Lease update'
);

SELECT function_privs_are(
  'public',
  'restore_lease',
  ARRAY['uuid', 'uuid'],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated callers reach only the fail-closed Lease restore wrapper'
);

SELECT function_privs_are(
  'public',
  'restore_lease',
  ARRAY['uuid', 'uuid'],
  'service_role',
  ARRAY[]::text[],
  'service role cannot execute Lease restore'
);

SELECT has_function(
  'app_private',
  'guard_lease_history_mutation',
  ARRAY[]::text[],
  'one private trigger guard protects Lease-party and occupancy history'
);

SELECT function_privs_are(
  'app_private',
  'guard_lease_history_mutation',
  ARRAY[]::text[],
  'authenticated',
  ARRAY[]::text[],
  'authenticated callers cannot execute the private history guard'
);

SELECT function_privs_are(
  'app_private',
  'guard_lease_history_mutation',
  ARRAY[]::text[],
  'service_role',
  ARRAY[]::text[],
  'service role cannot execute the private history guard'
);

SELECT has_trigger(
  'public',
  'lease_parties',
  'guard_lease_party_history_mutation',
  'Lease-party history has a defense-in-depth mutation trigger'
);

SELECT has_trigger(
  'public',
  'lease_occupancies',
  'guard_lease_occupancy_history_mutation',
  'Lease-occupancy history has a defense-in-depth mutation trigger'
);

SELECT has_trigger(
  'public',
  'leases',
  'guard_lease_history_transition',
  'Lease header history has a defense-in-depth transition guard'
);

SELECT has_trigger(
  'public',
  'leases',
  'sync_leases_backbone_records',
  'the Lease backbone compatibility trigger remains installed'
);

SELECT is(
  (
    SELECT routines.prosecdef
    FROM pg_catalog.pg_proc AS routines
    WHERE routines.oid =
      'public.sync_lease_backbone_records()'::regprocedure
  ),
  true,
  'the compatibility trigger owns its minimum internal write capability'
);

SELECT is(
  (
    SELECT pg_catalog.pg_get_userbyid(routines.proowner)
    FROM pg_catalog.pg_proc AS routines
    WHERE routines.oid =
      'public.sync_lease_backbone_records()'::regprocedure
  ),
  'postgres',
  'the privileged compatibility trigger is owned by the trusted postgres role'
);

SELECT is(
  (
    SELECT array_to_string(routines.proconfig, ',')
    FROM pg_catalog.pg_proc AS routines
    WHERE routines.oid =
      'public.sync_lease_backbone_records()'::regprocedure
  ),
  'search_path=""',
  'the privileged compatibility trigger has an empty search path'
);

SELECT function_privs_are(
  'public',
  'sync_lease_backbone_records',
  ARRAY[]::text[],
  'authenticated',
  ARRAY[]::text[],
  'authenticated callers cannot invoke the privileged compatibility trigger'
);

SELECT function_privs_are(
  'public',
  'sync_lease_backbone_records',
  ARRAY[]::text[],
  'service_role',
  ARRAY[]::text[],
  'service role cannot invoke the privileged compatibility trigger'
);

SELECT is(
  (
    SELECT tables.relrowsecurity
    FROM pg_catalog.pg_class AS tables
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = tables.relnamespace
    WHERE schemas.nspname = 'public'
      AND tables.relname = 'lease_parties'
  ),
  true,
  'Lease-party history keeps RLS enabled'
);

SELECT is(
  (
    SELECT tables.relrowsecurity
    FROM pg_catalog.pg_class AS tables
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = tables.relnamespace
    WHERE schemas.nspname = 'public'
      AND tables.relname = 'lease_occupancies'
  ),
  true,
  'Lease-occupancy history keeps RLS enabled'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_policy AS policies
    JOIN pg_catalog.pg_class AS tables
      ON tables.oid = policies.polrelid
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = tables.relnamespace
    WHERE schemas.nspname = 'public'
      AND tables.relname = 'lease_parties'
      AND policies.polcmd <> 'r'
  ),
  0::bigint,
  'Lease-party history has no direct mutation policy'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_policy AS policies
    JOIN pg_catalog.pg_class AS tables
      ON tables.oid = policies.polrelid
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = tables.relnamespace
    WHERE schemas.nspname = 'public'
      AND tables.relname = 'lease_occupancies'
      AND policies.polcmd <> 'r'
  ),
  0::bigint,
  'Lease-occupancy history has no direct mutation policy'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_policy AS policies
    JOIN pg_catalog.pg_class AS tables
      ON tables.oid = policies.polrelid
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = tables.relnamespace
    WHERE schemas.nspname = 'public'
      AND tables.relname = 'lease_parties'
      AND policies.polcmd = 'r'
  ),
  1::bigint,
  'Lease-party history retains one organization-scoped read policy'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_policy AS policies
    JOIN pg_catalog.pg_class AS tables
      ON tables.oid = policies.polrelid
    JOIN pg_catalog.pg_namespace AS schemas
      ON schemas.oid = tables.relnamespace
    WHERE schemas.nspname = 'public'
      AND tables.relname = 'lease_occupancies'
      AND policies.polcmd = 'r'
  ),
  1::bigint,
  'Lease-occupancy history retains one organization-scoped read policy'
);

SELECT * FROM finish();
ROLLBACK;
