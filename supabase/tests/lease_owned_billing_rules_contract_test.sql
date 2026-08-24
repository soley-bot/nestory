BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(10);

SELECT has_function(
  'public',
  'create_lease_with_billing_rules',
  ARRAY[
    'uuid','uuid','uuid','uuid','date','date','numeric','currency_code',
    'integer','text','text','numeric','currency_code','text','jsonb','jsonb','text'
  ],
  'new leases use one checked lease, relationship, term, deposit, and billing write'
);

SELECT has_function(
  'public',
  'create_lease_with_deposit_receipt',
  ARRAY[
    'uuid','uuid','uuid','uuid','date','date','numeric','currency_code',
    'integer','text','text','numeric','currency_code','text','jsonb','jsonb',
    'boolean','numeric','date','text'
  ],
  'lease creation can atomically add an optional deposit receipt'
);

SELECT has_function(
  'public',
  'update_lease_with_billing_rules',
  ARRAY[
    'uuid','uuid','uuid','uuid','uuid','date','date','numeric','currency_code',
    'integer','text','text','numeric','currency_code','text','jsonb','text'
  ],
  'draft lease and unused initial billing edits share one checked write'
);

SELECT has_function(
  'public',
  'save_lease_billing_rules',
  ARRAY['uuid','uuid','jsonb','uuid','text'],
  'legacy repair and active forward replacements share the lease-owned authority'
);

SELECT function_privs_are(
  'public',
  'create_lease_with_billing_rules',
  ARRAY[
    'uuid','uuid','uuid','uuid','date','date','numeric','currency_code',
    'integer','text','text','numeric','currency_code','text','jsonb','jsonb','text'
  ],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated operators can reach only the checked creation boundary'
);

SELECT function_privs_are(
  'public',
  'create_lease_with_deposit_receipt',
  ARRAY[
    'uuid','uuid','uuid','uuid','date','date','numeric','currency_code',
    'integer','text','text','numeric','currency_code','text','jsonb','jsonb',
    'boolean','numeric','date','text'
  ],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated operators reach the atomic obligation and receipt boundary'
);

SELECT function_privs_are(
  'public',
  'save_lease_billing_rules',
  ARRAY['uuid','uuid','jsonb','uuid','text'],
  'anon',
  ARRAY[]::text[],
  'anonymous callers cannot repair or replace lease billing rules'
);

SELECT function_privs_are(
  'app_private',
  'normalize_lease_billing_rule',
  ARRAY['uuid','uuid','date','jsonb'],
  'authenticated',
  ARRAY[]::text[],
  'billing snapshot validation remains behind checked commands'
);

SELECT table_privs_are(
  'public',
  'lease_billing_terms',
  'authenticated',
  ARRAY['SELECT'],
  'billing rule history remains read-only outside checked commands'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tenant_invoices'::regclass
      AND conname = 'tenant_invoices_billing_term_fkey'
      AND contype = 'f'
  ),
  'existing invoices retain their original billing rule reference'
);

SELECT * FROM finish();
ROLLBACK;
