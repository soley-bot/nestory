BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_class sequence_record
    JOIN pg_namespace schema_record
      ON schema_record.oid = sequence_record.relnamespace
    WHERE sequence_record.relkind = 'S'
      AND schema_record.nspname = 'public'
  ),
  'the public schema has existing sequences covered by the privilege contract'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class sequence_record
    JOIN pg_namespace schema_record
      ON schema_record.oid = sequence_record.relnamespace
    WHERE CASE
      WHEN sequence_record.relkind = 'S'
        AND schema_record.nspname = 'public'
      THEN has_sequence_privilege('anon', sequence_record.oid, 'UPDATE')
      ELSE false
    END
  ),
  0::bigint,
  'anon cannot update any existing public sequence'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class sequence_record
    JOIN pg_namespace schema_record
      ON schema_record.oid = sequence_record.relnamespace
    WHERE CASE
      WHEN sequence_record.relkind = 'S'
        AND schema_record.nspname = 'public'
      THEN has_sequence_privilege('authenticated', sequence_record.oid, 'UPDATE')
      ELSE false
    END
  ),
  0::bigint,
  'authenticated cannot update any existing public sequence'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class sequence_record
    JOIN pg_namespace schema_record
      ON schema_record.oid = sequence_record.relnamespace
    WHERE CASE
      WHEN sequence_record.relkind = 'S'
        AND schema_record.nspname = 'public'
      THEN NOT has_sequence_privilege('service_role', sequence_record.oid, 'UPDATE')
      ELSE false
    END
  ),
  0::bigint,
  'service_role can update every existing public sequence'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class sequence_record
    JOIN pg_namespace schema_record
      ON schema_record.oid = sequence_record.relnamespace
    WHERE CASE
      WHEN sequence_record.relkind = 'S'
        AND schema_record.nspname = 'public'
      THEN NOT has_sequence_privilege('postgres', sequence_record.oid, 'UPDATE')
      ELSE false
    END
  ),
  0::bigint,
  'postgres can update every existing public sequence'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl default_acl
    JOIN pg_namespace schema_record
      ON schema_record.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege_record
    WHERE default_acl.defaclrole = 'postgres'::regrole
      AND default_acl.defaclobjtype = 'S'
      AND schema_record.nspname = 'public'
      AND privilege_record.grantee = 'anon'::regrole
      AND privilege_record.privilege_type = 'UPDATE'
  ),
  'postgres defaults do not grant anon UPDATE on future public sequences'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl default_acl
    JOIN pg_namespace schema_record
      ON schema_record.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege_record
    WHERE default_acl.defaclrole = 'postgres'::regrole
      AND default_acl.defaclobjtype = 'S'
      AND schema_record.nspname = 'public'
      AND privilege_record.grantee = 'authenticated'::regrole
      AND privilege_record.privilege_type = 'UPDATE'
  ),
  'postgres defaults do not grant authenticated UPDATE on future public sequences'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_default_acl default_acl
    JOIN pg_namespace schema_record
      ON schema_record.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege_record
    WHERE default_acl.defaclrole = 'postgres'::regrole
      AND default_acl.defaclobjtype = 'S'
      AND schema_record.nspname = 'public'
      AND privilege_record.grantee = 'service_role'::regrole
      AND privilege_record.privilege_type = 'UPDATE'
  ),
  'postgres defaults preserve service_role UPDATE on future public sequences'
);

CREATE SEQUENCE public.sequence_update_privileges_probe;

SELECT ok(
  NOT has_sequence_privilege(
    'anon',
    'public.sequence_update_privileges_probe',
    'UPDATE'
  ),
  'a postgres-created public sequence does not grant anon UPDATE'
);

SELECT ok(
  NOT has_sequence_privilege(
    'authenticated',
    'public.sequence_update_privileges_probe',
    'UPDATE'
  ),
  'a postgres-created public sequence does not grant authenticated UPDATE'
);

SELECT ok(
  has_sequence_privilege(
    'service_role',
    'public.sequence_update_privileges_probe',
    'UPDATE'
  ),
  'a postgres-created public sequence preserves service_role UPDATE'
);

SELECT ok(
  has_sequence_privilege(
    'postgres',
    'public.sequence_update_privileges_probe',
    'UPDATE'
  ),
  'a postgres-created public sequence preserves postgres UPDATE'
);

SELECT * FROM finish();

ROLLBACK;
