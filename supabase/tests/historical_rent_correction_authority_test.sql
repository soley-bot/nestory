BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

SELECT has_function(
  'public',
  'preview_historical_rent_correction',
  ARRAY['uuid', 'uuid', 'numeric', 'integer'],
  'a checked historical-rent preview authority exists'
);

SELECT has_function(
  'public',
  'correct_historical_rent',
  ARRAY['uuid', 'uuid', 'numeric', 'integer', 'text', 'text', 'text'],
  'a checked historical-rent correction authority exists'
);

SELECT has_table(
  'public',
  'historical_rent_settlement_reapplications',
  'settlement reversal and reapplication identities are append-only evidence'
);

SELECT has_table(
  'public',
  'tenant_credit_occurrences',
  'settled decreases have explicit tenant-credit liability evidence'
);

SELECT has_column(
  'public',
  'tenant_invoice_lines',
  'supersedes_line_id',
  'replacement invoice lines retain obligation lineage'
);

SELECT has_column(
  'public',
  'finance_income_items',
  'supersedes_income_item_id',
  'replacement finance obligations retain source lineage'
);

SELECT has_column(
  'public',
  'finance_income_items',
  'correction_occurrence_id',
  'replacement finance obligations identify their correction occurrence'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.preview_historical_rent_correction(uuid,uuid,numeric,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.preview_historical_rent_correction(uuid,uuid,numeric,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.preview_historical_rent_correction(uuid,uuid,numeric,integer)',
    'EXECUTE'
  ),
  'preview is exposed only to authenticated application callers'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)',
    'EXECUTE'
  ),
  'execution is exposed only to authenticated application callers'
);

SELECT ok(
  (
    SELECT
      procedure.prosecdef
      AND procedure.proowner = 'postgres'::regrole
      AND coalesce(
        procedure.proconfig @> ARRAY['search_path=""']::text[],
        false
      )
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid =
      'public.preview_historical_rent_correction(uuid,uuid,numeric,integer)'::regprocedure
  ),
  'preview is postgres-owned SECURITY DEFINER with an empty search path'
);

SELECT ok(
  (
    SELECT
      procedure.prosecdef
      AND procedure.proowner = 'postgres'::regrole
      AND coalesce(
        procedure.proconfig @> ARRAY['search_path=""']::text[],
        false
      )
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid =
      'public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)'::regprocedure
  ),
  'execution is postgres-owned SECURITY DEFINER with an empty search path'
);

SELECT ok(
  (
    SELECT relation.relrowsecurity AND relation.relforcerowsecurity
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'historical_rent_settlement_reapplications'
  ),
  'settlement lineage forces row-level security'
);

SELECT ok(
  (
    SELECT relation.relrowsecurity AND relation.relforcerowsecurity
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'tenant_credit_occurrences'
  ),
  'tenant-credit evidence forces row-level security'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'public.tenant_invoice_corrections', 'INSERT'
  )
  AND NOT has_table_privilege(
    'authenticated', 'public.tenant_invoice_lines', 'INSERT'
  )
  AND NOT has_table_privilege(
    'authenticated', 'public.finance_income_items', 'INSERT'
  )
  AND NOT has_table_privilege(
    'authenticated', 'public.management_fee_occurrences', 'INSERT'
  )
  AND NOT has_table_privilege(
    'authenticated', 'public.owner_invoice_lines', 'INSERT'
  ),
  'authenticated callers cannot bypass the checked RPC with direct DML'
);

SELECT * FROM finish();
ROLLBACK;
