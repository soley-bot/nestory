\if :{?empty_books_single_admin}
\else
\set empty_books_single_admin false
\endif
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
  'execution_business_date',app_private.rent_business_date(o.organization_id,statement_timestamp()),'invoice_date_policy','empty-books-no-invoices',
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
CREATE FUNCTION pg_temp.empty_books_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('eb270056-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE empty_books_state AS SELECT
 pg_temp.empty_books_id(9001) AS maker,pg_temp.empty_books_id(9002) AS reviewer,
 CASE WHEN :'empty_books_single_admin'::boolean THEN '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid ELSE pg_temp.empty_books_id(9003) END AS org,pg_temp.empty_books_id(9004) AS property,
 pg_temp.empty_books_id(9005) AS tenant,pg_temp.empty_books_id(9006) AS owner,
 pg_temp.empty_books_id(700) AS operation,transaction_timestamp() AS started_at;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
SELECT person,'authenticated','authenticated','empty-books-'||extensions.gen_random_uuid()::text||'@test.invalid',
 '{"provider":"email","providers":["email"]}','{}'
FROM empty_books_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT md5(person::text||':reset-fixture')::uuid,person,now(),now(),'aal1'
FROM empty_books_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO public.organizations(id,name,slug,operational_timezone)
SELECT org,'Empty books synthetic option','empty-bookss-'||extensions.gen_random_uuid()::text,'UTC' FROM empty_books_state;
INSERT INTO public.organization_members(organization_id,user_id,role)
SELECT org,person,'super_admin' FROM empty_books_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure,status)
SELECT property,org,'Empty books property','ODP','apartment','multi_unit','active' FROM empty_books_state;
INSERT INTO public.people(id,organization_id,display_name,party_type)
SELECT person,org,label,kind FROM empty_books_state
CROSS JOIN LATERAL (VALUES(tenant,'Empty books tenant','individual'),(owner,'Empty books owner','company')) people(person,label,kind);
INSERT INTO public.person_contacts(id,organization_id,person_id,contact_name)
SELECT pg_temp.empty_books_id(9007),org,tenant,'Preserved contact' FROM empty_books_state;
INSERT INTO public.person_roles(organization_id,person_id,role)
SELECT org,person,kind FROM empty_books_state CROSS JOIN LATERAL (VALUES(tenant,'tenant'),(owner,'owner')) roles(person,kind);
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_label,ownership_percent,is_primary,started_on,created_by,updated_by)
SELECT org,property,owner,'Primary owner',100,true,'2025-01-01',maker,maker FROM empty_books_state;
-- Historical identities are retained; no role assignment or unarchiving is
-- permitted merely to manufacture the reset's zero opening authority.
INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure,status)
SELECT pg_temp.empty_books_id(9010),org,'Archived empty books property','ODA','apartment','multi_unit','active' FROM empty_books_state;
INSERT INTO public.people(id,organization_id,display_name,party_type)
SELECT pg_temp.empty_books_id(9011),org,'Archived empty books owner','company' FROM empty_books_state;
INSERT INTO public.person_roles(organization_id,person_id,role)
SELECT org,pg_temp.empty_books_id(9011),'owner' FROM empty_books_state;
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_label,ownership_percent,is_primary,started_on,created_by,updated_by)
SELECT org,pg_temp.empty_books_id(9010),pg_temp.empty_books_id(9011),'Historical owner',100,true,'2025-01-01',maker,maker FROM empty_books_state;
UPDATE public.properties SET archived_at=clock_timestamp(),archived_by=(SELECT maker FROM empty_books_state) WHERE id=pg_temp.empty_books_id(9010);
SELECT pg_temp.reset_fixture_claims(maker) FROM empty_books_state;
SELECT public.archive_person(org,pg_temp.empty_books_id(9011)) FROM empty_books_state;
SELECT throws_ok($$SELECT * FROM app_private.financial_reset_zero_roster_on_date((SELECT org FROM empty_books_state),pg_temp.empty_books_id(9010),'2026-10-01')$$,
 '23514','owner_person_inactive','legacy reset roster still rejects an archived owner');
SELECT throws_ok($$SELECT * FROM app_private.validate_owner_roster_on_date((SELECT org FROM empty_books_state),pg_temp.empty_books_id(9010),'2026-10-01')$$,
 '23503','owner_roster_property_not_found','ordinary owner roster still rejects an archived property');
SELECT throws_ok($$SELECT * FROM app_private.financial_reset_empty_command_roster_on_date((SELECT org FROM empty_books_state),pg_temp.empty_books_id(9010),'2026-10-01')$$,
 '23503','owner_roster_property_not_found','historical command path requires the consumed exact transaction context');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_submit_opening((SELECT org FROM empty_books_state),pg_temp.empty_books_id(9010),pg_temp.empty_books_id(9011),
 'USD','2026-10-01',(enum_range(NULL::public.owner_balance_component))[1],0,'Synthetic context denial','synthetic',NULL,NULL,NULL,'synthetic-no-context')$$,
 '42501','financial_reset_zero_command_context_required','direct scoped submit cannot admit a historical owner without the native command context');
SELECT is((SELECT count(*) FROM app_private.financial_reset_empty_zero_roster_on_date((SELECT org FROM empty_books_state),pg_temp.empty_books_id(9010),'2026-10-01')),1::bigint,
 'private v4 preparation reader retains a complete historical owner roster');
SAVEPOINT active_property_archived_owner;
UPDATE public.properties SET archived_at=NULL,archived_by=NULL WHERE id=pg_temp.empty_books_id(9010);
SELECT throws_ok($$SELECT * FROM app_private.financial_reset_empty_zero_roster_on_date((SELECT org FROM empty_books_state),pg_temp.empty_books_id(9010),'2026-10-01')$$,
 '23514','owner_person_inactive','v4 still rejects archived owners of active properties');
