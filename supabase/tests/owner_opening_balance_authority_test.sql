BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_type AS type_row
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = type_row.typnamespace
    WHERE namespace_row.nspname = 'public'
      AND type_row.typname = 'owner_balance_component'
      AND type_row.typtype = 'e'
  ),
  'owner balance components use a durable PostgreSQL enum'
);

SELECT is(
  (
    SELECT jsonb_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder)
    FROM pg_type AS type_row
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = type_row.typnamespace
    JOIN pg_enum AS enum_value ON enum_value.enumtypid = type_row.oid
    WHERE namespace_row.nspname = 'public'
      AND type_row.typname = 'owner_balance_component'
  ),
  '["ips_held_owner_cash","owner_due_to_ips","ips_due_to_owner","security_deposit_custody"]'::jsonb,
  'the component enum contains exactly the four approved identities in stable order'
);

SELECT has_table(
  'public',
  'owner_opening_balance_requests',
  'opening requests have a dedicated authority table'
);

SELECT is(
  (
    SELECT jsonb_agg(column_name ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'owner_opening_balance_requests'
  ),
  '["id","organization_id","property_id","owner_person_id","property_owner_id","ownership_percent_snapshot","ownership_roster_hash","currency","effective_date","component","request_kind","proposed_amount","correction_of_entry_id","resubmission_of_request_id","status","reason","source_reference","supporting_document_id","evidence_sha256","payload_hash","submitted_at","submitted_by","reviewed_at","reviewed_by","review_reason","created_at"]'::jsonb,
  'opening requests expose exactly the approved immutable and review columns'
);

SELECT is(
  (
    SELECT jsonb_agg(
      jsonb_build_array(
        column_name,
        data_type,
        udt_schema,
        udt_name,
        is_nullable,
        coalesce(numeric_precision, 0),
        coalesce(numeric_scale, 0)
      )
      ORDER BY column_name
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'owner_opening_balance_requests'
      AND column_name IN (
        'ownership_percent_snapshot', 'currency', 'component', 'proposed_amount'
      )
  ),
  '[["component","USER-DEFINED","public","owner_balance_component","NO",0,0],["currency","USER-DEFINED","public","currency_code","NO",0,0],["ownership_percent_snapshot","numeric","pg_catalog","numeric","NO",6,3],["proposed_amount","numeric","pg_catalog","numeric","NO",14,2]]'::jsonb,
  'opening request authority and money types preserve exact approved precision'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'owner_opening_balance_requests'
      AND column_name IN (
        'id', 'organization_id', 'property_id', 'owner_person_id',
        'property_owner_id', 'ownership_percent_snapshot',
        'ownership_roster_hash', 'currency', 'effective_date', 'component',
        'request_kind', 'proposed_amount', 'status', 'reason',
        'evidence_sha256', 'payload_hash', 'submitted_at', 'submitted_by',
        'created_at'
      )
      AND is_nullable <> 'NO'
  ),
  'every required request authority field is non-null'
);

SELECT is(
  (
    SELECT jsonb_agg(conname ORDER BY conname)
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.owner_opening_balance_requests')
      AND contype = 'f'
  ),
  '["owner_opening_balance_requests_correction_target_fkey","owner_opening_balance_requests_document_fkey","owner_opening_balance_requests_organization_fkey","owner_opening_balance_requests_owner_person_fkey","owner_opening_balance_requests_property_fkey","owner_opening_balance_requests_property_owner_fkey","owner_opening_balance_requests_resubmission_fkey","owner_opening_balance_requests_reviewed_by_fkey","owner_opening_balance_requests_submitted_by_fkey"]'::jsonb,
  'request foreign keys prove organization, property, owner, roster row, evidence, actors, and same-org resubmission scope'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.owner_opening_balance_requests')
      AND conname = 'owner_opening_balance_requests_property_owner_fkey'
      AND pg_get_constraintdef(oid) =
        'FOREIGN KEY (organization_id, property_id, owner_person_id, property_owner_id) REFERENCES property_owners(organization_id, property_id, person_id, id) ON DELETE RESTRICT'
  ),
  'the ownership snapshot foreign key proves the full organization/property/owner roster scope'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.owner_opening_balance_requests')
      AND conname = 'owner_opening_balance_requests_correction_target_fkey'
      AND convalidated
  ),
  'Task 2.1B installs and validates the correction target FK only after creating the entry table'
);

