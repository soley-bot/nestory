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
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE tenant_tx_cases AS SELECT kind,(public.submit_expense_transaction(org,NULL,'Tenant utility vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',payload,'tenant-correction-'||kind)->>'transaction_id')::uuid id
 FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN unnest(ARRAY['pending','unpaid','paid']) kind;
SELECT public.review_expense_transaction(org,id,'approve','Original utility','tenant-original-'||kind)
 FROM tenant_tx_state CROSS JOIN tenant_tx_cases WHERE kind<>'pending';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,NULL,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
 org,id,'submitted','Fix utility amount','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',jsonb_set(payload,'{0,unit_id}',to_jsonb(gen_random_uuid())),'tenant-pending-invalid'),NULL,NULL,'invalid unit rolls back pending cancellation')
 FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='pending';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM tenant_tx_cases WHERE kind='pending')),'submitted','failed pending edit leaves original submitted');
CREATE TEMP TABLE tenant_tx_replacements AS SELECT kind,(public.replace_expense_transaction(org,id,'submitted','Fix utility amount',NULL,NULL,'Tenant utility vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',jsonb_set(payload,'{0,amount}','"30.00"'),'tenant-pending-valid')->>'transaction_id')::uuid id
 FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='pending';
SELECT is((public.replace_expense_transaction(org,id,'submitted','Fix utility amount',NULL,NULL,'Tenant utility vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',jsonb_set(payload,'{0,amount}','"30.00"'),'tenant-pending-valid')->>'transaction_id')::uuid,
 (SELECT id FROM tenant_tx_replacements WHERE kind='pending'),'pending tenant retry returns same replacement') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='pending';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
 org,id,'approved','Fix utility amount','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',jsonb_set(payload,'{0,amount}','"-1.00"'),'tenant-approved-invalid'),NULL,NULL,'invalid approved replacement rolls back reversal')
 FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='unpaid';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM tenant_tx_cases WHERE kind='unpaid')),'approved','failed correction preserves approved original');
SELECT is((SELECT count(*) FROM public.expense_customer_adjustments a JOIN public.expense_transaction_lines l ON l.submission_id=a.submission_id WHERE l.transaction_id=(SELECT id FROM tenant_tx_cases WHERE kind='unpaid')),0::bigint,'failed correction leaves no invoice adjustment');
INSERT INTO tenant_tx_replacements SELECT kind,(public.replace_expense_transaction(org,id,'approved','Fix utility amount','2026-08-13',NULL,'Tenant utility vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',jsonb_set(payload,'{0,amount}','"30.00"'),'tenant-approved-valid')->>'transaction_id')::uuid
 FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='unpaid';
SELECT is((public.replace_expense_transaction(org,id,'approved','Fix utility amount','2026-08-13',NULL,'Tenant utility vendor','2026-08-12','USD',pay_from,NULL,NULL,'tenant',jsonb_set(payload,'{0,amount}','"30.00"'),'tenant-approved-valid')->>'transaction_id')::uuid,
 (SELECT id FROM tenant_tx_replacements WHERE kind='unpaid'),'approved tenant retry returns same replacement') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='unpaid';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM tenant_tx_replacements WHERE kind='unpaid')),'approved','tenant replacement posts atomically');
SELECT is((SELECT replaces_transaction_id FROM public.expense_transactions WHERE id=(SELECT id FROM tenant_tx_replacements WHERE kind='unpaid')),(SELECT id FROM tenant_tx_cases WHERE kind='unpaid'),'tenant correction links immutable original');
SELECT is((SELECT sum(a.amount) FROM public.expense_customer_adjustments a JOIN public.expense_transaction_lines l ON l.submission_id=a.submission_id WHERE l.transaction_id=(SELECT id FROM tenant_tx_cases WHERE kind='unpaid')),-25::numeric,'negative adjustment cancels original cost plus markup exactly once');
SELECT ok((SELECT bool_and(s.tenant_invoice_id=t.invoice_id AND s.property_id=t.property_id AND s.unit_id=t.unit_id AND s.responsibility='tenant') FROM public.expense_submissions s JOIN public.expense_transaction_lines l ON l.submission_id=s.id CROSS JOIN tenant_tx_state t WHERE l.transaction_id IN(SELECT id FROM tenant_tx_replacements)),'tenant identity and property/unit attribution remain intact');
SELECT is((SELECT sum(a.signed_amount) FROM public.finance_payment_allocations a JOIN public.expense_submissions s ON a.id IN(s.approved_payment_allocation_id,s.reversal_payment_allocation_id) JOIN public.expense_transaction_lines l ON l.submission_id=s.id WHERE l.transaction_id=(SELECT id FROM tenant_tx_cases WHERE kind='unpaid')),0::numeric,'original payment and reversal allocations net zero');
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'approved','Unauthorized correction','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',payload,'tenant-denied-maker'),'42501','Not authorized','submitter permission alone cannot correct posted tenant expense') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='paid';
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',other_org,id,'approved','Wrong company correction','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',payload,'tenant-denied-company'),'23503','Expense transaction not found','cross-company transaction lookup fails closed') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='paid';