ROLLBACK TO SAVEPOINT active_property_archived_owner;
SAVEPOINT inactive_owner_role;
UPDATE public.person_roles SET status='inactive' WHERE person_id=pg_temp.empty_books_id(9011) AND role='owner';
SELECT throws_ok($$SELECT * FROM app_private.financial_reset_empty_zero_roster_on_date((SELECT org FROM empty_books_state),pg_temp.empty_books_id(9010),'2026-10-01')$$,
 '23514','owner_person_inactive','v4 still requires an active owner role for historical identities');
ROLLBACK TO SAVEPOINT inactive_owner_role;
CREATE FUNCTION pg_temp.contract_review(p_org uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('version',4,'actor_id',(SELECT maker FROM empty_books_state),'billing_period_start','2026-10-01',
  'issue_date','2026-10-01','execution_business_date','2026-10-27','invoice_date_policy','empty-books-no-invoices',
  'contracts_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(p_org)),
  'leases',(SELECT coalesce(jsonb_agg(jsonb_build_object('lease_id',l.id,'disposition','preserve-unbilled',
   'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_lease_source(p_org,l.id))) ORDER BY l.id),'[]')
   FROM public.leases l WHERE l.organization_id=p_org))
$$;
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,pg_temp.contract_review(org)) FROM empty_books_state$$,
 'fresh complete contract assertion accepts an empty lease roster');
CREATE TEMP TABLE empty_books_contract_fixture AS
SELECT n,pg_temp.empty_books_id(n) AS lease,pg_temp.empty_books_id(100+n) AS term,
 pg_temp.empty_books_id(200+n) AS rule,pg_temp.empty_books_id(300+n) AS unit,
 CASE n WHEN 1 THEN 400 WHEN 2 THEN 1000 WHEN 3 THEN 0 ELSE 600 END::numeric AS rent,
 CASE WHEN n>=4 THEN DATE '2026-09-30' WHEN n=2 THEN DATE '2026-10-14' ELSE DATE '2027-08-31' END AS ends_on
FROM generate_series(1,8) n;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
SELECT unit,org,property,'OD-'||n,'vacant',rent,'USD' FROM empty_books_contract_fixture CROSS JOIN empty_books_state;
SELECT pg_temp.reset_fixture_claims(maker) FROM empty_books_state;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by,archived_at,archived_by)
SELECT lease,org,property,unit,tenant,CASE WHEN n>=7 THEN 'ended' ELSE 'active' END,1234.56,'USD',maker,maker,
 CASE WHEN n=8 THEN clock_timestamp() ELSE NULL END,CASE WHEN n=8 THEN maker ELSE NULL END
 FROM empty_books_contract_fixture CROSS JOIN empty_books_state WHERE n=1;
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,pg_temp.contract_review(org)) FROM empty_books_state$$,
 'one lease with no terms or billing rules matches the independent native source');
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by,archived_at,archived_by)
SELECT lease,org,property,unit,tenant,CASE WHEN n>=7 THEN 'ended' ELSE 'active' END,1234.56,'USD',maker,maker,
 CASE WHEN n=8 THEN clock_timestamp() ELSE NULL END,CASE WHEN n=8 THEN maker ELSE NULL END
 FROM empty_books_contract_fixture CROSS JOIN empty_books_state WHERE n>1;
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,pg_temp.contract_review(org)) FROM empty_books_state$$,
 'one-image contract assertion matches the independent per-lease source with no child rows');
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,
 payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
-- Draft authoritative terms cannot generate rent until their normal activation.
SELECT term,org,lease,1,'2026-09-01',ends_on,rent,'USD',7,'monthly','draft','authoritative',now(),maker,maker,maker
FROM empty_books_contract_fixture CROSS JOIN empty_books_state;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,
 management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
 billing_recipient_kind,billing_recipient_person_id,rent_calculation_timezone,short_month_due_day_rule,
 lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT rule,org,lease,property,'2026-09-01',ends_on,'through_ips','percentage',10,n=2,false,'individual',tenant,
 'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),maker,maker,maker
FROM empty_books_contract_fixture CROSS JOIN empty_books_state;
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,pg_temp.contract_review(org)) FROM empty_books_state$$,
 'complete native row images preserve null fields and fractional numeric contract values');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,jsonb_set(pg_temp.contract_review(org),'{leases,0,source_sha256}',to_jsonb(repeat('f',64)))) FROM empty_books_state$$,
 '40001','financial_reset_empty_contracts_changed','a matching global digest never substitutes for every per-lease digest');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,jsonb_set(pg_temp.contract_review(org),'{leases}',(pg_temp.contract_review(org)->'leases')-0)) FROM empty_books_state$$,
 '23514','financial_reset_continuation_roster_mismatch','omitted contracts still fail the complete roster check');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,jsonb_set(pg_temp.contract_review(org),'{contracts_sha256}',to_jsonb(repeat('f',64)))) FROM empty_books_state$$,
 '40001','financial_reset_empty_contracts_changed','per-lease digests never replace the full global image digest');
SAVEPOINT contract_assertion_drift;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,
 payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
SELECT pg_temp.empty_books_id(50+n),org,pg_temp.empty_books_id(1),2+n,
 DATE '2027-09-01'+(n||' years')::interval,DATE '2028-08-31'+(n||' years')::interval,432.10,'USD',7,'monthly','draft','authoritative',now(),maker,maker,maker
 FROM empty_books_state CROSS JOIN generate_series(0,1) n ORDER BY n DESC;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,
 management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
 billing_recipient_kind,billing_recipient_person_id,rent_calculation_timezone,short_month_due_day_rule,
 lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
SELECT pg_temp.empty_books_id(1050+n),org,pg_temp.empty_books_id(1),property,
 DATE '2027-09-01'+(n||' years')::interval,DATE '2028-08-31'+(n||' years')::interval,
 'through_ips','percentage',7.25,false,false,'individual',tenant,'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),maker,maker,maker
 FROM empty_books_state CROSS JOIN generate_series(0,1) n ORDER BY n DESC;
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,pg_temp.contract_review(org)) FROM empty_books_state$$,
 'grouped history hashes match the original native reader for multiple reverse-inserted child UUIDs');