SELECT is(
  (
    SELECT jsonb_agg(indexname ORDER BY indexname)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'owner_opening_balance_requests'
      AND indexname IN (
        'owner_opening_balance_requests_submitted_initial_uidx',
        'owner_opening_balance_requests_submitted_correction_uidx',
        'owner_opening_balance_requests_resubmission_uidx',
        'owner_opening_balance_requests_org_id_uidx'
      )
  ),
  '["owner_opening_balance_requests_org_id_uidx","owner_opening_balance_requests_resubmission_uidx","owner_opening_balance_requests_submitted_correction_uidx","owner_opening_balance_requests_submitted_initial_uidx"]'::jsonb,
  'concurrency and composite-scope unique indexes exist for submitted and resubmission identities'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'owner_opening_balance_requests'
      AND indexname = 'owner_opening_balance_requests_submitted_initial_uidx'
      AND indexdef LIKE '%organization_id, property_id, owner_person_id, currency, effective_date, component%'
      AND indexdef LIKE '%request_kind = ''initial''%'
      AND indexdef LIKE '%status = ''submitted''%'
  ),
  'only one submitted initial request can exist for an authority key'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'owner_opening_balance_requests'
      AND indexname = 'owner_opening_balance_requests_submitted_correction_uidx'
      AND indexdef LIKE '%correction_of_entry_id%'
      AND indexdef LIKE '%request_kind = ''correction''%'
      AND indexdef LIKE '%status = ''submitted''%'
  ),
  'only one submitted correction request can exist for an entry target'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.owner_opening_balance_requests')
      AND relrowsecurity
  ),
  'opening request rows enforce RLS'
);

SELECT is(
  (
    SELECT jsonb_agg(policyname ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'owner_opening_balance_requests'
  ),
  '["Finance roles can read owner opening requests"]'::jsonb,
  'the request table has one organization-scoped Finance read policy and no write policy'
);

SELECT ok(
  coalesce(
    has_table_privilege(
      'authenticated',
      to_regclass('public.owner_opening_balance_requests'),
      'SELECT'
    ),
    false
  )
  AND NOT coalesce(
    has_table_privilege(
      'anon',
      to_regclass('public.owner_opening_balance_requests'),
      'SELECT'
    ),
    false
  )
  AND NOT coalesce(
    has_table_privilege(
      'service_role',
      to_regclass('public.owner_opening_balance_requests'),
      'SELECT'
    ),
    false
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS relation_acl
    WHERE relation.oid = to_regclass('public.owner_opening_balance_requests')
      AND relation_acl.grantee = 0
      AND relation_acl.privilege_type = 'SELECT'
  ),
  'only authenticated receives the request table SELECT grant'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS role_name(name)
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS privilege_name(name)
    WHERE coalesce(
      has_table_privilege(
        role_name.name,
        to_regclass('public.owner_opening_balance_requests'),
        privilege_name.name
      ),
      false
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS relation_acl
    WHERE relation.oid = to_regclass('public.owner_opening_balance_requests')
      AND relation_acl.grantee = 0
      AND relation_acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ),
  'anon, authenticated, and service_role have no request mutation privilege'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure_row
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND procedure_row.proname IN (
        'submit_owner_opening_balance',
        'review_owner_opening_balance',
        'submit_owner_opening_balance_correction'
      )
  ),
  'schema foundation exposes no opening-balance workflow mutation RPC'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.owner_opening_balance_requests')
      AND tgname = 'guard_owner_opening_balance_request_mutation'
      AND NOT tgisinternal
  ),
  'request evidence and authority fields have an immutable mutation guard'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.owner_opening_balance_requests')
      AND tgname = 'owner_opening_balance_approved_entries_complete'
      AND tgconstraint <> 0
      AND tgdeferrable
      AND tginitdeferred
      AND NOT tgisinternal
  )
  AND EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.owner_opening_balance_entries')
      AND tgname = 'owner_opening_balance_entry_request_complete'
      AND tgconstraint <> 0
      AND tgdeferrable
      AND tginitdeferred
      AND NOT tgisinternal
  ),
  'approved requests and their entries share initially-deferred completeness invariants'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'anon',
      to_regprocedure('app_private.guard_owner_opening_balance_request_mutation()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.guard_owner_opening_balance_request_mutation()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure('app_private.guard_owner_opening_balance_request_mutation()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'anon',
      to_regprocedure('app_private.enforce_owner_opening_balance_approved_entries()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.enforce_owner_opening_balance_approved_entries()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure('app_private.enforce_owner_opening_balance_approved_entries()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS relation_acl
    WHERE relation.oid = to_regclass('public.owner_opening_balance_entries')
      AND relation_acl.grantee = 0
      AND relation_acl.privilege_type = 'SELECT'
  ),
  'private request lifecycle guards are not directly executable by application roles'
);

SELECT has_table(
  'public',
  'owner_opening_balance_entries',
  'approved opening authority has an append-only signed entry table'
);

