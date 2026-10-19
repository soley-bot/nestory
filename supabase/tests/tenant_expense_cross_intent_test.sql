BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT no_plan();
-- Independent synthetic tenant fixture; all evidence rolls back.
CREATE TEMP TABLE expense_approval_state (
  organization_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000001',
  cross_organization_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000002',
  super_admin_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000101',
  finance_manager_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000102',
  finance_member_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000103',
  operations_manager_id uuid NOT NULL DEFAULT 'b1000000-0000-0000-0000-000000000104',
  property_id uuid NOT NULL DEFAULT 'b2000000-0000-0000-0000-000000000001',
  cross_property_id uuid NOT NULL DEFAULT 'b2000000-0000-0000-0000-000000000002',
  unit_id uuid NOT NULL DEFAULT 'b3000000-0000-0000-0000-000000000001',
  owner_id uuid NOT NULL DEFAULT 'b4000000-0000-0000-0000-000000000001',
  operations_person_id uuid NOT NULL DEFAULT 'b4000000-0000-0000-0000-000000000002',
  tenant_id uuid NOT NULL DEFAULT 'b4000000-0000-0000-0000-000000000003',
  lease_id uuid NOT NULL DEFAULT 'b5000000-0000-0000-0000-000000000001',
  billing_id uuid NOT NULL DEFAULT 'b6000000-0000-0000-0000-000000000001',
  invoice_id uuid NOT NULL DEFAULT 'b7000000-0000-0000-0000-000000000001',
  source_id uuid,
  evidence_document_id uuid,
  rejection_evidence_document_id uuid,
  tenant_evidence_document_id uuid,
  locked_evidence_document_id uuid,
  submission_id uuid,
  rejection_submission_id uuid,
  locked_submission_id uuid,
  tenant_submission_id uuid,
  approval_result jsonb,
  tenant_approval_result jsonb,
  reversal_result jsonb
) ON COMMIT DROP;

INSERT INTO expense_approval_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON expense_approval_state TO authenticated;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  label || '@expense-approval.test',
  extensions.crypt('expense-approval-test', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM expense_approval_state
  UNION ALL
  SELECT finance_manager_id, 'finance-manager' FROM expense_approval_state
  UNION ALL
  SELECT finance_member_id, 'finance-member' FROM expense_approval_state
  UNION ALL
  SELECT operations_manager_id, 'operations-manager' FROM expense_approval_state
) AS users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Expense approval organization', 'expense-approval'
FROM expense_approval_state
UNION ALL
SELECT cross_organization_id, 'Cross expense organization', 'cross-expense'
FROM expense_approval_state;

INSERT INTO public.organization_branches (organization_id, name, code)
SELECT organization_id, 'Expense operations', 'EXP-OPS'
FROM expense_approval_state;

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT owner_id, organization_id, 'Expense Owner', 'individual'
FROM expense_approval_state
UNION ALL
SELECT operations_person_id, organization_id, 'Expense Operations Manager', 'individual'
FROM expense_approval_state
UNION ALL
SELECT tenant_id, organization_id, 'Expense Tenant', 'individual'
FROM expense_approval_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, owner_id, 'owner', 'active'
FROM expense_approval_state
UNION ALL
SELECT organization_id, operations_person_id, 'staff', 'active'
FROM expense_approval_state
UNION ALL
SELECT organization_id, tenant_id, 'tenant', 'active'
FROM expense_approval_state;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  person_id,
  branch_id
)
SELECT organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM expense_approval_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager', NULL::uuid, NULL::uuid
FROM expense_approval_state
UNION ALL
SELECT organization_id, finance_member_id, 'finance_member', NULL::uuid, NULL::uuid
FROM expense_approval_state
UNION ALL
SELECT
  state.organization_id,
  state.operations_manager_id,
  'operations_manager',
  state.operations_person_id,
  branch.id
FROM expense_approval_state AS state
JOIN public.organization_branches AS branch
  ON branch.organization_id = state.organization_id
UNION ALL
SELECT cross_organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM expense_approval_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Expense approval property',
  'EA-001',
  'apartment',
  'active'
FROM expense_approval_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  'Cross expense property',
  'EA-002',
  'apartment',
  'active'
FROM expense_approval_state;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status
)
SELECT unit_id, organization_id, property_id, 'EA-A1', 'vacant'
FROM expense_approval_state;