CREATE TEMP TABLE contract_review_before AS SELECT org,pg_temp.contract_review(org) review FROM empty_books_state;
UPDATE public.lease_terms SET rent_amount=1234.56 WHERE id=pg_temp.empty_books_id(101);
SELECT throws_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,review) FROM contract_review_before$$,
 '40001','financial_reset_empty_contracts_changed','a changed child amount invalidates the captured global image');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,jsonb_set(review,'{contracts_sha256}',to_jsonb(app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(org))))) FROM contract_review_before$$,
 '40001','financial_reset_empty_contracts_changed','refreshing only the global image cannot hide a changed per-lease history');
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_contracts(org,pg_temp.contract_review(org)) FROM empty_books_state$$,
 'fresh per-lease hashes agree exactly after a valid fractional amount change');
ROLLBACK TO SAVEPOINT contract_assertion_drift;
SAVEPOINT ordinary_opening_self_review;
SELECT pg_temp.reset_fixture_claims(maker) FROM empty_books_state;
SELECT public.submit_owner_opening_balance(org,property,owner,'USD','2026-10-01',
 (enum_range(NULL::public.owner_balance_component))[1],0,'Ordinary synthetic opening','Ordinary synthetic evidence',NULL,repeat('a',64),NULL,'ordinary-self-review-probe') FROM empty_books_state;
SELECT throws_ok($$SELECT public.review_owner_opening_balance(s.org,r.id,'approve','Ordinary review','ordinary-self-review-denied')
 FROM empty_books_state s JOIN public.owner_opening_balance_requests r ON r.organization_id=s.org$$,
 '22023','Owner opening submitter cannot review the same request','ordinary public opening RPC retains independent review even for the selected sole administrator');
ROLLBACK TO SAVEPOINT ordinary_opening_self_review;
INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,notes,created_by,updated_by)
SELECT pg_temp.empty_books_id(400+n),org,lease,1234.56,'USD','pending','Contract requirement is unchanged',maker,maker
FROM empty_books_contract_fixture CROSS JOIN empty_books_state;
-- The ordinary generator retains its execution-date due-date floor. Its probe
-- is separate from the hosted reset and all generated effects are rolled back.
SAVEPOINT ordinary_execution_date_probe;
UPDATE public.lease_terms SET status='active' WHERE id IN (SELECT term FROM empty_books_contract_fixture WHERE n IN (1,2));
SELECT lives_ok($$SELECT app_private.generate_simple_lease_rent_invoice(org,lease,'2026-10-01',
 app_private.rent_business_date(org,statement_timestamp()),'activation_catch_up',maker,rule)
 FROM empty_books_contract_fixture CROSS JOIN empty_books_state WHERE n IN (1,2)$$,
 'ordinary execution-date generator creates both positive-rent invoices');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM empty_books_state)),2::bigint,
 'ordinary execution-date alternative generates both invoices');
SELECT ok((SELECT bool_and(issue_date=app_private.rent_business_date(org,statement_timestamp())
 AND due_date=greatest(DATE '2026-10-07',app_private.rent_business_date(org,statement_timestamp())))
 FROM public.tenant_invoices CROSS JOIN empty_books_state WHERE organization_id=org),
 'ordinary execution-date generator retains the actual issue date and due-date floor');
ROLLBACK TO SAVEPOINT ordinary_execution_date_probe;
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM empty_books_state)),0::bigint,
 'ordinary execution-date probe was fully rolled back');

-- The normal generator runs in RETURNING before queued AFTER catch-up triggers.
-- It creates real income, invoice, rent-line and fee sources with original
-- reviewed business dates and current audit timestamps. No context is forged.
CREATE TEMP TABLE empty_books_generated AS
WITH generated AS (
 UPDATE public.lease_terms t SET status='active'
 FROM empty_books_contract_fixture f CROSS JOIN empty_books_state s
 WHERE t.id=f.term AND f.n IN (1,2)
 RETURNING f.n,app_private.generate_simple_lease_rent_invoice(s.org,f.lease,'2026-10-01','2026-10-01',
  'activation_catch_up',s.maker,f.rule) AS invoice_id
) SELECT * FROM generated;
UPDATE public.lease_terms SET status='active' WHERE id IN (SELECT term FROM empty_books_contract_fixture WHERE n>=3);
SELECT ok((SELECT bool_and(i.issue_date=DATE '2026-10-01' AND i.due_date=DATE '2026-10-07')
 FROM empty_books_generated g JOIN public.tenant_invoices i ON i.id=g.invoice_id),
 'normal-trigger source setup generated the reviewed original invoice dates');
SELECT is(current_setting('session_replication_role'),'origin','all checked operations run with normal triggers');

INSERT INTO public.organizations(id,name,slug)
SELECT pg_temp.empty_books_id(9500+n*10),'Foreign empty-books sentinel','foreign-empty-'||extensions.gen_random_uuid()::text FROM generate_series(0,3) n;
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
SELECT pg_temp.empty_books_id(9501+n*10),pg_temp.empty_books_id(9500+n*10),'2026-10-01',maker,'Unrelated organization must stay exact'
 FROM empty_books_state CROSS JOIN generate_series(0,3) n;
CREATE TEMP TABLE empty_books_foreign AS SELECT jsonb_agg(to_jsonb(f) ORDER BY id) AS image FROM public.financial_month_locks f
 WHERE id IN (SELECT pg_temp.empty_books_id(9501+n*10) FROM generate_series(0,3) n);
CREATE TEMP TABLE empty_books_masters AS SELECT jsonb_build_object(
 'properties',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.properties p WHERE organization_id=s.org),
 'units',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.units u WHERE organization_id=s.org),
 'people',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.people p WHERE organization_id=s.org)) AS image FROM empty_books_state s;
CREATE TEMP TABLE empty_books_contracts AS SELECT jsonb_build_object(
 'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leases l WHERE organization_id=s.org),
 'terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=s.org),
 'rules',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.lease_billing_terms b WHERE organization_id=s.org),
 'deposits',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.lease_deposits d WHERE organization_id=s.org)) AS image FROM empty_books_state s;