SELECT is(
  (
    SELECT jsonb_agg(column_name ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'owner_opening_balance_entries'
  ),
  '["id","request_id","organization_id","property_id","owner_person_id","property_owner_id","ownership_percent_snapshot","ownership_roster_hash","currency","effective_date","component","entry_kind","signed_amount","reversal_of_entry_id","created_at","created_by"]'::jsonb,
  'opening entries expose exactly the approved authority, amount, lineage, and actor columns'
);

SELECT is(
  (
    SELECT jsonb_agg(
      jsonb_build_array(
        column_name,
        data_type,
        udt_schema,
        udt_name,
        is_nullable,
        coalesce(numeric_precision, 0),
        coalesce(numeric_scale, 0)
      )
      ORDER BY column_name
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'owner_opening_balance_entries'
      AND column_name IN (
        'ownership_percent_snapshot', 'currency', 'component', 'signed_amount'
      )
  ),
  '[["component","USER-DEFINED","public","owner_balance_component","NO",0,0],["currency","USER-DEFINED","public","currency_code","NO",0,0],["ownership_percent_snapshot","numeric","pg_catalog","numeric","NO",6,3],["signed_amount","numeric","pg_catalog","numeric","NO",14,2]]'::jsonb,
  'entry authority and signed money preserve exact approved precision'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'owner_opening_balance_entries'
      AND is_nullable <> 'NO'
      AND column_name <> 'reversal_of_entry_id'
  ),
  'only the reversal target is nullable on an approved entry'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.owner_opening_balance_requests')
      AND conname = 'owner_opening_balance_requests_correction_target_fkey'
      AND pg_get_constraintdef(oid) LIKE
        'FOREIGN KEY (organization_id, property_id, owner_person_id, currency, effective_date, component, correction_of_entry_id) REFERENCES owner_opening_balance_entries%'
  ),
  'the deferred correction target FK proves the complete authority scope after the entry table exists'
);

SELECT is(
  (
    SELECT jsonb_agg(indexname ORDER BY indexname)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'owner_opening_balance_entries'
      AND indexname IN (
        'owner_opening_balance_entries_org_id_uidx',
        'owner_opening_balance_entries_scope_id_uidx',
        'owner_opening_balance_entries_request_kind_uidx',
        'owner_opening_balance_entries_opening_uidx',
        'owner_opening_balance_entries_reversal_target_uidx'
      )
  ),
  '["owner_opening_balance_entries_opening_uidx","owner_opening_balance_entries_org_id_uidx","owner_opening_balance_entries_request_kind_uidx","owner_opening_balance_entries_reversal_target_uidx","owner_opening_balance_entries_scope_id_uidx"]'::jsonb,
  'entry uniqueness covers organization scope, authority scope, request kind, initial authority, and one reversal'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.owner_opening_balance_entries')
      AND relrowsecurity
  ),
  'opening entry rows enforce RLS'
);

SELECT is(
  (
    SELECT jsonb_agg(policyname ORDER BY policyname)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'owner_opening_balance_entries'
  ),
  '["Finance roles can read owner opening entries"]'::jsonb,
  'the entry table has one organization-scoped Finance read policy and no write policy'
);

SELECT ok(
  coalesce(
    has_table_privilege(
      'authenticated',
      to_regclass('public.owner_opening_balance_entries'),
      'SELECT'
    ),
    false
  )
  AND NOT coalesce(
    has_table_privilege(
      'anon',
      to_regclass('public.owner_opening_balance_entries'),
      'SELECT'
    ),
    false
  )
  AND NOT coalesce(
    has_table_privilege(
      'service_role',
      to_regclass('public.owner_opening_balance_entries'),
      'SELECT'
    ),
    false
  ),
  'only authenticated receives the entry table SELECT grant'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS role_name(name)
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS privilege_name(name)
    WHERE coalesce(
      has_table_privilege(
        role_name.name,
        to_regclass('public.owner_opening_balance_entries'),
        privilege_name.name
      ),
      false
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS relation_acl
    WHERE relation.oid = to_regclass('public.owner_opening_balance_entries')
      AND relation_acl.grantee = 0
      AND relation_acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ),
  'anon, authenticated, and service_role have no entry mutation privilege'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.owner_opening_balance_entries')
      AND tgname = 'guard_owner_opening_balance_entry_insert'
      AND NOT tgisinternal
  )
  AND EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.owner_opening_balance_entries')
      AND tgname = 'guard_owner_opening_balance_entry_immutable'
      AND NOT tgisinternal
  ),
  'entries require approved-request validation and reject every later mutation'
);

SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.guard_owner_opening_balance_entry_insert()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure('app_private.guard_owner_opening_balance_entry_insert()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('app_private.guard_owner_opening_balance_entry_immutable()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure('app_private.guard_owner_opening_balance_entry_immutable()'),
      'EXECUTE'
    ),
    false
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS relation_acl
    WHERE relation.oid = to_regclass('public.owner_opening_balance_known_authority_v1')
      AND relation_acl.grantee = 0
      AND relation_acl.privilege_type = 'SELECT'
  ),
  'entry trigger helpers are private and non-executable by application roles'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.owner_opening_balance_known_authority_v1')
      AND relkind = 'v'
      AND reloptions @> ARRAY['security_invoker=true']
  ),
  'the known-authority read view is security invoker and cannot bypass entry RLS'
);

SELECT ok(
  coalesce(
    has_table_privilege(
      'authenticated',
      to_regclass('public.owner_opening_balance_known_authority_v1'),
      'SELECT'
    ),
    false
  )
  AND NOT coalesce(
    has_table_privilege(
      'anon',
      to_regclass('public.owner_opening_balance_known_authority_v1'),
      'SELECT'
    ),
    false
  )
  AND NOT coalesce(
    has_table_privilege(
      'service_role',
      to_regclass('public.owner_opening_balance_known_authority_v1'),
      'SELECT'
    ),
    false
  ),
  'the known-authority view follows the same minimum read ACL as its tables'
);

