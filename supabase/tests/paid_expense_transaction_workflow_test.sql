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

CREATE TEMP TABLE tx_documents(kind text PRIMARY KEY, document_id uuid);
CREATE TEMP TABLE tx_payees AS
SELECT gen_random_uuid() AS id, kind
FROM unnest(ARRAY['tenant','owner','staff','unclassified','inactive_vendor','archived_vendor','vendor']) AS kind;
INSERT INTO public.people(id,organization_id,display_name)
SELECT payee.id,state.org,'Transaction payee '||payee.kind FROM tx_payees AS payee CROSS JOIN tx_state AS state;
INSERT INTO public.person_roles(organization_id,person_id,role,status,archived_at)
SELECT state.org,payee.id,
  CASE WHEN payee.kind LIKE '%vendor' THEN 'vendor' ELSE payee.kind END,
  CASE WHEN payee.kind='inactive_vendor' THEN 'inactive' ELSE 'active' END,
  CASE WHEN payee.kind='archived_vendor' THEN now() ELSE NULL END
FROM tx_payees AS payee CROSS JOIN tx_state AS state WHERE payee.kind<>'unclassified';
INSERT INTO public.person_roles(organization_id,person_id,role)
SELECT state.org,payee.id,'tenant' FROM tx_payees AS payee CROSS JOIN tx_state AS state WHERE payee.kind='vendor';
INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id)
SELECT DISTINCT state.org,payee.id,property.branch_id
FROM tx_payees AS payee CROSS JOIN tx_state AS state
JOIN public.properties AS property ON property.id IN (state.property_a,state.property_b);
INSERT INTO storage.objects(bucket_id,name,version,metadata)
SELECT 'nestory-documents',state.org::text||'/paid-cost-evidence/tx-integration-'||kind||'.pdf',
  gen_random_uuid()::text,jsonb_build_object('mimetype','application/pdf','size',25)
FROM tx_state AS state CROSS JOIN unnest(ARRAY['valid','reject','invalid','over','legacy']) AS kind;
INSERT INTO tx_documents(kind,document_id)
SELECT kind, (public.register_paid_cost_evidence_verified(
  state.org,state.maker,state.property_a,kind||'.pdf',object.name,'application/pdf',
  25,repeat('a',64),object.id,object.version,'transaction-evidence-'||kind)->>'document_id')::uuid
FROM tx_state AS state CROSS JOIN unnest(ARRAY['valid','reject','invalid','over','legacy']) AS kind
JOIN storage.objects AS object ON object.bucket_id='nestory-documents'
  AND object.name='00000000-0000-0000-0000-000000000001/paid-cost-evidence/tx-integration-'||kind||'.pdf';

CREATE TEMP TABLE tx_lines AS SELECT jsonb_build_array(
  jsonb_build_object('property_id',property_a,'unit_id',NULL,'category_account_id',category,
    'description','First property line','amount','10.00','internal_markup_amount','0.00','owner_cash_amount','0.00'),
  jsonb_build_object('property_id',property_b,'unit_id',NULL,'category_account_id',category,
    'description','Second property line','amount','20.00','internal_markup_amount','0.00','owner_cash_amount','0.00')
) AS payload FROM tx_state;
GRANT SELECT ON tx_state,tx_documents,tx_lines,tx_payees TO authenticated;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;

SELECT throws_ok(format(
  'SELECT public.submit_expense_transaction(%L,%L,NULL,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
  state.org,payee.id,'USD',state.pay_from,'owner',lines.payload,'transaction-payee-'||payee.kind),
  '23503','Selected payee is unavailable','direct RPC rejects payee without active vendor role: '||payee.kind)
FROM tx_state AS state CROSS JOIN tx_lines AS lines CROSS JOIN tx_payees AS payee WHERE payee.kind<>'vendor';
SELECT lives_ok(format(
  'SELECT public.submit_expense_transaction(%L,%L,NULL,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',
  state.org,payee.id,'USD',state.pay_from,'owner',lines.payload,'transaction-payee-valid-vendor'),
  'direct RPC accepts an active vendor with another role and no receipt evidence')