CREATE TEMP TABLE empty_books_archive AS
SELECT relation_name,image,app_private.financial_reset_primary_key(relation_name::regclass,image) AS pk,
 app_private.financial_reset_hash(image) AS hash,row_number() OVER(ORDER BY priority,image->>'id')::integer AS ordinal
FROM (
 SELECT 'public.owner_invoice_lines'::text AS relation_name,to_jsonb(t) AS image,1 AS priority
 FROM public.owner_invoice_lines t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.owner_invoices',to_jsonb(t),2
 FROM public.owner_invoices t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.management_fee_occurrences',to_jsonb(t),3
 FROM public.management_fee_occurrences t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.tenant_invoice_rent_segments',to_jsonb(t),4
 FROM public.tenant_invoice_rent_segments t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.tenant_invoice_lines',to_jsonb(t),5
 FROM public.tenant_invoice_lines t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.rent_generation_exceptions',to_jsonb(t),6
 FROM public.rent_generation_exceptions t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.tenant_invoices',to_jsonb(t),7
 FROM public.tenant_invoices t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
 UNION ALL SELECT 'public.finance_income_items',to_jsonb(t),8
 FROM public.finance_income_items t CROSS JOIN empty_books_state s WHERE t.organization_id=s.org
) fixture_rows;
CREATE TEMP TABLE empty_books_actions AS SELECT jsonb_agg(jsonb_build_object('action_id',pg_temp.empty_books_id(600+ordinal),
 'ordinal',ordinal,'relation_name',relation_name,'primary_key',pk,'kind','archive-delete',
 'before_row_text',image::text,'before_sha256',hash,'after_row_text',NULL,'after_sha256',NULL) ORDER BY ordinal) AS value FROM empty_books_archive;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
SELECT org,1,'frozen','2026-10-01' FROM empty_books_state;
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id',operation,'organization_id',org,
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,'manifest_sha256',repeat('a',64),
 'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_count',(SELECT count(*) FROM empty_books_archive),'action_count',(SELECT count(*) FROM empty_books_archive),
 'audit_timestamp',clock_timestamp(),'audit_actor',maker,
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,'row_sha256',hash)
  ORDER BY relation_name,pk::text)) FROM empty_books_archive),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
  FROM empty_books_actions CROSS JOIN LATERAL jsonb_array_elements(value) a))) FROM empty_books_state;
SELECT app_private.archive_financial_reset_rows(operation,(SELECT jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,
 'row_text',image::text,'row_sha256',hash) ORDER BY ordinal) FROM empty_books_archive)) FROM empty_books_state;
SELECT app_private.prepare_financial_reset_actions(operation,value) FROM empty_books_state CROSS JOIN empty_books_actions;
CREATE TEMP TABLE empty_books_zero_review AS SELECT operation,jsonb_build_object('version',4,'operation_id',operation,'organization_id',org,'manifest_sha256',repeat('a',64),
 'reset_plan_sha256',repeat('b',64),'maker_actor_id',maker,'reviewer_actor_id',reviewer,'effective_date','2026-10-01','currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_empty_zero_scope_on_date(org,'2026-10-01'))||CASE WHEN :'empty_books_single_admin'::boolean THEN jsonb_build_object('approval_policy','pilot-october-single-admin-v1','reviewer_actor_id',NULL) ELSE '{}'::jsonb END AS value FROM empty_books_state;
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_empty_zero_plan(operation,value-'version',app_private.financial_reset_hash(value-'version')) FROM empty_books_zero_review$$,
 '23514','financial_reset_zero_review_scope_invalid','historical preparation requires the explicit reviewed version4 marker');
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_empty_zero_plan(operation,jsonb_set(value,'{scopes,0,owner_person_row_sha256}',to_jsonb(repeat('d',64))),
 app_private.financial_reset_hash(jsonb_set(value,'{scopes,0,owner_person_row_sha256}',to_jsonb(repeat('d',64))))) FROM empty_books_zero_review$$,
 '23514','financial_reset_zero_review_scope_invalid','zero review binds exact person row bytes as well as property and ownership roster');
\if :empty_books_single_admin
SELECT is(app_private.financial_reset_single_admin_mode(pg_temp.empty_books_id(9999)),false,'unknown operation does not acquire single-admin policy');
SELECT is((SELECT app_private.financial_reset_single_admin_mode(operation) FROM empty_books_state),false,'prepared operation without a zero plan does not acquire policy');
CREATE FUNCTION pg_temp.prepare_single(p jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_empty_zero_plan((SELECT operation FROM empty_books_state),p,app_private.financial_reset_hash(p))
$$;
SELECT throws_ok($$SELECT pg_temp.prepare_single(value-'approval_policy') FROM empty_books_zero_review$$,
 '42501','financial_reset_zero_independent_actors_required','unmarked v4 still requires two distinct actors');
SELECT throws_ok($$SELECT pg_temp.prepare_single(value-'reviewer_actor_id') FROM empty_books_zero_review$$,
 '23514','financial_reset_zero_review_scope_invalid','single policy requires explicit JSON null reviewer');
SELECT throws_ok($$SELECT pg_temp.prepare_single(jsonb_set(value,'{maker_actor_id}','null')) FROM empty_books_zero_review$$,
 '23514','financial_reset_single_admin_policy_invalid','NULL sole actor is never an approval identity');
SELECT throws_ok($$SELECT pg_temp.prepare_single(jsonb_set(value,'{reviewer_actor_id}',to_jsonb((SELECT reviewer FROM empty_books_state)))) FROM empty_books_zero_review$$,
 '23514','financial_reset_single_admin_policy_invalid','single policy cannot fabricate a second reviewer');
SELECT throws_ok($$SELECT pg_temp.prepare_single(jsonb_set(value,'{approval_policy}','"unknown"')) FROM empty_books_zero_review$$,
 '23514','financial_reset_single_admin_policy_invalid','unknown approval policy is rejected');
SELECT throws_ok($$SELECT app_private.financial_reset_single_admin_mode(operation,jsonb_set(value,'{organization_id}',to_jsonb(pg_temp.empty_books_id(9003)))) FROM empty_books_zero_review$$,
 '23514','financial_reset_single_admin_policy_invalid','single policy is fixed to the Pilot organization');
SELECT throws_ok($$SELECT app_private.financial_reset_single_admin_mode(operation,jsonb_set(value,'{effective_date}','"2026-11-01"')) FROM empty_books_zero_review$$,
 '23514','financial_reset_single_admin_policy_invalid','single policy is fixed to the October cutoff');
\endif
SELECT app_private.prepare_financial_reset_zero_plan(operation,value,app_private.financial_reset_hash(value)) FROM empty_books_zero_review;
\if :empty_books_single_admin
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement(operation,'maker') FROM empty_books_state$$,
 '42501','financial_reset_zero_session_endorsement_required','naming the maker never substitutes for genuine endorsement');
