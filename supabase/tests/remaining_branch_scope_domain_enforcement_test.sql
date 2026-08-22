BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

-- Schema, resolver and low-level boundary contracts.
SELECT has_column('public', 'financial_month_locks', 'branch_id',
  'financial month locks have nullable branch scope');
SELECT has_column('public', 'documents', 'branch_id',
  'documents persist an authoritative branch snapshot');
SELECT has_column('public', 'activity_logs', 'branch_id',
  'activity records persist an immutable branch snapshot');

SELECT has_function('app_private', 'document_branch_id', ARRAY['uuid','uuid'],
  'private document branch resolver exists');
SELECT has_function('app_private', 'can_access_document',
  ARRAY['uuid','uuid','organization_permission_key'],
  'private checked document access predicate exists');
SELECT has_function('app_private', 'storage_object_branch_id', ARRAY['text'],
  'private storage path branch parser exists');
SELECT has_function('app_private', 'can_access_storage_object',
  ARRAY['text','text','organization_permission_key'],
  'storage metadata and object access share one checked predicate');
SELECT has_function('app_private', 'is_financial_month_locked',
  ARRAY['uuid','uuid','date'],
  'branch-aware financial month lock predicate exists');
SELECT has_function('app_private', 'lock_open_financial_month',
  ARRAY['uuid','uuid','date'],
  'branch-aware financial month lock guard exists');
SELECT has_function('app_private', 'lock_financial_month_scope',
  ARRAY['uuid','uuid','date'],
  'financial month mutations share one organization-month serialization gate');
SELECT has_function('public', 'set_financial_month_lock',
  ARRAY['uuid','uuid','date','boolean','text'],
  'Super Admin can explicitly select branch scope for a month lock');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'financial_month_locks'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%(organization_id, branch_id)%organization_branches%'
  ),
  'financial month lock branch reference is same-organization'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'documents'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%(organization_id, branch_id)%organization_branches%'
  ),
  'document branch snapshot reference is same-organization'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'activity_logs'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%(organization_id, branch_id)%organization_branches%'
  ),
  'activity branch snapshot reference is same-organization'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'financial_month_locks'
      AND indexdef LIKE '%organization_id, month_start)%WHERE (branch_id IS NULL)%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'financial_month_locks'
      AND indexdef LIKE '%organization_id, branch_id, month_start)%WHERE (branch_id IS NOT NULL)%'
  ),
  'global and branch month locks each have exact uniqueness'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('app_private.document_branch_id(uuid,uuid)'::regprocedure),
      ('app_private.can_access_document(uuid,uuid,public.organization_permission_key)'::regprocedure),
      ('app_private.storage_object_branch_id(text)'::regprocedure),
      ('app_private.can_access_storage_object(text,text,public.organization_permission_key)'::regprocedure),
      ('app_private.is_financial_month_locked(uuid,uuid,date)'::regprocedure),
      ('app_private.lock_open_financial_month(uuid,uuid,date)'::regprocedure),
      ('app_private.lock_financial_month_scope(uuid,uuid,date)'::regprocedure),
      ('app_private.guard_branch_scoped_document()'::regprocedure),
      ('app_private.guard_activity_branch_snapshot()'::regprocedure)
    ) AS contract(function_oid)
    JOIN pg_proc AS function_record ON function_record.oid=contract.function_oid
    WHERE NOT (
      function_record.prosecdef
      AND function_record.proconfig @> ARRAY['search_path=""']
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          coalesce(
            function_record.proacl,
            pg_catalog.acldefault('f',function_record.proowner)
          )
        ) AS privilege
        WHERE privilege.grantee=0
          AND privilege.privilege_type='EXECUTE'
      )
      AND NOT has_function_privilege('anon',function_record.oid,'EXECUTE')
    )
  ),
  'named private enforcement functions use empty search paths and are not public APIs'
);

