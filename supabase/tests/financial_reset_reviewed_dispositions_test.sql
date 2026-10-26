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
  admin_id uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000001',
  organization_id uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000002',
  property_id uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000003',
  unit_id uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000004',
  tenant_id uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000005',
  company_id uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000006',
  start_actual_lease uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000010',
  end_actual_lease uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000011',
  start_override_lease uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000012',
  end_override_lease uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000013',
  conflict_write_lease uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000014',
  conflict_history_lease uuid NOT NULL DEFAULT 'fa231616-0000-0000-0000-000000000015'
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
  'authenticated', 'authenticated', 'reset-deferred@test.invalid',
  extensions.crypt('rent-boundary', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM boundary_state;

INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT md5(admin_id::text||':reset-fixture')::uuid,admin_id,now(),now(),'aal1' FROM boundary_state;
SELECT pg_temp.reset_fixture_claims(admin_id) FROM boundary_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT organization_id, 'Rent boundary', 'reset-deferred-fixture', 'UTC'
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
CROSS JOIN (VALUES('fa231616-0000-0000-0000-000000000008'::uuid,'B-2',400),('fa231616-0000-0000-0000-000000000009'::uuid,'B-3',0)) fixture(id,label,rent);
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT start_actual_lease,organization_id,property_id,unit_id,tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231616-0000-0000-0000-000000000100',organization_id,start_actual_lease,1,
 (billing_month-interval '13 months')::date,billing_month-1,
 600,'USD',7,'monthly','draft','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,
 charge_management_fee_when_active,full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
 rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231616-0000-0000-0000-000000000101',organization_id,start_actual_lease,property_id,
 (billing_month-interval '13 months')::date,billing_month-1,
 'through_ips','percentage',10,true,false,'individual',tenant_id,'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',
 now(),admin_id,admin_id,admin_id FROM boundary_state;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT id,organization_id,property_id,unit,tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231616-0000-0000-0000-000000000011'::uuid,'fa231616-0000-0000-0000-000000000008'::uuid),('fa231616-0000-0000-0000-000000000012'::uuid,'fa231616-0000-0000-0000-000000000009'::uuid)) fixture(id,unit);
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT id,organization_id,lease,1,(billing_month-interval '1 month')::date,(billing_month+interval '11 months')::date-1,rent,'USD',7,'monthly','draft','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231616-0000-0000-0000-000000000102'::uuid,'fa231616-0000-0000-0000-000000000011'::uuid,400),('fa231616-0000-0000-0000-000000000104'::uuid,'fa231616-0000-0000-0000-000000000012'::uuid,0)) fixture(id,lease,rent);
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,
 charge_management_fee_when_active,full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
 rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT id,organization_id,lease,property_id,(billing_month-interval '1 month')::date,(billing_month+interval '11 months')::date-1,'through_ips','percentage',10,false,false,'individual',tenant_id,
 'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),admin_id,admin_id,admin_id FROM boundary_state
CROSS JOIN (VALUES('fa231616-0000-0000-0000-000000000103'::uuid,'fa231616-0000-0000-0000-000000000011'::uuid),('fa231616-0000-0000-0000-000000000105'::uuid,'fa231616-0000-0000-0000-000000000012'::uuid)) fixture(id,lease);
-- A separate active October term ends on day14. This is ordinary proration,
-- never an expired-before-cutoff deferral or a synthesized renewal.
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
SELECT 'fa231616-0000-0000-0000-000000000021',organization_id,property_id,'B-prorated','vacant',1000,'USD' FROM boundary_state;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT 'fa231616-0000-0000-0000-000000000020',organization_id,property_id,'fa231616-0000-0000-0000-000000000021',tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231616-0000-0000-0000-000000000022',organization_id,'fa231616-0000-0000-0000-000000000020',1,
 (billing_month-interval '1 month')::date,billing_month+13,1000,'USD',7,'monthly','draft','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,
 charge_management_fee_when_active,full_management_fee_during_proration,billing_recipient_kind,billing_recipient_person_id,
 rent_calculation_timezone,short_month_due_day_rule,lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231616-0000-0000-0000-000000000023',organization_id,'fa231616-0000-0000-0000-000000000020',property_id,
 (billing_month-interval '1 month')::date,billing_month+13,'through_ips','percentage',10,true,false,'individual',tenant_id,
 'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),admin_id,admin_id,admin_id FROM boundary_state;