SELECT ok((SELECT i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND a.attname='organization_id'
 AND pg_get_expr(i.indpred,i.indrelid) = '((plan_json ->> ''approval_policy''::text) = ''pilot-october-single-admin-v1''::text)'
 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
 WHERE i.indexrelid='app_private.financial_reset_single_admin_once'::regclass),
 'actual one-off index is valid and unique for organization under only the marked policy');
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_operation((to_jsonb(o)-ARRAY['database_oid','database_name','status','execution_backend','execution_xid','created_at','completed_at'])||jsonb_build_object('operation_id',pg_temp.empty_books_id(701)))
 FROM app_private.financial_reset_operations o JOIN empty_books_state s ON o.operation_id=s.operation$$,
 '23505',NULL,'native one-pending lifecycle rejects a competing operation before the policy reservation');
\endif
SELECT pg_temp.reset_fixture_claims(maker) FROM empty_books_state;
SELECT set_config('empty_books.operation',operation::text,true),set_config('empty_books.zero_review',review_sha256,true)
FROM empty_books_state JOIN app_private.financial_reset_zero_plans ON operation_id=operation;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan(current_setting('empty_books.operation')::uuid,current_setting('empty_books.zero_review'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.reset_fixture_claims(reviewer) FROM empty_books_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
\if :empty_books_single_admin
SELECT throws_ok($$SELECT public.approve_financial_reset_zero_plan(current_setting('empty_books.operation')::uuid,current_setting('empty_books.zero_review'))$$,
 '42501','financial_reset_zero_approval_forbidden','another genuine administrator cannot approve the pinned sole-maker plan');
\else
SELECT public.approve_financial_reset_zero_plan(current_setting('empty_books.operation')::uuid,current_setting('empty_books.zero_review'));
\endif
RESET ROLE;
RESET SESSION AUTHORIZATION;
\if :empty_books_single_admin
SELECT is((SELECT count(*) FROM app_private.financial_reset_zero_approvals WHERE operation_id=(SELECT operation FROM empty_books_state)),1::bigint,'exactly one real approval is recorded');
SELECT is((SELECT count(*) FROM app_private.financial_reset_zero_session_endorsements WHERE operation_id=(SELECT operation FROM empty_books_state)),1::bigint,'exactly one session endorsement is recorded');
SELECT is((SELECT app_private.financial_reset_zero_endorsement_status(operation,'reviewer')->>'status' FROM empty_books_state),'missing','reviewer evidence remains explicitly missing');
SAVEPOINT single_admin_stale_session;
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE user_id=(SELECT maker FROM empty_books_state);
SELECT throws_ok($$SELECT app_private.assert_financial_reset_zero_endorsement(operation,'maker') FROM empty_books_state$$,
 '42501','financial_reset_zero_session_endorsement_stale','expired sole-maker session cannot authorize zero commands');
ROLLBACK TO SAVEPOINT single_admin_stale_session;
\endif
SELECT app_private.seal_financial_reset_operation(operation) FROM empty_books_state;
SELECT app_private.start_financial_reset_actions(operation) FROM empty_books_state;
-- The exact-action invoker guards require the native executor's existing role.
SET LOCAL ROLE postgres;
DO $$ DECLARE a record; BEGIN
 FOR a IN SELECT * FROM app_private.financial_reset_actions
  WHERE operation_id='eb270056-0000-4000-8000-000000000700' ORDER BY ordinal LOOP
  PERFORM app_private.arm_financial_reset_action(a.operation_id,a.action_id);
  EXECUTE format('DELETE FROM %s WHERE id=$1',a.relation_oid::regclass) USING (a.primary_key->>'id')::uuid;
 END LOOP;
END $$;
RESET ROLE;
SELECT app_private.complete_financial_reset_actions(operation) FROM empty_books_state;
\if :empty_books_single_admin
SAVEPOINT second_single_reservation;
SELECT app_private.prepare_financial_reset_operation((to_jsonb(o)-ARRAY['database_oid','database_name','status','execution_backend','execution_xid','created_at','completed_at'])||jsonb_build_object('operation_id',pg_temp.empty_books_id(701)))
 FROM app_private.financial_reset_operations o JOIN empty_books_state s ON o.operation_id=s.operation;
SELECT throws_ok($$SELECT app_private.prepare_financial_reset_empty_zero_plan(pg_temp.empty_books_id(701),jsonb_set(value,'{operation_id}',to_jsonb(pg_temp.empty_books_id(701))),
 app_private.financial_reset_hash(jsonb_set(value,'{operation_id}',to_jsonb(pg_temp.empty_books_id(701))))) FROM empty_books_zero_review$$,
 '23505',NULL,'actual one-off reservation rejects a second marked operation after the pending lifecycle has completed');
ROLLBACK TO SAVEPOINT second_single_reservation;
SAVEPOINT single_generation_scope;
UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id=(SELECT org FROM empty_books_state);
SELECT app_private.prepare_financial_reset_operation((to_jsonb(o)-ARRAY['database_oid','database_name','status','execution_backend','execution_xid','created_at','completed_at'])||jsonb_build_object('operation_id',pg_temp.empty_books_id(702),'source_generation',1,'target_generation',2))
 FROM app_private.financial_reset_operations o JOIN empty_books_state s ON o.operation_id=s.operation;
SELECT throws_ok($$SELECT app_private.financial_reset_single_admin_mode(pg_temp.empty_books_id(702),jsonb_set(value,'{operation_id}',to_jsonb(pg_temp.empty_books_id(702)))) FROM empty_books_zero_review$$,
 '23514','financial_reset_single_admin_policy_invalid','later generation reset cannot acquire the one-off single policy');
ROLLBACK TO SAVEPOINT single_generation_scope;
SAVEPOINT single_recovery_scope;
UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id=(SELECT org FROM empty_books_state);
SELECT app_private.prepare_financial_reset_operation((to_jsonb(o)-ARRAY['database_oid','database_name','status','execution_backend','execution_xid','created_at','completed_at'])||jsonb_build_object('operation_id',pg_temp.empty_books_id(703),'operation_kind','restore','restore_of',o.operation_id,'source_generation',1,'target_generation',2))
 FROM app_private.financial_reset_operations o JOIN empty_books_state s ON o.operation_id=s.operation;
SELECT is(app_private.financial_reset_single_admin_mode(pg_temp.empty_books_id(703)),false,'genuine prepared recovery with no zero plan remains outside single-admin policy');
SELECT throws_ok($$SELECT app_private.financial_reset_single_admin_mode(pg_temp.empty_books_id(703),jsonb_set(value,'{operation_id}',to_jsonb(pg_temp.empty_books_id(703)))) FROM empty_books_zero_review$$,
 '23514','financial_reset_single_admin_policy_invalid','recovery cannot acquire the marked reset policy');
ROLLBACK TO SAVEPOINT single_recovery_scope;
\endif
CREATE TEMP TABLE empty_books_plan AS SELECT jsonb_build_object('version',4,'actor_id',maker,'billing_period_start','2026-10-01',
 'issue_date','2026-10-01','execution_business_date',CASE WHEN date_trunc('month',app_private.rent_business_date(org,statement_timestamp()))::date=DATE '2026-10-01'
  THEN app_private.rent_business_date(org,statement_timestamp()) ELSE DATE '2026-10-01' END,
 'invoice_date_policy','empty-books-no-invoices','source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(org)),
 'contracts_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(org)),
 'leases',(SELECT coalesce(jsonb_agg(jsonb_build_object('lease_id',l.id,'disposition','preserve-unbilled',
  'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_lease_source(org,l.id))) ORDER BY l.id),'[]')
  FROM public.leases l WHERE organization_id=org)) AS value FROM empty_books_state;
-- Current known-zero authority requires the consumed genuine-session adapter;
-- request claims alone must not turn this new review into a privileged reset.
SELECT pg_temp.reset_fixture_claims(maker) FROM empty_books_state;
SELECT throws_ok($$SELECT app_private.apply_financial_reset_known_zero(operation) FROM empty_books_state$$,
 '42501','financial_reset_claim_free_operator_required','raw claims cannot bypass the existing consumed-session zero authority');
INSERT INTO reset_operator_fixture(binding)
SELECT jsonb_set(pg_temp.reset_fixture_binding(operation,value-'source_sha256'),'{execution_business_date}',value->'execution_business_date')
 FROM empty_books_state CROSS JOIN empty_books_plan;
SELECT pg_temp.reset_fixture_claims(maker) FROM empty_books_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE reset_operator_fixture SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM reset_operator_fixture;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT app_private.apply_financial_reset_known_zero(operation) FROM empty_books_state;
\if :empty_books_single_admin
SELECT ok((SELECT count(*)>0 AND bool_and(r.submitted_by=s.maker AND r.reviewed_by=s.maker AND r.proposed_amount=0
 AND r.source_reference=app_private.financial_reset_zero_source_reference(s.operation)) FROM public.owner_opening_balance_requests r JOIN empty_books_state s ON s.org=r.organization_id),
 'marked known-zero records truthfully name the sole actor as submitter and reviewer');
SELECT ok(NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_command_context WHERE backend_pid=pg_backend_pid()),'private command context is closed after known zero');
CREATE FUNCTION pg_temp.single_row_check(p_image jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE expression text; allowed boolean;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT expression FROM pg_constraint WHERE conrelid='public.owner_opening_balance_requests'::regclass AND conname='owner_opening_balance_requests_independent_reviewer_check';
 EXECUTE format('SELECT (%s) IS TRUE FROM jsonb_populate_record(NULL::public.owner_opening_balance_requests,$1)',expression) INTO allowed USING p_image;
 RETURN allowed;
END;
$$;
SELECT ok((SELECT bool_and(pg_temp.single_row_check(to_jsonb(r))) FROM public.owner_opening_balance_requests r JOIN empty_books_state s ON s.org=r.organization_id),
 'saved self-review rows remain valid under the row-local CHECK without active command context');
SELECT ok((SELECT bool_and(NOT pg_temp.single_row_check(to_jsonb(r)||jsonb_build_object('source_reference',NULL))) FROM public.owner_opening_balance_requests r JOIN empty_books_state s ON s.org=r.organization_id),
 'NULL marker cannot turn the row CHECK into an allowed UNKNOWN result');
SELECT ok((SELECT bool_and(NOT pg_temp.single_row_check(to_jsonb(r)||jsonb_build_object('proposed_amount',1))) FROM public.owner_opening_balance_requests r JOIN empty_books_state s ON s.org=r.organization_id),
 'nonzero self-review rows remain forbidden by the physical CHECK');
SELECT throws_ok($$INSERT INTO public.owner_opening_balance_requests SELECT (jsonb_populate_record(NULL::public.owner_opening_balance_requests,to_jsonb(r)||jsonb_build_object('id',pg_temp.empty_books_id(9998)))).*
 FROM public.owner_opening_balance_requests r JOIN empty_books_state s ON s.org=r.organization_id LIMIT 1$$,
 '42501','financial_reset_single_admin_command_required','a forged marked row cannot be inserted outside consumed native command context');
\endif
SELECT ok((SELECT count(*)=4 AND bool_and(proposed_amount=0 AND status='approved') FROM public.owner_opening_balance_requests WHERE property_id=pg_temp.empty_books_id(9010)),
 'consumed v4 session authorizes only four checked zero components for the archived property');
SELECT ok((SELECT archived_at IS NOT NULL FROM public.people WHERE id=pg_temp.empty_books_id(9011)) AND
 (SELECT archived_at IS NOT NULL FROM public.properties WHERE id=pg_temp.empty_books_id(9010)),
 'known zero leaves the historical property and owner archived');
UPDATE empty_books_plan SET value=jsonb_set(value,'{source_sha256}',to_jsonb(app_private.financial_reset_hash(
 app_private.financial_reset_continuation_snapshot((SELECT org FROM empty_books_state)))));
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
CREATE FUNCTION pg_temp.prepare_empty_books(p_plan jsonb) RETURNS void LANGUAGE sql AS $$
 SELECT app_private.prepare_financial_reset_continuation((SELECT operation FROM empty_books_state),p_plan,app_private.financial_reset_hash(p_plan))
$$;

SELECT ok(NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) roles(name)
 CROSS JOIN (VALUES('app_private.prepare_financial_reset_empty_continuation(uuid,jsonb,text)'),
  ('app_private.apply_financial_reset_empty_continuation(uuid)'),('app_private.assert_financial_reset_empty_plan(uuid,jsonb)'),
  ('app_private.financial_reset_preserved_contracts(uuid)'),('app_private.financial_reset_preserved_lease_source(uuid,uuid)'),
  ('app_private.financial_reset_empty_zero_roster_on_date(uuid,uuid,date)'),('app_private.financial_reset_empty_zero_scope_on_date(uuid,date)'),
  ('app_private.prepare_financial_reset_empty_zero_plan(uuid,jsonb,text)'),('app_private.assert_financial_reset_empty_zero_operator(uuid)'),
  ('app_private.financial_reset_reviewed_zero_roster_on_date(uuid,uuid,uuid,date)'),('app_private.financial_reset_empty_command_roster_on_date(uuid,uuid,date)')) f(signature)
 WHERE has_function_privilege(name,signature,'EXECUTE')),'empty-books helpers expose no application reset or private snapshot access');
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_semantic((value-'source_sha256')||jsonb_build_object('leases','[]'::jsonb)) FROM empty_books_plan$$,
 'empty semantic roster is structurally allowed; source verification still requires every actual lease');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_empty_semantic((value-'source_sha256')||jsonb_build_object('original_invoice_sources','[]'::jsonb)) FROM empty_books_plan$$,
 '23514','financial_reset_empty_review_invalid','empty mode cannot carry invoice replay sources');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(jsonb_set(binding,'{invoice_date_policy}','"original-reviewed-october"'),'execute') FROM reset_operator_fixture$$,
 '22023','financial_reset_actor_binding_invalid','v4 cannot be bound under the old invoice policy');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_actor_binding(jsonb_set(binding,'{version}','2'),'execute') FROM reset_operator_fixture$$,
 '22023','financial_reset_actor_binding_invalid','empty mode does not infer a no-backup waiver');