SELECT ok(
  NOT has_table_privilege('authenticated','public.financial_month_locks','INSERT')
  AND NOT has_table_privilege('authenticated','public.financial_month_locks','UPDATE')
  AND NOT has_table_privilege('authenticated','public.financial_month_locks','DELETE')
  AND NOT has_table_privilege('authenticated','public.documents','INSERT')
  AND NOT has_table_privilege('authenticated','public.documents','UPDATE')
  AND NOT has_table_privilege('authenticated','public.documents','DELETE')
  AND NOT has_table_privilege('authenticated','public.activity_logs','INSERT')
  AND NOT has_table_privilege('authenticated','public.activity_logs','UPDATE')
  AND NOT has_table_privilege('authenticated','public.activity_logs','DELETE')
  AND NOT has_table_privilege('authenticated','public.tasks','INSERT')
  AND NOT has_table_privilege('authenticated','public.tasks','UPDATE')
  AND NOT has_table_privilege('authenticated','public.tasks','DELETE')
  AND NOT has_table_privilege('authenticated','public.maintenance_recurrence_series','INSERT')
  AND NOT has_table_privilege('authenticated','public.maintenance_recurrence_series','UPDATE')
  AND NOT has_table_privilege('authenticated','public.maintenance_recurrence_series','DELETE')
  AND NOT has_table_privilege('authenticated','public.import_runs','INSERT')
  AND NOT has_table_privilege('authenticated','public.import_rows','UPDATE'),
  'authenticated direct DML is contained across the remaining domains'
);

-- Exact operation-to-permission source mapping. These assertions intentionally
-- inspect checked entrypoints as well as behavior so a broad substitute key
-- cannot silently satisfy the runtime matrix.
SELECT ok((SELECT prosrc LIKE '%finance.record_payments%' FROM pg_proc
  WHERE oid='app_private.can_operate_finance(uuid)'::regprocedure),
  'ordinary settlement maps to finance.record_payments');
SELECT ok((SELECT prosrc LIKE '%finance.submit_expenses%' FROM pg_proc
  WHERE oid='app_private.can_submit_expense(uuid)'::regprocedure),
  'expense submission maps to finance.submit_expenses');
SELECT ok((SELECT prosrc LIKE '%finance.approve_expenses%' FROM pg_proc
  WHERE oid='app_private.can_review_expense(uuid)'::regprocedure),
  'expense review maps to finance.approve_expenses');
SELECT ok((SELECT prosrc LIKE '%finance.correct_records%' FROM pg_proc
  WHERE oid='app_private.can_correct_finance(uuid)'::regprocedure),
  'routine finance correction maps to finance.correct_records');
SELECT ok((SELECT prosrc LIKE '%finance.close_periods%' FROM pg_proc
  WHERE oid='app_private.can_lock_financial_month(uuid)'::regprocedure),
  'month close maps to finance.close_periods');
SELECT ok(
  (SELECT prosrc LIKE '%is_super_admin%' AND prosrc NOT LIKE '%finance.publish%'
   FROM pg_proc
   WHERE oid='app_private.can_read_finance_reports(uuid)'::regprocedure)
  AND
  (SELECT prosrc LIKE '%is_super_admin%'
      AND prosrc LIKE '%has_finance_branch_authority_context%'
      AND prosrc NOT LIKE '%has_org_permission%'
   FROM pg_proc
   WHERE oid='app_private.can_read_finance(uuid)'::regprocedure),
  'legacy finance reads remain Super-Admin-only unless entered through the scoped checked wrapper');
SELECT ok(
  (SELECT prosrc LIKE '%can_access_property%'
      AND prosrc LIKE '%finance.view%'
   FROM pg_proc
   WHERE oid='app_private.can_read_finance_property(uuid,uuid)'::regprocedure),
  'scoped finance read wrapper requires branch-aware finance.view authority');
SELECT ok(
  (SELECT prosrc LIKE '%can_read_finance_property%'
      AND prosrc LIKE '%storage_object_branch_id%'
      AND prosrc NOT LIKE '%can_read_finance(p_organization_id)%'
   FROM pg_proc
   WHERE oid='public.get_paid_cost_submission_evidence(uuid,uuid[])'::regprocedure),
  'paid-cost evidence history keeps finance classification while filtering by exact Property branch');
SELECT ok(
  (SELECT prosrc LIKE '%has_org_permission%'
      AND prosrc LIKE '%can_read_finance_property%'
      AND prosrc NOT LIKE '%can_read_finance(p_organization_id)%'
   FROM pg_proc
   WHERE oid='public.get_finance_submission_actor_labels(uuid,uuid[])'::regprocedure),
  'finance submitter labels resolve only through branch-scoped visible submissions');
