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

-- Rollback-only synthetic contract and original-invoice fixture. All setup and
-- reset/archive/generator/report work uses normal triggers, checked permissions,
-- exact actions and normal constraints.
CREATE FUNCTION pg_temp.original_date_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('fd231852-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE original_date_state AS SELECT
 pg_temp.original_date_id(9001) AS maker,pg_temp.original_date_id(9002) AS reviewer,
 pg_temp.original_date_id(9003) AS org,pg_temp.original_date_id(9004) AS property,
 pg_temp.original_date_id(9005) AS tenant,pg_temp.original_date_id(9006) AS owner,
 pg_temp.original_date_id(700) AS operation,transaction_timestamp() AS started_at;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
SELECT person,'authenticated','authenticated','original-date-'||extensions.gen_random_uuid()::text||'@test.invalid',
 '{"provider":"email","providers":["email"]}','{}'
FROM original_date_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT md5(person::text||':reset-fixture')::uuid,person,now(),now(),'aal1'
FROM original_date_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO public.organizations(id,name,slug,operational_timezone)
SELECT org,'Original date synthetic option','original-dates-'||extensions.gen_random_uuid()::text,'UTC' FROM original_date_state;
INSERT INTO public.organization_members(organization_id,user_id,role)
SELECT org,person,'super_admin' FROM original_date_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure,status)
SELECT property,org,'Original date property','ODP','apartment','multi_unit','active' FROM original_date_state;
INSERT INTO public.people(id,organization_id,display_name,party_type)
SELECT person,org,label,kind FROM original_date_state
CROSS JOIN LATERAL (VALUES(tenant,'Original date tenant','individual'),(owner,'Original date owner','company')) people(person,label,kind);
INSERT INTO public.person_roles(organization_id,person_id,role)
SELECT org,person,kind FROM original_date_state CROSS JOIN LATERAL (VALUES(tenant,'tenant'),(owner,'owner')) roles(person,kind);
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_label,ownership_percent,is_primary,started_on,created_by,updated_by)
SELECT org,property,owner,'Primary owner',100,true,'2025-01-01',maker,maker FROM original_date_state;
CREATE TEMP TABLE original_date_contract_fixture AS
SELECT n,pg_temp.original_date_id(n) AS lease,pg_temp.original_date_id(100+n) AS term,
 pg_temp.original_date_id(200+n) AS rule,pg_temp.original_date_id(300+n) AS unit,
 CASE n WHEN 1 THEN 400 WHEN 2 THEN 1000 WHEN 3 THEN 0 ELSE 600 END::numeric AS rent,
 CASE WHEN n>=4 THEN DATE '2026-09-30' WHEN n=2 THEN DATE '2026-10-14' ELSE DATE '2027-08-31' END AS ends_on
FROM generate_series(1,8) n;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
SELECT unit,org,property,'OD-'||n,'vacant',rent,'USD' FROM original_date_contract_fixture CROSS JOIN original_date_state;
SELECT pg_temp.reset_fixture_claims(maker) FROM original_date_state;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
SELECT lease,org,property,unit,tenant,'active',1234.56,'USD',maker,maker FROM original_date_contract_fixture CROSS JOIN original_date_state;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,
 payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
-- Draft authoritative terms cannot generate rent until their normal activation.
SELECT term,org,lease,1,'2026-09-01',ends_on,rent,'USD',7,'monthly','draft','authoritative',now(),maker,maker,maker
FROM original_date_contract_fixture CROSS JOIN original_date_state;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,
 management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
 billing_recipient_kind,billing_recipient_person_id,rent_calculation_timezone,short_month_due_day_rule,
 lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT rule,org,lease,property,'2026-09-01',ends_on,'through_ips','percentage',10,n=2,false,'individual',tenant,
 'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),maker,maker,maker
