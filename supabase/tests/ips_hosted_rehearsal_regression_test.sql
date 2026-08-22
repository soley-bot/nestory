BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(10);

CREATE TEMP TABLE hosted_rehearsal_state (
  organization_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000001',
  property_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000002',
  unit_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000003',
  tenant_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000004',
  lease_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000005',
  term_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000006',
  current_policy_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000007',
  repair_policy_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000008',
  stale_policy_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000009',
  super_admin_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000101',
  operations_manager_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000501',
  operations_branch_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000211',
  operations_assignee_id uuid NOT NULL DEFAULT '80000000-0000-0000-0000-000000000008',
  operations_task_id uuid,
  other_branch_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000010',
  other_property_id uuid NOT NULL DEFAULT 'b8120000-0000-4000-8000-000000000011',
  other_branch_task_id uuid,
  period_start date NOT NULL DEFAULT date_trunc('month', current_date)::date,
  previous_period_start date NOT NULL DEFAULT (
    date_trunc('month', current_date)::date - interval '1 month'
  )::date
) ON COMMIT DROP;

INSERT INTO hosted_rehearsal_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON hosted_rehearsal_state TO authenticated;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Hosted rehearsal regression', 'hosted-rehearsal-regression'
FROM hosted_rehearsal_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin'
FROM hosted_rehearsal_state;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status
)
SELECT property_id, organization_id, 'Hosted rehearsal property',
  'HR-001', 'apartment', 'active'
FROM hosted_rehearsal_state;

INSERT INTO public.units (
  id, organization_id, property_id, unit_number, status
)
SELECT unit_id, organization_id, property_id, 'A-01', 'occupied'
FROM hosted_rehearsal_state;

INSERT INTO public.people (
  id, organization_id, display_name, party_type
)
SELECT tenant_id, organization_id, 'Hosted Rehearsal Tenant', 'individual'
FROM hosted_rehearsal_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, tenant_id, 'tenant', 'active'
FROM hosted_rehearsal_state;

SET LOCAL session_replication_role = replica;
INSERT INTO public.leases (
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  status, created_by, updated_by
)
SELECT lease_id, organization_id, property_id, unit_id, tenant_id,
  'active', super_admin_id, super_admin_id
FROM hosted_rehearsal_state;
SET LOCAL session_replication_role = origin;

INSERT INTO public.lease_terms (
  id, organization_id, lease_id, term_sequence, start_date, end_date,
  rent_amount, rent_currency, rent_due_day, payment_frequency, status,
  authority_kind, confirmed_at, confirmed_by, created_by, updated_by
)
SELECT term_id, organization_id, lease_id, 1, period_start,
  (period_start + interval '1 year - 1 day')::date,
  925, 'USD', 5, 'monthly', 'active', 'authoritative', now(),
  super_admin_id, super_admin_id, super_admin_id
FROM hosted_rehearsal_state;

INSERT INTO public.rent_policy_versions (
  id, organization_id, version_number, effective_from,
  supported_frequencies, rent_calculation_timezone, due_day_source,
  policy_default_due_day, short_month_due_day_rule,
  lease_start_proration_rule, lease_end_proration_rule,
  notice_period_charging_rule, mid_period_rent_change_rule,
  concessions_support_state, rent_free_support_state,
  waivers_support_state, lifecycle, created_by, updated_by,
  approved_at, approved_by
)
SELECT current_policy_id, organization_id, 1, current_date,
  ARRAY['monthly']::text[], 'Asia/Bangkok', 'term', NULL::integer,
  'last_calendar_day', 'actual_days', 'actual_days', 'through_lease_end',
  'prorate_actual_days', 'unsupported', 'unsupported', 'unsupported',
  'approved', super_admin_id, super_admin_id, now(), super_admin_id
FROM hosted_rehearsal_state
UNION ALL
SELECT repair_policy_id, organization_id, 2, period_start,
  ARRAY['monthly']::text[], 'Asia/Bangkok', 'term', NULL::integer,
  'last_calendar_day', 'actual_days', 'actual_days', 'through_lease_end',
  'prorate_actual_days', 'unsupported', 'unsupported', 'unsupported',
  'draft', super_admin_id, super_admin_id, NULL::timestamptz, NULL::uuid
FROM hosted_rehearsal_state
UNION ALL
SELECT stale_policy_id, organization_id, 3, previous_period_start,
  ARRAY['monthly']::text[], 'Asia/Bangkok', 'term', NULL::integer,
  'last_calendar_day', 'actual_days', 'actual_days', 'through_lease_end',
  'prorate_actual_days', 'unsupported', 'unsupported', 'unsupported',
  'draft', super_admin_id, super_admin_id, NULL::timestamptz, NULL::uuid
FROM hosted_rehearsal_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM hosted_rehearsal_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT (item ->> 'ready')::boolean
    FROM hosted_rehearsal_state AS state
    CROSS JOIN LATERAL jsonb_array_elements(
      public.get_ips_setup_readiness(
        state.organization_id, state.property_id, state.unit_id,
        state.lease_id, current_date
      ) -> 'items'
    ) AS item
    WHERE item ->> 'code' = 'rent_policy'
  ),
  false,
  'setup stays blocked when policy begins after the lease billing period start'
);

SELECT lives_ok(
  format(
    'SELECT public.approve_rent_policy_version(%L, %L)',
    organization_id,
    repair_policy_id
  ),
  'a complete policy can repair the open current billing month'
) FROM hosted_rehearsal_state;

SELECT is(
  (
    SELECT (item ->> 'ready')::boolean
    FROM hosted_rehearsal_state AS state
    CROSS JOIN LATERAL jsonb_array_elements(
      public.get_ips_setup_readiness(
        state.organization_id, state.property_id, state.unit_id,
        state.lease_id, current_date
      ) -> 'items'
    ) AS item
    WHERE item ->> 'code' = 'rent_policy'
  ),
  true,
  'current-month repair aligns setup readiness with rent generation'
);