FROM tx_state AS state CROSS JOIN tx_lines AS lines CROSS JOIN tx_payees AS payee WHERE payee.kind='vendor';

SELECT throws_ok(format(
  'SELECT public.submit_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,%L,%L,%L,%L::jsonb,%L)',
  state.org,'Precision vendor','USD',state.pay_from,'precision',document.document_id,'owner',
  jsonb_set(lines.payload,'{0,amount}',to_jsonb(value)),
  'transaction-invalid-'||ordinality),
  '22023','Expense line 1 is incomplete or invalid','raw RPC rejects inexact or nonfinite amount: '||value)
FROM tx_state AS state CROSS JOIN tx_lines AS lines
JOIN tx_documents AS document ON document.kind='invalid'
CROSS JOIN unnest(ARRAY['1.001','0.001','NaN','Infinity','-1.00','1000000000000.00'])
  WITH ORDINALITY AS invalid(value,ordinality);

SELECT throws_ok(format(
  'SELECT public.submit_expense_transaction(%L,NULL,%L,CURRENT_DATE,%L,%L,%L,%L,%L,%L::jsonb,%L)',
  state.org,'Precision vendor','USD',state.pay_from,'precision',document.document_id,'owner',
  jsonb_set(lines.payload,'{0,amount}','null'::jsonb),'transaction-invalid-null'),
  '22023','Expense line 1 is incomplete or invalid','null amount cannot bypass SQL validation')
FROM tx_state AS state CROSS JOIN tx_lines AS lines JOIN tx_documents AS document ON document.kind='invalid';

CREATE TEMP TABLE tx_created AS SELECT (public.submit_expense_transaction(
  state.org,NULL,'Transaction integration vendor',CURRENT_DATE,'USD',state.pay_from,'multi-property',
  document.document_id,'owner',lines.payload,'transaction-integration-valid')->>'transaction_id')::uuid AS id
FROM tx_state AS state CROSS JOIN tx_lines AS lines JOIN tx_documents AS document ON document.kind='valid';
SELECT is((SELECT count(*) FROM public.expense_transactions WHERE id=(SELECT id FROM tx_created)),
  1::bigint,'authenticated parent RLS can execute its private read predicate');
SELECT is((SELECT count(*) FROM public.expense_transaction_lines WHERE transaction_id=(SELECT id FROM tx_created)),
  2::bigint,'both exact scoped financial children exist');
SELECT set_config('app.expense_transaction_id',(SELECT id::text FROM tx_created),true);
SELECT set_config('app.expense_transaction_org',(SELECT org::text FROM tx_state),true);
SELECT set_config('app.expense_transaction_operation','submit',true);
SELECT set_config('app.expense_transaction_token',repeat('0',64),true);
SELECT throws_ok(format(
  'SELECT public.submit_expense_with_accounts(%L,%L,NULL,%L,NULL,%L,%L,CURRENT_DATE,1,0,%L,%L,NULL,%L,%L,NULL,%L,%L)',
  state.org,state.property_b,'general',state.category,'Forged shared receipt','USD','owner',
  state.pay_from,document.document_id,'forged shared receipt','transaction-forged-shared-receipt'),
  '23514','paid_cost_evidence_invalid','forged parent context cannot reuse a receipt across properties')
FROM tx_state AS state JOIN tx_documents AS document ON document.kind='valid';
SELECT is((SELECT count(*) FROM public.get_expense_transaction_child_links(
  state.org,ARRAY(SELECT submission_id FROM public.expense_transaction_lines WHERE transaction_id=(SELECT id FROM tx_created))))
  ,2::bigint,'checked marker returns only linked identities') FROM tx_state AS state;
SELECT is((public.submit_expense_transaction(
  state.org,NULL,'Transaction integration vendor',CURRENT_DATE,'USD',state.pay_from,'multi-property',
  document.document_id,'owner',lines.payload,'transaction-integration-valid')->>'transaction_id')::uuid,
  (SELECT id FROM tx_created),'identical submit replays the same parent')