FROM original_date_contract_fixture CROSS JOIN original_date_state;
INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,notes,created_by,updated_by)
SELECT pg_temp.original_date_id(400+n),org,lease,1234.56,'USD','pending','Contract requirement is unchanged',maker,maker
FROM original_date_contract_fixture CROSS JOIN original_date_state;
-- The ordinary generator retains its execution-date due-date floor. Its probe
-- is separate from the hosted reset and all generated effects are rolled back.
SAVEPOINT ordinary_execution_date_probe;
UPDATE public.lease_terms SET status='active' WHERE id IN (SELECT term FROM original_date_contract_fixture WHERE n IN (1,2));
SELECT lives_ok($$SELECT app_private.generate_simple_lease_rent_invoice(org,lease,'2026-10-01',
 app_private.rent_business_date(org,statement_timestamp()),'activation_catch_up',maker,rule)
 FROM original_date_contract_fixture CROSS JOIN original_date_state WHERE n IN (1,2)$$,
 'ordinary execution-date generator creates both positive-rent invoices');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM original_date_state)),2::bigint,
 'ordinary execution-date alternative generates both invoices');
SELECT ok((SELECT bool_and(issue_date=app_private.rent_business_date(org,statement_timestamp())
 AND due_date=greatest(DATE '2026-10-07',app_private.rent_business_date(org,statement_timestamp())))
 FROM public.tenant_invoices CROSS JOIN original_date_state WHERE organization_id=org),
 'ordinary execution-date generator retains the actual issue date and due-date floor');
ROLLBACK TO SAVEPOINT ordinary_execution_date_probe;
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM original_date_state)),0::bigint,
 'ordinary execution-date probe was fully rolled back');

-- The normal generator runs in RETURNING before queued AFTER catch-up triggers.
-- It creates real income, invoice, rent-line and fee sources with original
-- reviewed business dates and current audit timestamps. No context is forged.
CREATE TEMP TABLE original_date_generated AS
WITH generated AS (
 UPDATE public.lease_terms t SET status='active'
 FROM original_date_contract_fixture f CROSS JOIN original_date_state s
 WHERE t.id=f.term AND f.n IN (1,2)
 RETURNING f.n,app_private.generate_simple_lease_rent_invoice(s.org,f.lease,'2026-10-01','2026-10-01',
  'activation_catch_up',s.maker,f.rule) AS invoice_id
) SELECT * FROM generated;
UPDATE public.lease_terms SET status='active' WHERE id IN (SELECT term FROM original_date_contract_fixture WHERE n>=3);
SELECT ok((SELECT bool_and(i.issue_date=DATE '2026-10-01' AND i.due_date=DATE '2026-10-07')
 FROM original_date_generated g JOIN public.tenant_invoices i ON i.id=g.invoice_id),
 'normal-trigger source setup generated the reviewed original invoice dates');
SELECT is(current_setting('session_replication_role'),'origin','all checked operations run with normal triggers');

INSERT INTO public.organizations(id,name,slug) VALUES(pg_temp.original_date_id(9500),'Foreign date sentinel','foreign-date-'||extensions.gen_random_uuid()::text);
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
SELECT pg_temp.original_date_id(9501),pg_temp.original_date_id(9500),'2026-10-01',maker,'Unrelated organization must stay exact' FROM original_date_state;
CREATE TEMP TABLE original_date_foreign AS SELECT to_jsonb(f) AS image FROM public.financial_month_locks f WHERE id=pg_temp.original_date_id(9501);
CREATE TEMP TABLE original_date_contracts AS SELECT jsonb_build_object(
 'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leases l WHERE organization_id=s.org),
 'terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=s.org),
 'rules',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.lease_billing_terms b WHERE organization_id=s.org),
 'deposits',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.lease_deposits d WHERE organization_id=s.org)) AS image FROM original_date_state s;
CREATE TEMP TABLE original_date_archive AS
SELECT relation_name,image,app_private.financial_reset_primary_key(relation_name::regclass,image) AS pk,
 app_private.financial_reset_hash(image) AS hash,row_number() OVER(ORDER BY priority,image->>'id')::integer AS ordinal