CREATE TEMP TABLE owner_opening_request_fixture (
  organization_id uuid NOT NULL DEFAULT 'a2110000-0000-4000-8000-000000000001',
  property_id uuid NOT NULL DEFAULT 'a2110000-0000-4000-8000-000000000002',
  owner_person_id uuid NOT NULL DEFAULT 'a2110000-0000-4000-8000-000000000003',
  property_owner_id uuid NOT NULL DEFAULT 'a2110000-0000-4000-8000-000000000004',
  submitter_id uuid NOT NULL DEFAULT 'a2110000-0000-4000-8000-000000000005',
  reviewer_id uuid NOT NULL DEFAULT 'a2110000-0000-4000-8000-000000000006',
  request_id uuid NOT NULL DEFAULT 'a2110000-0000-4000-8000-000000000007'
) ON COMMIT DROP;

INSERT INTO owner_opening_request_fixture DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', actor_id, 'authenticated',
  'authenticated', label || '@owner-opening.test',
  extensions.crypt('owner-opening-schema', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  SELECT submitter_id AS actor_id, 'submitter' AS label
  FROM owner_opening_request_fixture
  UNION ALL
  SELECT reviewer_id, 'reviewer'
  FROM owner_opening_request_fixture
) AS actors;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Owner opening schema', 'owner-opening-schema'
FROM owner_opening_request_fixture;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type
)
SELECT property_id, organization_id, 'Owner opening property', 'OPEN-1', 'Apartment'
FROM owner_opening_request_fixture;

INSERT INTO public.people (id, organization_id, display_name)
SELECT owner_person_id, organization_id, 'Opening balance owner'
FROM owner_opening_request_fixture;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, owner_person_id, 'owner', 'active'
FROM owner_opening_request_fixture;

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
SELECT
  property_owner_id, organization_id, property_id, owner_person_id,
  100.000, '2026-08-01'
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount, status,
        reason, source_reference, evidence_sha256, payload_hash, submitted_by,
        reviewed_at, reviewed_by
      ) VALUES (
        %L, %L, %L, %L, 100.000, repeat('a', 64), 'USD',
        '2026-08-01', 'security_deposit_custody', 'initial', 10.00, 'approved',
        'Invalid direct approval', 'IPS cutover direct approval probe',
        repeat('a', 64), repeat('b', 64), %L,
        '2026-08-09T11:55:00Z', %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id,
    reviewer_id
  ),
  '22023',
  'owner opening balance requests must be inserted as submitted',
  'a request cannot bypass review by being inserted directly as approved'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        id, organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount,
        reason, source_reference, evidence_sha256, payload_hash, submitted_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000060', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'security_deposit_custody', 'initial', 10.00,
        'Missing opening entry', 'IPS cutover missing opening probe',
        repeat('c', 64), repeat('d', 64), %L
      );
      SELECT set_config(
        'app.owner_opening_request_review_context',
        'checked-review-v1',
        true
      );
      UPDATE public.owner_opening_balance_requests
      SET status = 'approved',
          reviewed_at = '2026-08-09T11:56:00Z',
          reviewed_by = %L
      WHERE id = 'a2110000-0000-4000-8000-000000000060';
      SET CONSTRAINTS owner_opening_balance_approved_entries_complete IMMEDIATE
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id,
    reviewer_id
  ),
  '23514',
  'approved initial owner opening request requires exactly one opening entry',
  'an approved initial request cannot commit without its opening entry'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        id, organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount,
        reason, source_reference, evidence_sha256, payload_hash, submitted_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000061', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'ips_due_to_owner', 'initial', 10.00,
        'Lifecycle race source', 'IPS cutover lifecycle probe',
        repeat('1', 64), repeat('2', 64), %L
      );
      SELECT set_config(
        'app.owner_opening_request_review_context',
        'checked-review-v1',
        true
      );
      UPDATE public.owner_opening_balance_requests
      SET status = 'approved',
          reviewed_at = '2026-08-09T11:57:00Z',
          reviewed_by = %L
      WHERE id = 'a2110000-0000-4000-8000-000000000061';
      INSERT INTO public.owner_opening_balance_entries (
        id, request_id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
        currency, effective_date, component, entry_kind, signed_amount, created_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000062',
        'a2110000-0000-4000-8000-000000000061', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'ips_due_to_owner', 'opening', 10.00, %L
      );
      SET CONSTRAINTS owner_opening_balance_approved_entries_complete IMMEDIATE;
      SET CONSTRAINTS owner_opening_balance_approved_entries_complete DEFERRED;
      INSERT INTO public.owner_opening_balance_requests (
        id, organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount,
        correction_of_entry_id, reason, source_reference, evidence_sha256,
        payload_hash, submitted_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000063', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'ips_due_to_owner', 'correction', 7.00,
        'a2110000-0000-4000-8000-000000000062',
        'Incomplete correction pair', 'IPS cutover incomplete correction probe',
        repeat('3', 64), repeat('4', 64), %L
      );
      UPDATE public.owner_opening_balance_requests
      SET status = 'approved',
          reviewed_at = '2026-08-09T11:58:00Z',
          reviewed_by = %L
      WHERE id = 'a2110000-0000-4000-8000-000000000063';
      INSERT INTO public.owner_opening_balance_entries (
        id, request_id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
        currency, effective_date, component, entry_kind, signed_amount,
        reversal_of_entry_id, created_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000064',
        'a2110000-0000-4000-8000-000000000063', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'ips_due_to_owner', 'correction_reversal', -10.00,
        'a2110000-0000-4000-8000-000000000062', %L
      );
      SET CONSTRAINTS owner_opening_balance_approved_entries_complete IMMEDIATE
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id,
    reviewer_id,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    reviewer_id,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id,
    reviewer_id,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    reviewer_id
  ),
  '23514',
  'approved correction owner opening request requires exactly one reversal and one replacement entry',
  'an approved correction cannot commit with only its reversal entry'
)
FROM owner_opening_request_fixture;