SELECT throws_ok($$SELECT app_private.assert_financial_reset_reopening_ready(binding,'{}') FROM reset_operator_fixture$$,
 '55000','financial_reset_empty_restart_review_required','the empty-books review never authorizes reopening or automatic billing');

SELECT date_trunc('month',app_private.rent_business_date(org,statement_timestamp()))::date=DATE '2026-10-01' AS empty_month FROM empty_books_state \gset
\if :empty_month
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{leases,0,disposition}','"bill"')) FROM empty_books_plan$$,
 '23514','financial_reset_empty_lease_invalid','a reviewed empty-books lease cannot generate an invoice');
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{leases,0,continue_month_to_month}','true')) FROM empty_books_plan$$,
 '23514','financial_reset_empty_lease_invalid','empty books cannot change or extend a contract');
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{leases}',(value->'leases')-7)) FROM empty_books_plan$$,
 '23514','financial_reset_continuation_roster_mismatch','the complete organization lease roster includes archived terminal contracts');
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{leases,1}',value->'leases'->0)) FROM empty_books_plan$$,
 '23514','financial_reset_continuation_duplicate_lease','duplicate lease decisions are rejected');
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{contracts_sha256}',to_jsonb(repeat('d',64)))) FROM empty_books_plan$$,
 '40001','financial_reset_empty_contracts_changed','full contract history hash must match the reviewed source');
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{leases,0,source_sha256}',to_jsonb(repeat('d',64)))) FROM empty_books_plan$$,
 '40001','financial_reset_empty_contracts_changed','individual lease and term history hash must match');
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{source_sha256}',to_jsonb(repeat('d',64)))) FROM empty_books_plan$$,
 '40001','financial_reset_continuation_source_changed','a stale post-zero source cannot prepare a no-op phase');
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(jsonb_set(value,'{actor_id}',to_jsonb((SELECT reviewer::text FROM empty_books_state)))) FROM empty_books_plan$$,
 '42501','financial_reset_scoped_phase_binding_invalid','consumed actor authority cannot be substituted');

