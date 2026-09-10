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
GRANT SELECT ON tx_state,tx_lines TO authenticated;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE correction_cases AS
SELECT kind,(public.submit_expense_transaction(org,NULL,'Correction vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,
  'owner',payload,'expense-correction-fixture-'||kind)->>'transaction_id')::uuid id
FROM tx_state CROSS JOIN tx_lines CROSS JOIN unnest(ARRAY['cancel','edit','correct']) kind;
SELECT throws_ok(format('SELECT public.cancel_expense_transaction(%L,%L,%L,%L)',org,id,'','cancel-invalid'),
  '22023','Expense cancellation request is invalid','empty cancellation reason is rejected')
FROM tx_state CROSS JOIN correction_cases WHERE kind='cancel';
SELECT lives_ok(format('SELECT public.cancel_expense_transaction(%L,%L,%L,%L)',org,id,'Entered twice','cancel-valid'),
  'maker can cancel their pending complete transaction') FROM tx_state CROSS JOIN correction_cases WHERE kind='cancel';
SELECT is((SELECT count(*) FROM public.expense_submissions s JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE l.transaction_id=(SELECT id FROM correction_cases WHERE kind='cancel') AND s.status='rejected'),2::bigint,
 'cancel updates all child lines');
SELECT ok((SELECT cancelled_at IS NOT NULL AND cancelled_by=maker FROM public.expense_transactions t CROSS JOIN tx_state
 WHERE t.id=(SELECT id FROM correction_cases WHERE kind='cancel')),'cancellation has explicit actor and time');
SELECT lives_ok(format('SELECT public.cancel_expense_transaction(%L,%L,%L,%L)',org,id,'Entered twice','cancel-valid'),
  'identical cancellation replays') FROM tx_state CROSS JOIN correction_cases WHERE kind='cancel';
SELECT throws_ok(format('SELECT public.cancel_expense_transaction(%L,%L,%L,%L)',org,id,'Different reason','cancel-valid'),
 '22023','Only a pending expense transaction can be cancelled','changed cancellation replay fails')
 FROM tx_state CROSS JOIN correction_cases WHERE kind='cancel';

-- A bad replacement must undo the pending cancellation, including its audit log.
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,NULL,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
 org,id,'submitted','Fix wrong amount','Correction vendor','USD',pay_from,'owner',
 jsonb_set(payload,'{1,amount}','"-1.00"'),'edit-invalid'),
 '22023','Expense line 2 is incomplete or invalid','invalid line rolls back complete edit')
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='edit';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM correction_cases WHERE kind='edit')),
 'submitted','failed edit retains original pending status');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id=(SELECT id FROM correction_cases WHERE kind='edit')
 AND action='cancelled'),0::bigint,'failed edit has no cancellation audit');
CREATE TEMP TABLE replacement_cases AS
SELECT kind,(public.replace_expense_transaction(org,id,'submitted','Fix wrong amount',NULL,NULL,'Corrected vendor',CURRENT_DATE,
 'USD',pay_from,NULL,NULL,'owner',jsonb_set(payload,'{1,amount}','"25.00"'),'edit-valid')->>'transaction_id')::uuid id
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='edit';
SELECT is((public.replace_expense_transaction(org,id,'submitted','Fix wrong amount',NULL,NULL,'Corrected vendor',CURRENT_DATE,
 'USD',pay_from,NULL,NULL,'owner',jsonb_set(payload,'{1,amount}','"25.00"'),'edit-valid')->>'transaction_id')::uuid,
 (SELECT id FROM replacement_cases WHERE kind='edit'),'edit replay returns same replacement')
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='edit';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,NULL,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
 org,id,'submitted','Changed reason','Corrected vendor','USD',pay_from,'owner',payload,'edit-valid'),
 '22023','Conflicting expense replacement request','edit payload mismatch fails')
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='edit';
SELECT is((SELECT sum(s.internal_cost_amount) FROM public.expense_submissions s JOIN public.expense_transaction_lines l
 ON l.submission_id=s.id WHERE l.transaction_id=(SELECT id FROM replacement_cases WHERE kind='edit')),35.00::numeric,
 'replacement keeps multiple lines and new amount');