-- The ordinary generator's issue-date floor is a separate, rollback-only
-- regression. Hosted replay below uses the exact original October dates.
SAVEPOINT ordinary_execution_date;
UPDATE public.lease_terms SET status='active' WHERE id IN ('fa231616-0000-0000-0000-000000000102','fa231616-0000-0000-0000-000000000022');
SELECT lives_ok($$SELECT app_private.generate_simple_lease_rent_invoice(organization_id,'fa231616-0000-0000-0000-000000000020',billing_month,business_date,
 'activation_catch_up',admin_id,'fa231616-0000-0000-0000-000000000023') FROM boundary_state$$,'ordinary prorated generator accepts the real execution date');
SELECT is((SELECT due_date FROM public.tenant_invoices WHERE lease_id='fa231616-0000-0000-0000-000000000020'),
 greatest(billing_month+6,business_date),'ordinary rebuilt invoice due date respects the existing issue-date floor') FROM boundary_state;
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE lease_id='fa231616-0000-0000-0000-000000000020'),451.61::numeric,
 'ordinary generator retains October day14 actual-day rent proration');
ROLLBACK TO SAVEPOINT ordinary_execution_date;

-- Generate original source invoices through the real command before queued
-- AFTER term-activation catch-up observes them; audit timestamps remain current.
CREATE TEMP TABLE boundary_original_sources AS
WITH generated AS (
 UPDATE public.lease_terms t SET status='active' FROM boundary_state s
 WHERE t.organization_id=s.organization_id AND t.id IN ('fa231616-0000-0000-0000-000000000102','fa231616-0000-0000-0000-000000000022')
 RETURNING t.lease_id,t.id AS term_id,app_private.generate_simple_lease_rent_invoice(s.organization_id,t.lease_id,
  s.billing_month,s.billing_month,'activation_catch_up',s.admin_id,
  (SELECT b.id FROM public.lease_billing_terms b WHERE b.organization_id=t.organization_id AND b.lease_id=t.lease_id)) AS invoice_id
) SELECT * FROM generated;
UPDATE public.lease_terms SET status='active' WHERE organization_id=(SELECT organization_id FROM boundary_state) AND status='draft';
SELECT ok((SELECT bool_and(i.issue_date=DATE '2026-10-01' AND i.due_date=DATE '2026-10-07')
 FROM boundary_original_sources s JOIN public.tenant_invoices i ON i.id=s.invoice_id),'normal-trigger source invoices retain reviewed October dates');

-- Boundary-only synthetic contract fixture; no completed reset journal is forged.
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
SELECT 'fa231616-0000-0000-0000-000000000017',organization_id,property_id,'Deferred-boundary','vacant',350,'USD' FROM boundary_state;
SAVEPOINT deferred_boundary_lease;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT 'fa231616-0000-0000-0000-000000000016',organization_id,property_id,'fa231616-0000-0000-0000-000000000017',tenant_id,'active',0,'USD',admin_id,admin_id FROM boundary_state;
SAVEPOINT deferred_boundary_term;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT 'fa231616-0000-0000-0000-000000000018',organization_id,'fa231616-0000-0000-0000-000000000016',1,
 billing_month-30,billing_month,350,'USD',7,'monthly','draft','authoritative',now(),admin_id,admin_id,admin_id FROM boundary_state;
SELECT throws_ok($$SELECT app_private.financial_reset_deferred_lease_source(organization_id,'fa231616-0000-0000-0000-000000000016',billing_month) FROM boundary_state$$,
 '23514','financial_reset_deferred_lease_term_not_expired','term ending on October1 is not eligible for October deferral');
ROLLBACK TO SAVEPOINT deferred_boundary_term;
SELECT throws_ok($$SELECT app_private.financial_reset_deferred_lease_source(organization_id,'fa231616-0000-0000-0000-000000000016',billing_month) FROM boundary_state$$,
 '23514','financial_reset_deferred_lease_term_not_expired','active lease with no authoritative term cannot be labeled expired');
ROLLBACK TO SAVEPOINT deferred_boundary_lease;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by,archived_at)
SELECT 'fa231616-0000-0000-0000-000000000016',organization_id,property_id,'fa231616-0000-0000-0000-000000000017',tenant_id,'terminated',0,'USD',admin_id,admin_id,now() FROM boundary_state;
SELECT throws_ok($$SELECT app_private.financial_reset_deferred_lease_source(organization_id,'fa231616-0000-0000-0000-000000000016',billing_month) FROM boundary_state$$,
 '23514','financial_reset_deferred_lease_scope_invalid','archived terminal lease cannot join the active deferred roster');
