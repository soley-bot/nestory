-- Runs in an empty local schema clone. Only the lease and membership in this fixture are used.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE rent_setting AS SELECT
  '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid AS org, gen_random_uuid() AS other_org,
  gen_random_uuid() AS admin_id, gen_random_uuid() AS finance_id, gen_random_uuid() AS foreign_admin_id,
  gen_random_uuid() AS property_id, gen_random_uuid() AS unit_id, gen_random_uuid() AS tenant_id,
  gen_random_uuid() AS lease_id, gen_random_uuid() AS owner_id, NULL::timestamptz AS original_version, NULL::timestamptz AS manual_version;
GRANT SELECT, UPDATE ON rent_setting TO authenticated;

INSERT INTO public.organizations(id,name,slug,operational_timezone)
SELECT org,'Pilot fixture','pilot','UTC' FROM rent_setting UNION ALL
SELECT other_org,'Other fixture','other-rent-setting','UTC' FROM rent_setting;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous)
SELECT actor,'authenticated','authenticated',actor::text||'@test.invalid','{}','{}',false
FROM rent_setting CROSS JOIN LATERAL unnest(ARRAY[admin_id,finance_id,foreign_admin_id]) actor;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT gen_random_uuid(),id,now(),now(),'aal1' FROM auth.users;
INSERT INTO public.organization_members(organization_id,user_id,role)
SELECT org,admin_id,'super_admin' FROM rent_setting UNION ALL
SELECT org,finance_id,'finance_manager' FROM rent_setting UNION ALL
SELECT other_org,foreign_admin_id,'super_admin' FROM rent_setting;

CREATE FUNCTION pg_temp.sign_in(actor uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated',
    'aud','authenticated','is_anonymous',false,'session_id',id,
    'exp',extract(epoch FROM now()+interval '1 hour')::bigint)::text,true)
  FROM auth.sessions WHERE user_id=actor;
$$;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT org,1,'frozen',(date_trunc('month',current_date)-interval '1 month')::date FROM rent_setting;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT org FROM rent_setting);
SELECT pg_temp.sign_in(admin_id) FROM rent_setting;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT has_function('public','set_pilot_rent_auto_posting',ARRAY['uuid','boolean','timestamp with time zone'],
  'the signed-in settings action has a database command');
SELECT ok(NOT has_function_privilege('anon','public.set_pilot_rent_auto_posting(uuid,boolean,timestamptz)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.set_pilot_rent_auto_posting(uuid,boolean,timestamptz)','EXECUTE'),
  'only authenticated callers can enter the settings command');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE rent_setting SET original_version=(public.get_financial_write_context(org)->>'automatic_rent_updated_at')::timestamptz;
SELECT ok(original_version IS NOT NULL,'the settings form receives an optimistic concurrency token') FROM rent_setting;
SAVEPOINT previous_generation;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"0"}',true);
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,false,original_version) FROM rent_setting$$,
  '40001','financial_generation_stale','the setting requires the displayed financial generation');
ROLLBACK TO SAVEPOINT previous_generation;
SELECT is(public.set_pilot_rent_auto_posting(org,false,original_version),false,'a Pilot Super Admin can switch to manual billing') FROM rent_setting;
UPDATE rent_setting SET manual_version=(public.get_financial_write_context(org)->>'automatic_rent_updated_at')::timestamptz;
SELECT isnt(manual_version,original_version,'a successful change advances the settings version') FROM rent_setting;
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,true,original_version) FROM rent_setting$$,
  '40001','rent_posting_setting_stale','an older form cannot reverse the saved change');
SELECT is(public.set_pilot_rent_auto_posting(org,false,manual_version),false,'saving the current setting is a no-op') FROM rent_setting;
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(other_org,true,manual_version) FROM rent_setting$$,
  '42501','rent_posting_setting_forbidden','the Pilot administrator cannot use this command for another organization');
RESET ROLE;
RESET SESSION AUTHORIZATION;

SAVEPOINT expired_session;
UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE user_id=(SELECT admin_id FROM rent_setting);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,true,manual_version) FROM rent_setting$$,
  '42501','rent_posting_setting_forbidden','an expired Pilot session cannot change rent posting');
ROLLBACK TO SAVEPOINT expired_session;
SAVEPOINT email_verification;
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at,enabled_by)
SELECT org,true,now(),admin_id FROM rent_setting;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,true,manual_version) FROM rent_setting$$,
  '42501','rent_posting_setting_forbidden','the workspace email verification policy applies to the setting');
ROLLBACK TO SAVEPOINT email_verification;

INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure,status)
SELECT property_id,org,'Rent setting unit','RENT-1','apartment','multi_unit','active' FROM rent_setting;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
SELECT unit_id,org,property_id,'A1','vacant',450,'USD' FROM rent_setting;
INSERT INTO public.people(id,organization_id,display_name,party_type)
SELECT tenant_id,org,'Synthetic tenant','individual' FROM rent_setting;
INSERT INTO public.person_roles(organization_id,person_id,role) SELECT org,tenant_id,'tenant' FROM rent_setting;
INSERT INTO public.people(id,organization_id,display_name,party_type)
SELECT owner_id,org,'Synthetic owner','individual' FROM rent_setting;
INSERT INTO public.person_roles(organization_id,person_id,role) SELECT org,owner_id,'owner' FROM rent_setting;
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_label,ownership_percent,is_primary,started_on,created_by,updated_by)
SELECT org,property_id,owner_id,'Primary owner',100,true,(date_trunc('month',current_date)-interval '2 months')::date,admin_id,admin_id FROM rent_setting;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,created_by,updated_by)
SELECT lease_id,org,property_id,unit_id,tenant_id,'active',admin_id,admin_id FROM rent_setting;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is((SELECT r.status FROM rent_setting s CROSS JOIN LATERAL public.get_scoped_current_rent_statuses(s.org,ARRAY[s.lease_id]) r),
  'setup_needed','a lease without rent setup cannot be charged from the unit list');
