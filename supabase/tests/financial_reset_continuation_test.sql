BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

-- SQL-only gateway simulation with real synthetic Auth session rows. This is
-- fixture setup, not evidence of a real Auth login or HTTP/PostgREST ingress.
CREATE FUNCTION pg_temp.reset_fixture_claims(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'session_id',md5(p_actor::text||':reset-fixture')::uuid,
  'role','authenticated','aud','authenticated','is_anonymous',false,
  'exp',extract(epoch FROM clock_timestamp()+interval '1 hour')::bigint)::text,true);
END;
$$;
CREATE FUNCTION pg_temp.reset_fixture_binding(p_operation uuid,p_semantic jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('version',1,'operation_id',o.operation_id,'project_ref','syntheticprojectrefa','organization_id',o.organization_id,
  'packet_sha256',repeat('1',64),'main_sha',repeat('a',40),'sources_sha256',repeat('2',64),'schema_sha256',o.schema_sha256,
  'ledger_sha256',repeat('3',64),'source_snapshot_sha256',repeat('4',64),'source_generation',o.source_generation,'target_generation',o.target_generation,
  'cutoff','2026-10-01','issue_date','2026-10-01','timezone',g.operational_timezone,
  'execution_business_date',app_private.rent_business_date(o.organization_id,statement_timestamp()),'invoice_date_policy','original-reviewed-october',
  'manifest_sha256',o.manifest_sha256,'plan_sha256',o.plan_sha256,'archive_sha256',o.archive_sha256,'action_sha256',o.action_sha256,
  'archive_artifact_sha256',repeat('5',64),'archive_count',o.archive_count,'action_count',o.action_count,'zero_review_sha256',z.review_sha256,
  'continuation_semantic_sha256',app_private.financial_reset_hash(p_semantic),'report_review_sha256',repeat('6',64),'continuation_semantic',p_semantic)
 FROM app_private.financial_reset_operations o JOIN app_private.financial_reset_zero_plans z USING(operation_id)
 JOIN public.organizations g ON g.id=o.organization_id WHERE o.operation_id=p_operation
$$;
CREATE TEMP TABLE reset_operator_fixture(binding jsonb,authorization_id uuid);
GRANT SELECT,UPDATE ON reset_operator_fixture TO authenticated;

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

INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT md5(admin_id::text||':reset-fixture')::uuid,admin_id,now(),now(),'aal1' FROM boundary_state;
SELECT pg_temp.reset_fixture_claims(admin_id) FROM boundary_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT organization_id, 'Rent boundary', 'reset-continuation-fixture', 'UTC'
FROM boundary_state;

UPDATE boundary_state SET business_date=app_private.rent_business_date(organization_id,statement_timestamp());
UPDATE boundary_state SET billing_month=DATE '2026-10-01';

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
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT start_actual_lease,organization_id,property_id,unit_id,tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231050-0000-0000-0000-000000000100',organization_id,start_actual_lease,1,
 (billing_month-interval '13 months')::date,(billing_month-interval '1 month')::date+2,
 600,'USD',7,'monthly','draft','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state;
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
SELECT id,organization_id,lease,1,(billing_month-interval '1 month')::date,(billing_month+interval '11 months')::date-1,rent,'USD',7,'monthly','draft','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231050-0000-0000-0000-000000000102'::uuid,'fa231050-0000-0000-0000-000000000011'::uuid,400),('fa231050-0000-0000-0000-000000000104'::uuid,'fa231050-0000-0000-0000-000000000012'::uuid,0)) fixture(id,lease,rent);
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,
 charge_management_fee_when_active,full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
 rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT id,organization_id,lease,property_id,(billing_month-interval '1 month')::date,(billing_month+interval '11 months')::date-1,'through_ips','percentage',10,false,false,'individual',tenant_id,
 'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),admin_id,admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231050-0000-0000-0000-000000000103'::uuid,'fa231050-0000-0000-0000-000000000011'::uuid),('fa231050-0000-0000-0000-000000000105'::uuid,'fa231050-0000-0000-0000-000000000012'::uuid)) fixture(id,lease);
