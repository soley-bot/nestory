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
SELECT ok(NOT has_table_privilege('authenticated','public.expense_legacy_replacements','INSERT'),'clients cannot forge legacy correction links');
SELECT ok(NOT has_table_privilege('authenticated','public.expense_legacy_replacements','UPDATE'),'clients cannot change legacy correction links');
SELECT ok(NOT has_function_privilege('anon','public.get_legacy_expense_history(uuid,uuid)','EXECUTE'),'anonymous users cannot read correction history');
SELECT ok(NOT has_function_privilege('service_role','public.replace_legacy_expense_submission(uuid,uuid,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)','EXECUTE'),'service role cannot impersonate a legacy correction actor');
CREATE TEMP TABLE legacy_case(id uuid,replacement uuid);
GRANT SELECT ON tx_state TO authenticated;
GRANT ALL ON legacy_case TO authenticated;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
INSERT INTO legacy_case SELECT (public.submit_expense_with_accounts(org,property_a,NULL,'general',NULL,category,'Legacy vendor',CURRENT_DATE,5,0,'USD','owner',NULL,pay_from,NULL,NULL,'Legacy expense reference','legacy-correction-fixture')->>'submission_id')::uuid,NULL FROM tx_state;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT public.review_expense_with_account(org,id,'approve','Original approved','legacy-fixture-approve',pay_from) FROM tx_state CROSS JOIN legacy_case;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
CREATE TEMP TABLE legacy_lines AS SELECT jsonb_build_array(jsonb_build_object('property_id',property_a,'category_account_id',category,'description','Corrected standalone expense','amount','7.00','internal_markup_amount','0.00','owner_cash_amount','0.00')) payload FROM tx_state;
GRANT SELECT ON tx_state,legacy_case,legacy_lines TO authenticated;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.replace_legacy_expense_submission(%L,%L,%L,CURRENT_DATE,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'Correct legacy expense','Legacy vendor','USD',pay_from,'tenant',payload,'legacy-correction-one'),'22023','Keep the original expense property, unit, currency and customer attribution','cannot change owner to tenant') FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines;
SELECT throws_ok(format('SELECT public.replace_legacy_expense_submission(%L,%L,%L,CURRENT_DATE,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'Correct legacy expense','Legacy vendor','USD',pay_from,'owner',jsonb_set(payload,'{0,category_account_id}',to_jsonb('00000000-0000-0000-0000-000000000099'::text)),'legacy-correction-one'),NULL,NULL,'failed replacement rolls back original reversal') FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines;
SELECT is((SELECT status FROM public.expense_submissions WHERE id=(SELECT id FROM legacy_case)),'approved','original remains approved after downstream failure');
SELECT is((SELECT count(*) FROM public.expense_legacy_replacements),0::bigint,'failed correction leaves no link');
-- A caller could previously pre-create and approve the predictable inner keys.
CREATE TEMP TABLE precreated_approved AS SELECT (public.submit_expense_transaction(org,NULL,'Legacy vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'legacy-replacement:'||id::text)->>'transaction_id')::uuid id FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines;
SELECT public.review_expense_transaction(org,id,'approve','Correct legacy expense','legacy-correction-approve:'||id::text) FROM tx_state CROSS JOIN precreated_approved;
CREATE TEMP TABLE legacy_result AS SELECT public.replace_legacy_expense_submission(org,id,'Correct legacy expense',CURRENT_DATE,NULL,'Legacy vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'legacy-correction-one') result FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines;
SELECT is(result->>'status','approved','corrected legacy is directly approved') FROM legacy_result;
SELECT isnt((result->>'transaction_id')::uuid,(SELECT id FROM precreated_approved),'legacy correction never adopts a preapproved transaction under predictable keys') FROM legacy_result;
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM precreated_approved)),'approved','preexisting approved transaction remains independent');
SELECT ok((SELECT previous_values->'expense'->>'payee_label'='Legacy vendor'
 AND previous_values->'expense'->>'status'='approved'
 AND previous_values->'lines'->0->>'amount'='5.00'
 AND new_values->'lines'->0->>'amount'='7.00'
 AND new_values->'expense'->>'id'=(SELECT result->>'transaction_id' FROM legacy_result)
 AND new_values->'expense'->>'status'='approved'
 AND actor_id=(SELECT admin FROM tx_state)
 FROM public.activity_logs WHERE entity_type='expense_submission' AND entity_id=(SELECT id FROM legacy_case) AND action='corrected'),
 'audit retains normalized actual before/after amounts payee status and actor');
SELECT is((SELECT status FROM public.expense_submissions WHERE id=(SELECT id FROM legacy_case)),'reversed','original remains immutable reversed evidence');
SELECT is(public.replace_legacy_expense_submission(org,id,'Correct legacy expense',CURRENT_DATE,NULL,'Legacy vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'legacy-correction-one'),result,'exact retry returns same replacement') FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines CROSS JOIN legacy_result;
SELECT throws_ok(format('SELECT public.replace_legacy_expense_submission(%L,%L,%L,CURRENT_DATE,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'Different correction','Legacy vendor','USD',pay_from,'owner',payload,'legacy-correction-two'),'22023','Conflicting legacy expense correction request','different retry cannot replace twice') FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines;
SELECT is((SELECT count(*) FROM public.expense_legacy_replacements),1::bigint,'exactly one immutable link');
SELECT ok(jsonb_array_length(public.get_legacy_expense_history(org,id))>=3,'history includes original review reversal and linked correction') FROM tx_state CROSS JOIN legacy_case;
CREATE TEMP TABLE legacy_descendant AS SELECT public.replace_expense_transaction(org,(result->>'transaction_id')::uuid,'approved','Second linked correction',CURRENT_DATE,NULL,'Legacy vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'legacy-second-correction') result FROM tx_state CROSS JOIN legacy_lines CROSS JOIN legacy_result;
SELECT ok(EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_expense_transaction_history(org,(result->>'transaction_id')::uuid)) entry WHERE entry->'new_values'->>'replaces_submission_id'=(SELECT id::text FROM legacy_case)),'latest grouped descendant retains original legacy correction history') FROM tx_state CROSS JOIN legacy_descendant;
SELECT is(public.get_expense_transaction_history(org,(result->>'transaction_id')::uuid),public.get_legacy_expense_history(org,(SELECT id FROM legacy_case)),'legacy original and latest descendant return the same complete history') FROM tx_state CROSS JOIN legacy_descendant;
SELECT is((SELECT count(*) FROM jsonb_array_elements(public.get_legacy_expense_history(org,id))), (SELECT count(DISTINCT entry->>'id') FROM jsonb_array_elements(public.get_legacy_expense_history(org,id)) entry),'legacy history contains no duplicated events') FROM tx_state CROSS JOIN legacy_case;
RESET ROLE;
SELECT throws_ok($$UPDATE public.expense_legacy_replacements SET reason='Overwrite history'$$,'55000','Legacy expense replacement history is immutable','even table owner cannot mutate correction history');
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.replace_legacy_expense_submission(%L,%L,%L,CURRENT_DATE,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'Correct legacy expense','Legacy vendor','USD',pay_from,'owner',payload,'legacy-correction-one'),'42501','Not authorized','submitter without correction authority cannot replay correction') FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines;
SELECT throws_ok(format('SELECT public.get_legacy_expense_history(%L,%L)','00000000-0000-0000-0000-000000000002',id),'42501','Not authorized','history refuses cross-organization source') FROM legacy_case;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',maker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE pending_source AS SELECT (public.submit_expense_with_accounts(org,property_a,NULL,'general',NULL,category,'Legacy vendor',CURRENT_DATE,5,0,'USD','owner',NULL,pay_from,NULL,NULL,'Legacy pending collision','legacy-correction-pending-fixture')->>'submission_id')::uuid id FROM tx_state;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT public.review_expense_with_account(org,id,'approve','Original approved','legacy-pending-fixture-approve',pay_from) FROM tx_state CROSS JOIN pending_source;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE precreated_pending AS SELECT (public.submit_expense_transaction(org,NULL,'Legacy vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'legacy-replacement:'||id::text)->>'transaction_id')::uuid id FROM tx_state CROSS JOIN pending_source CROSS JOIN legacy_lines;
CREATE TEMP TABLE pending_result AS SELECT public.replace_legacy_expense_submission(org,id,'Correct legacy expense',CURRENT_DATE,NULL,'Legacy vendor',CURRENT_DATE,'USD',pay_from,NULL,NULL,'owner',payload,'legacy-correction-pending') result FROM tx_state CROSS JOIN pending_source CROSS JOIN legacy_lines;
SELECT isnt((result->>'transaction_id')::uuid,(SELECT id FROM precreated_pending),'legacy correction never adopts a pending transaction under predictable keys') FROM pending_result;
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT id FROM precreated_pending)),'submitted','preexisting pending review remains pending');
SELECT is(result->>'status','approved','correction posts its own fresh replacement') FROM pending_result;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',admin::text,true) FROM tx_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status) SELECT '00000000-0000-4000-8000-000000009998',org,'Legacy isolated branch','LEGACY-ISOLATED','active' FROM tx_state;
UPDATE public.organization_members SET branch_id='00000000-0000-4000-8000-000000009998' WHERE organization_id=(SELECT org FROM tx_state) AND user_id=(SELECT checker FROM tx_state);
SELECT set_config('request.jwt.claim.sub',checker::text,true) FROM tx_state;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_legacy_expense_history(%L,%L)',org,id),'42501','Not authorized','manager cannot read legacy history across branch') FROM tx_state CROSS JOIN legacy_case;
SELECT is((SELECT count(*) FROM public.expense_legacy_replacements),0::bigint,'replacement relation RLS hides another branch');
SELECT throws_ok(format('SELECT public.replace_legacy_expense_submission(%L,%L,%L,CURRENT_DATE,NULL,%L,CURRENT_DATE,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,id,'Correct legacy expense','Legacy vendor','USD',pay_from,'owner',payload,'legacy-correction-one'),'42501','Not authorized','manager cannot replay correction across branch') FROM tx_state CROSS JOIN legacy_case CROSS JOIN legacy_lines;
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;