SELECT lives_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot,
        ownership_roster_hash, currency, effective_date, component,
        request_kind, proposed_amount, reason, source_reference,
        evidence_sha256, payload_hash, submitted_by
      ) VALUES (
        %L, %L, %L, %L, %L, 100.000, repeat('a', 64), 'USD',
        '2026-08-01', 'ips_held_owner_cash', 'initial', 0.00,
        'Verified cutover source', 'IPS cutover manifest row 1',
        repeat('b', 64), repeat('c', 64), %L
      )
    $sql$,
    request_id,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id
  ),
  'a submitted 0.00 proposal is stored exactly but does not itself establish approved authority'
)
FROM owner_opening_request_fixture;

SELECT is(
  (
    SELECT proposed_amount::text
    FROM public.owner_opening_balance_requests
    WHERE id = (SELECT request_id FROM owner_opening_request_fixture)
  ),
  '0.00',
  'request money retains exact two-decimal zero text'
);

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount, reason,
        source_reference, evidence_sha256, payload_hash, submitted_by
      ) VALUES (
        %L, %L, %L, %L, 100.000, repeat('a', 64), 'USD',
        '2026-08-01', 'ips_held_owner_cash', 'initial', 1.00,
        'Duplicate authority', 'IPS cutover manifest row 2',
        repeat('d', 64), repeat('e', 64), %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id
  ),
  '23505',
  NULL,
  'the pending-initial unique index rejects a second submitted authority key'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    'UPDATE public.owner_opening_balance_requests SET proposed_amount = 2.00 WHERE id = %L',
    request_id
  ),
  '42501',
  'owner opening balance requests require the checked review path',
  'request business data cannot be updated outside the checked review context'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    'DELETE FROM public.owner_opening_balance_requests WHERE id = %L',
    request_id
  ),
  '42501',
  'owner opening balance requests are append-only',
  'request rows cannot be deleted even by the table owner'
)
FROM owner_opening_request_fixture;

SELECT set_config(
  'app.owner_opening_request_review_context',
  'checked-review-v1',
  true
);

SELECT lives_ok(
  format(
    $sql$
      UPDATE public.owner_opening_balance_requests
      SET status = 'rejected',
          reviewed_at = '2026-08-09T12:00:00Z',
          reviewed_by = %L,
          review_reason = 'Evidence needs reconciliation'
      WHERE id = %L
    $sql$,
    reviewer_id,
    request_id
  ),
  'the checked review context can make the one submitted-to-rejected transition'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    $sql$
      UPDATE public.owner_opening_balance_requests
      SET review_reason = 'Rewritten review'
      WHERE id = %L
    $sql$,
    request_id
  ),
  '22023',
  'owner opening balance request status transition is invalid',
  'a reviewed request can never be rewritten through the review context'
)
FROM owner_opening_request_fixture;

SELECT set_config(
  'app.owner_opening_request_review_context',
  'off',
  true
);

SELECT lives_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot,
        ownership_roster_hash, currency, effective_date, component,
        request_kind, proposed_amount, resubmission_of_request_id, reason,
        source_reference, evidence_sha256, payload_hash, submitted_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000008', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'ips_held_owner_cash', 'initial', 0.00, %L,
        'Reconciled cutover source', 'IPS cutover manifest row 3',
        repeat('f', 64), repeat('1', 64), %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    request_id,
    submitter_id
  ),
  'a rejected request remains immutable while a new submitted successor links to it'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount,
        resubmission_of_request_id, reason, source_reference,
        evidence_sha256, payload_hash, submitted_by
      ) VALUES (
        %L, %L, %L, %L, 100.000, repeat('a', 64), 'USD',
        '2026-08-01', 'owner_due_to_ips', 'initial', 1.00, %L,
        'Second successor', 'IPS cutover manifest row 4',
        repeat('2', 64), repeat('3', 64), %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    request_id,
    submitter_id
  ),
  '23505',
  NULL,
  'a rejected predecessor can have at most one resubmission successor'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_entries (
        id, request_id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
        currency, effective_date, component, entry_kind, signed_amount,
        created_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000020',
        'a2110000-0000-4000-8000-000000000008', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'ips_held_owner_cash', 'opening', 0.00, %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    reviewer_id
  ),
  '22023',
  'owner opening entry requires an approved request',
  'a submitted 0.00 request cannot create known-zero authority'
)
FROM owner_opening_request_fixture;