-- Ordinary renewal semantics remain covered outside the bounded hosted reset.
SAVEPOINT ordinary_month_to_month;
UPDATE public.lease_terms SET status='active' WHERE id='fa231050-0000-0000-0000-000000000100';
SELECT lives_ok($$SELECT public.continue_lease_month_to_month(organization_id,start_actual_lease,'fa231050-0000-0000-0000-000000000100','fa231050-0000-0000-0000-000000000101',
 600,'percentage',10,'ordinary-reset-renewal-probe') FROM boundary_state$$,
 'ordinary checked continuation still creates a real month-to-month contract');
SELECT is((SELECT start_date FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND term_sequence=2),
 (SELECT (billing_month-interval '1 month')::date+3 FROM boundary_state),'ordinary continuation keeps the real prior-month contractual start');
SELECT is((SELECT end_date::text FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state) AND term_sequence=2),
 'infinity','ordinary continuation has no fabricated fixed end');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)
 AND total_amount=600 AND management_fee_amount=60),1::bigint,'ordinary renewal generates the reviewed rent and fee');
SELECT ok((SELECT bool_and(issue_date=business_date AND due_date=greatest(billing_month+6,business_date))
 FROM public.tenant_invoices CROSS JOIN boundary_state WHERE lease_id=start_actual_lease),
 'ordinary renewal retains actual execution dates and the due-date floor');
ROLLBACK TO SAVEPOINT ordinary_month_to_month;
-- The hosted fixture uses an existing contract covering October; it never asks
-- the reset to renew the expired alternative tested above.
UPDATE public.lease_terms SET end_date='2027-08-31' WHERE id='fa231050-0000-0000-0000-000000000100';
UPDATE public.lease_billing_terms SET effective_to='2027-08-31' WHERE id='fa231050-0000-0000-0000-000000000101';

-- Generate original source invoices through the real command before queued
-- AFTER term-activation catch-up observes them; audit timestamps remain current.
CREATE TEMP TABLE boundary_original_sources AS
WITH generated AS (
 UPDATE public.lease_terms t SET status='active' FROM boundary_state s
 WHERE t.organization_id=s.organization_id AND t.id IN ('fa231050-0000-0000-0000-000000000100','fa231050-0000-0000-0000-000000000102')
 RETURNING t.lease_id,t.id AS term_id,app_private.generate_simple_lease_rent_invoice(s.organization_id,t.lease_id,
  s.billing_month,s.billing_month,'activation_catch_up',s.admin_id,
  (SELECT b.id FROM public.lease_billing_terms b WHERE b.organization_id=t.organization_id AND b.lease_id=t.lease_id)) AS invoice_id
) SELECT * FROM generated;
UPDATE public.lease_terms SET status='active' WHERE organization_id=(SELECT organization_id FROM boundary_state) AND status='draft';
SELECT ok((SELECT bool_and(i.issue_date=DATE '2026-10-01' AND i.due_date=DATE '2026-10-07')
 FROM boundary_original_sources s JOIN public.tenant_invoices i ON i.id=s.invoice_id),'normal-trigger source invoices retain reviewed October dates');

-- All historical fixture setup and checked phases use normal triggers. Actual
-- automatically generated financial sources are archived in dependency order.
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa231050-0000-0000-0000-000000000007','authenticated','authenticated','reset-continuation-checker@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organization_members(organization_id,user_id,role)
SELECT organization_id,'fa231050-0000-0000-0000-000000000007','super_admin' FROM boundary_state;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT md5(id::text||':reset-fixture')::uuid,id,now(),now(),'aal1'
FROM auth.users WHERE id::text LIKE 'fa231050-%' AND id<>('fa231050-0000-0000-0000-000000000001')::uuid;
INSERT INTO public.person_contacts(id,organization_id,person_id,contact_name)
SELECT 'fa231050-0000-0000-0000-000000000301',organization_id,tenant_id,'Preserved contact' FROM boundary_state;
INSERT INTO public.organizations(id,name,slug) VALUES('fa231050-0000-0000-0000-000000000302','Contact fence foreign organization','reset-report-foreign-contact');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('fa231050-0000-0000-0000-000000000303','fa231050-0000-0000-0000-000000000302','Foreign contact person');
INSERT INTO public.person_contacts(id,organization_id,person_id,contact_name)
VALUES('fa231050-0000-0000-0000-000000000304','fa231050-0000-0000-0000-000000000302','fa231050-0000-0000-0000-000000000303','Foreign contact');
-- CHECKPOINT_CONCURRENCY_FIXTURE_READY: only synthetic fixture rows precede this boundary.
CREATE TEMP TABLE boundary_archive AS
SELECT relation_name,image,app_private.financial_reset_primary_key(relation_name::regclass,image) AS pk,
 app_private.financial_reset_hash(image) AS hash,row_number() OVER(ORDER BY priority,image->>'id')::integer AS ordinal
