BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT has_function(
  'public',
  'restore_financial_reconciliation_source',
  ARRAY['uuid', 'uuid'],
  'checked funding-source restore authority exists'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'anon',
      to_regprocedure('public.restore_financial_reconciliation_source(uuid,uuid)'),
      'EXECUTE'
    ),
    false
  )
  AND coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('public.restore_financial_reconciliation_source(uuid,uuid)'),
      'EXECUTE'
    ),
    false
  ),
  'restore is unavailable to anon and exposed only through the authenticated checked boundary'
);

CREATE TEMP TABLE source_management_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_one_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_two_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_one_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_two_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_reader_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_role_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO source_management_state DEFAULT VALUES;
GRANT SELECT ON source_management_state TO authenticated;

INSERT INTO auth.users (id, email)
SELECT super_admin_id, 'source-super@example.test' FROM source_management_state
UNION ALL
SELECT finance_reader_id, 'source-reader@example.test' FROM source_management_state
UNION ALL
SELECT other_super_admin_id, 'source-other-super@example.test' FROM source_management_state;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Funding source workspace', 'source-' || left(organization_id::text, 8)
FROM source_management_state
UNION ALL
SELECT other_organization_id, 'Other funding source workspace', 'source-other-' || left(other_organization_id::text, 8)
FROM source_management_state;

INSERT INTO public.organization_branches (id, organization_id, name, code, status)
SELECT branch_one_id, organization_id, 'Branch one', 'SRC-ONE', 'active'
FROM source_management_state
UNION ALL
SELECT branch_two_id, organization_id, 'Branch two', 'SRC-TWO', 'active'
FROM source_management_state;

INSERT INTO public.organization_roles (id, organization_id, name, status)
SELECT finance_role_id, organization_id, 'Finance reader', 'active'
FROM source_management_state;

INSERT INTO public.organization_role_permissions (
  organization_id,
  role_id,
  permission_key
)
SELECT organization_id, finance_role_id, 'finance.view'
FROM source_management_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  branch_id,
  custom_role_id
)
SELECT organization_id, super_admin_id, 'super_admin', NULL, NULL
FROM source_management_state
UNION ALL
SELECT organization_id, finance_reader_id, 'custom', branch_one_id, finance_role_id
FROM source_management_state
UNION ALL
SELECT other_organization_id, other_super_admin_id, 'super_admin', NULL, NULL
FROM source_management_state;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id = (SELECT organization_id FROM source_management_state);

SELECT pg_catalog.set_config(
  'app.property_branch_assignment_context',
  (
    SELECT capability_token
    FROM app_private.property_branch_assignment_context_capability
    WHERE singleton
  ),
  true
);
SELECT pg_catalog.set_config(
  'app.property_creation_branch_id',
  (SELECT branch_one_id::text FROM source_management_state),
  true
);

INSERT INTO public.properties (
  id,
  organization_id,
  branch_id,
  name,
  code,
  property_type,
  rental_structure
)
SELECT property_one_id, organization_id, branch_one_id, 'Source property one', 'SRC-P1', 'apartment', 'multi_unit'
FROM source_management_state;

SELECT pg_catalog.set_config(
  'app.property_creation_branch_id',
  (SELECT branch_two_id::text FROM source_management_state),
  true
);

INSERT INTO public.properties (
  id,
  organization_id,
  branch_id,
  name,
  code,
  property_type,
  rental_structure
)
SELECT property_two_id, organization_id, branch_two_id, 'Source property two', 'SRC-P2', 'apartment', 'multi_unit'
FROM source_management_state;

SELECT pg_catalog.set_config('app.property_creation_branch_id', '', true);
SELECT pg_catalog.set_config('app.property_branch_assignment_context', 'off', true);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM source_management_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.create_financial_reconciliation_source(%L,%L,%L,%L,%L,%L,%L,NULL)',
    (SELECT organization_id FROM source_management_state),
    'BRANCH_ONE_BANK',
    'Branch one bank',
    'bank',
    'property_dedicated',
    'USD',
    (SELECT property_one_id FROM source_management_state)
  ),
  'Super Admin can create a property-dedicated bank source through the checked RPC'
);
SELECT lives_ok(
  format(
    'SELECT public.create_financial_reconciliation_source(%L,%L,%L,%L,%L,%L,%L,NULL)',
    (SELECT organization_id FROM source_management_state),
    'BRANCH_TWO_CASH',
    'Branch two cash',
    'cash',
    'property_dedicated',
    'USD',
    (SELECT property_two_id FROM source_management_state)
  ),
  'Super Admin can create a second branch source for RLS isolation proof'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_reader_id::text FROM source_management_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT code
    FROM public.financial_reconciliation_sources
    ORDER BY code
  $$,
  $$ VALUES ('BRANCH_ONE_BANK'::text), ('IPS_COLLECTIONS'::text) $$,
  'a branch Finance reader sees organization-pooled sources plus dedicated sources in the assigned branch'
);

SELECT throws_ok(
  format(
    'SELECT public.archive_financial_reconciliation_source(%L,%L)',
    (SELECT organization_id FROM source_management_state),
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = (SELECT organization_id FROM source_management_state)
        AND code = 'BRANCH_ONE_BANK'
    )
  ),
  '42501',
  'Not authorized',
  'a Finance reader cannot archive a funding source'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM source_management_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.archive_financial_reconciliation_source(%L,%L)',
    (SELECT organization_id FROM source_management_state),
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = (SELECT organization_id FROM source_management_state)
        AND code = 'BRANCH_ONE_BANK'
    )
  ),
  'Super Admin can archive a funding source without deleting history'
);
SELECT lives_ok(
  format(
    'SELECT public.restore_financial_reconciliation_source(%L,%L)',
    (SELECT organization_id FROM source_management_state),
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = (SELECT organization_id FROM source_management_state)
        AND code = 'BRANCH_ONE_BANK'
    )
  ),
  'Super Admin can restore an archived funding source'
);
SELECT is(
  (
    SELECT archived_at
    FROM public.financial_reconciliation_sources
    WHERE organization_id = (SELECT organization_id FROM source_management_state)
      AND code = 'BRANCH_ONE_BANK'
  ),
  NULL::timestamptz,
  'restore clears the archived lifecycle marker'
);

SELECT lives_ok(
  format(
    'SELECT public.archive_financial_reconciliation_source(%L,%L)',
    (SELECT organization_id FROM source_management_state),
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = (SELECT organization_id FROM source_management_state)
        AND code = 'BRANCH_ONE_BANK'
    )
  ),
  'source can be archived before its dedicated Property is retired'
);
RESET ROLE;

UPDATE public.properties
SET archived_at = now()
WHERE id = (SELECT property_one_id FROM source_management_state);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.restore_financial_reconciliation_source(%L,%L)',
    (SELECT organization_id FROM source_management_state),
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = (SELECT organization_id FROM source_management_state)
        AND code = 'BRANCH_ONE_BANK'
    )
  ),
  '55000',
  'Dedicated funding source property is archived',
  'restore fails closed when a dedicated source points to an archived Property'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT other_super_admin_id::text FROM source_management_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.restore_financial_reconciliation_source(%L,%L)',
    (SELECT organization_id FROM source_management_state),
    (
      SELECT id
      FROM public.financial_reconciliation_sources
      WHERE organization_id = (SELECT organization_id FROM source_management_state)
        AND code = 'BRANCH_ONE_BANK'
    )
  ),
  '42501',
  'Not authorized',
  'restore authority never crosses organizations'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