SELECT is((SELECT replaces_transaction_id FROM public.expense_transactions WHERE id=(SELECT id FROM replacement_cases WHERE kind='edit')),
 (SELECT id FROM correction_cases WHERE kind='edit'),'replacement links to immutable original');
RESET ROLE;
GRANT SELECT ON correction_cases,replacement_cases TO authenticated;
-- Grant the reviewer submission authority so the ownership check, rather than
-- a missing general permission, is what rejects another maker's cancellation.
INSERT INTO public.organization_role_permissions (organization_id,role_id,permission_key,granted_by)
SELECT org,'00000000-0000-0000-0000-000000000311'::uuid,'finance.submit_expenses'::public.organization_permission_key,admin
FROM tx_state ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.cancel_expense_transaction(%L,%L,%L,%L)',org,id,'Cancel someone else','cancel-other-maker'),
 '42501',NULL,'another staff member cannot cancel the maker transaction')
FROM tx_state CROSS JOIN correction_cases WHERE kind='correct';
SELECT lives_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,%L,%L)',org,id,'approve','Reviewed original','correction-original-review'),
 'checker approves original before correction') FROM tx_state CROSS JOIN correction_cases WHERE kind='correct';
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SELECT throws_ok(format('SELECT public.cancel_expense_transaction(%L,%L,%L,%L)',org,id,'Stale pending tab','cancel-stale-approved'),
 '22023','Only a pending expense transaction can be cancelled','stale pending UI cannot cancel approved money')
FROM tx_state CROSS JOIN correction_cases WHERE kind='correct';
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,CURRENT_DATE,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
 org,id,'approved','Fix wrong amount','Correction vendor','USD',pay_from,'owner',payload,'correct-unauthorized'),
 '42501','Not authorized','maker cannot correct approved financial effects')
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='correct';
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,CURRENT_DATE,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
 org,id,'approved','Fix wrong amount','Correction vendor','USD',pay_from,'owner',
 jsonb_set(payload,'{1,amount}','"-1.00"'),'correct-invalid'),
 '22023','Expense line 2 is incomplete or invalid','invalid correction rolls back reversal')
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='correct';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM correction_cases WHERE kind='correct')),
 'approved','failed correction preserves approved original');
SELECT is((SELECT count(*) FROM public.expense_submissions s JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE l.transaction_id=(SELECT id FROM correction_cases WHERE kind='correct') AND s.reversal_payment_id IS NOT NULL),0::bigint,
 'failed correction leaves no reversal payments');
RESET ROLE;
INSERT INTO replacement_cases
SELECT kind,(public.replace_expense_transaction(org,id,'approved','Fix wrong amount',CURRENT_DATE,NULL,'Corrected vendor',CURRENT_DATE,
 'USD',pay_from,NULL,NULL,'owner',payload,'correct-valid')->>'transaction_id')::uuid
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='correct';
SET LOCAL ROLE authenticated;
SELECT is((public.replace_expense_transaction(org,id,'approved','Fix wrong amount',CURRENT_DATE,NULL,'Corrected vendor',CURRENT_DATE,
 'USD',pay_from,NULL,NULL,'owner',payload,'correct-valid')->>'transaction_id')::uuid,
 (SELECT id FROM replacement_cases WHERE kind='correct'),'approved correction retry has same replacement')
FROM tx_state CROSS JOIN tx_lines CROSS JOIN correction_cases WHERE kind='correct';
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM replacement_cases WHERE kind='correct')),
 'submitted','approved correction requires separate replacement approval');
SELECT is((SELECT count(*) FROM public.expense_submissions s JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE l.transaction_id=(SELECT id FROM correction_cases WHERE kind='correct') AND s.status='reversed'),2::bigint,
 'all original lines are reversed exactly once');
