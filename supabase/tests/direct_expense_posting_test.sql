BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public','expense_transactions','one parent owns the review boundary');
SELECT has_table('public','expense_transaction_lines','financial children preserve their original identities');
SELECT ok(NOT has_table_privilege('authenticated','public.expense_transactions','INSERT'),
  'clients cannot forge a parent');
SELECT ok(NOT has_function_privilege('authenticated',
  'app_private.set_expense_transaction_context(uuid,uuid,text,boolean)','EXECUTE'),
  'clients cannot mint child mutation authority');
SELECT ok(NOT has_table_privilege('authenticated','app_private.expense_transaction_capability','SELECT'),
  'the context signing secret is private');

CREATE TEMP TABLE tx_state AS SELECT
  '00000000-0000-0000-0000-000000000001'::uuid AS org,
  '10000000-0000-0000-0000-000000000001'::uuid AS property_a,
  '10000000-0000-0000-0000-000000000002'::uuid AS property_b,
  '00000000-0000-0000-0000-000000000801'::uuid AS maker,
  '00000000-0000-0000-0000-000000000701'::uuid AS checker,
  '00000000-0000-0000-0000-000000000101'::uuid AS admin,
  NULL::uuid AS pay_from, NULL::uuid AS category;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
UPDATE tx_state SET pay_from = public.create_finance_account(org,'asset','bank',
  'Transaction integration bank',NULL,NULL,NULL,NULL,false,false,false);
UPDATE tx_state SET category = (
  SELECT account.id FROM public.finance_accounts AS account
  JOIN public.finance_account_category_links AS link ON link.account_id=account.id
    AND link.organization_id=account.organization_id
  JOIN public.finance_categories AS category ON category.id=link.category_id
    AND category.organization_id=link.organization_id
  WHERE account.organization_id=tx_state.org AND account.account_class='expense'
    AND account.archived_at IS NULL AND category.namespace='owner_expense'
    AND category.archived_at IS NULL AND account.property_id IS NULL
  ORDER BY account.id LIMIT 1
);
SELECT ok((SELECT pay_from IS NOT NULL AND category IS NOT NULL FROM tx_state),
  'fixture resolves real pooled and expense Chart accounts');

CREATE TEMP TABLE tx_lines AS SELECT jsonb_build_array(
  jsonb_build_object('property_id',property_a,'category_account_id',category,'description','Correction first line',
    'amount','10.00','internal_markup_amount','0.00','owner_cash_amount','0.00'),
  jsonb_build_object('property_id',property_b,'category_account_id',category,'description','Correction second line',
    'amount','20.00','internal_markup_amount','0.00','owner_cash_amount','0.00')
) AS payload FROM tx_state;
INSERT INTO public.organizations(id,name,slug) VALUES ('df190000-0000-4000-8000-000000000001','Direct foreign fixture','direct-foreign-fixture');
INSERT INTO public.properties(id,organization_id,name,code,property_type) VALUES ('df190000-0000-4000-8000-000000000002','df190000-0000-4000-8000-000000000001','Foreign property','DIRECT-FOREIGN','Apartment');
GRANT SELECT ON tx_state,tx_lines TO authenticated;
SELECT ok(NOT has_function_privilege('anon','public.post_expense_transaction(uuid,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)','EXECUTE'),'anonymous cannot post');
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Direct vendor','USD',pay_from,'owner',payload,'direct-denied-maker'),'42501','Not authorized','submit-only user retains review workflow') FROM tx_state CROSS JOIN tx_lines;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
CREATE TEMP TABLE direct_created AS SELECT public.post_expense_transaction(org,NULL,'Direct vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'direct-success-key') result FROM tx_state CROSS JOIN tx_lines;
SELECT is((SELECT result->>'status' FROM direct_created),'approved','existing Finance Manager self-approval authority posts in one call');
SELECT is(public.post_expense_transaction(org,NULL,'Direct vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'direct-success-key'),(SELECT result FROM direct_created),'identical retry returns original approved transaction') FROM tx_state CROSS JOIN tx_lines;
SELECT is((SELECT count(*) FROM public.expense_submissions s JOIN public.expense_transaction_lines l ON l.submission_id=s.id WHERE l.transaction_id=(SELECT (result->>'transaction_id')::uuid FROM direct_created) AND s.status='approved' AND s.approved_payment_id IS NOT NULL),2::bigint,'both lines have exactly one approved payment');
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Changed vendor','USD',pay_from,'owner',payload,'direct-success-key'),'22023','Conflicting paid expense transaction request','changed payload cannot reuse posting key') FROM tx_state CROSS JOIN tx_lines;
CREATE TEMP TABLE direct_pending AS SELECT public.submit_expense_transaction(org,NULL,'Direct vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'direct-pending-key') result FROM tx_state CROSS JOIN tx_lines;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Direct vendor','USD',pay_from,'owner',payload,'direct-pending-key'),'22023','Conflicting direct expense posting request','existing pending submission is never silently approved') FROM tx_state CROSS JOIN tx_lines;
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT (result->>'transaction_id')::uuid FROM direct_pending)),'submitted','review request remains pending');
-- The first child is valid; the second fails after a parent and first child were created.
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Rollback vendor','USD',pay_from,'owner',jsonb_set(payload,'{1,amount}','"-1.00"'),'direct-invalid-line'),'22023','Expense line 2 is incomplete or invalid','invalid later line rolls back submission')
FROM tx_state CROSS JOIN tx_lines;