SELECT throws_ok(
  format(
    'SELECT public.approve_rent_policy_version(%L, %L)',
    organization_id,
    stale_policy_id
  ),
  '22023',
  'Rent policy effective date cannot precede the current billing month',
  'policy approval cannot rewrite a prior billing month'
) FROM hosted_rehearsal_state;

RESET ROLE;

INSERT INTO public.organization_branches (
  id, organization_id, name, code, created_by, updated_by
)
SELECT other_branch_id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Hosted rehearsal other branch', 'HR-OTHER', super_admin_id, super_admin_id
FROM hosted_rehearsal_state;

SELECT pg_catalog.set_config(
  'app.property_branch_assignment_context',
  (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),
  true
);
INSERT INTO public.properties (id,organization_id,branch_id,name,code,property_type,status)
SELECT other_property_id,'00000000-0000-0000-0000-000000000001',other_branch_id,
  'Hosted rehearsal other property','HR-OTHER-P','apartment','active'
FROM hosted_rehearsal_state;
SELECT pg_catalog.set_config('app.property_branch_assignment_context','off',true);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM hosted_rehearsal_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE hosted_rehearsal_state
SET other_branch_task_id = public.create_maintenance_task(
  '00000000-0000-0000-0000-000000000001'::uuid,
  other_property_id,
  NULL,
  'Hosted rehearsal cross-branch evidence',
  'Operations Manager must not verify this task evidence',
  'Inspection', 'normal', 'pending', current_date + 1, NULL,
  NULL, NULL, NULL, 120, 'USD', '[]'::jsonb, 'none',
  other_branch_id, NULL
);

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM hosted_rehearsal_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE hosted_rehearsal_state
SET operations_task_id = public.create_maintenance_task(
  '00000000-0000-0000-0000-000000000001'::uuid,
  '10000000-0000-0000-0000-000000000001'::uuid,
  '20000000-0000-0000-0000-000000000001'::uuid,
  'Hosted rehearsal paid-cost registrar',
  'Task-bound Operations Manager evidence regression',
  'Inspection', 'normal', 'pending', current_date + 1, NULL,
  NULL, NULL, NULL, 120, 'USD', '[]'::jsonb, 'none',
  operations_branch_id, operations_assignee_id
);

RESET ROLE;

INSERT INTO storage.objects (bucket_id, name, version, metadata)
SELECT 'nestory-documents',
  '00000000-0000-0000-0000-000000000001/paid-cost-evidence/hosted-rehearsal.pdf',
  gen_random_uuid()::text,
  jsonb_build_object('mimetype', 'application/pdf', 'size', 128)
FROM hosted_rehearsal_state;

SELECT ok(
  to_regprocedure(
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text,uuid)'
  ) IS NOT NULL,
  'task-bound service verification exists for Operations Manager evidence'
);

SELECT throws_ok(
  format(
    $sql$SELECT public.get_paid_cost_evidence_object(%L,%L,%L,%L)$sql$,
    '00000000-0000-0000-0000-000000000001'::uuid,
    operations_manager_id,
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001/paid-cost-evidence/hosted-rehearsal.pdf'
  ),
  '42501',
  'paid_cost_evidence_forbidden',
  'Operations Manager cannot use the generic paid-cost evidence boundary'
) FROM hosted_rehearsal_state;

SELECT lives_ok(
  format(
    $sql$SELECT public.get_paid_cost_evidence_object(%L,%L,%L,%L,%L)$sql$,
    '00000000-0000-0000-0000-000000000001'::uuid,
    operations_manager_id,
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001/paid-cost-evidence/hosted-rehearsal.pdf',
    operations_task_id
  ),
  'Operations Manager can verify evidence only through its branch-scoped task'
) FROM hosted_rehearsal_state;

SELECT throws_ok(
  format(
    $sql$SELECT public.get_paid_cost_evidence_object(%L,%L,%L,%L,%L)$sql$,
    '00000000-0000-0000-0000-000000000001'::uuid,
    operations_manager_id,
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001/paid-cost-evidence/hosted-rehearsal.pdf',
    other_branch_task_id
  ),
  '42501',
  'paid_cost_evidence_forbidden',
  'Operations Manager cannot verify another branch task evidence'
) FROM hosted_rehearsal_state;

SELECT lives_ok(
  format(
    $sql$
      SELECT public.register_paid_cost_evidence_verified(
        %L,%L,%L,'hosted-rehearsal.pdf',%L,'application/pdf',128,%L,
        %L,%L,'hosted-rehearsal-register',%L
      )
    $sql$,
    '00000000-0000-0000-0000-000000000001'::uuid,
    operations_manager_id,
    '10000000-0000-0000-0000-000000000001'::uuid,
    object.name,
    repeat('a', 64),
    object.id,
    object.version,
    operations_task_id
  ),
  'Operations Manager can register immutable evidence for its exact task'
)
FROM hosted_rehearsal_state
JOIN storage.objects AS object
  ON object.bucket_id = 'nestory-documents'
 AND object.name =
   '00000000-0000-0000-0000-000000000001/paid-cost-evidence/hosted-rehearsal.pdf';

SELECT is(
  (
    SELECT document.task_id
    FROM public.documents AS document
    WHERE document.storage_path =
      '00000000-0000-0000-0000-000000000001/paid-cost-evidence/hosted-rehearsal.pdf'
  ),
  (SELECT operations_task_id FROM hosted_rehearsal_state),
  'registered Operations evidence is bound to the maintenance task'
);

SELECT * FROM finish();
ROLLBACK;