FROM tx_state AS state CROSS JOIN tx_lines AS lines JOIN tx_documents AS document ON document.kind='valid';
SELECT throws_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,NULL,%L)',
  state.org,created.id,'approve','transaction-maker-review'),'42501',NULL,
  'maker cannot approve their own transaction') FROM tx_state AS state CROSS JOIN tx_created AS created;

RESET ROLE;
GRANT SELECT ON tx_created TO authenticated;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.review_expense(%L,%L,%L,''Direct child rejected'',%L,NULL)',
  state.org,line.submission_id,'reject','transaction-direct-child-reject'),'42501',
  'Review or reverse the complete expense transaction','legacy direct child rejection cannot split a parent')
FROM tx_state AS state JOIN public.expense_transaction_lines AS line
  ON line.transaction_id=(SELECT id FROM tx_created) AND line.sort_order=1;

SELECT set_config('app.expense_transaction_id',(SELECT id::text FROM tx_created),true);
SELECT set_config('app.expense_transaction_org',(SELECT org::text FROM tx_state),true);
SELECT set_config('app.expense_transaction_operation','review',true);
SELECT set_config('app.expense_transaction_token',repeat('0',64),true);
SELECT throws_ok(format('SELECT public.review_expense(%L,%L,%L,''Forged child rejected'',%L,NULL)',
  state.org,line.submission_id,'reject','transaction-forged-child-reject'),'42501',
  'Review or reverse the complete expense transaction','forged transaction GUCs confer no child authority')
FROM tx_state AS state JOIN public.expense_transaction_lines AS line
  ON line.transaction_id=(SELECT id FROM tx_created) AND line.sort_order=1;
SELECT lives_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,%L,%L)',
  state.org,created.id,'approve','Complete transaction reviewed','transaction-integration-approve'),
  'checked parent approval processes both properties') FROM tx_state AS state CROSS JOIN tx_created AS created;
SELECT is((SELECT count(*) FROM public.expense_submissions AS submission
  JOIN public.expense_transaction_lines AS line ON line.submission_id=submission.id
  WHERE line.transaction_id=(SELECT id FROM tx_created) AND submission.status='approved'),2::bigint,
  'every child and the parent approve together');
SELECT lives_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,%L,%L)',
  state.org,created.id,'approve','Complete transaction reviewed','transaction-integration-approve'),
  'identical parent review replays') FROM tx_state AS state CROSS JOIN tx_created AS created;
RESET ROLE;

SELECT is((SELECT count(*) FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  JOIN public.expense_transaction_lines AS line ON
    binding.idempotency_key='expense-line:'||line.transaction_id::text||':'||line.sort_order::text
  WHERE line.transaction_id=(SELECT id FROM tx_created) AND binding.operation='submit_expense'
    AND binding.primary_account_id=line.category_account_id
    AND binding.secondary_account_id=(SELECT pay_from FROM tx_state)),2::bigint,
  'both child submit bindings preserve selected Chart identities');
SELECT is((SELECT count(*) FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  JOIN public.expense_transaction_lines AS line ON
    binding.idempotency_key='expense-transaction-review:'||line.transaction_id::text||':'||line.id::text
  WHERE line.transaction_id=(SELECT id FROM tx_created) AND binding.operation='review_expense'
    AND binding.primary_account_id=(SELECT pay_from FROM tx_state)),2::bigint,
  'both child review bindings preserve original pay-from identity');
SELECT is((SELECT coalesce(sum(cash.amount),0) FROM public.owner_charge_cash_allocations AS cash
  JOIN public.ips_expense_responsibilities AS responsibility ON responsibility.owner_invoice_line_id=cash.owner_invoice_line_id
  JOIN public.expense_submissions AS submission ON submission.approved_responsibility_id=responsibility.id
  JOIN public.expense_transaction_lines AS line ON line.submission_id=submission.id
  WHERE line.transaction_id=(SELECT id FROM tx_created)),0::numeric,
  'explicit zero appends no held owner cash allocations');

SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.reverse_expense(%L,%L,CURRENT_DATE,%L,%L)',
  state.org,line.submission_id,'Direct child reversal','transaction-direct-reverse'),'42501',
  'Review or reverse the complete expense transaction','legacy direct child reversal cannot split approved parent')