SELECT lives_ok($$SELECT app_private.financial_reset_deferred_lease_source(organization_id,start_actual_lease,billing_month) FROM boundary_state$$,
 'term and rule ending September30 are eligible for October deferral without renewal');
-- All historical fixture setup and checked phases use normal triggers. Actual
-- automatically generated financial sources are archived in dependency order.
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa231616-0000-0000-0000-000000000007','authenticated','authenticated','reset-deferred-checker@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organization_members(organization_id,user_id,role)
SELECT organization_id,'fa231616-0000-0000-0000-000000000007','super_admin' FROM boundary_state;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT md5(id::text||':reset-fixture')::uuid,id,now(),now(),'aal1'
FROM auth.users WHERE id::text LIKE 'fa231616-%' AND id<>('fa231616-0000-0000-0000-000000000001')::uuid;
INSERT INTO public.person_contacts(id,organization_id,person_id,contact_name)
SELECT 'fa231616-0000-0000-0000-000000000301',organization_id,tenant_id,'Preserved contact' FROM boundary_state;
INSERT INTO public.organizations(id,name,slug) VALUES('fa231616-0000-0000-0000-000000000302','Contact fence foreign organization','reset-deferred-foreign-contact');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('fa231616-0000-0000-0000-000000000303','fa231616-0000-0000-0000-000000000302','Foreign contact person');
INSERT INTO public.person_contacts(id,organization_id,person_id,contact_name)
VALUES('fa231616-0000-0000-0000-000000000304','fa231616-0000-0000-0000-000000000302','fa231616-0000-0000-0000-000000000303','Foreign contact');
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
CREATE TEMP TABLE boundary_actions AS SELECT jsonb_agg(jsonb_build_object('action_id',md5('fa231616-0000-4000-8000-000000000200:'||ordinal)::uuid,
 'ordinal',ordinal,'relation_name',relation_name,'primary_key',pk,'kind','archive-delete','before_row_text',image::text,'before_sha256',hash,
 'after_row_text',NULL,'after_sha256',NULL) ORDER BY ordinal) AS value FROM boundary_archive;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT organization_id,1,'frozen',billing_month FROM boundary_state;
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object(
 'operation_id','fa231616-0000-4000-8000-000000000200','organization_id',organization_id,'operation_kind','reset','restore_of',NULL,
 'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,'row_sha256',hash)
  ORDER BY relation_name,pk::text)) FROM boundary_archive),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
  FROM boundary_actions CROSS JOIN LATERAL jsonb_array_elements(value) a),
 'archive_count',(SELECT count(*) FROM boundary_archive),'action_count',(SELECT count(*) FROM boundary_archive),'audit_timestamp',now(),'audit_actor',admin_id)) FROM boundary_state;
SELECT app_private.archive_financial_reset_rows('fa231616-0000-4000-8000-000000000200',(SELECT jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,
 'row_text',image::text,'row_sha256',hash) ORDER BY ordinal) FROM boundary_archive));