FROM (
 SELECT 'public.owner_invoice_lines'::text AS relation_name,to_jsonb(t) AS image,1 AS priority
 FROM public.owner_invoice_lines t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.owner_invoices',to_jsonb(t),2
 FROM public.owner_invoices t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.management_fee_occurrences',to_jsonb(t),3
 FROM public.management_fee_occurrences t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.tenant_invoice_rent_segments',to_jsonb(t),4
 FROM public.tenant_invoice_rent_segments t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.tenant_invoice_lines',to_jsonb(t),5
 FROM public.tenant_invoice_lines t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.rent_generation_exceptions',to_jsonb(t),6
 FROM public.rent_generation_exceptions t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.tenant_invoices',to_jsonb(t),7
 FROM public.tenant_invoices t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.finance_income_items',to_jsonb(t),8
 FROM public.finance_income_items t CROSS JOIN original_date_state s WHERE t.organization_id=s.org
) fixture_rows;
CREATE TEMP TABLE original_date_actions AS SELECT jsonb_agg(jsonb_build_object('action_id',pg_temp.original_date_id(600+ordinal),
 'ordinal',ordinal,'relation_name',relation_name,'primary_key',pk,'kind','archive-delete',
 'before_row_text',image::text,'before_sha256',hash,'after_row_text',NULL,'after_sha256',NULL) ORDER BY ordinal) AS value FROM original_date_archive;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT org,1,'frozen','2026-10-01' FROM original_date_state;
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id',operation,'organization_id',org,
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),
 'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_count',(SELECT count(*) FROM original_date_archive),'action_count',(SELECT count(*) FROM original_date_archive),
 'audit_timestamp',clock_timestamp(),'audit_actor',maker,
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,'row_sha256',hash)
  ORDER BY relation_name,pk::text)) FROM original_date_archive),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
  FROM original_date_actions CROSS JOIN LATERAL jsonb_array_elements(value) a))) FROM original_date_state;
SELECT app_private.archive_financial_reset_rows(operation,(SELECT jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,
 'row_text',image::text,'row_sha256',hash) ORDER BY ordinal) FROM original_date_archive)) FROM original_date_state;
