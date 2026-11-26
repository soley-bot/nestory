-- Runs in an empty local schema clone. Only the lease and membership in this fixture are used.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE rent_setting AS SELECT
  '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid AS org, gen_random_uuid() AS other_org,
  gen_random_uuid() AS admin_id, gen_random_uuid() AS finance_id, gen_random_uuid() AS foreign_admin_id,
  gen_random_uuid() AS property_id, gen_random_uuid() AS unit_id, gen_random_uuid() AS tenant_id,
  gen_random_uuid() AS lease_id, NULL::timestamptz AS original_version, NULL::timestamptz AS manual_version;
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
  450,'USD',1,'monthly','active','authoritative',now(),admin_id,admin_id,admin_id FROM rent_setting;
INSERT INTO public.lease_billing_terms(organization_id,lease_id,property_id,effective_from,effective_to,collection_route,
  management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
  billing_recipient_kind,billing_recipient_person_id,rent_calculation_timezone,short_month_due_day_rule,
  lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
  confirmed_at,confirmed_by,created_by,updated_by)
SELECT org,lease_id,property_id,(date_trunc('month',current_date)-interval '1 month')::date,current_date+interval '1 year',
  'through_ips','percentage',0,false,false,'individual',tenant_id,'UTC','last_calendar_day',
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
SELECT app_private.run_due_rent_generation(now());
SELECT app_private.run_due_rent_generation(now());
SELECT is((SELECT count(*) FROM public.tenant_invoices),1::bigint,'two ordinary scheduler runs post one eligible lease-month');
SELECT is((SELECT billing_period_start FROM public.tenant_invoices LIMIT 1),date_trunc('month',now() AT TIME ZONE 'UTC')::date,
  'the existing lease beginning last month receives only its current billing month');
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
