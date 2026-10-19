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
SELECT ok('finance.view'::public.organization_permission_key=ANY(app_private.normalize_organization_permission_keys(ARRAY['finance.post_expenses']::public.organization_permission_key[])),'new posting permission normalizes finance view dependency');
SELECT ok(NOT app_private.has_explicit_expense_permission(org,property_id,'finance.post_expenses'),'Super Admin has no implicit new tenant authority') FROM tenant_tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Tenant vendor','2026-08-12','USD',pay_from,'tenant',payload,'granular-sa-denied'),'22023','Direct posting requires an owner expense','existing Super Admin does not gain tenant direct posting') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tenant_tx_state;
CREATE TEMP TABLE granular_post AS SELECT public.post_expense_transaction(org,NULL,'Granular vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'granular-post-key') result FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT is((SELECT result->>'status' FROM granular_post),'approved','explicit post authority posts tenant expense without broad approval');
SELECT is(public.post_expense_transaction(org,NULL,'Granular vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'granular-post-key'),(SELECT result FROM granular_post),'granular post retry returns same result') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
CREATE TEMP TABLE granular_correction AS SELECT public.replace_expense_transaction(org,(SELECT (result->>'transaction_id')::uuid FROM granular_post),'approved','Correct granular cost','2026-08-13',NULL,'Granular vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',jsonb_set(payload,'{0,amount}','"30.00"'),'granular-correction-key') result FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT is((SELECT result->>'status' FROM granular_correction),'approved','explicit correction atomically replaces without broad correct or approve');
SELECT throws_ok(format('SELECT public.reverse_expense_transaction(%L,%L,%L,%L,%L)',org,(SELECT (result->>'transaction_id')::uuid FROM granular_correction),'2026-08-13','Unauthorized standalone reversal','granular-reverse-denied'),'42501','Not authorized','correct permission does not grant standalone reversal') FROM tenant_tx_state;
SELECT throws_ok($$SELECT * FROM app_private.expense_operation_authority$$,'42501',NULL,'client cannot inspect operation capability');
SELECT throws_ok($$SELECT app_private.advance_expense_operation(NULL,NULL)$$,'42501',NULL,'client cannot mint or advance operation capability');

CREATE TEMP TABLE granular_pending AS SELECT public.submit_expense_transaction(org,NULL,'Pending vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'granular-pending-key') result FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Pending vendor','2026-08-12','USD',pay_from,'tenant',payload,'granular-pending-key'),'22023','Conflicting direct expense posting request','post authority cannot adopt a pending review request') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT throws_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,NULL,%L)',org,(SELECT (result->>'transaction_id')::uuid FROM granular_pending),'approve','granular-review-denied'),'42501','Not authorized','post permission does not grant standalone review') FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Bad vendor','2026-08-12','USD',pay_from,'tenant',jsonb_set(payload,'{0,amount}','"-1.00"'),'granular-invalid-key'),'22023',NULL,'invalid post rolls back capability and submission') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Changed vendor','2026-08-12','USD',pay_from,'tenant',payload,'granular-post-key'),'22023',NULL,'changed post payload does not reuse a key') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT set_config('app.expense_transaction_org',(SELECT org::text FROM tenant_tx_state),true),set_config('app.expense_transaction_operation','review',true),set_config('app.expense_transaction_token','forged',true);
SELECT throws_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,NULL,%L)',org,(SELECT (result->>'transaction_id')::uuid FROM granular_pending),'approve','granular-forged-review'),'42501','Not authorized','forged GUC cannot grant review authority') FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Other branch vendor','2026-08-12','USD',pay_from,'tenant',jsonb_set(payload,'{0,property_id}','"b2000000-0000-0000-0000-000000000002"'),'granular-foreign-property'),'42501','Not authorized','new permission cannot cross organization property scope') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.expense_operation_authority),0::bigint,'all successful and failed operations clear private context');
SELECT is((SELECT count(*) FROM public.expense_transactions WHERE idempotency_key='granular-invalid-key'),0::bigint,'failed new operation leaves no pending parent');
SELECT ok(NOT app_private.can_reverse_expense(org),'new correction key does not alter standalone reversal helper') FROM tenant_tx_state;
SELECT ok(NOT app_private.has_org_permission(org,'finance.approve_expenses') AND NOT app_private.has_org_permission(org,'finance.correct_records'),'new role receives neither broad approval nor broad correction') FROM tenant_tx_state;
DELETE FROM public.organization_role_permissions WHERE role_id=(SELECT id FROM granular_role) AND permission_key='finance.correct_expenses';
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,(SELECT (result->>'transaction_id')::uuid FROM granular_correction),'approved','Post-only correction attempt','2026-08-13','Granular vendor','2026-08-12','USD',pay_from,'tenant',payload,'granular-postonly-correct'),'42501','Not authorized','posting alone does not confer expense correction') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
RESET ROLE;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key,granted_by) SELECT org,id,'finance.correct_expenses',admin FROM tenant_tx_state CROSS JOIN granular_role;
DELETE FROM public.organization_role_permissions WHERE role_id=(SELECT id FROM granular_role) AND permission_key='finance.post_expenses';
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Correction-only vendor','2026-08-12','USD',pay_from,'tenant',payload,'granular-correctonly-post'),'42501','Not authorized','correction alone cannot create an unrelated expense') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
SELECT is(public.replace_expense_transaction(org,(SELECT (result->>'transaction_id')::uuid FROM granular_correction),'approved','Correction-only replacement','2026-08-13',NULL,'Granular vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'granular-correctonly-replace')->>'status','approved','correction-only key can replace existing expense without post key') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.expense_operation_authority),0::bigint,'correction-only operation leaves no ambient authority');

-- Explicit capabilities remain subject to active role/branch and access gates.
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key,granted_by) SELECT org,id,'finance.post_expenses',admin FROM tenant_tx_state CROSS JOIN granular_role;
SELECT throws_ok($$UPDATE public.organization_roles SET status='archived',archived_at=now(),archived_by=(SELECT admin FROM tenant_tx_state) WHERE id=(SELECT id FROM granular_role)$$,NULL,'Assigned roles cannot be archived.','role cannot become archived while assigned to the authorized actor');
SAVEPOINT disabled_access;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=false WHERE organization_id=(SELECT org FROM tenant_tx_state);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Disabled access vendor','2026-08-12','USD',pay_from,'tenant',payload,'granular-disabled-access'),'42501','Not authorized','disabled ordinary access blocks new capability') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
RESET ROLE;
ROLLBACK TO disabled_access;
CREATE TEMP TABLE other_granular_scope AS SELECT gen_random_uuid() branch,gen_random_uuid() property;
INSERT INTO public.organization_branches(id,organization_id,name,code) SELECT branch,org,'Other test branch','OTHER' FROM other_granular_scope CROSS JOIN tenant_tx_state;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tenant_tx_state;
UPDATE other_granular_scope o SET property=public.create_property_minimal(t.org,o.branch,'Other branch property','GRANULAR-OTHER','Apartment',NULL,NULL,'granular-other-property',NULL,NULL,NULL) FROM tenant_tx_state t;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tenant_tx_state;
GRANT SELECT ON other_granular_scope TO authenticated;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Other branch vendor','2026-08-12','USD',pay_from,'tenant',jsonb_set(payload,'{0,property_id}',to_jsonb(property)),'granular-other-branch'),'42501','Not authorized','new posting key cannot reach another branch of same company') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN other_granular_scope;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Mixed branch vendor','2026-08-12','USD',pay_from,'owner',payload||jsonb_set(payload,'{0,property_id}',to_jsonb(property)),'granular-mixed-branch'),'42501','Not authorized','mixed scoped and out-of-branch lines do not authorize a partial post') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN other_granular_scope;
SELECT throws_ok($$INSERT INTO app_private.expense_operation_authority(xid,actor,organization_id,operation,phase,properties) VALUES(txid_current(),auth.uid(),NULL,'post','prepare','{}')$$,'42501',NULL,'authenticated cannot forge capability row');
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.expense_operation_authority),0::bigint,'scope denials leave no private capability');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.organization_role_permissions WHERE permission_key IN('finance.post_expenses','finance.correct_expenses') AND role_id<>(SELECT id FROM granular_role)),'migration grants no new capabilities to existing roles');