SELECT ok((SELECT public.get_finance_read_context(org)->'recovery_leases' @> jsonb_build_array(
  jsonb_build_object('id',lease_id,'unit_id',unit_id,'status','active','primary_tenant_person_id',tenant_id))
  FROM rent_setting),'a lease without a term still belongs to the right unit and tenant in the finance context');
RESET ROLE;
RESET SESSION AUTHORIZATION;
INSERT INTO public.lease_terms(organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,
  rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT org,lease_id,1,(date_trunc('month',current_date)-interval '1 month')::date,current_date+interval '1 year',
  450,'USD',7,'monthly','active','authoritative',now(),admin_id,admin_id,admin_id FROM rent_setting;
INSERT INTO public.lease_billing_terms(organization_id,lease_id,property_id,effective_from,effective_to,collection_route,
  management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
  billing_recipient_kind,billing_recipient_person_id,rent_calculation_timezone,short_month_due_day_rule,
  lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
  confirmed_at,confirmed_by,created_by,updated_by)
SELECT org,lease_id,property_id,(date_trunc('month',current_date)-interval '1 month')::date,current_date+interval '1 year',
  'through_ips','percentage',10,true,false,'individual',tenant_id,'UTC','last_calendar_day',
  'actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),admin_id,admin_id,admin_id FROM rent_setting;
SELECT app_private.run_due_rent_generation(now());
SELECT is((SELECT count(*) FROM public.tenant_invoices),0::bigint,'lease setup and the ordinary scheduler honor Off');
SELECT pg_temp.sign_in(finance_id) FROM rent_setting;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is((SELECT r.status FROM rent_setting s CROSS JOIN LATERAL public.get_scoped_current_rent_statuses(s.org,ARRAY[s.lease_id]) r),
  'missing','a finance reader sees that the eligible lease has no rent charge');
SELECT throws_ok($$SELECT r.* FROM rent_setting s CROSS JOIN LATERAL public.get_scoped_current_rent_statuses(s.org,array_fill(s.lease_id,ARRAY[101])) r$$,
  '22023','Invalid rent status batch','unit rent status reads are bounded');
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,true,manual_version) FROM rent_setting$$,
  '42501','rent_posting_setting_forbidden','finance staff cannot change posting policy');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.sign_in(foreign_admin_id) FROM rent_setting;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT r.* FROM rent_setting s CROSS JOIN LATERAL public.get_scoped_current_rent_statuses(s.org,ARRAY[s.lease_id]) r$$,
  '42501','Not authorized','an administrator in another organization cannot read this unit charge');
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,true,manual_version) FROM rent_setting$$,
  '42501','rent_posting_setting_forbidden','another workspace administrator cannot change Pilot');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.sign_in(admin_id) FROM rent_setting;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is(public.set_pilot_rent_auto_posting(org,true,manual_version),true,'a Pilot Super Admin can turn automatic billing back on') FROM rent_setting;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*) FROM public.tenant_invoices),0::bigint,'saving On does not synchronously generate invoices');
SELECT is((SELECT count(*) FROM public.management_fee_occurrences),0::bigint,'there is no fee before rent is generated');
SELECT app_private.run_due_rent_generation(now());
SELECT app_private.run_due_rent_generation(now());
SELECT is((SELECT count(*) FROM public.tenant_invoices),1::bigint,'two ordinary scheduler runs post one eligible lease-month');
SELECT is((SELECT billing_period_start FROM public.tenant_invoices LIMIT 1),date_trunc('month',now() AT TIME ZONE 'UTC')::date,
  'the existing lease beginning last month receives only its current billing month');
SELECT results_eq($$SELECT f.fee_date, l.recognized_on, f.amount FROM public.management_fee_occurrences f
  JOIN public.owner_invoice_lines l ON l.source_type='management_fee' AND l.source_id=f.id$$,
  $$SELECT date_trunc('month',current_date)::date, date_trunc('month',current_date)::date, 45::numeric$$,
  'the repeated scheduled run produces one fee and one owner charge on the first of the rental month');
SELECT results_eq($$SELECT economic_class,recognized_on,signed_amount FROM rent_setting s CROSS JOIN LATERAL
  public.get_report_profit_loss_events_page(s.org,s.property_id,'USD',date_trunc('month',current_date)::date,
  (date_trunc('month',current_date)+interval '1 month - 1 day')::date,NULL,NULL,NULL,100,true)
  ORDER BY economic_class$$,
  $$SELECT kind,date_trunc('month',current_date)::date,amount FROM (VALUES('owner_expense'::text,45::numeric),('owner_income',450)) t(kind,amount) ORDER BY kind$$,
  'same-month catch-up rent and its fee both appear on the first on the Pilot P&L');