SET LOCAL session_replication_role = replica;

INSERT INTO public.leases (
  id,
  organization_id,
  property_id,
  unit_id,
  primary_tenant_person_id,
  status,
  created_by,
  updated_by
)
SELECT
  lease_id,
  organization_id,
  property_id,
  unit_id,
  tenant_id,
  'draft',
  super_admin_id,
  super_admin_id
FROM expense_approval_state;

SET LOCAL session_replication_role = origin;

INSERT INTO public.lease_terms (
  organization_id,
  lease_id,
  term_sequence,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  status,
  authority_kind,
  confirmed_at,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  organization_id,
  lease_id,
  1,
  '2026-08-01',
  '2027-07-31',
  1000,
  'USD',
  5,
  'monthly',
  'active',
  'authoritative',
  now(),
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM expense_approval_state;

INSERT INTO public.lease_billing_terms (
  id,
  organization_id,
  lease_id,
  property_id,
  effective_from,
  effective_to,
  collection_route,
  management_fee_mode,
  management_fee_value,
  charge_management_fee_when_active,
  full_management_fee_during_proration,
  billing_recipient_kind,
  billing_recipient_person_id,
  confirmed_by,
  created_by,
  updated_by
)
SELECT
  billing_id,
  organization_id,
  lease_id,
  property_id,
  '2026-08-01',
  '2027-07-31',
  'through_ips',
  'percentage',
  10,
  true,
  true,
  'individual',
  tenant_id,
  super_admin_id,
  super_admin_id,
  super_admin_id
FROM expense_approval_state;

INSERT INTO public.tenant_invoices (
  id,
  organization_id,
  invoice_number,
  property_id,
  unit_id,
  lease_id,
  billing_term_id,
  billing_period_start,
  billing_period_end,
  issue_date,
  due_date,
  collection_route,
  recipient_kind,
  recipient_person_id,
  recipient_label,
  occupant_labels,
  currency,
  total_amount,
  created_by
)
SELECT
  invoice_id,
  organization_id,
  'EA-INV-0001',
  property_id,
  unit_id,
  lease_id,
  billing_id,
  '2026-08-01',
  '2026-08-31',
  '2026-08-01',
  '2026-08-05',
  'through_ips',
  'individual',
  tenant_id,
  'Expense Tenant',
  ARRAY['Expense Tenant'],
  'USD',
  1000,
  super_admin_id
FROM expense_approval_state;
SELECT set_config('request.jwt.claim.sub',super_admin_id::text,true) FROM expense_approval_state;
CREATE TEMP TABLE tenant_tx_state AS SELECT organization_id org,property_id,unit_id,invoice_id,
 super_admin_id admin,finance_member_id maker, cross_organization_id other_org,
 public.create_finance_account(organization_id,'asset','bank','Tenant correction bank',NULL,NULL,NULL,NULL,false,false,false) pay_from,
 public.create_finance_account(organization_id,'expense','expense','Tenant correction utilities',NULL,NULL,NULL,NULL,false,true,false) category
 FROM expense_approval_state s;
SELECT ok(category IS NOT NULL,'tenant billing chart fixture exists') FROM tenant_tx_state;
CREATE TEMP TABLE tenant_tx_lines AS SELECT jsonb_build_array(jsonb_build_object('property_id',property_id,'unit_id',unit_id,
 'tenant_invoice_id',invoice_id,'category_account_id',category,'description','Tenant utility correction','amount','20.00','internal_markup_amount','5.00')) payload FROM tenant_tx_state;
GRANT SELECT ON tenant_tx_state,tenant_tx_lines TO authenticated;

CREATE TEMP TABLE granular_role AS SELECT gen_random_uuid() id, (SELECT id FROM public.organization_branches WHERE organization_id=t.org LIMIT 1) branch FROM tenant_tx_state t;
INSERT INTO public.organization_roles(id,organization_id,name,created_by,updated_by) SELECT r.id,t.org,'Synthetic expense specialist',t.admin,t.admin FROM granular_role r CROSS JOIN tenant_tx_state t;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key,granted_by) SELECT t.org,r.id,k::public.organization_permission_key,t.admin FROM tenant_tx_state t CROSS JOIN granular_role r CROSS JOIN unnest(ARRAY['finance.view','finance.submit_expenses','finance.post_expenses','finance.correct_expenses']) k;
SELECT public.assign_property_branch(t.org,t.property_id,r.branch) FROM tenant_tx_state t CROSS JOIN granular_role r;

