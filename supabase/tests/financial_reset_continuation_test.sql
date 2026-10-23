BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

CREATE TEMP TABLE boundary_state (
  billing_month date,
  business_date date,
  admin_id uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000001',
  organization_id uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000002',
  property_id uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000003',
  unit_id uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000004',
  tenant_id uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000005',
  company_id uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000006',
  start_actual_lease uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000010',
  end_actual_lease uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000011',
  start_override_lease uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000012',
  end_override_lease uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000013',
  conflict_write_lease uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000014',
  conflict_history_lease uuid NOT NULL DEFAULT 'fa231050-0000-0000-0000-000000000015'
) ON COMMIT DROP;

INSERT INTO boundary_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', admin_id,
  'authenticated', 'authenticated', 'reset-continuation@test.invalid',
  extensions.crypt('rent-boundary', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM boundary_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT organization_id, 'Rent boundary', 'reset-continuation-fixture', 'UTC'
FROM boundary_state;

UPDATE boundary_state SET business_date=app_private.rent_business_date(organization_id,statement_timestamp());
UPDATE boundary_state SET billing_month=date_trunc('month',business_date)::date;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM boundary_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, rental_structure, status
)
SELECT property_id, organization_id, 'Boundary Property', 'RBP',
  'apartment', 'multi_unit', 'active'
FROM boundary_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT unit_id, organization_id, property_id, 'B-1', 'vacant', 3100, 'USD'
FROM boundary_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT fixture.id, state.organization_id, fixture.name, fixture.kind
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'Boundary Tenant', 'individual'),
  (state.company_id, 'Boundary Company', 'company')
) AS fixture(id, name, kind);

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT state.organization_id, fixture.id, fixture.role
FROM boundary_state AS state
CROSS JOIN LATERAL (VALUES
  (state.tenant_id, 'tenant'),
  (state.company_id, 'owner')
) AS fixture(id, role);

INSERT INTO public.property_owners(
  organization_id, property_id, person_id, ownership_label,
  ownership_percent, is_primary, started_on, created_by, updated_by
)
SELECT organization_id, property_id, company_id, 'Primary owner',
  100, true, DATE '2025-01-01', admin_id, admin_id
FROM boundary_state;


INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
SELECT id,organization_id,property_id,label,'vacant',rent,'USD' FROM boundary_state
CROSS JOIN (VALUES('fa231050-0000-0000-0000-000000000008'::uuid,'B-2',400),('fa231050-0000-0000-0000-000000000009'::uuid,'B-3',0)) fixture(id,label,rent);
SET LOCAL session_replication_role = replica;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT start_actual_lease,organization_id,property_id,unit_id,tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231050-0000-0000-0000-000000000100',organization_id,start_actual_lease,1,
 (billing_month-interval '13 months')::date,(billing_month-interval '1 month')::date+2,
 600,'USD',1,'monthly','active','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,
 charge_management_fee_when_active,full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
 rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231050-0000-0000-0000-000000000101',organization_id,start_actual_lease,property_id,
 (billing_month-interval '13 months')::date,(billing_month-interval '1 month')::date+2,
 'through_ips','percentage',10,true,false,'individual',tenant_id,'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',
 now(),admin_id,admin_id,admin_id FROM boundary_state;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT id,organization_id,property_id,unit,tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231050-0000-0000-0000-000000000011'::uuid,'fa231050-0000-0000-0000-000000000008'::uuid),('fa231050-0000-0000-0000-000000000012'::uuid,'fa231050-0000-0000-0000-000000000009'::uuid)) fixture(id,unit);
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT id,organization_id,lease,1,(billing_month-interval '1 month')::date,(billing_month+interval '11 months')::date-1,rent,'USD',1,'monthly','active','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231050-0000-0000-0000-000000000102'::uuid,'fa231050-0000-0000-0000-000000000011'::uuid,400),('fa231050-0000-0000-0000-000000000104'::uuid,'fa231050-0000-0000-0000-000000000012'::uuid,0)) fixture(id,lease,rent);
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,
 charge_management_fee_when_active,full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
 rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT id,organization_id,lease,property_id,(billing_month-interval '1 month')::date,(billing_month+interval '11 months')::date-1,'through_ips','percentage',10,false,false,'individual',tenant_id,
 'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),admin_id,admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231050-0000-0000-0000-000000000103'::uuid,'fa231050-0000-0000-0000-000000000011'::uuid),('fa231050-0000-0000-0000-000000000105'::uuid,'fa231050-0000-0000-0000-000000000012'::uuid)) fixture(id,lease);