SAVEPOINT first_day;
SELECT app_private.run_due_rent_generation((date_trunc('month',current_date::timestamp)+interval '1 month 17 minutes') AT TIME ZONE 'UTC');
SELECT app_private.run_due_rent_generation((date_trunc('month',current_date::timestamp)+interval '1 month 1 hour 17 minutes') AT TIME ZONE 'UTC');
SELECT results_eq($$SELECT i.issue_date,i.due_date,f.fee_date,l.recognized_on FROM public.tenant_invoices i
  JOIN public.management_fee_occurrences f ON f.tenant_invoice_id=i.id
  JOIN public.owner_invoice_lines l ON l.source_type='management_fee' AND l.source_id=f.id
  WHERE i.billing_period_start=(date_trunc('month',current_date)+interval '1 month')::date$$,
  $$SELECT d,d+6,d,d FROM (SELECT (date_trunc('month',current_date)+interval '1 month')::date d) first_day$$,
  'the first scheduled run posts rent and fee on day one with rent due on the seventh and no duplicate on retry');
ROLLBACK TO SAVEPOINT first_day;

SAVEPOINT bulk_history;
-- The following calls emulate fresh PostgREST requests after the scheduler
-- tests above, which ran inside this same rollback-only database transaction.
SELECT set_config('app.financial_scheduler_scope','',true);
CREATE TEMP TABLE bulk_history AS SELECT s.*,gen_random_uuid() AS ended_lease,gen_random_uuid() AS ended_unit,
  (date_trunc('month',current_date)-interval '1 month')::date AS month, '[]'::jsonb AS review FROM rent_setting s;
GRANT SELECT, UPDATE ON bulk_history TO authenticated;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
  SELECT ended_unit,org,property_id,'Ended unit','vacant',620,'USD' FROM bulk_history;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,created_by,updated_by)
  SELECT ended_lease,org,property_id,ended_unit,tenant_id,'ended',admin_id,admin_id FROM bulk_history;
INSERT INTO public.lease_terms(organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,
  rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
  SELECT org,ended_lease,1,month,month+9,620,'USD',1,'monthly','expired','authoritative',now(),admin_id,admin_id,admin_id FROM bulk_history;
INSERT INTO public.lease_billing_terms(organization_id,lease_id,property_id,effective_from,effective_to,collection_route,
  management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
  billing_recipient_kind,billing_recipient_person_id,rent_calculation_timezone,short_month_due_day_rule,
  lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
  confirmed_at,confirmed_by,created_by,updated_by)
  SELECT org,ended_lease,property_id,month,month+9,'through_ips','flat',62,true,false,'individual',tenant_id,'UTC',
    'last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),admin_id,admin_id,admin_id FROM bulk_history;
CREATE FUNCTION pg_temp.selection(rows jsonb, lease uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('id',lease,'token',r->>'token')) FROM jsonb_array_elements(rows) r WHERE r->>'leaseId'=lease::text;
$$;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE bulk_history SET review=public.preview_pilot_bulk_rent(org,month);
SELECT is(jsonb_array_length(review),2,'past month review includes an active lease and a lease which has already ended') FROM bulk_history;
SELECT is((SELECT count(*) FROM public.tenant_invoices i JOIN bulk_history b ON i.billing_period_start=b.month),0::bigint,'preview creates zero invoices');
SELECT ok(review @> jsonb_build_array(jsonb_build_object('leaseId',lease_id,'rent',450,'fee',45,'prorated',false))
  AND review @> jsonb_build_array(jsonb_build_object('leaseId',ended_lease,'rent',round(6200::numeric/((month+interval '1 month')::date-month),2),
  'prorated',true,'through',month+9)),'preview shows the full monthly and actual-days prorated charges') FROM bulk_history;
SELECT is(public.preview_pilot_bulk_rent(org,month,NULL,other_org),'[]'::jsonb,'review honors the property filter') FROM bulk_history;
SELECT is(public.preview_pilot_bulk_rent(org,month,greatest(lease_id,ended_lease)), '[]'::jsonb,'a review cursor cannot repeat an earlier lease') FROM bulk_history;
SELECT throws_ok($$SELECT public.preview_pilot_bulk_rent(org,date_trunc('month',current_date)::date) FROM bulk_history$$,
  '22023','bulk_rent_choose_past_month','current month belongs to normal posting');
SELECT throws_ok($$SELECT public.preview_pilot_bulk_rent(org,(month-interval '1 month')::date) FROM bulk_history$$,
  '22023','financial_date_before_start','earlier financial generations remain protected');
SELECT throws_ok($$SELECT public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id)||pg_temp.selection(review,lease_id)) FROM bulk_history$$,
  '22023','Invalid rent selection','duplicate leases in one request are rejected');
SELECT is(public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id),other_org)->0->>'status','review','posting also honors the property filter') FROM bulk_history;
-- A manual rent charge can already have a genuine receipt before staff notice
-- that it was booked in the wrong month. Exercise the normal entry points.
SAVEPOINT paid_rent_review;
RESET ROLE;
RESET SESSION AUTHORIZATION;
CREATE TEMP TABLE paid_review AS SELECT org,property_id,lease_id,month,gen_random_uuid() AS bank,
  NULL::uuid AS account_id,NULL::jsonb AS manual,NULL::jsonb AS review,NULL::jsonb AS done FROM bulk_history;