SET LOCAL ROLE authenticated;
CREATE TEMP TABLE granular_legacy AS SELECT (public.submit_expense_with_accounts(org,property_id,unit_id,'general',NULL,category,'Granular legacy vendor','2026-08-12',5,0,'USD','tenant',invoice_id,pay_from,NULL,NULL,'Legacy granular fixture','granular-legacy-original')->>'submission_id')::uuid id FROM tenant_tx_state;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tenant_tx_state;
SELECT public.review_expense_with_account(org,id,'approve','Approve synthetic legacy','granular-legacy-review',pay_from) FROM tenant_tx_state CROSS JOIN granular_legacy;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tenant_tx_state;
SELECT is(public.replace_legacy_expense_submission(org,id,'Correct legacy expense','2026-08-13',NULL,'Granular legacy vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'granular-legacy-correction')->>'status','approved','explicit correction key supports audited legacy replacement without broad rights') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN granular_legacy;
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.expense_operation_authority),0::bigint,'legacy replacement clears operation capability');
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at,enabled_by) SELECT org,true,now(),admin FROM tenant_tx_state;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Stepup vendor','2026-08-12','USD',pay_from,'tenant',payload,'granular-stepup-denied'),'42501',NULL,'new posting capability cannot bypass configured privileged step-up') FROM tenant_tx_state CROSS JOIN tenant_tx_lines;
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.expense_operation_authority),0::bigint,'downstream step-up failure rolls back new authority');
SELECT is((SELECT count(*) FROM public.expense_transactions WHERE idempotency_key='granular-stepup-denied'),0::bigint,'step-up failure leaves no submitted expense');
SELECT * FROM finish();
ROLLBACK;