FROM (
 SELECT 'public.owner_invoice_lines'::text AS relation_name,to_jsonb(t) AS image,1 AS priority
 FROM public.owner_invoice_lines t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
 UNION ALL SELECT 'public.owner_invoices',to_jsonb(t),2
 FROM public.owner_invoices t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
 UNION ALL SELECT 'public.management_fee_occurrences',to_jsonb(t),3
 FROM public.management_fee_occurrences t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
 UNION ALL SELECT 'public.tenant_invoice_rent_segments',to_jsonb(t),4
 FROM public.tenant_invoice_rent_segments t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
 UNION ALL SELECT 'public.tenant_invoice_lines',to_jsonb(t),5
 FROM public.tenant_invoice_lines t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
 UNION ALL SELECT 'public.rent_generation_exceptions',to_jsonb(t),6
 FROM public.rent_generation_exceptions t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
 UNION ALL SELECT 'public.tenant_invoices',to_jsonb(t),7
 FROM public.tenant_invoices t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
 UNION ALL SELECT 'public.finance_income_items',to_jsonb(t),8
 FROM public.finance_income_items t CROSS JOIN boundary_state s WHERE t.organization_id=s.organization_id
) fixture_rows;
CREATE TEMP TABLE boundary_actions AS SELECT jsonb_agg(jsonb_build_object('action_id',md5('fa231050-0000-4000-8000-000000000200:'||ordinal)::uuid,
 'ordinal',ordinal,'relation_name',relation_name,'primary_key',pk,'kind','archive-delete','before_row_text',image::text,'before_sha256',hash,
 'after_row_text',NULL,'after_sha256',NULL) ORDER BY ordinal) AS value FROM boundary_archive;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT organization_id,1,'frozen',billing_month FROM boundary_state;
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object(
 'operation_id','fa231050-0000-4000-8000-000000000200','organization_id',organization_id,'operation_kind','reset','restore_of',NULL,
 'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,'row_sha256',hash)
  ORDER BY relation_name,pk::text)) FROM boundary_archive),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
  FROM boundary_actions CROSS JOIN LATERAL jsonb_array_elements(value) a),
 'archive_count',(SELECT count(*) FROM boundary_archive),'action_count',(SELECT count(*) FROM boundary_archive),'audit_timestamp',now(),'audit_actor',admin_id)) FROM boundary_state;
SELECT app_private.archive_financial_reset_rows('fa231050-0000-4000-8000-000000000200',(SELECT jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,
 'row_text',image::text,'row_sha256',hash) ORDER BY ordinal) FROM boundary_archive));