GRANT SELECT,UPDATE ON paid_review TO authenticated;
UPDATE paid_review p SET account_id=(SELECT a.id FROM public.finance_accounts a WHERE a.organization_id=p.org AND a.system_role='rental_income');
SELECT set_config('app.financial_reconciliation_source_context','on',true);
INSERT INTO public.financial_reconciliation_sources(id,organization_id,currency,code,display_name,source_kind,scope_kind)
SELECT bank,org,'USD','PAID_RENT_BANK','Lease rent test bank','bank','organization_pooled' FROM paid_review;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE paid_review SET manual=public.create_manual_tenant_charge_with_account(org,lease_id,account_id,month,month+6,450,'Rent for last month','paid-rent-test-charge');
SELECT throws_ok($$SELECT public.preview_paid_lease_rent(org,(manual->>'invoiceId')::uuid) FROM paid_review$$,
  '22023','paid_rent_not_eligible','an unpaid invoice cannot use the paid charge correction');
SELECT public.record_tenant_invoice_payment(org,(manual->>'invoiceId')::uuid,450,month+13,bank,'October receipt',
  jsonb_build_array(jsonb_build_object('lineId',manual->>'lineId','amount',450)),'paid-rent-test-receipt') FROM paid_review;
UPDATE paid_review SET review=public.preview_paid_lease_rent(org,(manual->>'invoiceId')::uuid);
SELECT throws_ok($$SELECT public.preview_historical_rent_correction(org,(manual->>'invoiceId')::uuid,
  450,extract(day FROM month+6)::integer,42) FROM paid_review$$,
  '23514','historical_rent_invoice_not_eligible','a paid manual charge needs a confirmed lease fee before staff can edit the fee');
SELECT ok(review @> jsonb_build_object('month',month,'receivedDate',month+13,'rent',450,'fee',45),'review binds the rental month, receipt date, rent and fee') FROM paid_review;
SELECT throws_ok($$SELECT public.confirm_paid_lease_rent(org,(manual->>'invoiceId')::uuid,repeat('0',32)) FROM paid_review$$,
  '40001','paid_rent_changed','a stale confirmation cannot correct a paid charge');
SELECT is((SELECT count(*) FROM public.management_fee_occurrences f,paid_review p WHERE f.tenant_invoice_id=(p.manual->>'invoiceId')::uuid),
  0::bigint,'preview and stale confirmation leave the fee untouched');
UPDATE paid_review SET done=public.confirm_paid_lease_rent(org,(manual->>'invoiceId')::uuid,review->>'token');
SELECT is(public.confirm_paid_lease_rent(org,(manual->>'invoiceId')::uuid,review->>'token'),done,'replaying the same confirmation has no additional effect') FROM paid_review;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT ok(l.line_type='rent' AND l.income_item_id=(p.review->>'incomeId')::uuid AND f.rent_billing_period_start=p.month
  AND f.income_type='rent' AND f.amount_received=450 AND l.recognized_on=i.issue_date AND i.generation_source IS NULL,
  'the existing obligation counts as rent and retains its original issue date and source')
FROM paid_review p JOIN public.tenant_invoice_lines l ON l.id=(p.manual->>'lineId')::uuid
JOIN public.tenant_invoices i ON i.id=l.invoice_id JOIN public.finance_income_items f ON f.id=l.income_item_id;
SELECT is((SELECT count(*) FROM public.tenant_invoice_payments t,paid_review p WHERE t.invoice_id=(p.manual->>'invoiceId')::uuid
  AND t.id=(p.review->>'paymentId')::uuid AND t.received_date=p.month+13 AND t.amount=450 AND t.receipt_number=p.review->>'receipt' AND t.reversal_of_id IS NULL),
  1::bigint,'the original payment and dated receipt survive the correction');
SELECT ok((SELECT count(*)=1 AND min(f.fee_date)=p.month AND sum(f.amount)=45 FROM public.management_fee_occurrences f
  WHERE f.tenant_invoice_id=(p.manual->>'invoiceId')::uuid)
  AND (SELECT count(*)=2 FROM public.owner_event_allocation_sets s WHERE s.organization_id=p.org AND
    (s.source_type='tenant_rent_receipt' AND s.source_line_id=(p.review->>'allocationId')::uuid
     OR s.source_type='management_fee_occurrence' AND s.source_line_id=(p.done->>'feeId')::uuid)),
  'one first-of-month fee and one cash allocation reach the owner accounts') FROM paid_review p;
SELECT results_eq($$SELECT economic_class,recognized_on,signed_amount FROM paid_review p CROSS JOIN LATERAL
  public.get_report_profit_loss_events_page(p.org,p.property_id,'USD',p.month,(p.month+interval '1 month - 1 day')::date,
    NULL,NULL,NULL,100,true) e WHERE e.unit_id=(SELECT unit_id FROM rent_setting) ORDER BY signed_amount$$,
  $$SELECT 'owner_expense'::text,month,45::numeric FROM paid_review UNION ALL SELECT 'owner_income',month,450 FROM paid_review ORDER BY 3$$,
  'monthly P&L includes the paid rent and its fee in the rental month');
SELECT is((SELECT sum(e.signed_amount) FROM paid_review p CROSS JOIN LATERAL public.get_report_profit_loss_events_page(
  p.org,p.property_id,'USD',(p.month+interval '1 month')::date,(p.month+interval '2 months - 1 day')::date,
  NULL,NULL,NULL,100,true) e WHERE e.economic_class='owner_income'),450::numeric,'the following month counts only its own rent');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