SET LOCAL session_replication_role = origin;
-- Only the legacy contract fixture above is seeded without side effects, as in
-- the existing continuation contract test. Every reset/zero/continuation action
-- below runs normal triggers, permissions, source revisions and constraints.
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa231050-0000-0000-0000-000000000007','authenticated','authenticated','reset-continuation-checker@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organization_members(organization_id,user_id,role)
SELECT organization_id,'fa231050-0000-0000-0000-000000000007','super_admin' FROM boundary_state;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT organization_id,1,'frozen',billing_month FROM boundary_state;
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object(
 'operation_id','fa231050-0000-0000-0000-000000000200','organization_id',organization_id,'operation_kind','reset','restore_of',NULL,
 'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_sha256',app_private.financial_reset_hash('[]'),'action_sha256',app_private.financial_reset_hash('[]'),
 'archive_count',0,'action_count',0,'audit_timestamp',now(),'audit_actor',admin_id)) FROM boundary_state;
WITH plan AS(SELECT jsonb_build_object('operation_id','fa231050-0000-0000-0000-000000000200',
 'organization_id',organization_id,'manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
 'maker_actor_id',admin_id,'reviewer_actor_id','fa231050-0000-0000-0000-000000000007','effective_date',billing_month,'currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_known_zero_scope('fa231050-0000-0000-0000-000000000200')) AS value FROM boundary_state)
SELECT app_private.prepare_financial_reset_zero_plan('fa231050-0000-0000-0000-000000000200',value,app_private.financial_reset_hash(value)) FROM plan;
SELECT set_config('request.jwt.claim.sub',(SELECT admin_id::text FROM boundary_state),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT admin_id FROM boundary_state),'role','authenticated')::text,true);
SELECT set_config('reset_test.zero_review_sha',(SELECT review_sha256 FROM app_private.financial_reset_zero_plans WHERE operation_id='fa231050-0000-0000-0000-000000000200'),true);
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231050-0000-0000-0000-000000000200',current_setting('reset_test.zero_review_sha'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','fa231050-0000-0000-0000-000000000007',true);
SELECT set_config('request.jwt.claims','{"sub":"fa231050-0000-0000-0000-000000000007","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231050-0000-0000-0000-000000000200',current_setting('reset_test.zero_review_sha'));
RESET ROLE;
SELECT app_private.seal_financial_reset_operation('fa231050-0000-0000-0000-000000000200');
SELECT app_private.start_financial_reset_actions('fa231050-0000-0000-0000-000000000200');
SELECT app_private.complete_financial_reset_actions('fa231050-0000-0000-0000-000000000200');
SELECT app_private.apply_financial_reset_known_zero('fa231050-0000-0000-0000-000000000200');
SELECT set_config('request.jwt.claim.sub',(SELECT admin_id::text FROM boundary_state),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT admin_id FROM boundary_state),'sentinel','original')::text,true);
SELECT set_config('request.headers','{"sentinel":"original","x-nestory-financial-generation":"0"}',true);
CREATE TEMP TABLE continuation_plan AS SELECT jsonb_build_object('version',1,'actor_id',admin_id,
 'billing_period_start',billing_month,'issue_date',business_date,
 'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(organization_id)),
 'leases',jsonb_build_array(jsonb_build_object('lease_id',start_actual_lease,'term_id','fa231050-0000-0000-0000-000000000100',
 'billing_rule_id','fa231050-0000-0000-0000-000000000101','continue_month_to_month',true,
 'rent_amount',600,'management_fee_amount',60,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',app_private.rent_business_date(organization_id,statement_timestamp())),
 jsonb_build_object('lease_id','fa231050-0000-0000-0000-000000000011','term_id','fa231050-0000-0000-0000-000000000102',
 'billing_rule_id','fa231050-0000-0000-0000-000000000103','continue_month_to_month',false,
 'rent_amount',400,'management_fee_amount',0,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',app_private.rent_business_date(organization_id,statement_timestamp())),
 jsonb_build_object('lease_id','fa231050-0000-0000-0000-000000000012','term_id','fa231050-0000-0000-0000-000000000104',
 'billing_rule_id','fa231050-0000-0000-0000-000000000105','continue_month_to_month',false,
 'rent_amount',0,'management_fee_amount',0,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',app_private.rent_business_date(organization_id,statement_timestamp())))) AS value FROM boundary_state;
CREATE FUNCTION pg_temp.prepare_continuation(p_plan jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_continuation('fa231050-0000-0000-0000-000000000200',p_plan,app_private.financial_reset_hash(p_plan));
$$;
SELECT ok(NOT has_function_privilege('authenticated','app_private.apply_financial_reset_continuation(uuid)','EXECUTE')
 AND NOT has_function_privilege('service_role','app_private.prepare_financial_reset_continuation(uuid,jsonb,text)','EXECUTE'),
 'continuation phase is private to the operator');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT value||'{"sql":"select 1"}'::jsonb FROM continuation_plan))$$,
 '23514','financial_reset_continuation_plan_invalid','review plan rejects unrecognized callback or SQL fields');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT value||jsonb_build_object('issue_date',business_date-1) FROM continuation_plan CROSS JOIN boundary_state))$$,
 '40001','financial_reset_continuation_business_date_changed','backdated issue date fails before recording or opening the phase');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT value||jsonb_build_object('billing_period_start',(billing_month-interval '1 month')::date) FROM continuation_plan CROSS JOIN boundary_state))$$,
 '23514','financial_reset_continuation_current_cutoff_month_required','noncurrent billing period cannot trigger an unintended current-month catch-up');