INSERT INTO public.owner_opening_balance_requests (
  id, organization_id, property_id, owner_person_id,
  property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
  currency, effective_date, component, request_kind, proposed_amount, reason,
  source_reference, evidence_sha256, payload_hash, submitted_by
)
SELECT
  'a2110000-0000-4000-8000-000000000030', organization_id, property_id,
  owner_person_id, property_owner_id, 100.000, repeat('a', 64), 'USD',
  '2026-08-01', 'owner_due_to_ips', 'initial', 0.00,
  'Known-zero structural authority', 'IPS cutover manifest known zero',
  repeat('4', 64), repeat('5', 64), submitter_id
FROM owner_opening_request_fixture;

SELECT set_config(
  'app.owner_opening_request_review_context',
  'checked-review-v1',
  true
);

UPDATE public.owner_opening_balance_requests
SET status = 'approved',
    reviewed_at = '2026-08-09T12:10:00Z',
    reviewed_by = (SELECT reviewer_id FROM owner_opening_request_fixture)
WHERE id = 'a2110000-0000-4000-8000-000000000030';

SELECT set_config(
  'app.owner_opening_request_review_context',
  'off',
  true
);

SELECT lives_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_entries (
        id, request_id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
        currency, effective_date, component, entry_kind, signed_amount,
        created_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000040',
        'a2110000-0000-4000-8000-000000000030', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'owner_due_to_ips', 'opening', 0.00, %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    reviewer_id
  ),
  'the schema accepts an exact zero opening only after an independently reviewed approved request'
)
FROM owner_opening_request_fixture;

SELECT lives_ok(
  'SET CONSTRAINTS owner_opening_balance_approved_entries_complete IMMEDIATE',
  'a valid initial approval and opening entry satisfy the deferred invariant in one transaction'
);

SET CONSTRAINTS ALL DEFERRED;

SELECT results_eq(
  $$
    SELECT authority_state, current_amount::text, entry_count
    FROM public.owner_opening_balance_known_authority_v1
    WHERE organization_id = 'a2110000-0000-4000-8000-000000000001'
      AND component = 'owner_due_to_ips'
  $$,
  $$ VALUES ('known'::text, '0.00'::text, 1::bigint) $$,
  'an approved zero entry chain is structurally distinct from missing authority'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.owner_opening_balance_known_authority_v1
    WHERE organization_id = 'a2110000-0000-4000-8000-000000000001'
      AND component = 'ips_held_owner_cash'
  ),
  0,
  'a submitted zero proposal remains absent from the known-authority view'
);

INSERT INTO public.owner_opening_balance_requests (
  id, organization_id, property_id, owner_person_id,
  property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
  currency, effective_date, component, request_kind, proposed_amount,
  correction_of_entry_id, reason, source_reference, evidence_sha256,
  payload_hash, submitted_by
)
SELECT
  'a2110000-0000-4000-8000-000000000031', organization_id, property_id,
  owner_person_id, property_owner_id, 100.000, repeat('a', 64), 'USD',
  '2026-08-01', 'owner_due_to_ips', 'correction', 0.00,
  'a2110000-0000-4000-8000-000000000040',
  'Zero correction structural authority', 'IPS cutover manifest zero correction',
  repeat('6', 64), repeat('7', 64), submitter_id
FROM owner_opening_request_fixture;

SELECT set_config(
  'app.owner_opening_request_review_context',
  'checked-review-v1',
  true
);

UPDATE public.owner_opening_balance_requests
SET status = 'approved',
    reviewed_at = '2026-08-09T12:20:00Z',
    reviewed_by = (SELECT reviewer_id FROM owner_opening_request_fixture)
WHERE id = 'a2110000-0000-4000-8000-000000000031';

SELECT set_config(
  'app.owner_opening_request_review_context',
  'off',
  true
);

SELECT lives_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_entries (
        id, request_id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
        currency, effective_date, component, entry_kind, signed_amount,
        reversal_of_entry_id, created_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000041',
        'a2110000-0000-4000-8000-000000000031', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'owner_due_to_ips', 'correction_reversal', 0.00,
        'a2110000-0000-4000-8000-000000000040', %L
      );
      INSERT INTO public.owner_opening_balance_entries (
        id, request_id, organization_id, property_id, owner_person_id,
        property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
        currency, effective_date, component, entry_kind, signed_amount,
        created_by
      ) VALUES (
        'a2110000-0000-4000-8000-000000000042',
        'a2110000-0000-4000-8000-000000000031', %L, %L, %L, %L,
        100.000, repeat('a', 64), 'USD', '2026-08-01',
        'owner_due_to_ips', 'correction_replacement', 0.00, %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    reviewer_id,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    reviewer_id
  ),
  'a zero authority-bearing entry can be reversed once and replaced with zero without losing lineage'
)
FROM owner_opening_request_fixture;