RESET ROLE;
SELECT is((SELECT count(*) FROM public.expense_transactions WHERE idempotency_key='direct-invalid-line'),0::bigint,'failure leaves no parent');
CREATE TEMP TABLE direct_counts AS SELECT
 (SELECT count(*) FROM public.expense_transactions) parents,
 (SELECT count(*) FROM public.expense_submissions) children,
 (SELECT count(*) FROM public.finance_payments) payments,
 (SELECT count(*) FROM public.activity_logs) audits;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Cash failure vendor','USD',pay_from,'owner',
 jsonb_set(jsonb_set(payload,'{0,amount}','"999999999.00"'),'{0,owner_cash_amount}','"999999999.00"'),'direct-cash-failure'),
 '22023','Owner cash amount exceeds IPS-held cash available at approval','approval failure rolls back a fully submitted transaction') FROM tx_state CROSS JOIN tx_lines;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Tenant vendor','USD',pay_from,'tenant',payload,'direct-tenant-denied'),
 '22023','Direct posting requires an owner expense','tenant expenses retain the existing review workflow') FROM tx_state CROSS JOIN tx_lines;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.expense_transactions),(SELECT parents FROM direct_counts),'approval failure leaves no parent');
SELECT is((SELECT count(*) FROM public.expense_submissions),(SELECT children FROM direct_counts),'approval failure leaves no children');
SELECT is((SELECT count(*) FROM public.finance_payments),(SELECT payments FROM direct_counts),'approval failure leaves no payments');
SELECT is((SELECT count(*) FROM public.activity_logs),(SELECT audits FROM direct_counts),'approval failure leaves no submission or payment audit');

SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT is(public.post_expense_transaction(org,NULL,'Admin vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'direct-admin-success')->>'status','approved','Super Admin can post directly') FROM tx_state CROSS JOIN tx_lines;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)','00000000-0000-0000-0000-000000009999','Foreign vendor','USD',pay_from,'owner',payload,'direct-foreign-org'),'42501','Not authorized','foreign organization is denied') FROM tx_state CROSS JOIN tx_lines;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Foreign property vendor','USD',pay_from,'owner',jsonb_set(payload,'{1,property_id}','"df190000-0000-4000-8000-000000000002"'),'direct-foreign-property'),NULL,NULL,'real foreign-organization property is denied even to local Super Admin') FROM tx_state CROSS JOIN tx_lines;
SELECT public.set_financial_month_lock(org,CURRENT_DATE,true,'Direct posting locked month test') FROM tx_state;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Locked vendor','USD',pay_from,'owner',payload,'direct-locked-month'),NULL,NULL,'locked month blocks posting') FROM tx_state CROSS JOIN tx_lines;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.expense_transactions WHERE idempotency_key='direct-locked-month'),0::bigint,'locked-month failure leaves no pending transaction');
SELECT public.set_financial_month_lock(org,CURRENT_DATE,false,'Direct posting test reopen') FROM tx_state;
-- A direct post remains editable through the existing audited replacement path.
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE direct_replacement AS SELECT public.replace_expense_transaction(
 org,(SELECT (result->>'transaction_id')::uuid FROM direct_created),'approved',
 'Correct direct posted amount',CURRENT_DATE,NULL,'Direct vendor',CURRENT_DATE,
 'USD',pay_from,NULL,NULL,'owner',jsonb_set(payload,'{1,amount}','"25.00"'),
 'direct-post-edit-key') result FROM tx_state CROSS JOIN tx_lines;
SELECT is((SELECT result->>'status' FROM direct_replacement),'approved','same authorized manager edits a direct post and approves replacement atomically');
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT (result->>'transaction_id')::uuid FROM direct_created)),
 'reversed','editing reverses the directly posted original');
SELECT is((SELECT replaces_transaction_id FROM public.expense_transactions WHERE id=(SELECT (result->>'transaction_id')::uuid FROM direct_replacement)),
 (SELECT (result->>'transaction_id')::uuid FROM direct_created),'edited replacement links to directly posted original');
SELECT is((SELECT sum(a.signed_amount) FROM public.finance_payment_allocations a
 JOIN public.expense_submissions s ON a.id IN (s.approved_payment_allocation_id,s.reversal_payment_allocation_id)
 JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE l.transaction_id=(SELECT (result->>'transaction_id')::uuid FROM direct_created)),0::numeric,
 'direct post original and reversal allocations net to zero');
SELECT is((SELECT sum(s.internal_cost_amount) FROM public.expense_submissions s
 JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE l.transaction_id=(SELECT (result->>'transaction_id')::uuid FROM direct_replacement)),35::numeric,
 'replacement preserves both lines with the corrected total');
RESET ROLE;
SELECT ok((SELECT actor_id=(SELECT checker FROM tx_state)
 AND jsonb_array_length(previous_values->'lines')=2 AND jsonb_array_length(new_values->'lines')=2
 FROM public.activity_logs WHERE entity_id=(SELECT (result->>'transaction_id')::uuid FROM direct_created)
 AND action='corrected'),'post then edit retains original and replacement line audit with manager actor');
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status) SELECT '00000000-0000-4000-8000-000000009998',org,'Direct post isolated branch','DIRECT-ISOLATED','active' FROM tx_state;
UPDATE public.organization_members SET branch_id='00000000-0000-4000-8000-000000009998' WHERE organization_id=(SELECT org FROM tx_state) AND user_id=(SELECT checker FROM tx_state);
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.post_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,'Wrong branch vendor','USD',pay_from,'owner',payload,'direct-wrong-branch'),'42501','Not authorized','other branch property is denied') FROM tx_state CROSS JOIN tx_lines;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.expense_transactions WHERE idempotency_key='direct-wrong-branch'),0::bigint,'branch failure leaves no pending transaction');
SELECT finish();
ROLLBACK;