SELECT is((SELECT count(*) FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231050-0000-0000-0000-000000000200'),0::bigint,'rejected dates leave no prepared phase');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT jsonb_set(value,'{leases,0,currency}','"KHR"') FROM continuation_plan))$$,
 '23514','financial_reset_continuation_lease_invalid','unsupported currency cannot widen reviewed normal billing');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT jsonb_set(value,'{leases,0,recipient_person_id}','null') FROM continuation_plan))$$,
 '23514','financial_reset_continuation_lease_invalid','null required authority fails closed');
SAVEPOINT stale_source;
SELECT pg_temp.prepare_continuation((SELECT value||jsonb_build_object('source_sha256',repeat('e',64)) FROM continuation_plan));
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-0000-0000-000000000200')$$,
 '40001','financial_reset_continuation_source_changed','changed full source snapshot rejects execution');
ROLLBACK TO SAVEPOINT stale_source;
SAVEPOINT wrong_semantic_result;
SELECT pg_temp.prepare_continuation((SELECT jsonb_set(value,'{leases,0,rent_amount}','601') FROM continuation_plan));
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-0000-0000-000000000200')$$,
 '23514','financial_reset_continuation_invoice_mismatch','checked generation must equal the reviewed rent amount');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization_id FROM boundary_state)),'frozen','failed semantic check rolls back temporary open');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT organization_id FROM boundary_state)),0::bigint,'failed semantic check rolls back catch-up invoice and projections');