SELECT lives_ok(
  'SET CONSTRAINTS owner_opening_balance_approved_entries_complete IMMEDIATE',
  'a valid zero correction reversal and replacement pair satisfies the deferred invariant'
);

SET CONSTRAINTS ALL DEFERRED;

SELECT results_eq(
  $$
    SELECT authority_state, current_amount::text, entry_count
    FROM public.owner_opening_balance_known_authority_v1
    WHERE organization_id = 'a2110000-0000-4000-8000-000000000001'
      AND component = 'owner_due_to_ips'
  $$,
  $$ VALUES ('known'::text, '0.00'::text, 3::bigint) $$,
  'the append-only zero correction chain remains known zero with all three entries retained'
);

SELECT throws_ok(
  $$
    UPDATE public.owner_opening_balance_entries
    SET signed_amount = 1.00
    WHERE id = 'a2110000-0000-4000-8000-000000000042'
  $$,
  '42501',
  'owner opening balance entries are immutable',
  'an authority-bearing replacement entry cannot be changed'
);

SELECT throws_ok(
  $$
    DELETE FROM public.owner_opening_balance_entries
    WHERE id = 'a2110000-0000-4000-8000-000000000040'
  $$,
  '42501',
  'owner opening balance entries are immutable',
  'a reversed original opening remains permanently retained'
);

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount,
        correction_of_entry_id, reason, source_reference, evidence_sha256,
        payload_hash, submitted_by
      ) VALUES (
        %L, %L, %L, %L, 100.000, repeat('a', 64), 'USD',
        '2026-08-01', 'owner_due_to_ips', 'correction', 0.00,
        'a2110000-0000-4000-8000-000000000040',
        'Stale zero correction', 'IPS cutover stale correction',
        repeat('8', 64), repeat('9', 64), %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id
  ),
  '22023',
  'owner opening correction target is stale',
  'a reversed authority-bearing entry cannot be corrected again'
)
FROM owner_opening_request_fixture;