UPDATE public.organization_members SET role='custom',custom_role_id=r.id,branch_id=r.branch FROM granular_role r WHERE organization_id=(SELECT org FROM tenant_tx_state) AND role<>'super_admin';
UPDATE public.organization_authorization_states SET transition_manifest_required=false,ordinary_access_enabled=true WHERE organization_id=(SELECT org FROM tenant_tx_state);
CREATE FUNCTION pg_temp.intent_snapshot(o uuid) RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object(
 'parents',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.expense_transactions x WHERE organization_id=o),
 'submissions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.expense_submissions x WHERE organization_id=o),
 'income',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.finance_income_items x WHERE organization_id=o),
 'invoice_lines',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.tenant_invoice_lines x WHERE organization_id=o));
$$;
-- Review first, then authority changes: reuse must fail closed.
DELETE FROM public.organization_role_permissions WHERE role_id=(SELECT id FROM granular_role) AND permission_key='finance.post_expenses';
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tenant_tx_state;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE intent_review AS SELECT public.submit_expense_with_accounts(org,property_id,unit_id,'general',NULL,category,'Intent vendor','2026-08-12',20,5,'USD','tenant',invoice_id,pay_from,NULL,NULL,'Tenant utility correction','intent-review-first') result FROM tenant_tx_state;
SELECT is(public.submit_expense_with_accounts(org,property_id,unit_id,'general',NULL,category,'Intent vendor','2026-08-12',20,5,'USD','tenant',invoice_id,pay_from,NULL,NULL,'Tenant utility correction','intent-review-first'),(SELECT result FROM intent_review),'legacy same-path retry remains stable') FROM tenant_tx_state;
RESET ROLE;
CREATE TEMP TABLE intent_before AS SELECT pg_temp.intent_snapshot(org) snapshot FROM tenant_tx_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key,granted_by) SELECT org,id,'finance.post_expenses',admin FROM tenant_tx_state CROSS JOIN granular_role;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Intent vendor','2026-08-12','USD',pay_from,'tenant',payload,'intent-review-first'),'22023','Conflicting tenant expense submission intent','grant transition cannot post a legacy review key') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Intent vendor','2026-08-12','USD',pay_from,'tenant',payload,'  intent-review-first  '),'22023','Conflicting tenant expense submission intent','whitespace cannot bypass cross-intent conflict') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
RESET ROLE;
SELECT is(pg_temp.intent_snapshot(org),(SELECT snapshot FROM intent_before),'review-to-post conflict preserves all expense/income/invoice rows') FROM tenant_tx_state;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE intent_post AS SELECT public.post_expense_transaction(org,NULL,'Intent vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'intent-post-first') result FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT is(public.post_expense_transaction(org,NULL,'Intent vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'intent-post-first'),(SELECT result FROM intent_post),'grouped same-path retry and generated child keys remain stable') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
RESET ROLE;
UPDATE intent_before SET snapshot=pg_temp.intent_snapshot((SELECT org FROM tenant_tx_state));
DELETE FROM public.organization_role_permissions WHERE role_id=(SELECT id FROM granular_role) AND permission_key='finance.post_expenses';
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.submit_expense_with_accounts(%L,%L,%L,%L,NULL,%L,%L,%L,20,5,%L,%L,%L,%L,NULL,NULL,%L,%L)',org,property_id,unit_id,'general',category,'Intent vendor','2026-08-12','USD','tenant',invoice_id,pay_from,'Tenant utility correction','intent-post-first'),'22023','Conflicting tenant expense submission intent','revoked posting capability cannot submit the successful post key for review') FROM tenant_tx_state;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.submit_expense_with_accounts(%L,%L,%L,%L,NULL,%L,%L,%L,20,5,%L,%L,%L,%L,NULL,NULL,%L,%L)',org,property_id,unit_id,'general',category,'Intent vendor','2026-08-12','USD','tenant',invoice_id,pay_from,'Tenant utility correction','intent-post-first'),'22023','Conflicting tenant expense submission intent','another actor cannot reuse an opposite-path organization key') FROM tenant_tx_state;
RESET ROLE;
SELECT is(pg_temp.intent_snapshot(org),(SELECT snapshot FROM intent_before),'post-to-review conflict preserves all expense/income/invoice rows') FROM tenant_tx_state;
SELECT is((SELECT count(*) FROM public.expense_transactions WHERE organization_id=(SELECT org FROM tenant_tx_state) AND idempotency_key='intent-review-first'),0::bigint,'blocked posting creates no parent');
SELECT is((SELECT count(*) FROM public.expense_submissions WHERE organization_id=(SELECT org FROM tenant_tx_state) AND idempotency_key='intent-post-first'),0::bigint,'blocked legacy request creates no standalone submission');
SELECT is((SELECT count(*) FROM app_private.finance_chart_workflow_idempotency_bindings WHERE organization_id=(SELECT org FROM tenant_tx_state) AND idempotency_key='intent-post-first'),0::bigint,'blocked legacy request creates no chart binding');
SELECT is((SELECT count(*) FROM app_private.expense_operation_authority),0::bigint,'conflicts leave no scoped operation authority');
SELECT is((SELECT status::text FROM public.expense_submissions WHERE id=(SELECT (result->>'submission_id')::uuid FROM intent_review)),'submitted','review source remains pending after conflict');
SELECT is((SELECT status::text FROM public.expense_transactions WHERE id=(SELECT (result->>'transaction_id')::uuid FROM intent_post)),'approved','posted source remains approved after conflict');
SELECT lives_ok(format('SELECT app_private.check_tenant_expense_intent_result(%L,%L,true,''tenant'',''{}''::jsonb)',other_org,'intent-review-first'),'same key in another organization does not collide') FROM tenant_tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT app_private.lock_tenant_expense_intent(NULL,'intent-private-test')$$,'42501',NULL,'clients cannot call the internal guard');
SELECT throws_ok($$SELECT app_private.check_tenant_expense_intent_result(NULL,'intent-private-test',true,'tenant','{}'::jsonb)$$,'42501',NULL,'clients cannot call the result checker');
RESET ROLE;
-- Unknown and known keys must have identical denial before collision lookup.
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.submit_expense_with_accounts(%L,%L,%L,%L,NULL,%L,%L,%L,20,5,%L,%L,%L,%L,NULL,NULL,%L,%L)',org,property_id,unit_id,'general',category,'Intent vendor','2026-08-12','USD','tenant',invoice_id,pay_from,'Tenant utility correction','intent-post-first'),'42501',NULL,'unrelated actor cannot probe an existing grouped key') FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.submit_expense_with_accounts(%L,%L,%L,%L,NULL,%L,%L,%L,20,5,%L,%L,%L,%L,NULL,NULL,%L,%L)',org,property_id,unit_id,'general',category,'Intent vendor','2026-08-12','USD','tenant',invoice_id,pay_from,'Tenant utility correction','intent-unknown-key'),'42501',NULL,'unrelated actor receives same denial for unknown key') FROM tenant_tx_state;
RESET ROLE;
CREATE TEMP TABLE intent_other_branch AS SELECT gen_random_uuid() id;
INSERT INTO public.organization_branches(id,organization_id,name,code) SELECT id,org,'Intent isolated branch','INTENT-OTHER' FROM intent_other_branch CROSS JOIN tenant_tx_state;
UPDATE public.organization_members SET branch_id=(SELECT id FROM intent_other_branch) WHERE organization_id=(SELECT org FROM tenant_tx_state) AND user_id=(SELECT maker FROM tenant_tx_state);
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tenant_tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.submit_expense_with_accounts(%L,%L,%L,%L,NULL,%L,%L,%L,20,5,%L,%L,%L,%L,NULL,NULL,%L,%L)',org,property_id,unit_id,'general',category,'Intent vendor','2026-08-12','USD','tenant',invoice_id,pay_from,'Tenant utility correction','intent-post-first'),'42501',NULL,'out-of-branch actor cannot probe an existing grouped key') FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.submit_expense_with_accounts(%L,%L,%L,%L,NULL,%L,%L,%L,20,5,%L,%L,%L,%L,NULL,NULL,%L,%L)',org,property_id,unit_id,'general',category,'Intent vendor','2026-08-12','USD','tenant',invoice_id,pay_from,'Tenant utility correction','intent-unknown-key'),'42501',NULL,'out-of-branch actor receives same denial for unknown key') FROM tenant_tx_state;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