SELECT lives_ok($$SELECT pg_temp.prepare_empty_books(value) FROM empty_books_plan$$,'complete v4 contract review prepares under the genuine fixture session');
SELECT lives_ok($$SELECT app_private.apply_financial_reset_continuation(operation) FROM empty_books_state$$,
 'checked continuation preserves contracts and leaves every lease unbilled');
SELECT lives_ok($$SELECT app_private.apply_financial_reset_continuation(operation) FROM empty_books_state$$,
 'same-transaction repeated continuation is a verified no-op');
SELECT ok((SELECT before_images=after_images AND result_json->'empty_books'='true'::jsonb
 AND result_json->'billing_paused'='true'::jsonb AND result_json->'billing_complete'='false'::jsonb
 AND result_json->'close_ready'='false'::jsonb AND result_json->'contracts_unchanged'='true'::jsonb
 AND result_json->>'preserved_unbilled_lease_count'='8' AND result_json->>'deferred_lease_count'='0'
 FROM app_private.financial_reset_continuation_plans WHERE operation_id=(SELECT operation FROM empty_books_state)),
 'continuation records exact no-op images and truthful paused/incomplete result');
SELECT throws_ok($$SELECT app_private.financial_reset_scoped_rent(operation,org,lease,'2026-10-01','2026-10-01','activation_catch_up',maker,rule)
 FROM empty_books_state CROSS JOIN empty_books_contract_fixture WHERE n=1$$,
 '42501','financial_reset_scoped_rent_scope_invalid','even the scoped generator cannot turn preserve-unbilled into rent');
