BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES('d4610000-0000-4000-8000-000000000010','authenticated','authenticated','historical-recovery@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES('d4610000-0000-4000-8000-000000000001','Historical recovery','historical-recovery');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES('d4610000-0000-4000-8000-000000000001','d4610000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people(id,organization_id,display_name) VALUES('d4610000-0000-4000-8000-000000000003','d4610000-0000-4000-8000-000000000001','Recovery owner and tenant');
INSERT INTO public.person_roles(organization_id,person_id,role,status) VALUES('d4610000-0000-4000-8000-000000000001','d4610000-0000-4000-8000-000000000003','owner','active'),('d4610000-0000-4000-8000-000000000001','d4610000-0000-4000-8000-000000000003','tenant','active');
CREATE TEMP TABLE recovery_state(org uuid,property_id uuid,owner_id uuid,aug date,sep date,fee_aug uuid,fee_sep uuid,payout uuid,preview jsonb);
DO $$
DECLARE
 org uuid := 'd4610000-0000-4000-8000-000000000001'; actor uuid := 'd4610000-0000-4000-8000-000000000010'; owner_id uuid := 'd4610000-0000-4000-8000-000000000003';
 prop uuid := gen_random_uuid(); lease uuid := gen_random_uuid(); term uuid := gen_random_uuid(); source uuid := gen_random_uuid();
 invoice uuid; income uuid; line uuid; fee uuid; fee_line uuid; cash uuid; aug_cash uuid; sep_cash uuid;
 expense uuid := gen_random_uuid(); responsibility uuid := gen_random_uuid(); owner_invoice uuid; expense_line uuid := gen_random_uuid();
 aug date := (date_trunc('month',current_date)-interval '2 months')::date; sep date;
 bill date; receipt date; recognition date; n integer;
BEGIN
 sep := (aug+interval '1 month')::date;
 INSERT INTO public.properties(id,organization_id,name,code,property_type) VALUES(prop,org,'Recovery property','RECOVERY','Apartment');
 INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary) VALUES(org,prop,owner_id,100,aug-365,true);
 INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id) VALUES(lease,org,prop,owner_id);
 INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,confirmed_by) VALUES(term,org,lease,prop,aug,aug+365,actor);
 PERFORM set_config('app.financial_reconciliation_source_context','on',true);
 INSERT INTO public.financial_reconciliation_sources(id,organization_id,currency,code,display_name,source_kind,scope_kind) VALUES(source,org,'USD','RECOVERY_BANK','Recovery bank','bank','organization_pooled');
 FOR n IN 1..2 LOOP
  bill := CASE n WHEN 1 THEN aug ELSE sep END; receipt := CASE n WHEN 1 THEN aug+5 ELSE sep+3 END; recognition := CASE n WHEN 1 THEN aug+25 ELSE sep END;
  invoice:=gen_random_uuid(); income:=gen_random_uuid(); line:=gen_random_uuid(); fee:=gen_random_uuid(); cash:=gen_random_uuid();
  INSERT INTO public.tenant_invoices(id,organization_id,invoice_number,property_id,lease_id,billing_term_id,billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,recipient_label,total_amount,created_by)
  VALUES(invoice,org,'RECOVERY-TEN-'||n,prop,lease,term,bill,(bill+interval '1 month - 1 day')::date,bill,bill+5,'through_ips','individual',owner_id,'Tenant',500,actor);
  PERFORM set_config('app.rent_generation_context','lease-derived-v1',true);
  INSERT INTO public.finance_income_items(id,organization_id,property_id,payer_label,due_date,amount_due,income_type,lease_id) VALUES(income,org,prop,'Tenant',bill+5,500,'rent',lease);
  INSERT INTO public.tenant_invoice_lines(id,organization_id,invoice_id,income_item_id,line_type,customer_label,description,amount,sort_order,property_id,currency,recognized_on,created_by) VALUES(line,org,invoice,income,'rent','Rent','Recovery monthly rent',500,1,prop,'USD',bill,actor);
  INSERT INTO public.management_fee_occurrences(id,organization_id,property_id,lease_id,tenant_invoice_id,billing_term_id,fee_date,amount,fee_mode,fee_value,created_by) VALUES(fee,org,prop,lease,invoice,term,recognition,40,'flat',40,actor);
  SELECT id,invoice_id INTO STRICT fee_line,owner_invoice FROM public.owner_invoice_lines WHERE organization_id=org AND source_id=fee AND source_type='management_fee';
  -- Direct fixture insertion reproduces legacy settlements now prevented by the posting trigger.
  INSERT INTO public.owner_charge_cash_allocations(id,organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by) VALUES(cash,org,prop,fee_line,aug+5,40,actor);
  IF n=1 THEN aug_cash:=cash; ELSE sep_cash:=cash; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM public.record_tenant_invoice_payment(org,invoice,500,receipt,source,'Recovery rent receipt',jsonb_build_array(jsonb_build_object('lineId',line,'amount',500)),'recovery-rent-'||n);
 END LOOP;
 INSERT INTO public.finance_expense_items(id,organization_id,property_id,expense_type,vendor_label,invoice_date,paid_date,amount,currency,category,status,created_by,economic_scope,owner_bill_status,owner_reimbursable_amount)
 VALUES(expense,org,prop,'utilities','Utility company',aug+25,aug+25,5.60,'USD','utility','paid',actor,'company_advance','billed',5.60);
 INSERT INTO public.owner_invoice_lines(id,organization_id,invoice_id,property_id,source_type,source_id,customer_label,description,amount,sort_order,created_by,recognized_on)
 VALUES(expense_line,org,owner_invoice,prop,'owner_expense',responsibility,'Utilities','Historical utilities',5.60,2,actor,aug+25);
 INSERT INTO public.ips_expense_responsibilities(id,organization_id,property_id,finance_expense_item_id,responsibility,responsible_person_id,customer_category,customer_label,internal_cost_amount,customer_total_amount,held_cash_amount,ips_advance_amount,owner_invoice_line_id,idempotency_key,created_by)
 VALUES(responsibility,org,prop,expense,'owner',owner_id,'utility','Utilities',5.60,5.60,5.60,0,expense_line,'recovery-utility',actor);
 INSERT INTO public.owner_charge_cash_allocations(organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by) VALUES(org,prop,expense_line,aug+25,5.60,actor);
 INSERT INTO recovery_state VALUES(org,prop,owner_id,aug,sep,aug_cash,sep_cash,NULL,NULL);