SELECT is((SELECT count(*) FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)),1::bigint,'failed phase rolls back contractual continuation too');
SELECT is(current_setting('request.headers'),'{"sentinel":"original","x-nestory-financial-generation":"0"}','failed phase restores the original request context');
ROLLBACK TO SAVEPOINT wrong_semantic_result;
SELECT pg_temp.prepare_continuation((SELECT value FROM continuation_plan));
SELECT set_config('request.jwt.claim.sub','fa231050-0000-0000-0000-000000000007',true);
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-0000-0000-000000000200')$$,
 '42501','financial_reset_continuation_actor_required','even another super admin cannot impersonate the reviewed actor');
SELECT set_config('request.jwt.claim.sub',(SELECT admin_id::text FROM boundary_state),true);
SAVEPOINT unexpected_side_effect;
CREATE FUNCTION pg_temp.unplanned_billing_effect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE public.properties SET name='Unexpected billing mutation' WHERE id=NEW.property_id; RETURN NEW; END;
$$;
CREATE TRIGGER test_unplanned_billing_effect AFTER INSERT ON public.tenant_invoices FOR EACH ROW EXECUTE FUNCTION pg_temp.unplanned_billing_effect();
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-0000-0000-000000000200')$$,
 '23514','financial_reset_continuation_unplanned_relation: public.properties','an unexpected nested business effect aborts the closed write set');
ROLLBACK TO SAVEPOINT unexpected_side_effect;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-0000-0000-000000000200')$$,
 'unchanged checked continuation and billing execute while other sessions remain frozen');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization_id FROM boundary_state)),'frozen','successful phase refreezes before return');
SELECT is((SELECT generation FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization_id FROM boundary_state)),1,'building current authority never advances the reserved generation');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT organization_id FROM boundary_state) AND lifecycle='issued' AND total_amount=600 AND management_fee_amount=60),1::bigint,'exactly one reviewed current-month invoice and fee exist');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE lease_id='fa231050-0000-0000-0000-000000000011' AND total_amount=400 AND management_fee_amount=0),1::bigint,'lease without continuation is billed once and preserves its disabled fee flag');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE lease_id='fa231050-0000-0000-0000-000000000012'),0::bigint,'reviewed zero-rent lease remains explicit without a fabricated positive invoice');
SELECT is((SELECT count(*) FROM public.lease_terms WHERE lease_id IN ('fa231050-0000-0000-0000-000000000011','fa231050-0000-0000-0000-000000000012')),2::bigint,'uncontinued contracts are not recreated or mutated');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT organization_id FROM boundary_state) AND billing_period_start<(SELECT billing_month FROM boundary_state)),0::bigint,'prior-month continuity does not resurrect pre-cutoff billing');
SELECT is((SELECT start_date FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND term_sequence=2),(SELECT (billing_month-interval '1 month')::date+3 FROM boundary_state),'continuation keeps the real prior-month contractual start');
SELECT is((SELECT end_date::text FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND term_sequence=2),'infinity','continuation has no fabricated fixed end');
SELECT is(current_setting('request.headers'),'{"sentinel":"original","x-nestory-financial-generation":"0"}','success restores exact original header bytes');
SELECT is(app_private.apply_financial_reset_continuation('fa231050-0000-0000-0000-000000000200'),
 (SELECT result_json FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231050-0000-0000-0000-000000000200'),'unknown-commit retry returns immutable result without duplicate billing');
SELECT ok((SELECT before_images IS NOT NULL AND after_images IS NOT NULL AND result_json->>'after_sha256'=app_private.financial_reset_hash(after_images)
 FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231050-0000-0000-0000-000000000200'),'complete persisted write set is sealed with its actual resulting full images');
SAVEPOINT commit_must_stay_frozen;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT organization_id FROM boundary_state);
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_phase_must_commit_frozen','a caller cannot commit an open control after phase completion');
ROLLBACK TO SAVEPOINT commit_must_stay_frozen;
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'ordinary deferred constraints and final frozen-state fence all pass');
SELECT * FROM finish();
ROLLBACK;