SELECT throws_ok(
  format(
    $sql$
      INSERT INTO public.owner_opening_balance_requests (
        organization_id, property_id, owner_person_id, property_owner_id,
        ownership_percent_snapshot, ownership_roster_hash, currency,
        effective_date, component, request_kind, proposed_amount,
        correction_of_entry_id, reason, source_reference, evidence_sha256,
        payload_hash, submitted_by
      ) VALUES (
        %L, %L, %L, %L, 100.000, repeat('a', 64), 'USD',
        '2026-08-01', 'owner_due_to_ips', 'correction', 0.00,
        'a2110000-0000-4000-8000-000000000041',
        'Invalid reversal correction', 'IPS cutover reversal target',
        repeat('a', 64), repeat('b', 64), %L
      )
    $sql$,
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    submitter_id
  ),
  '22023',
  'owner opening correction target must carry current authority',
  'a correction reversal row can never become authority for another correction'
)
FROM owner_opening_request_fixture;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', actor_id, 'authenticated',
  'authenticated', label || '@owner-opening.test',
  extensions.crypt('owner-opening-roles', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
FROM (
  VALUES
    ('a2110000-0000-4000-8000-000000000050'::uuid, 'finance-manager'),
    ('a2110000-0000-4000-8000-000000000051'::uuid, 'operations-manager'),
    ('a2110000-0000-4000-8000-000000000052'::uuid, 'operations-member'),
    ('a2110000-0000-4000-8000-000000000053'::uuid, 'unaffiliated'),
    ('a2110000-0000-4000-8000-000000000054'::uuid, 'cross-super-admin')
) AS actors(actor_id, label);

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  ('a2110000-0000-4000-8000-000000000060', 'a2110000-0000-4000-8000-000000000001', 'Opening Operations Manager'),
  ('a2110000-0000-4000-8000-000000000061', 'a2110000-0000-4000-8000-000000000001', 'Opening Operations Member');

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  ('a2110000-0000-4000-8000-000000000001', 'a2110000-0000-4000-8000-000000000060', 'staff', 'active'),
  ('a2110000-0000-4000-8000-000000000001', 'a2110000-0000-4000-8000-000000000061', 'staff', 'active');

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES (
  'a2110000-0000-4000-8000-000000000062',
  'a2110000-0000-4000-8000-000000000001',
  'Opening operations branch',
  'OPEN-OPS'
);

INSERT INTO public.organization_members (
  organization_id, user_id, role, person_id, branch_id
)
VALUES
  ('a2110000-0000-4000-8000-000000000001', 'a2110000-0000-4000-8000-000000000005', 'finance_member', NULL, NULL),
  ('a2110000-0000-4000-8000-000000000001', 'a2110000-0000-4000-8000-000000000006', 'super_admin', NULL, NULL),
  ('a2110000-0000-4000-8000-000000000001', 'a2110000-0000-4000-8000-000000000050', 'finance_manager', NULL, NULL),
  ('a2110000-0000-4000-8000-000000000001', 'a2110000-0000-4000-8000-000000000051', 'operations_manager', 'a2110000-0000-4000-8000-000000000060', 'a2110000-0000-4000-8000-000000000062'),
  ('a2110000-0000-4000-8000-000000000001', 'a2110000-0000-4000-8000-000000000052', 'operations_member', 'a2110000-0000-4000-8000-000000000061', 'a2110000-0000-4000-8000-000000000062');

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'a2110000-0000-4000-8000-000000000070',
  'Cross owner opening schema',
  'cross-owner-opening-schema'
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (
  'a2110000-0000-4000-8000-000000000070',
  'a2110000-0000-4000-8000-000000000054',
  'super_admin'
);

SELECT set_config('request.jwt.claim.sub', 'a2110000-0000-4000-8000-000000000006', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) > 0 FROM public.owner_opening_balance_requests),
      (SELECT count(*) = 3 FROM public.owner_opening_balance_entries),
      (SELECT count(*) = 1 FROM public.owner_opening_balance_known_authority_v1)
  $$,
  $$ VALUES (true, true, true) $$,
  'Super Admin can read scoped request, entry, and known-authority rows'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a2110000-0000-4000-8000-000000000050', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) > 0 FROM public.owner_opening_balance_requests),
      (SELECT count(*) = 3 FROM public.owner_opening_balance_entries),
      (SELECT count(*) = 1 FROM public.owner_opening_balance_known_authority_v1)
  $$,
  $$ VALUES (true, true, true) $$,
  'Finance Manager can read scoped request, entry, and known-authority rows'
);
SELECT throws_ok(
  $$
    INSERT INTO public.owner_opening_balance_entries (
      request_id, organization_id, property_id, owner_person_id,
      property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
      currency, effective_date, component, entry_kind, signed_amount, created_by
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      gen_random_uuid(), 100, repeat('a',64), 'USD', '2026-08-01',
      'ips_due_to_owner', 'opening', 1, 'a2110000-0000-4000-8000-000000000050'
    )
  $$,
  '42501',
  'permission denied for table owner_opening_balance_entries',
  'Finance Manager direct entry INSERT is denied by ACL before RLS'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a2110000-0000-4000-8000-000000000005', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) > 0 FROM public.owner_opening_balance_requests),
      (SELECT count(*) = 3 FROM public.owner_opening_balance_entries),
      (SELECT count(*) = 1 FROM public.owner_opening_balance_known_authority_v1)
  $$,
  $$ VALUES (true, true, true) $$,
  'Finance Member can read scoped request, entry, and known-authority rows'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a2110000-0000-4000-8000-000000000051', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.owner_opening_balance_requests),
      (SELECT count(*) FROM public.owner_opening_balance_entries),
      (SELECT count(*) FROM public.owner_opening_balance_known_authority_v1)
  $$,
  $$ VALUES (0::bigint, 0::bigint, 0::bigint) $$,
  'Operations Manager cannot enumerate owner opening authority'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a2110000-0000-4000-8000-000000000052', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.owner_opening_balance_requests),
      (SELECT count(*) FROM public.owner_opening_balance_entries),
      (SELECT count(*) FROM public.owner_opening_balance_known_authority_v1)
  $$,
  $$ VALUES (0::bigint, 0::bigint, 0::bigint) $$,
  'Operations Member cannot enumerate owner opening authority'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a2110000-0000-4000-8000-000000000053', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.owner_opening_balance_requests),
      (SELECT count(*) FROM public.owner_opening_balance_entries),
      (SELECT count(*) FROM public.owner_opening_balance_known_authority_v1)
  $$,
  $$ VALUES (0::bigint, 0::bigint, 0::bigint) $$,
  'an unaffiliated authenticated user cannot enumerate owner opening authority'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a2110000-0000-4000-8000-000000000054', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.owner_opening_balance_requests),
      (SELECT count(*) FROM public.owner_opening_balance_entries),
      (SELECT count(*) FROM public.owner_opening_balance_known_authority_v1)
  $$,
  $$ VALUES (0::bigint, 0::bigint, 0::bigint) $$,
  'a cross-organization Super Admin cannot enumerate another organization authority'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$
    UPDATE public.owner_opening_balance_entries SET signed_amount = 1.00
    WHERE id = 'a2110000-0000-4000-8000-000000000042'
  $$,
  '42501',
  'permission denied for table owner_opening_balance_entries',
  'service_role direct entry UPDATE is denied despite bypass-RLS status'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$
    DELETE FROM public.owner_opening_balance_entries
    WHERE id = 'a2110000-0000-4000-8000-000000000042'
  $$,
  '42501',
  'permission denied for table owner_opening_balance_entries',
  'anonymous direct entry DELETE is denied by ACL'
);
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