END $$;
GRANT ALL ON recovery_state TO authenticated;
SET LOCAL ROLE authenticated;
UPDATE recovery_state SET payout=(public.record_owner_distribution(org,property_id,owner_id,'USD',454.40,sep+14,'Historical payout','recovery-payout')->>'property_withdrawal_id')::uuid;
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements m,recovery_state s WHERE m.property_id=s.property_id AND component='ips_held_owner_cash' AND event_date<s.sep),414.40::numeric,'legacy August cash is 414.40');
SELECT throws_ok($$SELECT public.correct_owner_distribution_date(org,payout,sep-1,'Actual August bank date','recovery-payout-blocked') FROM recovery_state$$,'23514',NULL,'August payout cannot borrow September cash');
SELECT is((SELECT count(*) FROM public.property_withdrawals w,recovery_state s WHERE w.property_id=s.property_id),1::bigint,'failed payout edit leaves no partial reversal');
SELECT results_eq($q$SELECT source.event_date,c.consumed_amount FROM public.owner_cash_source_consumptions c JOIN public.owner_component_movements source ON source.id=c.source_movement_id JOIN public.owner_component_movements consumer ON consumer.id=c.consumer_movement_id JOIN public.owner_event_owner_allocations a ON a.id=consumer.owner_event_owner_allocation_id JOIN public.owner_event_allocation_sets e ON e.id=a.allocation_set_id,recovery_state s WHERE e.source_line_id=s.payout ORDER BY source.event_date$q$,$q$SELECT aug+5,414.40::numeric FROM recovery_state UNION ALL SELECT sep+3,40::numeric FROM recovery_state$q$,'original payout reserves August 414.40 and September 40');
SAVEPOINT standalone_fee;
UPDATE recovery_state SET preview=public.preview_fee_payment_date_correction(org,fee_sep,sep+3);
SELECT ok((SELECT (preview->>'canApply')::boolean FROM recovery_state),'September fee date preview succeeds');
SELECT public.correct_fee_payment_date(org,fee_sep,sep+3,'September fee paid from September receipt',preview->>'previewHash','recovery-fee-date') FROM recovery_state;
SELECT throws_ok($$SELECT public.correct_owner_distribution_date(org,payout,sep-1,'Actual August bank date','recovery-payout-corrected') FROM recovery_state$$,'23514','insufficient_authoritative_held_cash','standalone fee correction retains August source reservation and cannot resolve payout');
ROLLBACK TO SAVEPOINT standalone_fee;
CREATE TEMP TABLE recovery_before AS SELECT
 (SELECT count(*) FROM public.owner_charge_cash_allocations WHERE organization_id=s.org) cash_rows,
 (SELECT count(*) FROM public.owner_component_movements WHERE organization_id=s.org) movements,
 (SELECT count(*) FROM public.activity_logs WHERE organization_id=s.org) logs FROM recovery_state s;