CREATE FUNCTION pg_temp.confirmed_fee_preview(amount numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.preview_historical_rent_correction(org,(manual->>'invoiceId')::uuid,
    450,extract(day FROM month+6)::integer,amount) FROM paid_review;
$$;
SELECT ok(pg_temp.confirmed_fee_preview(42) @> jsonb_build_object('originalManagementFeeAmount',45,
  'feeRecognizedOn',month,'correctedDueDate',month+6,'blockers','[]'::jsonb),
  'a fee edit keeps the recorded tenant due date and the first of the rental month') FROM paid_review;
CREATE FUNCTION pg_temp.correct_confirmed_fee(amount numeric, request_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.correct_historical_rent(org,(manual->>'invoiceId')::uuid,450,extract(day FROM month+6)::integer,
    'Reviewed fee for confirmed monthly rent',pg_temp.confirmed_fee_preview(amount)->>'previewHash',request_key,amount)
    FROM paid_review;
$$;
SELECT lives_ok($$SELECT pg_temp.correct_confirmed_fee(0,'confirmed-fee-remove')$$,'a confirmed rent fee can be removed');
SELECT lives_ok($$SELECT pg_temp.correct_confirmed_fee(42,'confirmed-fee-revise')$$,'a removed confirmed rent fee can be restored at a revised amount');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT ok((SELECT count(*)=1 AND sum(t.amount)=450 AND min(t.received_date)=p.month+13
    FROM public.tenant_invoice_payments t WHERE t.invoice_id=(p.manual->>'invoiceId')::uuid)
  AND (SELECT count(*)=1 FROM public.tenant_invoice_payments t WHERE t.id=(p.review->>'paymentId')::uuid AND t.receipt_number=p.review->>'receipt')
  AND (SELECT count(*)=2 FROM public.tenant_invoice_corrections c WHERE c.tenant_invoice_id=(p.manual->>'invoiceId')::uuid AND c.action='management_fee'),
  'both fee edits are audited and the original dated receipt survives once') FROM paid_review p;
SELECT results_eq($$SELECT economic_class,recognized_on,signed_amount FROM paid_review p CROSS JOIN LATERAL
  public.get_report_profit_loss_events_page(p.org,p.property_id,'USD',p.month,(p.month+interval '1 month - 1 day')::date,
    NULL,NULL,NULL,100,true) e WHERE e.unit_id=(SELECT unit_id FROM rent_setting) ORDER BY signed_amount$$,
  $$SELECT 'owner_expense'::text,month,42::numeric FROM paid_review UNION ALL SELECT 'owner_income',month,450 FROM paid_review ORDER BY 3$$,
  'the owner sees the final fee and a single rent amount in the original rental month');
ROLLBACK TO SAVEPOINT paid_rent_review;
SAVEPOINT departed_rent;
RESET ROLE;
RESET SESSION AUTHORIZATION;
CREATE TEMP TABLE departure AS SELECT b.*, i.id AS invoice_id,i.issue_date,
  (SELECT jsonb_agg(jsonb_build_object('id',il.id,'amount',il.amount) ORDER BY il.id)
   FROM public.tenant_invoice_lines il WHERE il.invoice_id=i.id) AS lines,gen_random_uuid() AS occupancy
  FROM bulk_history b JOIN public.tenant_invoices i ON i.lease_id=b.lease_id AND i.billing_period_start=(b.month+interval '1 month')::date;
GRANT SELECT ON departure TO authenticated;
SELECT set_config('app.people_leases_skip_sync','on',true);
INSERT INTO public.lease_occupancies(id,organization_id,lease_id,property_id,unit_id,status,actual_move_in_date,evidence_state,business_lifecycle,
  record_source,actual_move_in_kind,actual_move_in_confidence,evidence_reason,evidence_recorded_by,created_by,updated_by)
  SELECT occupancy,org,lease_id,property_id,unit_id,'occupied',month,'accepted','occupied','operator_confirmed','known','confirmed',
    'Confirmed move in',admin_id,admin_id,admin_id FROM departure;
SELECT set_config('app.people_leases_skip_sync','off',true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.record_owner_contribution(org,property_id,owner_id,'USD',current_date,100,'Owner funds for expenses','departure-owner-funds',unit_id) FROM departure;
RESET ROLE;
RESET SESSION AUTHORIZATION;
INSERT INTO public.owner_charge_cash_allocations(organization_id,property_id,owner_invoice_line_id,allocation_date,amount,created_by)
  SELECT d.org,d.property_id,ol.id,current_date,f.amount,d.admin_id FROM departure d
  JOIN public.management_fee_occurrences f ON f.tenant_invoice_id=d.invoice_id
  JOIN public.owner_invoice_lines ol ON ol.source_type='management_fee' AND ol.source_id=f.id;
SELECT is((SELECT count(*) FROM public.owner_charge_cash_allocations WHERE reversal_of_id IS NULL),1::bigint,'the unpaid tenant invoice has a fee settled from held owner funds');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.void_tenant_invoice_checked(org,invoice_id,issue_date,lines,'Premature void attempt','departure-not-closed') FROM departure$$,
  '23514','owner_invoice_settlement_active','held cash is protected while the lease is active');
SELECT public.transition_lease_lifecycle(org,lease_id,'active',occupancy,'end',(month+interval '1 month - 1 day')::date,NULL,
  'Confirmed final occupancy date','departure-confirm-moveout') FROM departure;
SELECT lives_ok($$SELECT public.void_tenant_invoice_checked(org,invoice_id,issue_date,lines,'Rent billed after confirmed move-out','departure-void-rent') FROM departure$$,
  'voiding rent after the confirmed departure releases its held fee');
SELECT lives_ok($$SELECT public.void_tenant_invoice_checked(org,invoice_id,issue_date,lines,'Rent billed after confirmed move-out','departure-void-rent') FROM departure$$,
  'retrying the void cannot return the fee twice');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT ok((SELECT i.lifecycle='void' FROM public.tenant_invoices i WHERE i.id=d.invoice_id)
  AND (SELECT l.status='ended' FROM public.leases l WHERE l.id=d.lease_id)
  AND (SELECT count(*)=2 AND sum(f.amount)=0 FROM public.management_fee_occurrences f WHERE f.tenant_invoice_id=d.invoice_id)
  AND (SELECT count(*)=2 AND sum(a.amount)=0 FROM public.owner_charge_cash_allocations a WHERE a.property_id=d.property_id),
  'the tenant charge and owner fee are cancelled, held funds are restored once, and future rent has stopped') FROM departure d;
ROLLBACK TO SAVEPOINT departed_rent;
SAVEPOINT edited_recipient;
RESET ROLE;
RESET SESSION AUTHORIZATION;
UPDATE public.people SET display_name='Updated billing identity' WHERE id=(SELECT tenant_id FROM bulk_history);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is(public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id))->0->>'status','review',
  'changing the billing identity after selection requires a fresh review') FROM bulk_history;