SELECT public.record_tenant_invoice_payment_with_account(t.org,t.invoice_id,5,'2026-08-13',t.pay_from,'Partial tenant payment',jsonb_build_array(jsonb_build_object('lineId',r.tenant_invoice_line_id,'amount',5)),'tenant-correction-payment')
 FROM tenant_tx_state t CROSS JOIN tenant_tx_cases c JOIN public.expense_transaction_lines l ON l.transaction_id=c.id JOIN public.expense_submissions s ON s.id=l.submission_id JOIN public.ips_expense_responsibilities r ON r.id=s.approved_responsibility_id WHERE c.kind='paid';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'approved','Fix settled utility','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',payload,'tenant-denied-payment'),'22023','Tenant payment already settled this charge; use a customer correction','partial tenant receipt prevents automatic reversal') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_cases WHERE kind='paid';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM tenant_tx_cases WHERE kind='paid')),'approved','paid correction failure retains original approval');
SELECT is((SELECT count(*) FROM public.expense_customer_adjustments a JOIN public.expense_transaction_lines l ON l.submission_id=a.submission_id WHERE l.transaction_id=(SELECT id FROM tenant_tx_cases WHERE kind='paid')),0::bigint,'paid correction failure appends no customer adjustment');
SELECT is((SELECT sum(p.amount) FROM public.tenant_invoice_payment_allocations p JOIN public.ips_expense_responsibilities r ON r.tenant_invoice_line_id=p.invoice_line_id JOIN public.expense_submissions s ON s.approved_responsibility_id=r.id JOIN public.expense_transaction_lines l ON l.submission_id=s.id WHERE l.transaction_id=(SELECT id FROM tenant_tx_cases WHERE kind='paid')),5::numeric,'denied correction preserves exact paid allocation');
SELECT is((SELECT i.description FROM public.finance_income_items i JOIN public.tenant_invoice_lines il ON il.income_item_id=i.id JOIN public.ips_expense_responsibilities r ON r.tenant_invoice_line_id=il.id JOIN public.expense_submissions s ON s.approved_responsibility_id=r.id JOIN public.expense_transaction_lines l ON l.submission_id=s.id WHERE l.transaction_id=(SELECT id FROM tenant_tx_replacements WHERE kind='unpaid')),'Tenant utility correction','authoritative grouped description reaches tenant income at creation');
SELECT throws_ok(format('UPDATE public.finance_income_items SET description=%L WHERE id=(SELECT il.income_item_id FROM public.tenant_invoice_lines il JOIN public.ips_expense_responsibilities r ON r.tenant_invoice_line_id=il.id JOIN public.expense_submissions s ON s.approved_responsibility_id=r.id JOIN public.expense_transaction_lines l ON l.submission_id=s.id WHERE l.transaction_id=%L)', 'Forged mutable charge',(SELECT id FROM tenant_tx_replacements WHERE kind='unpaid')),'42501','permission denied for table finance_income_items','client cannot directly mutate approved tenant income');

-- Locked period rejection must happen without touching approved money.
SELECT public.set_financial_month_lock(org,'2026-08-01',true,'Tenant correction period lock') FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'approved','Correct locked utility','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',payload,'tenant-locked-period'),'55000','Financial month is locked','closed month blocks tenant correction') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_replacements WHERE kind='unpaid';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM tenant_tx_replacements WHERE kind='unpaid')),'approved','closed period denial preserves posted replacement');
SELECT public.set_financial_month_lock(org,'2026-08-01',false,'Resume synthetic correction checks') FROM tenant_tx_state;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'approved','Reassign tenant invoice','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',jsonb_set(payload,'{0,tenant_invoice_id}',to_jsonb(gen_random_uuid())),'tenant-invoice-change'),'22023','A tenant correction must keep its original invoice, property, and unit','RPC rejects invoice reassignment before reversal') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_replacements WHERE kind='unpaid';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'approved','Reassign property','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',jsonb_set(payload,'{0,property_id}',to_jsonb(gen_random_uuid())),'tenant-property-change'),'22023','A tenant correction must keep its original invoice, property, and unit','RPC rejects property reassignment before reversal') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_replacements WHERE kind='unpaid';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'approved','Remove tenant unit','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant',payload#-'{0,unit_id}','tenant-unit-remove'),'22023','A tenant correction must keep its original invoice, property, and unit','RPC rejects missing tenant unit') FROM tenant_tx_state CROSS JOIN tenant_tx_lines CROSS JOIN tenant_tx_replacements WHERE kind='unpaid';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'approved','Invalid tenant lines','2026-08-13','Tenant utility vendor','2026-08-12','USD',pay_from,'tenant','{}','tenant-lines-object'),'22023','A tenant correction must keep its original invoice, property, and unit','RPC rejects non-array tenant lines') FROM tenant_tx_state CROSS JOIN tenant_tx_replacements WHERE kind='unpaid';
SELECT is((SELECT count(*) FROM public.expense_customer_adjustments a JOIN public.expense_transaction_lines l ON l.submission_id=a.submission_id WHERE l.transaction_id=(SELECT id FROM tenant_tx_replacements WHERE kind='unpaid')),0::bigint,'all denied reassignment attempts leave no reversal adjustments');
RESET ROLE;
-- Even a table-capable caller remains subject to the financial immutability guard.
SELECT throws_ok(format('UPDATE public.finance_income_items SET description=%L WHERE id=(SELECT il.income_item_id FROM public.tenant_invoice_lines il JOIN public.ips_expense_responsibilities r ON r.tenant_invoice_line_id=il.id JOIN public.expense_submissions s ON s.approved_responsibility_id=r.id JOIN public.expense_transaction_lines l ON l.submission_id=s.id WHERE l.transaction_id=%L)', 'Forged charge',(SELECT id FROM tenant_tx_replacements WHERE kind='unpaid')),'42501','Approved tenant charge must be changed through its tenant invoice','tenant income trigger still rejects direct table-capable mutation');
SELECT * FROM finish();
ROLLBACK;