SELECT app_private.prepare_financial_reset_actions(operation,value) FROM original_date_state CROSS JOIN original_date_actions;
WITH review AS(SELECT operation,jsonb_build_object('operation_id',operation,'organization_id',org,'manifest_sha256',repeat('a',64),
 'reset_plan_sha256',repeat('b',64),'maker_actor_id',maker,'reviewer_actor_id',reviewer,'effective_date','2026-10-01','currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_known_zero_scope(operation)) AS value FROM original_date_state)
SELECT app_private.prepare_financial_reset_zero_plan(operation,value,app_private.financial_reset_hash(value)) FROM review;
SELECT pg_temp.reset_fixture_claims(maker) FROM original_date_state;
SELECT set_config('original_date.operation',operation::text,true),set_config('original_date.zero_review',review_sha256,true)
FROM original_date_state JOIN app_private.financial_reset_zero_plans ON operation_id=operation;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan(current_setting('original_date.operation')::uuid,current_setting('original_date.zero_review'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.reset_fixture_claims(reviewer) FROM original_date_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan(current_setting('original_date.operation')::uuid,current_setting('original_date.zero_review'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.seal_financial_reset_operation(operation) FROM original_date_state;
SELECT app_private.start_financial_reset_actions(operation) FROM original_date_state;
-- The exact-action invoker guards require the native executor's existing role.
SET LOCAL ROLE postgres;
DO $$ DECLARE a record; BEGIN
 FOR a IN SELECT * FROM app_private.financial_reset_actions
  WHERE operation_id='fd231852-0000-4000-8000-000000000700' ORDER BY ordinal LOOP
  PERFORM app_private.arm_financial_reset_action(a.operation_id,a.action_id);
  EXECUTE format('DELETE FROM %s WHERE id=$1',a.relation_oid::regclass) USING (a.primary_key->>'id')::uuid;
 END LOOP;
END $$;
RESET ROLE;
SELECT app_private.complete_financial_reset_actions(operation) FROM original_date_state;
CREATE TEMP TABLE original_date_plan AS SELECT jsonb_build_object('version',3,'actor_id',maker,'billing_period_start','2026-10-01',
 'issue_date','2026-10-01','execution_business_date',app_private.rent_business_date(org,statement_timestamp()),
 'invoice_date_policy','original-reviewed-october','source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(org)),
 'original_invoice_sources',(SELECT jsonb_agg(jsonb_build_object('lease_id',image->'lease_id','invoice_id',image->'id','row_sha256',hash) ORDER BY ordinal)
  FROM original_date_archive WHERE relation_name='public.tenant_invoices'),
 'leases',(SELECT jsonb_agg(CASE WHEN n>=4 THEN jsonb_build_object('lease_id',lease,'term_id',term,'billing_rule_id',rule,
   'disposition','defer-expired-unbilled','reason','renewal-unconfirmed','source_sha256',app_private.financial_reset_hash(app_private.financial_reset_deferred_lease_source(org,lease,'2026-10-01')))
  ELSE jsonb_build_object('lease_id',lease,'term_id',term,'billing_rule_id',rule,'disposition','bill','continue_month_to_month',false,
   'rent_amount',CASE n WHEN 1 THEN 400 WHEN 2 THEN 451.61 ELSE 0 END,'management_fee_amount',CASE n WHEN 2 THEN 45.16 ELSE 0 END,
   'currency','USD','recipient_person_id',tenant,'collection_route','through_ips','due_date','2026-10-07') END ORDER BY n)
  FROM original_date_contract_fixture)) AS value FROM original_date_state;
INSERT INTO reset_operator_fixture(binding)
SELECT pg_temp.reset_fixture_binding(operation,value-'source_sha256') FROM original_date_state CROSS JOIN original_date_plan;
SELECT pg_temp.reset_fixture_claims(maker) FROM original_date_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE reset_operator_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM reset_operator_fixture;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT app_private.apply_financial_reset_known_zero(operation) FROM original_date_state;
UPDATE original_date_plan SET value=jsonb_set(value,'{source_sha256}',to_jsonb(app_private.financial_reset_hash(
 app_private.financial_reset_continuation_snapshot((SELECT org FROM original_date_state)))));
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);

CREATE FUNCTION pg_temp.prepare_original_dates(p_plan jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_continuation((SELECT operation FROM original_date_state),p_plan,app_private.financial_reset_hash(p_plan))
$$;
SELECT ok(NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) roles(name)
 WHERE has_function_privilege(name,'app_private.assert_financial_reset_original_invoice_dates(uuid,jsonb)','EXECUTE')),
 'original-date option exposes no application reset permission');
SELECT is((SELECT count(*) FROM app_private.financial_reset_archive_rows a JOIN original_date_state s ON s.operation=a.operation_id
 WHERE a.relation_name='public.tenant_invoices'),2::bigint,
 'both original invoice sources are real immutable archived rows');

-- The option deliberately expires after October. Future test runs prove refusal
-- and skip its success-only branch instead of backdating the database clock.
SELECT date_trunc('month',app_private.rent_business_date(org,statement_timestamp()))::date=DATE '2026-10-01' AS original_replay_month FROM original_date_state \gset
\if :original_replay_month
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{execution_business_date}',to_jsonb(((value->>'execution_business_date')::date-1)::text))) FROM original_date_plan$$,
 '40001','financial_reset_continuation_business_date_changed','actual execution business date cannot be backdated');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{issue_date}','"2026-10-02"')) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_date_review_invalid','only original October 1 issue dates are eligible');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{invoice_date_policy}','"any-date"')) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_date_review_invalid','original-date option requires its explicit policy');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{leases,0,due_date}','"2026-10-08"')) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_contract_required','original due date remains contractual October 7');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(jsonb_set(value,'{leases,0,continue_month_to_month}','true'),'{leases,0,disposition}','"continue-month-to-month"')) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_contract_required','original-date option cannot synthesize a renewal');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{leases}',(value->'leases')-3)) FROM original_date_plan$$,
 '23514','financial_reset_continuation_roster_mismatch','all five expired active leases must remain explicitly reviewed');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{original_invoice_sources}','[]')) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_source_roster_invalid','missing original invoice roster fails closed');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{original_invoice_sources,1}',value->'original_invoice_sources'->0)) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_source_roster_invalid','each billed lease needs its own original invoice');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{original_invoice_sources,0,row_sha256}',to_jsonb(repeat('d',64)))) FROM original_date_plan$$,
 '40001','financial_reset_original_invoice_source_changed','archive source hashes cannot be substituted');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{original_invoice_sources,0,invoice_id}',to_jsonb(pg_temp.original_date_id(9999)::text))) FROM original_date_plan$$,
 '40001','financial_reset_original_invoice_source_changed','unknown original invoice identity cannot supply business dates');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{original_invoice_sources,0,lease_id}',value->'leases'->3->'lease_id')) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_source_roster_invalid','deferred lease cannot borrow a billed original invoice');
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(jsonb_set(value,'{leases,0,term_id}',value->'leases'->1->'term_id')) FROM original_date_plan$$,
 '23514','financial_reset_original_invoice_contract_required','original replay still requires exact lease term authority');