UPDATE recovery_state SET preview=public.preview_owner_distribution_fee_recovery(org,fee_sep,sep+3,payout,sep-1);
SELECT ok((SELECT (preview->>'canApply')::boolean FROM recovery_state),'combined recovery preview succeeds');
SELECT is((SELECT (preview->>'currentBalanceChange')::numeric FROM recovery_state),0::numeric,'preview changes no current cash');
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations c,recovery_state s WHERE c.organization_id=s.org),(SELECT cash_rows FROM recovery_before),'preview rolls back all fee rows');
SELECT is((SELECT count(*) FROM public.owner_component_movements c,recovery_state s WHERE c.organization_id=s.org),(SELECT movements FROM recovery_before),'preview rolls back all movements');
SELECT is((SELECT count(*) FROM public.activity_logs c,recovery_state s WHERE c.organization_id=s.org),(SELECT logs FROM recovery_before),'preview rolls back all audit rows');
SELECT public.set_financial_month_lock(org,aug,true,'Recovery closed month test') FROM recovery_state;
SELECT ok(NOT (public.preview_owner_distribution_fee_recovery(org,fee_sep,sep+3,payout,sep-1)->>'canApply')::boolean,'closed month blocks recovery') FROM recovery_state;
SELECT public.set_financial_month_lock(org,aug,false,'Recovery reopen fixture') FROM recovery_state;
SELECT throws_ok($$SELECT public.recover_owner_distribution_fee_dates(org,fee_sep,sep+3,payout,sep-1,'Historical date correction',preview->>'previewHash','recovery-stale') FROM recovery_state$$,'40001','fee_payment_date_preview_stale','financial lock change invalidates old preview');
UPDATE recovery_state SET preview=public.preview_owner_distribution_fee_recovery(org,fee_sep,sep+3,payout,sep-1);
SELECT throws_ok($$SELECT public.recover_owner_distribution_fee_dates(org,fee_sep,sep+3,payout,sep-1,'Historical date correction',repeat('a',64),'recovery-bad-hash') FROM recovery_state$$,'40001','fee_payment_date_preview_stale','invalid preview hash cannot confirm');
SELECT ok(NOT (public.preview_owner_distribution_fee_recovery(org,fee_sep,sep,payout,sep-1)->>'canApply')::boolean,'fee cannot be moved to September 1 before its remaining cash arrives') FROM recovery_state;
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations c,recovery_state s WHERE c.organization_id=s.org),(SELECT cash_rows FROM recovery_before),'failed preview rolls back both corrections');
CREATE TEMP TABLE recovery_result AS SELECT public.recover_owner_distribution_fee_dates(org,fee_sep,sep+3,payout,sep-1,'Historical date correction',preview->>'previewHash','recovery-confirm') result FROM recovery_state;
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements m,recovery_state s WHERE m.property_id=s.property_id AND component='ips_held_owner_cash' AND event_date<s.sep),0::numeric,'corrected August closing cash is zero');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements m,recovery_state s WHERE m.property_id=s.property_id AND component='ips_held_owner_cash'),460::numeric,'September cash remains 460 with no invented money');
SELECT is((SELECT sum(amount) FROM public.owner_charge_cash_allocations c,recovery_state s WHERE c.property_id=s.property_id),85.60::numeric,'all fee and utility cash totals unchanged');
SELECT is((SELECT sum(CASE WHEN w.reversal_of_id IS NULL THEN w.amount ELSE -w.amount END) FROM public.property_withdrawals w,recovery_state s WHERE w.property_id=s.property_id),454.40::numeric,'payout total unchanged');
SELECT is((SELECT allocation_date FROM public.owner_charge_cash_allocations c,recovery_state s WHERE c.id=s.fee_sep),(SELECT aug+5 FROM recovery_state),'original September fee keeps historical date');
SELECT is((SELECT withdrawal_date FROM public.property_withdrawals w,recovery_state s WHERE w.id=s.payout),(SELECT sep+14 FROM recovery_state),'original payout keeps historical date');
SELECT is((SELECT public.recover_owner_distribution_fee_dates(org,fee_sep,sep+3,payout,sep-1,'Historical date correction',preview->>'previewHash','recovery-confirm') FROM recovery_state),(SELECT result FROM recovery_result),'confirmation retry replays same correction');
SELECT throws_ok($$SELECT public.recover_owner_distribution_fee_dates(org,fee_sep,sep+3,payout,sep-1,'Changed recovery reason',preview->>'previewHash','recovery-confirm') FROM recovery_state$$,'22023','fee_payment_date_idempotency_conflict','conflicting confirmation retry is rejected');
SELECT results_eq($q$SELECT source.event_date,c.consumed_amount FROM public.fee_payment_date_corrections f JOIN public.owner_event_allocation_sets e ON e.source_line_id=f.replacement_allocation_id JOIN public.owner_event_owner_allocations a ON a.allocation_set_id=e.id JOIN public.owner_component_movements consumer ON consumer.owner_event_owner_allocation_id=a.id JOIN public.owner_cash_source_consumptions c ON c.consumer_movement_id=consumer.id JOIN public.owner_component_movements source ON source.id=c.source_movement_id,recovery_state s WHERE f.original_allocation_id=s.fee_sep$q$,$q$SELECT sep+3,40::numeric FROM recovery_state$q$,'replacement September fee is funded by September receipt');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.owner_cash_source_consumptions c JOIN public.owner_component_movements consumer ON consumer.id=c.consumer_movement_id JOIN public.owner_component_movements source ON source.id=c.source_movement_id,recovery_state s WHERE consumer.property_id=s.property_id AND source.event_date>consumer.event_date),'no consumption borrows future receipts');
SELECT set_config('request.jwt.claim.sub','d4610000-0000-4000-8000-000000000099',true);
SELECT throws_ok($$SELECT public.preview_owner_distribution_fee_recovery(org,fee_sep,sep+3,payout,sep-1) FROM recovery_state$$,'42501','fee_payment_date_correction_forbidden','unrelated user cannot preview recovery');
SELECT throws_ok($$SELECT public.recover_owner_distribution_fee_dates(org,fee_sep,sep+3,payout,sep-1,'Historical date correction',preview->>'previewHash','recovery-denied') FROM recovery_state$$,'42501','fee_payment_date_correction_forbidden','unrelated user cannot confirm recovery');
SELECT * FROM finish();
ROLLBACK;