FROM tx_state AS state JOIN public.expense_transaction_lines AS line
  ON line.transaction_id=(SELECT id FROM tx_created) AND line.sort_order=1;
SELECT lives_ok(format('SELECT public.reverse_expense_transaction(%L,%L,CURRENT_DATE,%L,%L)',
  state.org,created.id,'Complete transaction reversed','transaction-integration-reverse'),
  'parent reversal appends established reversal identities for every child')
FROM tx_state AS state CROSS JOIN tx_created AS created;
SELECT is((SELECT count(*) FROM public.expense_submissions AS submission
  JOIN public.expense_transaction_lines AS line ON line.submission_id=submission.id
  WHERE line.transaction_id=(SELECT id FROM tx_created) AND submission.status='reversed'),2::bigint,
  'all children reverse together');
SELECT lives_ok(format('SELECT public.reverse_expense_transaction(%L,%L,CURRENT_DATE,%L,%L)',
  state.org,created.id,'Complete transaction reversed','transaction-integration-reverse'),
  'identical reversal replays without duplicate money')
FROM tx_state AS state CROSS JOIN tx_created AS created;
RESET ROLE;
CREATE TEMP TABLE tx_extra(kind text PRIMARY KEY,id uuid);
GRANT SELECT,INSERT ON tx_extra TO authenticated;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
INSERT INTO tx_extra SELECT 'reject',(public.submit_expense_transaction(
  state.org,NULL,'Rejected transaction vendor',CURRENT_DATE,'USD',state.pay_from,'reject whole parent',
  document.document_id,'owner',lines.payload,'transaction-integration-reject')->>'transaction_id')::uuid
FROM tx_state AS state CROSS JOIN tx_lines AS lines JOIN tx_documents AS document ON document.kind='reject';
INSERT INTO tx_extra SELECT 'over',(public.submit_expense_transaction(
  state.org,NULL,'Cash reservation vendor',CURRENT_DATE,'USD',state.pay_from,'over cash request',
  document.document_id,'owner',jsonb_set(jsonb_set(lines.payload,
    '{1,amount}','"999999999999.00"'::jsonb),'{1,owner_cash_amount}','"999999999999.00"'::jsonb),
  'transaction-integration-over')->>'transaction_id')::uuid
FROM tx_state AS state CROSS JOIN tx_lines AS lines JOIN tx_documents AS document ON document.kind='over';
INSERT INTO tx_extra SELECT 'single',(public.submit_expense_transaction(
  state.org,NULL,'Single parent vendor',CURRENT_DATE,'USD',state.pay_from,'single parent',
  document.document_id,'owner',jsonb_build_array(lines.payload->0),'transaction-integration-single')->>'transaction_id')::uuid
FROM tx_state AS state CROSS JOIN tx_lines AS lines JOIN tx_documents AS document ON document.kind='invalid';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.review_expense(%L,%L,%L,NULL,%L,NULL)',
  state.org,line.submission_id,'approve','transaction-direct-single-approve'),'42501',
  'Review or reverse the complete expense transaction','even a one-child parent requires parent approval')
FROM tx_state AS state JOIN public.expense_transaction_lines AS line
  ON line.transaction_id=(SELECT id FROM tx_extra WHERE kind='single');
SELECT lives_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,%L,%L)',
  state.org,extra.id,'reject','All lines rejected together','transaction-integration-reject-decision'),
  'parent rejection rejects every line') FROM tx_state AS state JOIN tx_extra AS extra ON extra.kind='reject';
SELECT is((SELECT count(*) FROM public.expense_submissions AS submission
  JOIN public.expense_transaction_lines AS line ON line.submission_id=submission.id
  WHERE line.transaction_id=(SELECT id FROM tx_extra WHERE kind='reject')
    AND submission.status='rejected' AND submission.approved_payment_id IS NULL),2::bigint,
  'rejection produces no financial effects on either child');