SELECT throws_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'23514','financial_reset_checkpoint_must_commit',
 'no-op continuation still cannot commit without the report checkpoint');
SELECT lives_ok($$SELECT app_private.apply_financial_reset_reports(operation) FROM empty_books_state$$,
 'zero reports persist while missing-rent blockers stay visible');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM empty_books_state)),0::bigint,'no tenant invoices regenerated');
SELECT is((SELECT count(*) FROM public.finance_income_items WHERE organization_id=(SELECT org FROM empty_books_state)),0::bigint,'no income regenerated');
SELECT is((SELECT count(*) FROM public.management_fee_occurrences WHERE organization_id=(SELECT org FROM empty_books_state)),0::bigint,'no management fee regenerated');
SELECT is((SELECT count(*) FROM public.owner_invoices WHERE organization_id=(SELECT org FROM empty_books_state)),0::bigint,'no owner invoice regenerated');
SELECT lives_ok($$SELECT app_private.assert_financial_reset_empty_sources(operation,true) FROM empty_books_state$$,
 'every monetary source is empty except approved zero opening and period authority');
SELECT ok((SELECT count(*)=4 AND bool_and(opening_amount=0 AND movement_amount=0 AND closing_amount=0)
 FROM public.owner_balance_period_components WHERE organization_id=(SELECT org FROM empty_books_state)),
 'all four owner components have zero opening, movement, and closing');
SELECT ok((SELECT result_json->'empty_books'='true'::jsonb AND result_json->'billing_paused'='true'::jsonb
 AND result_json->'contracts_unchanged'='true'::jsonb AND result_json->'billing_complete'='false'::jsonb
 AND result_json->'close_ready'='false'::jsonb AND result_json->'control_reopened'='false'::jsonb
 AND result_json->>'preserved_unbilled_lease_count'='8' AND result_json->'allocations'='[]'::jsonb
 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=(SELECT operation FROM empty_books_state)),
 'durable checkpoint proves zero books without billing, allocation, closing, or reopening');
SELECT ok(EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c
 CROSS JOIN LATERAL jsonb_array_elements(c.result_json->'scopes') s
 WHERE c.operation_id=(SELECT operation FROM empty_books_state) AND s->>'status'='empty-books-billing-paused'
 AND s->'close_readiness'->>'is_ready'='false' AND EXISTS(SELECT 1 FROM jsonb_array_elements(s->'close_readiness'->'blockers') b
 WHERE b->>'code'='monthly_rent_invoice_missing')),'missing contractual rent remains a real close blocker');
SELECT is((SELECT jsonb_build_object(
 'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leases l WHERE organization_id=s.org),
 'terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=s.org),
 'rules',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.lease_billing_terms b WHERE organization_id=s.org),
 'deposits',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.lease_deposits d WHERE organization_id=s.org)) FROM empty_books_state s),
 (SELECT image FROM empty_books_contracts),'all contracts, required amounts and pending deposit requirements remain byte-identical');
SELECT is((SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.financial_month_locks f
 WHERE id IN (SELECT pg_temp.empty_books_id(9501+n*10) FROM generate_series(0,3) n)),
 (SELECT image FROM empty_books_foreign),'all four foreign organization financial sentinels stay byte-identical');
SELECT is((SELECT jsonb_build_object(
 'properties',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.properties p WHERE organization_id=s.org),
 'units',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.units u WHERE organization_id=s.org),
 'people',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.people p WHERE organization_id=s.org)) FROM empty_books_state s),
 (SELECT image FROM empty_books_masters),'properties units and people remain byte-identical');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT org FROM empty_books_state)),
 'frozen','empty books remain frozen until a separately reviewed restart');
SELECT is((SELECT count(*) FROM app_private.financial_reset_phase_fences WHERE operation_id=(SELECT operation FROM empty_books_state)),3::bigint,
 'known-zero continuation and reports fences all remain required');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'the exact empty report checkpoint satisfies all deferred commit guards');
SELECT throws_ok($$UPDATE public.people SET display_name=display_name||' drift' WHERE id=(SELECT tenant FROM empty_books_state)$$,
 '55000','financial_writes_frozen','flushing constraints cannot bypass the existing financial freeze');
SELECT throws_ok($$UPDATE public.person_contacts SET contact_name='Changed after flush' WHERE id=pg_temp.empty_books_id(9007)$$,
 '23514','financial_reset_checkpoint_transaction_sealed','flushing constraints cannot bypass the checkpoint row seal on otherwise unfenced master data');
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT org FROM empty_books_state)$$,
 '42501','financial_reset_checked_reopening_required','direct reopen after a successful zero checkpoint is forbidden');
SELECT ok(NOT EXISTS(SELECT 1 FROM empty_books_state s CROSS JOIN LATERAL jsonb_array_elements(app_private.financial_reset_recovery_candidates(s.operation)) r
 WHERE r->>'relation_name' IN ('public.leases','public.lease_terms','public.lease_billing_terms','public.lease_deposits')),
 'inverse recovery cannot prune unchanged contracts or requirements');
\else
SELECT throws_ok($$SELECT pg_temp.prepare_empty_books(value) FROM empty_books_plan$$,
 '23514','financial_reset_continuation_current_cutoff_month_required','October empty books refuses execution outside October without a newly reviewed policy');
SELECT skip('October-only success path is not executed with a fabricated database clock.');
\endif
SELECT * FROM finish();
ROLLBACK;