SELECT app_private.prepare_financial_reset_actions('fa231616-0000-4000-8000-000000000200',value) FROM boundary_actions;
WITH plan AS(SELECT jsonb_build_object('operation_id','fa231616-0000-4000-8000-000000000200',
 'organization_id',organization_id,'manifest_sha256',repeat('a',64),'reset_plan_sha256',repeat('b',64),
 'maker_actor_id',admin_id,'reviewer_actor_id','fa231616-0000-0000-0000-000000000007','effective_date',billing_month,'currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_known_zero_scope('fa231616-0000-4000-8000-000000000200')) AS value FROM boundary_state)
SELECT app_private.prepare_financial_reset_zero_plan('fa231616-0000-4000-8000-000000000200',value,app_private.financial_reset_hash(value)) FROM plan;
SELECT pg_temp.reset_fixture_claims(admin_id) FROM boundary_state;
SELECT set_config('reset_test.zero_review_sha',(SELECT review_sha256 FROM app_private.financial_reset_zero_plans WHERE operation_id='fa231616-0000-4000-8000-000000000200'),true);
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231616-0000-4000-8000-000000000200',current_setting('reset_test.zero_review_sha'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.reset_fixture_claims('fa231616-0000-0000-0000-000000000007');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan('fa231616-0000-4000-8000-000000000200',current_setting('reset_test.zero_review_sha'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.seal_financial_reset_operation('fa231616-0000-4000-8000-000000000200');
SELECT app_private.start_financial_reset_actions('fa231616-0000-4000-8000-000000000200');
-- The exact-action invoker guards require the native executor's existing role.
SET LOCAL ROLE postgres;
DO $$ DECLARE a record; BEGIN
 FOR a IN SELECT * FROM app_private.financial_reset_actions
  WHERE operation_id='fa231616-0000-4000-8000-000000000200' ORDER BY ordinal LOOP
  PERFORM app_private.arm_financial_reset_action(a.operation_id,a.action_id);
  EXECUTE format('DELETE FROM %s WHERE id=$1',a.relation_oid::regclass) USING (a.primary_key->>'id')::uuid;
 END LOOP;
END $$;
RESET ROLE;
SELECT app_private.complete_financial_reset_actions('fa231616-0000-4000-8000-000000000200');
CREATE TEMP TABLE continuation_plan AS SELECT jsonb_build_object('version',3,'actor_id',admin_id,
 'billing_period_start',billing_month,'issue_date',billing_month,'execution_business_date',business_date,
 'invoice_date_policy','original-reviewed-october','original_invoice_sources',(SELECT jsonb_agg(jsonb_build_object('lease_id',image->'lease_id',
 'invoice_id',image->'id','row_sha256',hash) ORDER BY ordinal) FROM boundary_archive WHERE relation_name='public.tenant_invoices'),
 'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(organization_id)),
 'leases',jsonb_build_array(jsonb_build_object('lease_id',start_actual_lease,'term_id','fa231616-0000-0000-0000-000000000100',
 'billing_rule_id','fa231616-0000-0000-0000-000000000101','continue_month_to_month',false,'disposition','bill',
 'rent_amount',600,'management_fee_amount',60,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',billing_month+6),
 jsonb_build_object('lease_id','fa231616-0000-0000-0000-000000000011','term_id','fa231616-0000-0000-0000-000000000102',
 'billing_rule_id','fa231616-0000-0000-0000-000000000103','continue_month_to_month',false,'disposition','bill',
 'rent_amount',400,'management_fee_amount',0,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',billing_month+6),
 jsonb_build_object('lease_id','fa231616-0000-0000-0000-000000000012','term_id','fa231616-0000-0000-0000-000000000104',
 'billing_rule_id','fa231616-0000-0000-0000-000000000105','continue_month_to_month',false,'disposition','bill',
 'rent_amount',0,'management_fee_amount',0,'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips',
 'due_date',billing_month+6))) AS value FROM boundary_state;

CREATE TEMP TABLE deferred_source AS SELECT app_private.financial_reset_deferred_lease_source(organization_id,start_actual_lease,billing_month) AS value FROM boundary_state;
CREATE TEMP TABLE prorated_contract AS SELECT jsonb_build_object('lease',to_jsonb(l),'term',to_jsonb(t),'rule',to_jsonb(b)) AS value
 FROM public.leases l JOIN public.lease_terms t ON t.lease_id=l.id JOIN public.lease_billing_terms b ON b.lease_id=l.id
 WHERE l.id='fa231616-0000-0000-0000-000000000020';
UPDATE continuation_plan SET value=jsonb_set(jsonb_set(value,'{version}','3'),'{leases}',jsonb_build_array(
 jsonb_build_object('lease_id',(SELECT start_actual_lease FROM boundary_state),'term_id',(SELECT value->'selected_term_id' FROM deferred_source),
 'billing_rule_id',(SELECT value->'selected_billing_rule_id' FROM deferred_source),'disposition','defer-expired-unbilled','reason','renewal-unconfirmed',
 'source_sha256',(SELECT app_private.financial_reset_hash(value) FROM deferred_source)),
 (value->'leases'->1)||'{"disposition":"bill"}'::jsonb,(value->'leases'->2)||'{"disposition":"bill"}'::jsonb,
 (SELECT jsonb_build_object('lease_id','fa231616-0000-0000-0000-000000000020','term_id','fa231616-0000-0000-0000-000000000022',
 'billing_rule_id','fa231616-0000-0000-0000-000000000023','continue_month_to_month',false,'disposition','bill',
 'rent_amount',round(1000::numeric*14/extract(day FROM billing_month+interval '1 month - 1 day'),2),
 'management_fee_amount',round(round(1000::numeric*14/extract(day FROM billing_month+interval '1 month - 1 day'),2)*0.1,2),
 'currency','USD','recipient_person_id',tenant_id,'collection_route','through_ips','due_date',billing_month+6) FROM boundary_state)));
INSERT INTO reset_operator_fixture(binding)
SELECT pg_temp.reset_fixture_binding('fa231616-0000-4000-8000-000000000200',value-'source_sha256') FROM continuation_plan;
SELECT pg_temp.reset_fixture_claims(admin_id) FROM boundary_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE reset_operator_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM reset_operator_fixture;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT app_private.apply_financial_reset_known_zero('fa231616-0000-4000-8000-000000000200');
UPDATE continuation_plan SET value=jsonb_set(value,'{source_sha256}',to_jsonb(app_private.financial_reset_hash(
 app_private.financial_reset_continuation_snapshot((SELECT organization_id FROM boundary_state)))));
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"sentinel":"original"}',true);
SELECT set_config('request.headers','{"sentinel":"original","x-nestory-financial-generation":"0"}',true);
CREATE FUNCTION pg_temp.prepare_deferred(p_plan jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_continuation('fa231616-0000-4000-8000-000000000200',p_plan,app_private.financial_reset_hash(p_plan));
$$;
SAVEPOINT unsupported_hosted_legacy;
SELECT throws_ok($$SELECT pg_temp.prepare_deferred((value-ARRAY['execution_business_date','invoice_date_policy','original_invoice_sources'])||
 jsonb_build_object('version',2,'issue_date',(SELECT business_date FROM boundary_state),'leases',
  (SELECT jsonb_agg(CASE WHEN entry->>'disposition'='bill' THEN entry||jsonb_build_object('due_date',
   greatest(DATE '2026-10-07',(SELECT business_date FROM boundary_state))) ELSE entry END ORDER BY ordinal)
   FROM jsonb_array_elements(value->'leases') WITH ORDINALITY entries(entry,ordinal)))) FROM continuation_plan$$,
 '42501','financial_reset_scoped_phase_binding_invalid','hosted preparation cannot replace consumed original-date review with execution-date semantics');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation('fa231616-0000-4000-8000-000000000200')$$,
 '42501','financial_reset_scoped_phase_binding_invalid','consumed original-date review refuses hosted execution-date continuation');
ROLLBACK TO SAVEPOINT unsupported_hosted_legacy;
SELECT ok(NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE has_function_privilege(r.name,'app_private.financial_reset_deferred_lease_source(uuid,uuid,date)','EXECUTE')
 OR has_function_privilege(r.name,'app_private.assert_financial_reset_deferred_lease(uuid,date,jsonb)','EXECUTE')
 OR has_function_privilege(r.name,'app_private.financial_reset_report_deferred_blocker(uuid,uuid,public.currency_code,jsonb)','EXECUTE')),
 'deferred review helpers expose no application reset permission');
SELECT throws_ok($$SELECT pg_temp.prepare_deferred(jsonb_set(value,'{leases}',(value->'leases')-0)) FROM continuation_plan$$,
 '23514','financial_reset_continuation_roster_mismatch','omitting an expired active lease is not an approved deferred disposition');
SELECT throws_ok($$SELECT pg_temp.prepare_deferred(jsonb_set(value,'{leases}',(value->'leases')||jsonb_build_array(value->'leases'->0))) FROM continuation_plan$$,
 '23514','financial_reset_continuation_duplicate_lease','every active lease must occur exactly once');
SELECT throws_ok($$SELECT pg_temp.prepare_deferred(jsonb_set(value,'{leases,0,source_sha256}',to_jsonb(repeat('d',64)))) FROM continuation_plan$$,
 '40001','financial_reset_deferred_lease_source_changed','deferred review pins complete contractual before-images');
SELECT throws_ok($$SELECT pg_temp.prepare_deferred(jsonb_set(value,'{leases,0,term_id}','"fa231616-0000-0000-0000-000000000102"')) FROM continuation_plan$$,
 '40001','financial_reset_deferred_lease_source_changed','another lease term cannot satisfy the deferred source');
SELECT throws_ok($$SELECT pg_temp.prepare_deferred(jsonb_set(value,'{leases,0,reason}','"ignore-errors"')) FROM continuation_plan$$,
 '23514','financial_reset_deferred_lease_review_invalid','unknown deferred decision fails closed');
SELECT throws_ok($$SELECT pg_temp.prepare_deferred(jsonb_set(value,'{leases,0,rent_amount}','0')) FROM continuation_plan$$,
 '23514','financial_reset_deferred_lease_review_invalid','deferral is not a fabricated zero-rent contract');
SELECT throws_ok($$SELECT pg_temp.prepare_deferred(jsonb_set(value,'{leases,1,disposition}','"continue-month-to-month"')) FROM continuation_plan$$,
 '23514','financial_reset_continuation_disposition_invalid','ordinary bill cannot be relabeled as an approved renewal');
SELECT throws_ok($$SELECT app_private.financial_reset_deferred_lease_source(organization_id,end_actual_lease,billing_month) FROM boundary_state$$,
 '23514','financial_reset_deferred_lease_term_not_expired','live overlapping term cannot be deferred as expired');
SELECT throws_ok($$SELECT app_private.financial_reset_deferred_lease_source(organization_id,'fa231616-0000-0000-0000-000000000020',billing_month) FROM boundary_state$$,
 '23514','financial_reset_deferred_lease_term_not_expired','October day14 term must use normal proration rather than expired-before-October deferral');

CREATE TEMP TABLE deposit_images AS SELECT jsonb_build_object('id','fa231616-0000-0000-0000-000000000401',
 'organization_id',organization_id,'lease_id',end_actual_lease,'deposit_type','security','amount',1234.56,'currency','USD',
 'notes','Unchanged deposit contract','status','held','received_on','2026-09-01','returned_on',NULL,'archived_at',NULL,
 'updated_at',now(),'updated_by',admin_id) AS value FROM boundary_state;
SELECT ok(app_private.financial_reset_normalized_image('public.lease_deposits'::regclass,value,
 value||'{"status":"pending","received_on":null,"returned_on":null}'::jsonb,now(),NULL),
 'explicit active held cash clear changes status/dates without changing contractual amount or identity') FROM deposit_images;
SELECT ok(NOT app_private.financial_reset_normalized_image('public.lease_deposits'::regclass,value,
 value||'{"status":"pending","received_on":null,"returned_on":null,"amount":0}'::jsonb,now(),NULL),
 'clearing recorded cash cannot zero the contractual deposit requirement') FROM deposit_images;
SELECT ok(NOT app_private.financial_reset_normalized_image('public.lease_deposits'::regclass,
 value||'{"status":"returned"}'::jsonb,value||'{"status":"pending","received_on":null,"returned_on":null}'::jsonb,now(),NULL),
 'a returned deposit is never revived as a pending requirement') FROM deposit_images;
SELECT ok(app_private.financial_reset_normalized_image('public.lease_deposits'::regclass,
 value||jsonb_build_object('status',state,'lease_id','fa231616-0000-0000-0000-000000000016','archived_at',archived),
 value||jsonb_build_object('status',state,'lease_id','fa231616-0000-0000-0000-000000000016','archived_at',archived),now(),NULL),
 'explicit preserved '||state||' historical header stays byte-identical') FROM deposit_images
 CROSS JOIN (VALUES('pending',NULL::text),('pending','2026-09-01T00:00:00Z'),('returned',NULL),('waived',NULL),('forfeited',NULL)) fixture(state,archived);
SELECT ok(NOT app_private.financial_reset_normalized_image('public.lease_deposits'::regclass,
 value||jsonb_build_object('lease_id','fa231616-0000-0000-0000-000000000016'),
 value||jsonb_build_object('lease_id','fa231616-0000-0000-0000-000000000016','status','pending','received_on',NULL,'returned_on',NULL),now(),NULL),
 'terminal archived lease cannot use the active held-cash normalization path') FROM deposit_images;

SELECT lives_ok($$SELECT pg_temp.prepare_deferred((SELECT value FROM continuation_plan))$$,'complete reviewed bill/deferred roster prepares');
SELECT lives_ok($$SELECT app_private.apply_financial_reset_continuation('fa231616-0000-4000-8000-000000000200')$$,
 'ordinary billing runs while the exact expired lease remains unbilled');
SELECT is(app_private.financial_reset_deferred_lease_source(organization_id,start_actual_lease,billing_month),(SELECT value FROM deferred_source),
 'deferred lease and its complete historical terms/rules stay byte-identical') FROM boundary_state;
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)),0::bigint,'no invoice is fabricated for deferred expiry');
SELECT is((SELECT count(*) FROM public.management_fee_occurrences WHERE lease_id=(SELECT start_actual_lease FROM boundary_state)),0::bigint,'no fee is fabricated for deferred expiry');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT organization_id FROM boundary_state)),2::bigint,'full-month and prorated positive-rent leases are billed while zero-rent and deferred leases are not');
SELECT is((SELECT jsonb_build_object('lease',to_jsonb(l),'term',to_jsonb(t),'rule',to_jsonb(b))
 FROM public.leases l JOIN public.lease_terms t ON t.lease_id=l.id JOIN public.lease_billing_terms b ON b.lease_id=l.id
 WHERE l.id='fa231616-0000-0000-0000-000000000020'),(SELECT value FROM prorated_contract),
 'ordinary October proration leaves lease identity and exact contract term/rule unchanged');
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE lease_id='fa231616-0000-0000-0000-000000000020'),
 round(1000::numeric*14/extract(day FROM billing_month+interval '1 month - 1 day'),2),
 'day14 actual-day proration generates451.61 for a31-day October from monthly1000') FROM boundary_state;