-- A consumed v3 review cannot authorize an execution-date alternative. The
-- ordinary generator behavior was checked independently before freezing.
SAVEPOINT unsupported_hosted_execution_date;
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates((value-ARRAY['execution_business_date','invoice_date_policy','original_invoice_sources'])||
 jsonb_build_object('version',2,'issue_date',value->'execution_business_date','leases',
  (SELECT jsonb_agg(CASE WHEN entry->>'disposition'='bill' THEN entry||jsonb_build_object('due_date',
   greatest(DATE '2026-10-07',(value->>'execution_business_date')::date)) ELSE entry END ORDER BY ordinal)
   FROM jsonb_array_elements(value->'leases') WITH ORDINALITY entries(entry,ordinal)))) FROM original_date_plan$$,
 '42501','financial_reset_scoped_phase_binding_invalid','hosted preparation cannot replace consumed original-date review with execution-date semantics');
SELECT throws_ok($$SELECT app_private.apply_financial_reset_continuation(operation) FROM original_date_state$$,
 '42501','financial_reset_scoped_phase_binding_invalid','consumed original-date review cannot authorize hosted v2 execution-date billing');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM original_date_state)),0::bigint,
 'unsupported hosted alternative creates no invoice');
ROLLBACK TO SAVEPOINT unsupported_hosted_execution_date;

SELECT lives_ok($$SELECT pg_temp.prepare_original_dates(value) FROM original_date_plan$$,'exact original-date review is accepted without changing a clock');
SELECT lives_ok($$SELECT app_private.apply_financial_reset_continuation(operation) FROM original_date_state$$,
 'normal generator replays the reviewed original business dates');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM original_date_state)),2::bigint,
 'only two positive reviewed leases are billed');
SELECT ok((SELECT bool_and(issue_date=DATE '2026-10-01' AND due_date=DATE '2026-10-07') FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM original_date_state)),
 'rebuilt invoices retain October 1 issue and October 7 due dates');
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE lease_id=pg_temp.original_date_id(2)),451.61::numeric,'October 14 end uses ordinary actual-day rent proration');
SELECT is((SELECT management_fee_amount FROM public.tenant_invoices WHERE lease_id=pg_temp.original_date_id(2)),45.16::numeric,'October 14 fee remains prorated at ten percent');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM original_date_state) AND lease_id IN
 (SELECT lease FROM original_date_contract_fixture WHERE n>=4)),'five September-ended leases remain unbilled');