SELECT app_private.prepare_financial_reset_actions('fa231050-0000-4000-8000-000000000200',value) FROM boundary_actions;
WITH plan AS(SELECT jsonb_build_object('operation_id','fa231050-0000-4000-8000-000000000200',
 'organization_id',organization_id,'manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
 'maker_actor_id',admin_id,'reviewer_actor_id','fa231050-0000-0000-0000-000000000007','effective_date',billing_month,'currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_known_zero_scope('fa231050-0000-4000-8000-000000000200')) AS value FROM boundary_state)
SELECT app_private.prepare_financial_reset_zero_plan('fa231050-0000-4000-8000-000000000200',value,app_private.financial_reset_hash(value)) FROM plan;
SELECT pg_temp.reset_fixture_claims(admin_id) FROM boundary_state;
SELECT set_config('reset_test.zero_review_sha',(SELECT review_sha256 FROM app_private.financial_reset_zero_plans WHERE operation_id='fa231050-0000-4000-8000-000000000200'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231050-0000-4000-8000-000000000200',current_setting('reset_test.zero_review_sha'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.reset_fixture_claims('fa231050-0000-0000-0000-000000000007');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231050-0000-4000-8000-000000000200',current_setting('reset_test.zero_review_sha'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.seal_financial_reset_operation('fa231050-0000-4000-8000-000000000200');
SELECT app_private.start_financial_reset_actions('fa231050-0000-4000-8000-000000000200');
-- The exact-action invoker guards require the native executor's existing role.
SET LOCAL ROLE postgres;
DO $$ DECLARE a record; BEGIN
 FOR a IN SELECT * FROM app_private.financial_reset_actions
  WHERE operation_id='fa231050-0000-4000-8000-000000000200' ORDER BY ordinal LOOP
  PERFORM app_private.arm_financial_reset_action(a.operation_id,a.action_id);
  EXECUTE format('DELETE FROM %s WHERE id=$1',a.relation_oid::regclass) USING (a.primary_key->>'id')::uuid;
 END LOOP;
END $$;
RESET ROLE;
SELECT app_private.complete_financial_reset_actions('fa231050-0000-4000-8000-000000000200');
CREATE TEMP TABLE continuation_plan AS SELECT jsonb_build_object('version',3,'actor_id',admin_id,
 'billing_period_start',billing_month,'issue_date',billing_month,'execution_business_date',business_date,
 'invoice_date_policy','original-reviewed-october','original_invoice_sources',(SELECT jsonb_agg(jsonb_build_object('lease_id',image->'lease_id',
 'invoice_id',image->'id','row_sha256',hash) ORDER BY ordinal) FROM boundary_archive WHERE relation_name='public.tenant_invoices'),
 'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(organization_id)),
 'leases',jsonb_build_array(jsonb_build_object('lease_id',start_actual_lease,'term_id','fa231050-0000-0000-0000-000000000100',
 'billing_rule_id','fa231050-0000-0000-0000-000000000101','continue_month_to_month',false,'disposition','bill',
 'rent_amount',600,'management_fee_amount',60,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',billing_month+6),
 jsonb_build_object('lease_id','fa231050-0000-0000-0000-000000000011','term_id','fa231050-0000-0000-0000-000000000102',
 'billing_rule_id','fa231050-0000-0000-0000-000000000103','continue_month_to_month',false,'disposition','bill',
 'rent_amount',400,'management_fee_amount',0,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',billing_month+6),
 jsonb_build_object('lease_id','fa231050-0000-0000-0000-000000000012','term_id','fa231050-0000-0000-0000-000000000104',
 'billing_rule_id','fa231050-0000-0000-0000-000000000105','continue_month_to_month',false,'disposition','bill',
 'rent_amount',0,'management_fee_amount',0,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',billing_month+6))) AS value FROM boundary_state;
INSERT INTO reset_operator_fixture(binding)
SELECT pg_temp.reset_fixture_binding('fa231050-0000-4000-8000-000000000200',value-'source_sha256') FROM continuation_plan;
SELECT pg_temp.reset_fixture_claims(admin_id) FROM boundary_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE reset_operator_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM reset_operator_fixture;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT app_private.apply_financial_reset_known_zero('fa231050-0000-4000-8000-000000000200');
UPDATE continuation_plan SET value=jsonb_set(value,'{source_sha256}',to_jsonb(app_private.financial_reset_hash(
 app_private.financial_reset_continuation_snapshot((SELECT organization_id FROM boundary_state)))));
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"sentinel":"original"}',true);
SELECT set_config('request.headers','{"sentinel":"original","x-nestory-financial-generation":"0"}',true);
CREATE FUNCTION pg_temp.prepare_continuation(p_plan jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_continuation('fa231050-0000-4000-8000-000000000200',p_plan,app_private.financial_reset_hash(p_plan));
$$;
SAVEPOINT unsupported_hosted_legacy;
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((value-ARRAY['execution_business_date','invoice_date_policy','original_invoice_sources'])||
 jsonb_build_object('version',2,'issue_date',(SELECT business_date FROM boundary_state),'leases',
  (SELECT jsonb_agg(CASE WHEN entry->>'disposition'='bill' THEN entry||jsonb_build_object('due_date',
   greatest(DATE '2026-10-07',(SELECT business_date FROM boundary_state))) ELSE entry END ORDER BY ordinal)
   FROM jsonb_array_elements(value->'leases') WITH ORDINALITY entries(entry,ordinal)))) FROM continuation_plan$$,
 '42501','financial_reset_scoped_phase_binding_invalid','hosted preparation cannot replace consumed original-date review with execution-date semantics');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-4000-8000-000000000200')$$,
 '42501','financial_reset_scoped_phase_binding_invalid','consumed original-date review refuses hosted execution-date continuation');
ROLLBACK TO SAVEPOINT unsupported_hosted_legacy;
SELECT throws_ok($$SELECT pg_temp.prepare_continuation(jsonb_set(value,'{leases,0,continue_month_to_month}','true')) FROM continuation_plan$$,
 '23514','financial_reset_continuation_disposition_invalid','a renewal flag cannot disagree with the reviewed bill disposition');
SELECT ok(NOT has_function_privilege('authenticated','app_private.apply_financial_reset_continuation(uuid)','EXECUTE')
 AND NOT has_function_privilege('service_role','app_private.prepare_financial_reset_continuation(uuid,jsonb,text)','EXECUTE'),
 'continuation phase is private to the operator');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT value||'{"sql":"select 1"}'::jsonb FROM continuation_plan))$$,
 '23514','financial_reset_continuation_plan_invalid','review plan rejects unrecognized callback or SQL fields');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT value||jsonb_build_object('execution_business_date',business_date-1) FROM continuation_plan CROSS JOIN boundary_state))$$,
 '40001','financial_reset_continuation_business_date_changed','backdated issue date fails before recording or opening the phase');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT value||jsonb_build_object('billing_period_start',(billing_month-interval '1 month')::date) FROM continuation_plan CROSS JOIN boundary_state))$$,
 '23514','financial_reset_continuation_current_cutoff_month_required','noncurrent billing period cannot trigger an unintended current-month catch-up');
