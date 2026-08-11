BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(6);

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
    'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,bigint,text,uuid,text,text)'
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

SELECT * FROM finish();
ROLLBACK;