SELECT is((SELECT count(*) FROM public.tenant_invoices i JOIN bulk_history b ON i.billing_period_start=b.month),0::bigint,
  'the stale review cannot post a tenant invoice');
ROLLBACK TO SAVEPOINT edited_recipient;
SAVEPOINT bulk_stale_form;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"0"}',true);
SELECT throws_ok($$SELECT public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id)) FROM bulk_history$$,
  '40001','financial_generation_stale','bulk posts require the captured generation');
ROLLBACK TO SAVEPOINT bulk_stale_form;
SAVEPOINT bulk_locked;
SELECT public.set_financial_month_lock(org,month,true,'Reviewed test close') FROM bulk_history;
SELECT ok(public.preview_pilot_bulk_rent(org,month) @> '[{"status":"blocked","note":"The financial month is locked."}]'::jsonb
  AND public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id))->0->>'status'='review','closing a reviewed month blocks confirmation') FROM bulk_history;
ROLLBACK TO SAVEPOINT bulk_locked;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.sign_in(finance_id) FROM bulk_history;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.preview_pilot_bulk_rent(org,month) FROM bulk_history$$,
  '42501','bulk_rent_forbidden','ordinary finance staff cannot preview bulk rent');
SELECT throws_ok($$SELECT public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id)) FROM bulk_history$$,
  '42501','bulk_rent_forbidden','ordinary finance staff cannot confirm bulk rent');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.sign_in(foreign_admin_id) FROM bulk_history;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.preview_pilot_bulk_rent(org,month) FROM bulk_history$$,'42501','bulk_rent_forbidden','another organization cannot review Pilot rent');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.sign_in(admin_id) FROM bulk_history;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT ok(public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id)||
  jsonb_build_array(jsonb_build_object('id',ended_lease,'token',repeat('0',32)))) @>
  jsonb_build_array(jsonb_build_object('leaseId',lease_id,'status','generated'),jsonb_build_object('leaseId',ended_lease,'status','review',
    'message','Lease details changed. Review the month again.')),
  'mixed results issue only the reviewed invoice while automatic posting is on') FROM bulk_history;
SELECT is((SELECT count(*) FROM public.tenant_invoices i JOIN bulk_history b ON i.billing_period_start=b.month),1::bigint,'unconfirmed partial rent stays unbilled');
SELECT is(public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,lease_id))->0->>'status','existing','a repeated batch skips the previously issued invoice') FROM bulk_history;
SELECT ok(public.preview_pilot_bulk_rent(org,month) @> jsonb_build_array(jsonb_build_object('status','existing','leaseId',lease_id)),
  'resuming after an interruption shows the issued invoice') FROM bulk_history;
SELECT public.set_pilot_rent_auto_posting(org,false,(public.get_financial_write_context(org)->>'automatic_rent_updated_at')::timestamptz) FROM bulk_history;
SELECT is(public.post_pilot_bulk_rent(org,month,pg_temp.selection(review,ended_lease))->0->>'status','generated',
  'an explicitly selected ended lease can also be issued when automatic posting is off') FROM bulk_history;
SELECT ok((SELECT i.total_amount=(r->>'rent')::numeric AND f.amount=(r->>'fee')::numeric AND f.fee_date=b.month
  AND i.issue_date=current_date AND i.due_date=current_date FROM bulk_history b CROSS JOIN LATERAL jsonb_array_elements(b.review) r
  JOIN public.tenant_invoices i ON i.lease_id=(r->>'leaseId')::uuid
  JOIN public.management_fee_occurrences f ON f.tenant_invoice_id=i.id
  WHERE i.lease_id=b.ended_lease AND i.billing_period_start=b.month),'prorated rent and fee match the preview and retain their separate issue and rental dates');
RESET ROLE;
RESET SESSION AUTHORIZATION;
ROLLBACK TO SAVEPOINT bulk_history;