SELECT is((SELECT count(*) FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231050-0000-4000-8000-000000000200'),0::bigint,'rejected dates leave no prepared phase');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT jsonb_set(value,'{leases,0,currency}','"KHR"') FROM continuation_plan))$$,
 '23514','financial_reset_continuation_lease_invalid','unsupported currency cannot widen reviewed normal billing');
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT jsonb_set(value,'{leases,0,recipient_person_id}','null') FROM continuation_plan))$$,
 '23514','financial_reset_continuation_lease_invalid','null required authority fails closed');
SAVEPOINT stale_source;
SELECT pg_temp.prepare_continuation((SELECT value||jsonb_build_object('source_sha256',repeat('e',64)) FROM continuation_plan));
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-4000-8000-000000000200')$$,
 '40001','financial_reset_continuation_source_changed','changed full source snapshot rejects execution');
ROLLBACK TO SAVEPOINT stale_source;
SAVEPOINT wrong_semantic_result;
SELECT throws_ok($$SELECT pg_temp.prepare_continuation((SELECT jsonb_set(value,'{leases,0,rent_amount}','601') FROM continuation_plan))$$,
 '42501','financial_reset_scoped_phase_binding_invalid','hosted preparation cannot replace the consumed reviewed rent amount');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-4000-8000-000000000200')$$,
 '42501','financial_reset_scoped_phase_binding_invalid','consumed review rejects a changed rent amount before generation');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization_id FROM boundary_state)),'frozen','failed semantic check rolls back temporary open');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT organization_id FROM boundary_state)),0::bigint,'failed semantic check rolls back catch-up invoice and projections');
