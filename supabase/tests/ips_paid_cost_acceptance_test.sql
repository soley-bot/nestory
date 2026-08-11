BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

SELECT has_function(
  'public',
  'submit_expense',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'date',
    'numeric', 'numeric', 'currency_code', 'text', 'uuid', 'uuid', 'uuid',
    'uuid', 'text', 'text'
  ],
  'paid cost submission retains one checked financial command'
);

SELECT has_function(
  'public',
  'review_expense',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'uuid'],
  'paid cost review retains one checked maker-checker command'
);

SELECT has_function(
  'public',
  'reverse_expense',
  ARRAY['uuid', 'uuid', 'date', 'text', 'text'],
  'paid cost reversal retains one checked append-only command'
);

SELECT ok(
  to_regprocedure(
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)'
  ) IS NOT NULL,
  'service verification can resolve one exact paid-cost Storage object'
);

SELECT ok(
  to_regprocedure(
    'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)'
  ) IS NOT NULL,
  'service verification can register one immutable paid-cost document'
);

SELECT ok(
  (
    SELECT strpos(
      pg_catalog.pg_get_functiondef(
        'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
      ),
      'IF p_supporting_document_id IS NULL THEN'
    ) > 0
  ),
  'general paid-cost submission requires an immutable document even when a reference exists'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot inspect unregistered paid-cost Storage objects'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot forge paid-cost evidence registration metadata'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)',
    'EXECUTE'
  ),
  'only the trusted server service boundary can inspect and register evidence'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.submit_expense_baseline(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'app_private.submit_expense_baseline(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'no application role can bypass the strict public paid-cost wrapper'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'the checked paid-cost command is exposed only to authenticated actors'
);

SELECT ok(
  (
    SELECT
      routine.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'postgres')
      AND routine.prosecdef
      AND coalesce(
        pg_catalog.array_to_string(routine.proconfig, ','),
        ''
      ) = 'search_path=""'
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = 'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ),
  'the public paid-cost wrapper is postgres-owned, checked, and search-path locked'
);

SELECT ok(
  (
    SELECT routine.prosecdef
      AND coalesce(
        pg_catalog.array_to_string(routine.proconfig, ','),
        ''
      ) = 'search_path=""'
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = 'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)'::regprocedure
  ),
  'verified evidence registration is a search-path-locked definer boundary'
);

SELECT ok(
  (
    SELECT
      strpos(policy.qual, '/paid-cost-evidence/%') > 0
      AND policy.cmd = 'DELETE'
    FROM pg_catalog.pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'Admins can delete Nestory documents'
  ),
  'authenticated document cleanup cannot delete the paid-cost evidence namespace'
);

SELECT * FROM finish();
ROLLBACK;