SELECT ok((SELECT bool_and(created_at>=s.started_at AND generated_at>=s.started_at) FROM public.tenant_invoices CROSS JOIN original_date_state s WHERE organization_id=s.org),
 'invoice creation and generation timestamps record the real operation time');
SELECT ok((SELECT p.completed_at>=s.started_at AND o.audit_timestamp>=s.started_at AND o.created_at>=s.started_at
 FROM app_private.financial_reset_continuation_plans p JOIN original_date_state s ON s.operation=p.operation_id
 JOIN app_private.financial_reset_operations o ON o.operation_id=p.operation_id),'operation audit and completion timestamps are not backdated');
SELECT is((SELECT result_json->>'invoice_date_policy' FROM app_private.financial_reset_continuation_plans WHERE operation_id=(SELECT operation FROM original_date_state)),
 'original-reviewed-october','durable phase result labels the selected synthetic date policy');
SELECT is((SELECT result_json->'original_invoice_sources' FROM app_private.financial_reset_continuation_plans WHERE operation_id=(SELECT operation FROM original_date_state)),
 (SELECT value->'original_invoice_sources' FROM original_date_plan),'durable phase result retains exact original invoice provenance');
SELECT is((SELECT result_json->>'deferred_lease_count' FROM app_private.financial_reset_continuation_plans WHERE operation_id=(SELECT operation FROM original_date_state)),
 '5','all five deferred decisions remain visible');
SELECT lives_ok($$SELECT app_private.apply_financial_reset_reports(operation) FROM original_date_state$$,
 'report checkpoint accepts v3 deferred decisions without claiming complete billing');
SELECT is((SELECT result_json->>'billing_complete' FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=(SELECT operation FROM original_date_state)),
 'false','report result truthfully retains incomplete billing');
SELECT ok(EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c CROSS JOIN LATERAL jsonb_array_elements(c.result_json->'scopes') scope
 WHERE c.operation_id=(SELECT operation FROM original_date_state) AND scope->>'status'='blocked-deferred-lease' AND scope->'close_readiness'->>'is_ready'='false'),
 'deferred missing-rent blockers still prevent ordinary close readiness');
SELECT is((SELECT jsonb_build_object(
 'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leases l WHERE organization_id=s.org),
 'terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=s.org),
 'rules',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.lease_billing_terms b WHERE organization_id=s.org),
 'deposits',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.lease_deposits d WHERE organization_id=s.org)) FROM original_date_state s),
 (SELECT image FROM original_date_contracts),'all lease terms, due day 7, rules and contractual deposit requirements remain byte-identical');
SELECT is((SELECT to_jsonb(f) FROM public.financial_month_locks f WHERE id=pg_temp.original_date_id(9501)),(SELECT image FROM original_date_foreign),
 'real foreign organization financial sentinel stays byte-identical');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT org FROM original_date_state)),
 'frozen','synthetic option finishes frozen');
SELECT ok(NOT EXISTS(SELECT 1 FROM original_date_state s CROSS JOIN LATERAL jsonb_array_elements(app_private.financial_reset_recovery_candidates(s.operation)) r
 WHERE r->>'relation_name' IN ('public.leases','public.lease_terms','public.lease_billing_terms','public.lease_deposits')),
 'recovery candidates cannot prune unchanged contracts or deposits');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'original-date checkpoint satisfies deferred completion constraints');
\else
SELECT throws_ok($$SELECT pg_temp.prepare_original_dates(value) FROM original_date_plan$$,
 '23514','financial_reset_continuation_current_cutoff_month_required','October replay refuses execution outside the actual October business month');
SELECT skip('Original-date success path is eligible only during October 2026; no clock override is used.');
\endif
SELECT * FROM finish();
ROLLBACK;