SELECT is((SELECT sum(a.signed_amount) FROM public.finance_payment_allocations a JOIN public.expense_submissions s
 ON a.id IN (s.approved_payment_allocation_id,s.reversal_payment_allocation_id)
 JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE l.transaction_id=(SELECT id FROM correction_cases WHERE kind='correct')),0::numeric,
 'original and reversal financial allocations net to zero');
SELECT is((SELECT sum(amount) FROM public.expense_customer_adjustments a JOIN public.expense_transaction_lines l
 ON l.submission_id=a.submission_id WHERE l.transaction_id=(SELECT id FROM correction_cases WHERE kind='correct')),
 -30::numeric,'customer adjustment reverses original charge only once');
SELECT ok(NOT has_function_privilege('anon','public.cancel_expense_transaction(uuid,uuid,text,text)','EXECUTE'),
 'anonymous clients cannot cancel');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
INSERT INTO storage.objects(bucket_id,name,version,metadata)
SELECT 'nestory-documents',org::text||'/paid-cost-evidence/correction-'||kind||'.pdf',gen_random_uuid()::text,
 jsonb_build_object('mimetype','application/pdf','size',25)
FROM tx_state CROSS JOIN unnest(ARRAY['original','replacement']) kind;
CREATE TEMP TABLE correction_documents AS
SELECT kind,(public.register_paid_cost_evidence_verified(org,admin,property_a,kind||'.pdf',object.name,
 'application/pdf',25,repeat('b',64),object.id,object.version,'correction-evidence-'||kind)->>'document_id')::uuid id
FROM tx_state CROSS JOIN unnest(ARRAY['original','replacement']) kind JOIN storage.objects object
 ON object.bucket_id='nestory-documents' AND object.name=org::text||'/paid-cost-evidence/correction-'||kind||'.pdf';
CREATE TEMP TABLE receipt_original AS SELECT (public.submit_expense_transaction(org,NULL,'Receipt correction vendor',CURRENT_DATE,
 'USD',pay_from,NULL,(SELECT id FROM correction_documents WHERE kind='original'),'owner',payload,
 'correction-receipt-original')->>'transaction_id')::uuid id FROM tx_state CROSS JOIN tx_lines;
GRANT SELECT ON correction_documents,receipt_original TO authenticated;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,NULL,NULL,%L,CURRENT_DATE,%L,%L,NULL,%L,%L,%L::jsonb,%L)',
 org,id,'submitted','Fix receipt amount','Corrected vendor','USD',pay_from,document_id,'owner',payload,'receipt-replacement-'||kind),
 '22023','Upload a new receipt for the replacement; the original receipt remains in its history',
 'replacement cannot drop or reuse original receipt: '||kind)
FROM tx_state CROSS JOIN tx_lines CROSS JOIN receipt_original
CROSS JOIN (SELECT 'omitted' kind,NULL::uuid document_id UNION ALL SELECT 'same',id FROM correction_documents WHERE kind='original') evidence;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,NULL,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
 org,id,'submitted','Switch responsibility','Corrected vendor','USD',pay_from,'tenant',payload,'replacement-responsibility'),
 '22023','A replacement must keep the original expense responsibility','replacement cannot switch owner to tenant workflow')
FROM tx_state CROSS JOIN tx_lines CROSS JOIN receipt_original;
SELECT lives_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,NULL,NULL,%L,CURRENT_DATE,%L,%L,NULL,%L,%L,%L::jsonb,%L)',
 org,id,'submitted','Fix receipt amount','Corrected vendor','USD',pay_from,
 (SELECT id FROM correction_documents WHERE kind='replacement'),'owner',payload,'receipt-valid-replacement'),
 'newly registered receipt allows a replacement') FROM tx_state CROSS JOIN tx_lines CROSS JOIN receipt_original;
SELECT is((SELECT supporting_document_id FROM public.expense_transactions WHERE id=(SELECT id FROM receipt_original)),
 (SELECT id FROM correction_documents WHERE kind='original'),'original receipt remains attached to original');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pass('deferred evidence uniqueness guards remain satisfied');
SELECT finish();
ROLLBACK;