SELECT is((SELECT count(*) FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)),1::bigint,'failed phase rolls back contractual continuation too');
SELECT is(current_setting('request.headers'),'{"sentinel":"original","x-nestory-financial-generation":"0"}','failed phase restores the original request context');
ROLLBACK TO SAVEPOINT wrong_semantic_result;
SELECT pg_temp.prepare_continuation((SELECT value FROM continuation_plan));
SELECT set_config('request.jwt.claim.sub','fa231050-0000-0000-0000-000000000007',true);
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-4000-8000-000000000200')$$,
 '42501','financial_reset_claim_free_operator_required','even another super admin request identity cannot replace the consumed operator');
SELECT set_config('request.jwt.claim.sub','',true);
SAVEPOINT unexpected_side_effect;
CREATE FUNCTION pg_temp.unplanned_billing_effect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE public.properties SET name='Unexpected billing mutation' WHERE id=NEW.property_id; RETURN NEW; END;
$$;
CREATE TRIGGER test_unplanned_billing_effect AFTER INSERT ON public.tenant_invoices FOR EACH ROW EXECUTE FUNCTION pg_temp.unplanned_billing_effect();
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-4000-8000-000000000200')$$,
 '23514','financial_reset_continuation_unplanned_relation: public.properties','an unexpected nested business effect aborts the closed write set');
ROLLBACK TO SAVEPOINT unexpected_side_effect;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_continuation('fa231050-0000-4000-8000-000000000200')$$,
 'unchanged checked continuation and billing execute while other sessions remain frozen');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization_id FROM boundary_state)),'frozen','successful phase refreezes before return');
SELECT is((SELECT generation FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization_id FROM boundary_state)),1,'building current authority never advances the reserved generation');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT organization_id FROM boundary_state) AND lifecycle='issued' AND total_amount=600 AND management_fee_amount=60),1::bigint,'exactly one reviewed current-month invoice and fee exist');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE lease_id='fa231050-0000-0000-0000-000000000011' AND total_amount=400 AND management_fee_amount=0),1::bigint,'lease without continuation is billed once and preserves its disabled fee flag');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE lease_id='fa231050-0000-0000-0000-000000000012'),0::bigint,'reviewed zero-rent lease remains explicit without a fabricated positive invoice');
SELECT is((SELECT count(*) FROM public.lease_terms WHERE lease_id IN ('fa231050-0000-0000-0000-000000000011','fa231050-0000-0000-0000-000000000012')),2::bigint,'uncontinued contracts are not recreated or mutated');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT organization_id FROM boundary_state) AND billing_period_start<(SELECT billing_month FROM boundary_state)),0::bigint,'prior-month continuity does not resurrect pre-cutoff billing');
SELECT is((SELECT count(*) FROM public.lease_terms WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)),1::bigint,
 'hosted original-date billing does not synthesize the separately tested renewal');