SELECT is((SELECT management_fee_amount FROM public.tenant_invoices WHERE lease_id='fa231616-0000-0000-0000-000000000020'),
 round(round(1000::numeric*14/extract(day FROM billing_month+interval '1 month - 1 day'),2)*0.1,2),
 'ten-percent prorated fee generates45.16 inOctober without applying a full monthly fee') FROM boundary_state;
SELECT is((SELECT due_date FROM public.tenant_invoices WHERE lease_id='fa231616-0000-0000-0000-000000000020'),
 billing_month+6,'hosted rebuilt invoice retains the reviewed October 7 due date') FROM boundary_state;
SELECT is((SELECT result_json->>'billing_complete' FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231616-0000-4000-8000-000000000200'),'false','checked decisions do not falsely claim complete billing');
SELECT is((SELECT result_json->>'deferred_lease_count' FROM app_private.financial_reset_continuation_plans WHERE operation_id='fa231616-0000-4000-8000-000000000200'),'1','deferred roster count remains explicit');
SELECT lives_ok($$SELECT app_private.apply_financial_reset_reports('fa231616-0000-4000-8000-000000000200')$$,
 'report checkpoint persists owner periods while retaining the exact reviewed missing-rent blocker');
SELECT is((SELECT result_json->>'billing_complete' FROM app_private.financial_reset_verification_checkpoints WHERE operation_id='fa231616-0000-4000-8000-000000000200'),'false','report checkpoint exposes incomplete billing');
SELECT ok(EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c CROSS JOIN LATERAL jsonb_array_elements(c.result_json->'scopes') s
 WHERE c.operation_id='fa231616-0000-4000-8000-000000000200' AND s->>'status'='blocked-deferred-lease' AND s->'close_readiness'->>'is_ready'='false'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(s->'close_readiness'->'blockers') b WHERE b->>'code'='monthly_rent_invoice_missing')),
 'affected owner scope is visibly blocked rather than presented as report ready');
SELECT ok(EXISTS(SELECT 1 FROM jsonb_array_elements(app_private.owner_month_rent_completeness(organization_id,property_id,'USD',billing_month)->'gaps') b
 WHERE b->>'code'='monthly_rent_invoice_missing' AND b->>'lease_id'=start_actual_lease::text),
 'ordinary close completeness still blocks the deferred lease') FROM boundary_state;
SELECT ok(NOT app_private.financial_reset_report_deferred_blocker('fa231616-0000-4000-8000-000000000200',property_id,'USD',
 jsonb_build_object('code','monthly_rent_invoice_missing','lease_id',end_actual_lease,'property_id',property_id,'unit_id',unit_id)),
 'an unreviewed missing invoice cannot use the deferred blocker allowance') FROM boundary_state;
SELECT ok(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(app_private.financial_reset_recovery_candidates('fa231616-0000-4000-8000-000000000200')) s
 WHERE s->>'relation_name' IN ('public.leases','public.lease_terms','public.lease_billing_terms')),
 'recovery never prunes or repairs the unchanged deferred contract');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'reviewed deferred checkpoint commits frozen with full snapshot and normal constraints');
SELECT * FROM finish();
ROLLBACK;