SAVEPOINT late_invoice;
SELECT app_private.generate_simple_lease_rent_invoice(org,lease_id,
  (date_trunc('month',current_date)-interval '1 month')::date,current_date,'manual_recovery',admin_id) FROM rent_setting;
SELECT results_eq($$SELECT i.issue_date, f.fee_date, l.recognized_on, f.amount FROM public.tenant_invoices i
  JOIN public.management_fee_occurrences f ON f.tenant_invoice_id=i.id
  JOIN public.owner_invoice_lines l ON l.source_type='management_fee' AND l.source_id=f.id
  WHERE i.billing_period_start < date_trunc('month',current_date)::date$$,
  $$SELECT current_date, (date_trunc('month',current_date)-interval '1 month')::date,
    (date_trunc('month',current_date)-interval '1 month')::date,45::numeric$$,
  'a late invoice keeps the actual issue date and dates both linked fee records to the rental month');
CREATE TEMP TABLE issued_edit AS SELECT i.id AS invoice_id, i.organization_id AS org, i.due_date, i.billing_period_start AS month,
  NULL::text AS old_hash FROM public.tenant_invoices i WHERE i.billing_period_start<date_trunc('month',current_date)::date;
GRANT SELECT, UPDATE ON issued_edit TO authenticated;
CREATE FUNCTION pg_temp.fee_preview(rent numeric, fee numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.preview_historical_rent_correction(org,invoice_id,rent,extract(day FROM due_date)::integer,fee) FROM issued_edit;
$$;
CREATE FUNCTION pg_temp.apply_fee(rent numeric, fee numeric, key text, previous_hash text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.correct_historical_rent(org,invoice_id,rent,extract(day FROM due_date)::integer,'Staff only fee note',
    coalesce(previous_hash,pg_temp.fee_preview(rent,fee)->>'previewHash'),key,fee) FROM issued_edit;
$$;
CREATE FUNCTION pg_temp.apply_rent(amount numeric, key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.correct_historical_rent(org,invoice_id,amount,extract(day FROM due_date)::integer,'Staff only rent note',
    public.preview_historical_rent_correction(org,invoice_id,amount,extract(day FROM due_date)::integer)->>'previewHash',key)
    FROM issued_edit;
$$;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE issued_edit SET old_hash=pg_temp.fee_preview(450,55)->>'previewHash';
SELECT lives_ok($$SELECT pg_temp.apply_fee(450,60,'pilot-fee-change-1')$$,'change the linked fee');
SELECT throws_ok($$SELECT pg_temp.apply_fee(450,55,'pilot-fee-stale',old_hash) FROM issued_edit$$,'40001','historical_rent_preview_stale',
  'a stale fee editor cannot overwrite a more recent change');
SELECT lives_ok($$SELECT pg_temp.apply_fee(450,55,'pilot-fee-change-2')$$,'revise the fee a second time');
SELECT lives_ok($$SELECT pg_temp.apply_fee(450,0,'pilot-fee-change-3')$$,'reduce the fee to zero');
SELECT lives_ok($$SELECT pg_temp.apply_fee(450,48.33,'pilot-fee-change-4')$$,'restore a fee on the same lineage after zero');
SELECT results_eq($$SELECT count(*),sum(f.amount) FROM public.management_fee_occurrences f JOIN issued_edit e ON e.invoice_id=f.tenant_invoice_id$$,
  $$SELECT 7::bigint,48.33::numeric$$,'three reversed fees and the one effective fee retain the full staff history');
SELECT is((SELECT count(*) FROM public.management_fee_occurrences f JOIN issued_edit e ON e.invoice_id=f.tenant_invoice_id
  WHERE f.reversal_of_id IS NULL AND f.supersedes_occurrence_id IS NULL),1::bigint,'restoring the fee preserves a single original charge');
SELECT lives_ok($$SELECT pg_temp.apply_rent(425,'pilot-rent-change-1')$$,'edit rent after revising the linked fee');
SELECT lives_ok($$SELECT pg_temp.apply_rent(415,'pilot-rent-change-2')$$,'revise the same rent again');
SELECT lives_ok($$SELECT pg_temp.apply_fee(415,42,'pilot-fee-after-rent')$$,'edit the fee after a second rent edit');
SELECT is((SELECT sum(l.amount) FROM public.tenant_invoice_lines l JOIN issued_edit e ON e.invoice_id=l.invoice_id WHERE l.line_type='rent'),
  415::numeric,'the tenant owes exactly the final rent');
SELECT results_eq($$SELECT economic_class,sum(signed_amount),min(recognized_on),max(recognized_on)
  FROM issued_edit i JOIN public.tenant_invoices t ON i.invoice_id=t.id CROSS JOIN LATERAL
  public.get_report_profit_loss_events_page(i.org,t.property_id,'USD',i.month,(i.month+interval '1 month - 1 day')::date,NULL,NULL,NULL,100,true)
  GROUP BY economic_class ORDER BY economic_class$$,
  $$SELECT label,amount,month,month FROM issued_edit CROSS JOIN (VALUES('owner_expense'::text,42::numeric),('owner_income',415)) v(label,amount) ORDER BY label$$,
  'repeated edits retain the final fee and rent in the rental month');
SELECT is((SELECT count(*) FROM issued_edit i JOIN public.tenant_invoices t ON i.invoice_id=t.id CROSS JOIN LATERAL
  public.get_report_profit_loss_events_page(i.org,t.property_id,'USD',i.month,(i.month+interval '1 month - 1 day')::date,NULL,NULL,NULL,100,true) ev
  WHERE ev.description ILIKE '%staff only%'),0::bigint,'the owner-facing report scope excludes private reasons');
SAVEPOINT paid_charge;
CREATE TEMP TABLE payment_source AS SELECT public.create_financial_reconciliation_source(org,'PILOTRENT',
  'Synthetic rent account','bank','organization_pooled','USD',NULL,'****1001') AS id FROM issued_edit;
SELECT public.record_tenant_invoice_payment_with_account(i.org,i.invoice_id,415,current_date,link.account_id,'Synthetic receipt',
  jsonb_build_array(jsonb_build_object('lineId',line.id,'amount',415)),'pilot-test-paid-charge')
  FROM issued_edit i JOIN public.tenant_invoice_lines line ON line.invoice_id=i.invoice_id AND line.line_type='rent' AND line.reversal_of_id IS NULL
  JOIN public.finance_account_source_links link ON link.organization_id=i.org JOIN payment_source source ON source.id=link.source_id
  WHERE NOT EXISTS (SELECT 1 FROM public.tenant_invoice_lines r WHERE r.organization_id=i.org AND r.reversal_of_id=line.id);
SELECT public.allocate_owner_event(i.org,'tenant_rent_receipt',a.id,'pilot-test-owner-'||a.id::text)
  FROM issued_edit i JOIN public.tenant_invoice_payments p ON p.invoice_id=i.invoice_id
  JOIN public.tenant_invoice_payment_allocations a ON a.payment_id=p.id;
SELECT lives_ok($$SELECT pg_temp.apply_rent(425,'pilot-paid-rent-first')$$,'an authorized edit preserves the collected rent on a paid invoice');
SELECT lives_ok($$SELECT pg_temp.apply_rent(420,'pilot-paid-rent-second')$$,'a paid invoice can be revised again in the open period');
SELECT results_eq($$SELECT b.paid_through_ips,b.balance_due FROM issued_edit i JOIN public.tenant_invoice_balances b ON b.id=i.invoice_id$$,
  $$SELECT 415::numeric,5::numeric$$,'both edits retain the payment and leave only the outstanding difference');
ROLLBACK TO SAVEPOINT paid_charge;
SELECT public.set_financial_month_lock(org,month,true,'Synthetic month close') FROM issued_edit;
SELECT ok((pg_temp.fee_preview(415,41)->'blockers') @> '[{"code":"financial_month_locked"}]'::jsonb,'closing the rental month blocks another fee edit');
SELECT ok((SELECT public.preview_historical_rent_correction(org,invoice_id,405,extract(day FROM due_date)::integer)->'blockers' FROM issued_edit)
  @> '[{"code":"financial_month_locked"}]'::jsonb,'the rent edit is also blocked when the rental month closes');
RESET ROLE;
RESET SESSION AUTHORIZATION;
ROLLBACK TO SAVEPOINT late_invoice;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM rent_setting s CROSS JOIN LATERAL public.get_scoped_current_rent_statuses(s.org,ARRAY[s.lease_id]) r
  WHERE r.status='posted' AND r.invoice_id IS NOT NULL AND r.billing_period_start=date_trunc('month',now() AT TIME ZONE 'UTC')::date),
  1::bigint,'the unit shows the posted rent invoice for its billing month');
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,false,original_version) FROM rent_setting$$,
  '40001','rent_posting_setting_stale','returning to On does not make an old version current');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*) FROM public.activity_logs a JOIN rent_setting s ON a.organization_id=s.org AND a.actor_id=s.admin_id
  WHERE a.action='rent_auto_posting_changed'),2::bigint,'both actual transitions are attributed to the administrator');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET automatic_rent_enabled=false WHERE organization_id=(SELECT org FROM rent_setting)$$,
  '42501','automatic_rent_policy_restart_required','ordinary control updates cannot substitute for the signed-in settings action');