SELECT ok(
  (SELECT prosrc LIKE '%begin_finance_property_authority%'
      AND prosrc LIKE '%finance.submit_expenses%'
   FROM pg_proc
   WHERE oid='public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)'::regprocedure),
  'owner opening submission uses scoped finance.submit_expenses authority');
SELECT ok(
  (SELECT prosrc LIKE '%begin_finance_property_authority%'
      AND prosrc LIKE '%finance.correct_records%'
   FROM pg_proc
   WHERE oid='public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text)'::regprocedure),
  'owner opening correction uses scoped finance.correct_records authority');
SELECT ok(
  (SELECT prosrc LIKE '%begin_finance_property_authority%'
      AND prosrc LIKE '%finance.approve_expenses%'
   FROM pg_proc
   WHERE oid='public.review_owner_opening_balance(uuid,uuid,text,text,text)'::regprocedure),
  'owner opening review uses scoped finance.approve_expenses authority');
SELECT ok((SELECT prosrc LIKE '%maintenance.view%' FROM pg_proc
  WHERE oid='app_private.can_read_maintenance_task(uuid,uuid)'::regprocedure),
  'maintenance reads map to maintenance.view');
SELECT ok((SELECT prosrc LIKE '%maintenance.create_assign%' FROM pg_proc
  WHERE oid='public.create_maintenance_task(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure),
  'maintenance creation and assignment map to maintenance.create_assign');
SELECT ok(
  (SELECT prosrc LIKE '%has_maintenance_branch_authority_context%'
      AND prosrc NOT LIKE '%operations_manager%'
   FROM pg_proc
   WHERE oid='app_private.create_maintenance_task_baseline_track10(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure),
  'maintenance creation predecessor consumes only the checked branch authority context');
SELECT ok(
  (SELECT prosrc LIKE '%has_maintenance_branch_authority_context%'
      AND prosrc LIKE '%is_executable_maintenance_assignee%'
      AND prosrc NOT LIKE '%operations_manager%'
      AND prosrc NOT LIKE '%operations_member%'
   FROM pg_proc
   WHERE oid='app_private.create_maintenance_task_internal(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure),
  'maintenance creation internals consume checked authority and permission-based assignee identity');
SELECT ok(
  (SELECT prosrc LIKE '%maintenance.complete%'
      AND prosrc LIKE '%ordinary_access_enabled%'
   FROM pg_proc
   WHERE oid='app_private.has_maintenance_member_identity(uuid,uuid,uuid)'::regprocedure),
  'maintenance assignee identity follows the active custom-role permission contract');
SELECT ok((SELECT prosrc LIKE '%maintenance.complete%' FROM pg_proc
  WHERE oid='public.submit_maintenance_cost(uuid,uuid,date,uuid,text,text)'::regprocedure),
  'maintenance execution/cost submission maps to maintenance.complete');
SELECT ok((SELECT prosrc LIKE '%maintenance.review%' FROM pg_proc
  WHERE oid='public.update_maintenance_task(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure),
  'maintenance review transition maps to maintenance.review');
SELECT ok(
  (SELECT prosrc LIKE '%has_maintenance_branch_authority_context%'
      AND prosrc NOT LIKE '%operations_manager%'
   FROM pg_proc
   WHERE oid='app_private.update_maintenance_task_baseline_track10(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure)
  AND
  (SELECT prosrc LIKE '%has_maintenance_branch_authority_context%'
      AND prosrc LIKE '%is_executable_maintenance_assignee%'
      AND prosrc NOT LIKE '%operations_manager%'
      AND prosrc NOT LIKE '%operations_member%'
   FROM pg_proc
   WHERE oid='app_private.update_maintenance_task_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure),
  'maintenance update predecessors consume only checked permission and assignee contexts');
SELECT ok(
  (SELECT prosrc LIKE '%lock_financial_month_scope%'
   FROM pg_proc
   WHERE oid='app_private.is_financial_month_locked(uuid,uuid,date)'::regprocedure)
  AND (SELECT prosrc LIKE '%lock_financial_month_scope%'
       FROM pg_proc
       WHERE oid='app_private.lock_open_financial_month(uuid,uuid,date)'::regprocedure)
  AND (SELECT prosrc LIKE '%lock_financial_month_scope%'
       FROM pg_proc
       WHERE oid='public.set_financial_month_lock(uuid,uuid,date,boolean,text)'::regprocedure),
  'global and branch lock checks and writes share the same organization-month gate'
);
SELECT ok(
  (SELECT prosrc LIKE '%expense_submissions%'
      AND prosrc LIKE '%supporting_document_id%'
      AND prosrc LIKE '%finance.view%'
   FROM pg_proc
   WHERE oid='app_private.can_access_document(uuid,uuid,public.organization_permission_key)'::regprocedure),
  'submitted expense evidence is classified for exact branch-aware finance viewing'
);
SELECT ok(
  (SELECT prosrc LIKE '%can_submit_paid_cost_for_property_as_actor%'
   FROM pg_proc
   WHERE oid='public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)'::regprocedure)
  AND
  (SELECT prosrc LIKE '%can_submit_paid_cost_for_property_as_actor%'
   FROM pg_proc
   WHERE oid='app_private.register_paid_cost_evidence_verified_baseline_track6_registrar(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)'::regprocedure),
  'paid-cost evidence verification and registration use exact Property branch authority');
SELECT ok(
  (SELECT prosrc LIKE '%organization_role_permissions%'
      AND prosrc LIKE '%maintenance.complete%'
      AND prosrc NOT LIKE '%membership.role IN%'
   FROM pg_proc
   WHERE oid='app_private.assert_paid_cost_task_actor_scope(uuid,uuid,uuid,uuid)'::regprocedure),
  'task-bound paid-cost evidence maps custom permissions to the exact task branch');

CREATE TEMP TABLE remaining_scope_state (
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_one_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_two_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_branch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_one_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_two_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unresolved_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_one_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_two_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unresolved_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  super_id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_id uuid NOT NULL DEFAULT gen_random_uuid(),
  missing_id uuid NOT NULL DEFAULT gen_random_uuid(),
  inactive_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_super_id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  missing_role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  inactive_role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  person_one_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;
INSERT INTO remaining_scope_state DEFAULT VALUES;
GRANT SELECT ON remaining_scope_state TO authenticated;

INSERT INTO auth.users(id,email)
SELECT super_id,'remaining-scope-super@example.test' FROM remaining_scope_state UNION ALL
SELECT full_id,'remaining-scope-full@example.test' FROM remaining_scope_state UNION ALL
SELECT missing_id,'remaining-scope-missing@example.test' FROM remaining_scope_state UNION ALL
SELECT inactive_id,'remaining-scope-inactive@example.test' FROM remaining_scope_state UNION ALL
SELECT other_super_id,'remaining-scope-other@example.test' FROM remaining_scope_state;

INSERT INTO public.organizations(id,name,slug)
SELECT organization_id,'Remaining scope A','remaining-scope-'||left(organization_id::text,8) FROM remaining_scope_state UNION ALL
SELECT other_organization_id,'Remaining scope B','remaining-other-'||left(other_organization_id::text,8) FROM remaining_scope_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
SELECT branch_one_id,organization_id,'One','RS-ONE','active' FROM remaining_scope_state UNION ALL
SELECT branch_two_id,organization_id,'Two','RS-TWO','active' FROM remaining_scope_state UNION ALL
SELECT other_branch_id,other_organization_id,'Other','RS-OTH','active' FROM remaining_scope_state;

INSERT INTO public.organization_roles(id,organization_id,name,status)
SELECT full_role_id,organization_id,'Full remaining scope','active' FROM remaining_scope_state UNION ALL
SELECT missing_role_id,organization_id,'Missing archive','active' FROM remaining_scope_state UNION ALL
SELECT inactive_role_id,organization_id,'Inactive assignment role','active' FROM remaining_scope_state;

INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT s.organization_id,s.full_role_id,k.permission_key
FROM remaining_scope_state s
CROSS JOIN unnest(enum_range(NULL::public.organization_permission_key)) k(permission_key);
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT organization_id,missing_role_id,'properties.view'::public.organization_permission_key FROM remaining_scope_state UNION ALL
SELECT organization_id,inactive_role_id,'properties.archive'::public.organization_permission_key FROM remaining_scope_state;

INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT organization_id,super_id,'super_admin',NULL,NULL FROM remaining_scope_state UNION ALL
SELECT organization_id,full_id,'custom',branch_one_id,full_role_id FROM remaining_scope_state UNION ALL
SELECT organization_id,missing_id,'custom',branch_one_id,missing_role_id FROM remaining_scope_state UNION ALL
SELECT organization_id,inactive_id,'custom',branch_one_id,inactive_role_id FROM remaining_scope_state UNION ALL
SELECT other_organization_id,other_super_id,'super_admin',NULL,NULL FROM remaining_scope_state;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled=true
WHERE organization_id=(SELECT organization_id FROM remaining_scope_state);

ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties(id,organization_id,branch_id,name,code,property_type,rental_structure)
SELECT property_one_id,organization_id,branch_one_id,'Scope property one','RS-P1','apartment','multi_unit' FROM remaining_scope_state UNION ALL
SELECT property_two_id,organization_id,branch_two_id,'Scope property two','RS-P2','apartment','multi_unit' FROM remaining_scope_state UNION ALL
SELECT unresolved_property_id,organization_id,NULL,'Unresolved property','RS-PU','apartment','multi_unit' FROM remaining_scope_state UNION ALL
SELECT other_property_id,other_organization_id,other_branch_id,'Other property','RS-PO','apartment','multi_unit' FROM remaining_scope_state;
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;

ALTER TABLE public.units DISABLE TRIGGER USER;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status)
SELECT unit_one_id,organization_id,property_one_id,'U-1','vacant' FROM remaining_scope_state UNION ALL
SELECT unit_two_id,organization_id,property_two_id,'U-2','vacant' FROM remaining_scope_state UNION ALL
SELECT unresolved_unit_id,organization_id,unresolved_property_id,'U-X','vacant' FROM remaining_scope_state UNION ALL
SELECT other_unit_id,other_organization_id,other_property_id,'U-O','vacant' FROM remaining_scope_state;
ALTER TABLE public.units ENABLE TRIGGER USER;

INSERT INTO public.people(id,organization_id,display_name)
SELECT person_one_id,organization_id,'Remaining scope person' FROM remaining_scope_state;
INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id)
SELECT organization_id,person_one_id,branch_one_id FROM remaining_scope_state;

-- Unit archive/restore gap: exact properties.archive and exact active branch.
SELECT set_config('request.jwt.claim.sub',(SELECT full_id::text FROM remaining_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT unit_one_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  'same-branch properties.archive archives Unit');
SELECT lives_ok(format('SELECT public.restore_unit(%L,%L)',
  (SELECT unit_one_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  'same-branch properties.archive restores Unit');
SELECT throws_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT unit_two_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  '42501',NULL,'other-branch Unit archive is denied');
SELECT throws_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT other_unit_id FROM remaining_scope_state),(SELECT other_organization_id FROM remaining_scope_state)),
  '42501',NULL,'cross-organization Unit archive is denied');
SELECT throws_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT unresolved_unit_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  '42501',NULL,'ordinary unresolved Unit archive is denied');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT missing_id::text FROM remaining_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT unit_one_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  '42501',NULL,'missing properties.archive key denies Unit archive');
RESET ROLE;

UPDATE public.organization_branches SET status='inactive'
WHERE id=(SELECT branch_one_id FROM remaining_scope_state);
SELECT set_config('request.jwt.claim.sub',(SELECT inactive_id::text FROM remaining_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT unit_one_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  '42501',NULL,'inactive ordinary branch assignment denies Unit archive');
RESET ROLE;
UPDATE public.organization_branches SET status='active'
WHERE id=(SELECT branch_one_id FROM remaining_scope_state);

SELECT set_config('request.jwt.claim.sub',(SELECT super_id::text FROM remaining_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT unresolved_unit_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  'Super Admin may archive unresolved Unit in its organization');
SELECT lives_ok(format('SELECT public.restore_unit(%L,%L)',
  (SELECT unresolved_unit_id FROM remaining_scope_state),(SELECT organization_id FROM remaining_scope_state)),
  'Super Admin may restore unresolved Unit in its organization');
SELECT throws_ok(format('SELECT public.archive_unit(%L,%L)',
  (SELECT other_unit_id FROM remaining_scope_state),(SELECT other_organization_id FROM remaining_scope_state)),
  '42501',NULL,'Super Admin bypass never crosses organization');
RESET ROLE;

-- Legacy null locks remain global; branch locks are exact.
INSERT INTO public.financial_month_locks(organization_id,branch_id,month_start,is_locked,reason,locked_by,locked_at)
SELECT organization_id,NULL,DATE '2026-01-01',true,'legacy global',super_id,now()
FROM remaining_scope_state;
SELECT ok(app_private.is_financial_month_locked(
  (SELECT organization_id FROM remaining_scope_state),
  (SELECT branch_one_id FROM remaining_scope_state),DATE '2026-01-15'),
  'legacy null lock blocks branch one');
SELECT ok(app_private.is_financial_month_locked(
  (SELECT organization_id FROM remaining_scope_state),
  (SELECT branch_two_id FROM remaining_scope_state),DATE '2026-01-15'),
  'legacy null lock blocks every branch');
DELETE FROM public.financial_month_locks
WHERE organization_id=(SELECT organization_id FROM remaining_scope_state);
INSERT INTO public.financial_month_locks(organization_id,branch_id,month_start,is_locked,reason,locked_by,locked_at)
SELECT organization_id,branch_one_id,DATE '2026-02-01',true,'branch one',super_id,now()
FROM remaining_scope_state;
SELECT ok(app_private.is_financial_month_locked(
  (SELECT organization_id FROM remaining_scope_state),
  (SELECT branch_one_id FROM remaining_scope_state),DATE '2026-02-15'),
  'branch lock blocks matching branch');
SELECT ok(NOT app_private.is_financial_month_locked(
  (SELECT organization_id FROM remaining_scope_state),
  (SELECT branch_two_id FROM remaining_scope_state),DATE '2026-02-15'),
  'branch lock does not block another branch');

-- Storage path scope is checked against metadata/authoritative parent, not merely
-- an organization prefix supplied by the client.
SELECT is(app_private.storage_object_branch_id(format('%s/branches/%s/documents/a.pdf',
  (SELECT organization_id FROM remaining_scope_state),(SELECT branch_one_id FROM remaining_scope_state))),
  (SELECT branch_one_id FROM remaining_scope_state),
  'storage branch parser accepts the canonical branch-scoped path');
SELECT is(app_private.storage_object_branch_id(format('%s/branches/%s/documents/a.pdf',
  (SELECT organization_id FROM remaining_scope_state),(SELECT branch_two_id FROM remaining_scope_state))),
  (SELECT branch_two_id FROM remaining_scope_state),
  'storage branch parser returns the explicit path branch');
SELECT is(app_private.storage_object_branch_id(format('%s/documents/legacy.pdf',
  (SELECT organization_id FROM remaining_scope_state))),NULL::uuid,
  'legacy unscoped storage path remains unresolved');

-- Immutable snapshots and authoritative agreement fail closed even to direct
-- privileged fixture writes.
INSERT INTO public.activity_logs(organization_id,branch_id,actor_id,entity_type,entity_id,action)
SELECT organization_id,branch_one_id,super_id,'property',property_one_id,'created'
FROM remaining_scope_state;
SELECT throws_ok(format(
  'UPDATE public.activity_logs SET branch_id=%L WHERE organization_id=%L AND entity_id=%L',
  (SELECT branch_two_id FROM remaining_scope_state),
  (SELECT organization_id FROM remaining_scope_state),
  (SELECT property_one_id FROM remaining_scope_state)),
  '22023',NULL,'activity branch snapshot is immutable');

-- Imports have no permission key and therefore remain Super-Admin-only.
SELECT set_config('request.jwt.claim.sub',(SELECT full_id::text FROM remaining_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format(
  'SELECT public.stage_import_run_v1(%L,%L,%L,%s,%L,%L,%L,%L)',
  (SELECT organization_id FROM remaining_scope_state),'properties','ordinary.csv',1,
  'text/csv','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
  '42501',NULL,'even a custom role holding all 23 keys cannot stage an unscoped import');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT super_id::text FROM remaining_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format(
  'SELECT public.stage_import_run_v1(%L,%L,%L,%s,%L,%L,%L,%L)',
  (SELECT organization_id FROM remaining_scope_state),'properties','super.csv',1,
  'text/csv','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
  '22023',NULL,
  'Super Admin passes authorization before invalid import payload validation');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