SELECT is(current_setting('request.headers'),'{"sentinel":"original","x-nestory-financial-generation":"0"}','success restores exact original header bytes');
SELECT is(app_private.apply_financial_reset_continuation('fa231050-0000-4000-8000-000000000200'),
 (SELECT result_json FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231050-0000-4000-8000-000000000200'),'unknown-commit retry returns immutable result without duplicate billing');
SELECT ok((SELECT before_images IS NOT NULL AND after_images IS NOT NULL AND result_json->>'after_sha256'=app_private.financial_reset_hash(after_images)
 FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231050-0000-4000-8000-000000000200'),'complete persisted write set is sealed with its actual resulting full images');
SELECT throws_ok($$SET CONSTRAINTS app_private.financial_reset_checkpoint_operation_commit IMMEDIATE$$,'23514','financial_reset_checkpoint_must_commit',
 'completed continuation cannot commit without its real report checkpoint');
-- Before the checkpoint, the existing execution transaction may temporarily
-- open for checked phases, but every later control write must still re-freeze.
SAVEPOINT commit_must_stay_frozen;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT organization_id FROM boundary_state);
SELECT throws_ok($$SET CONSTRAINTS app_private.financial_reset_control_commit_frozen IMMEDIATE$$,
 '23514','financial_reset_phase_must_commit_frozen','a temporary checked-phase opening cannot commit before refreezing');
ROLLBACK TO SAVEPOINT commit_must_stay_frozen;
SELECT lives_ok($$SELECT app_private.apply_financial_reset_reports('fa231050-0000-4000-8000-000000000200')$$,
 'ordinary allocation and owner period generation persist in the frozen reset transaction');
SELECT ok(EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id='fa231050-0000-4000-8000-000000000200'
 AND checkpoint_kind='checked-reports' AND result_json->>'reports_persisted'='true' AND after_images=app_private.financial_reset_continuation_snapshot(organization_id)),
 'durable report checkpoint binds exact current full organization images');
SELECT ok(EXISTS(SELECT 1 FROM public.owner_balance_periods WHERE organization_id=(SELECT organization_id FROM boundary_state) AND status='ready'),
 'owner periods exist as real stored authority rather than a rolled-back probe');
SELECT is(app_private.apply_financial_reset_reports('fa231050-0000-4000-8000-000000000200'),
 (SELECT result_json FROM app_private.financial_reset_verification_checkpoints WHERE operation_id='fa231050-0000-4000-8000-000000000200'),
 'same report finalization returns its immutable checkpoint without allocating twice');
SELECT ok(EXISTS(SELECT 1 FROM jsonb_array_elements(app_private.financial_reset_recovery_candidates('fa231050-0000-4000-8000-000000000200')) s
 WHERE s->>'provenance'='reports' AND s->>'relation_name'='public.owner_balance_periods'),
 'recovery derives the newly persisted report periods from immutable phase images');
-- CHECKPOINT_CONCURRENCY_REPORT_READY: real reset, ordinary reports and checkpoint are complete.
SAVEPOINT checkpoint_early_flush;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok($$UPDATE public.person_contacts SET contact_name='Changed after flush' WHERE id='fa231050-0000-0000-0000-000000000301'$$,
 '23514','financial_reset_checkpoint_transaction_sealed','flushing all deferred checks cannot permit a later unfenced master change');
SELECT throws_ok($$UPDATE public.person_contacts SET organization_id='fa231050-0000-0000-0000-000000000302',person_id='fa231050-0000-0000-0000-000000000303'
 WHERE id='fa231050-0000-0000-0000-000000000301'$$,
 '23514','financial_reset_checkpoint_transaction_sealed','moving a row out of the sealed organization checks the old scope');
SELECT throws_ok($$UPDATE public.person_contacts SET organization_id=(SELECT organization_id FROM boundary_state),person_id=(SELECT tenant_id FROM boundary_state)
 WHERE id='fa231050-0000-0000-0000-000000000304'$$,
 '23514','financial_reset_checkpoint_transaction_sealed','moving a row into the sealed organization checks the new scope');
SELECT lives_ok($$UPDATE public.person_contacts SET contact_name='Allowed foreign change' WHERE id='fa231050-0000-0000-0000-000000000304'$$,
 'the transaction checkpoint does not seal unrelated organizations');
SELECT throws_ok($$UPDATE app_private.financial_reset_verification_checkpoints SET after_images='{}' WHERE operation_id='fa231050-0000-4000-8000-000000000200'$$,
 '23514','financial_reset_evidence_immutable','checkpoint images remain immutable after an early constraint flush');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT organization_id FROM boundary_state)$$,
 '42501','financial_reset_checked_reopening_required','early constraint flush cannot bypass checked reopening');
SELECT is((SELECT contact_name FROM public.person_contacts WHERE id='fa231050-0000-0000-0000-000000000301'),'Preserved contact','failed writes leave the sealed contact intact');
SELECT lives_ok($$SELECT app_private.assert_financial_reset_report_recovery_boundary('fa231050-0000-4000-8000-000000000200')$$,
 'the unchanged checkpoint remains an exact recovery boundary');
ROLLBACK TO SAVEPOINT checkpoint_early_flush;
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT organization_id FROM boundary_state)$$,
 '42501','financial_reset_checked_reopening_required','completed checkpoint requires checked reopening before the control can change');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT organization_id FROM boundary_state)),
 'frozen','rejected unchecked reopening leaves the completed phase frozen');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'ordinary deferred constraints and final frozen-state fence all pass');
SELECT * FROM finish();
ROLLBACK;