SAVEPOINT invoice_voided;
UPDATE public.tenant_invoices SET lifecycle='void',voided_at=now(),voided_by=(SELECT admin_id FROM rent_setting);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is((SELECT r.status FROM rent_setting s CROSS JOIN LATERAL public.get_scoped_current_rent_statuses(s.org,ARRAY[s.lease_id]) r),
  'voided','a voided rent invoice requires review and is never offered as an unbilled unit');
ROLLBACK TO SAVEPOINT invoice_voided;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is(public.set_pilot_rent_auto_posting(org,false,(public.get_financial_write_context(org)->>'automatic_rent_updated_at')::timestamptz),
  false,'the administrator can pause again after the scheduled run') FROM rent_setting;
SELECT is((SELECT count(*) FROM rent_setting s CROSS JOIN LATERAL public.get_scoped_current_rent_statuses(s.org,ARRAY[s.lease_id]) r
  WHERE r.status='posted'),1::bigint,'turning posting off keeps the existing unit charge');
RESET ROLE;
RESET SESSION AUTHORIZATION;

UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=(SELECT org FROM rent_setting);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.set_pilot_rent_auto_posting(org,false,manual_version) FROM rent_setting$$,
  '55000','financial_writes_frozen','the billing setting cannot change or reopen a frozen workspace');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT * FROM finish();
ROLLBACK;