SELECT throws_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,%L,%L)',
  state.org,extra.id,'approve','Excess owner cash requested','transaction-integration-over-decision'),
  '22023','Owner cash amount exceeds IPS-held cash available at approval',
  'current authoritative cash rejects excessive reservation for any property')
FROM tx_state AS state JOIN tx_extra AS extra ON extra.kind='over';
SELECT is((SELECT count(*) FROM public.expense_submissions AS submission
  JOIN public.expense_transaction_lines AS line ON line.submission_id=submission.id
  WHERE line.transaction_id=(SELECT id FROM tx_extra WHERE kind='over')
    AND submission.status='submitted' AND submission.approved_payment_id IS NULL),2::bigint,
  'one failing property leaves every child submitted with no payment');
RESET ROLE;
SELECT is((SELECT count(*) FROM app_private.finance_chart_workflow_idempotency_bindings AS binding
  JOIN public.expense_transaction_lines AS line ON
    binding.idempotency_key='expense-transaction-review:'||line.transaction_id::text||':'||line.id::text
  WHERE line.transaction_id=(SELECT id FROM tx_extra WHERE kind='reject')
    AND binding.operation='review_expense'),0::bigint,
  'rejection does not require or bind a new active payment account');
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
INSERT INTO tx_extra SELECT 'legacy',(public.submit_expense_with_accounts(
  state.org,state.property_a,NULL,'general',NULL,state.category,'Standalone historical vendor',
  CURRENT_DATE,5,0,'USD','owner',NULL,state.pay_from,document.document_id,NULL,
  'legacy compatibility','transaction-legacy-submit')->>'submission_id')::uuid
FROM tx_state AS state JOIN tx_documents AS document ON document.kind='legacy';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT lives_ok(format('SELECT public.review_expense_with_account(%L,%L,%L,%L,%L,%L)',
  state.org,extra.id,'approve','Standalone approved','transaction-legacy-review',state.pay_from),
  'standalone submissions preserve the existing review workflow')
FROM tx_state AS state JOIN tx_extra AS extra ON extra.kind='legacy';
RESET ROLE;
-- Receipt evidence and reference can be independently absent.
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
INSERT INTO tx_extra SELECT 'optional',(public.submit_expense_transaction(
  state.org,NULL,'Vendor without receipt',CURRENT_DATE,'USD',state.pay_from,NULL,
  NULL,'owner',lines.payload,'transaction-optional-submit')->>'transaction_id')::uuid
FROM tx_state AS state CROSS JOIN tx_lines AS lines;
SELECT is((public.submit_expense_transaction(
  state.org,NULL,'Vendor without receipt',CURRENT_DATE,'USD',state.pay_from,NULL,
  NULL,'owner',lines.payload,'transaction-optional-submit')->>'transaction_id')::uuid,
  (SELECT id FROM tx_extra WHERE kind='optional'),'receipt-free submission replays')
FROM tx_state AS state CROSS JOIN tx_lines AS lines;
RESET ROLE;
SELECT ok((SELECT supporting_document_id IS NULL AND reference IS NULL
  FROM public.expense_transactions WHERE id=(SELECT id FROM tx_extra WHERE kind='optional')),
  'absent evidence and reference are stored as null');
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT lives_ok(format('SELECT public.review_expense_transaction(%L,%L,%L,%L,%L)',
  state.org,extra.id,'approve','Expense reviewed without receipt','transaction-optional-review'),
  'receipt-free transaction can be approved')
FROM tx_state AS state JOIN tx_extra AS extra ON extra.kind='optional';
RESET ROLE;
SELECT is((SELECT count(*) FROM public.expense_submissions AS submission
  JOIN public.expense_transaction_lines AS line ON line.submission_id=submission.id
  WHERE line.transaction_id=(SELECT id FROM tx_extra WHERE kind='optional')
    AND submission.status='approved' AND submission.supporting_document_id IS NULL),2::bigint,
  'all receipt-free lines are approved');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT is((SELECT count(*) FROM app_private.financial_idempotency_requests WHERE status='pending'),
  0::bigint,'transaction operations leave no pending child idempotency state');
SELECT * FROM finish();
ROLLBACK;
