-- Rollback-only forward reset component proof. All financial rows are synthetic.
-- SET SESSION AUTHORIZATION simulates the gateway with synthetic Auth sessions;
-- it does not prove a real login, HTTP ingress, hosted dispatch or a live reset.
-- The same-database archive is an exact action witness, not an external backup.
BEGIN;
SET LOCAL timezone='UTC';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Preserve the real clock and the original-date option's October-only limit.
SELECT current_date BETWEEN DATE '2026-10-01' AND DATE '2026-10-31' AS held_forward_month \gset
\if :held_forward_month
CREATE FUNCTION pg_temp.held_forward_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('fd241054-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.held_forward_claims(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,
  'session_id',md5(p_actor::text||':held-forward-fixture')::uuid,'role','authenticated','aud','authenticated',
  'is_anonymous',false,'exp',extract(epoch FROM clock_timestamp()+interval '1 hour')::bigint)::text,true);
END;
$$;
CREATE TEMP TABLE held_forward_state AS SELECT
 pg_temp.held_forward_id(9001) AS maker,pg_temp.held_forward_id(9002) AS reviewer,
 pg_temp.held_forward_id(9003) AS org,pg_temp.held_forward_id(9004) AS property,
 pg_temp.held_forward_id(9005) AS tenant,pg_temp.held_forward_id(9006) AS owner,
 pg_temp.held_forward_id(700) AS operation,transaction_timestamp() AS started_at;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
 SELECT person,'authenticated','authenticated','held-forward-'||extensions.gen_random_uuid()::text||'@test.invalid',
  '{"provider":"email","providers":["email"]}','{}'
 FROM held_forward_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
 SELECT md5(person::text||':held-forward-fixture')::uuid,person,now(),now(),'aal1'
 FROM held_forward_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO public.organizations(id,name,slug,operational_timezone)
 SELECT org,'Held deposit forward fixture','held-forward-'||extensions.gen_random_uuid()::text,'UTC' FROM held_forward_state;
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT org,person,'super_admin' FROM held_forward_state CROSS JOIN LATERAL (VALUES(maker),(reviewer)) actors(person);
INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure,status)
 SELECT property,org,'Held forward property','HDF','apartment','multi_unit','active' FROM held_forward_state;
INSERT INTO public.people(id,organization_id,display_name,party_type)
 SELECT person,org,label,kind FROM held_forward_state
 CROSS JOIN LATERAL (VALUES(tenant,'Held forward tenant','individual'),(owner,'Held forward owner','company')) people(person,label,kind);
INSERT INTO public.person_roles(organization_id,person_id,role)
 SELECT org,person,kind FROM held_forward_state CROSS JOIN LATERAL (VALUES(tenant,'tenant'),(owner,'owner')) roles(person,kind);
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_label,ownership_percent,is_primary,started_on,created_by,updated_by)
 SELECT org,property,owner,'Primary owner',100,true,'2025-01-01',maker,maker FROM held_forward_state;
CREATE TEMP TABLE held_forward_contract_fixture AS
 SELECT n,pg_temp.held_forward_id(n) AS lease,pg_temp.held_forward_id(100+n) AS term,
  pg_temp.held_forward_id(200+n) AS rule,pg_temp.held_forward_id(300+n) AS unit,
  CASE n WHEN 1 THEN 400 WHEN 2 THEN 1000 WHEN 3 THEN 0 ELSE 600 END::numeric AS rent,
  CASE WHEN n>=4 THEN DATE '2026-09-30' WHEN n=2 THEN DATE '2026-10-14' ELSE DATE '2027-08-31' END AS ends_on
 FROM generate_series(1,8) n;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,current_rent_amount,current_rent_currency)
 SELECT unit,org,property,'HDF-'||n,'vacant',rent,'USD' FROM held_forward_contract_fixture CROSS JOIN held_forward_state;
SELECT pg_temp.held_forward_claims(maker) FROM held_forward_state;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,deposit_amount,deposit_currency,created_by,updated_by)
 SELECT lease,org,property,unit,tenant,'active',1234.56,'USD',maker,maker FROM held_forward_contract_fixture CROSS JOIN held_forward_state;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,
 payment_frequency,status,authority_kind,confirmed_at,confirmed_by,created_by,updated_by)
 SELECT term,org,lease,1,'2026-09-01',ends_on,rent,'USD',7,'monthly','draft','authoritative',now(),maker,maker,maker
 FROM held_forward_contract_fixture CROSS JOIN held_forward_state;
INSERT INTO public.lease_billing_terms(id,organization_id,lease_id,property_id,effective_from,effective_to,collection_route,
 management_fee_mode,management_fee_value,charge_management_fee_when_active,full_management_fee_during_proration,
 billing_recipient_kind,billing_recipient_person_id,rent_calculation_timezone,short_month_due_day_rule,
 lease_start_proration_rule,lease_end_proration_rule,mid_period_rent_change_rule,charge_through_lease_end,rule_source,
 confirmed_at,confirmed_by,created_by,updated_by)
 SELECT rule,org,lease,property,'2026-09-01',ends_on,'through_ips','percentage',10,n=2,false,'individual',tenant,
  'UTC','last_calendar_day','actual_days','actual_days','next_full_month',true,'lease_default_v1',now(),maker,maker,maker
 FROM held_forward_contract_fixture CROSS JOIN held_forward_state;
INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,notes,created_by,updated_by)
 SELECT pg_temp.held_forward_id(400+n),org,lease,1234.56,'USD','pending','Preserved contractual requirement',maker,maker
 FROM held_forward_contract_fixture CROSS JOIN held_forward_state;

-- Normal activation and the normal generator create original invoice evidence.
CREATE TEMP TABLE held_forward_generated AS
 WITH generated AS (
  UPDATE public.lease_terms t SET status='active'
  FROM held_forward_contract_fixture f CROSS JOIN held_forward_state s
  WHERE t.id=f.term AND f.n IN (1,2)
  RETURNING f.n,app_private.generate_simple_lease_rent_invoice(s.org,f.lease,'2026-10-01','2026-10-01',
   'activation_catch_up',s.maker,f.rule) AS invoice_id
 ) SELECT * FROM generated;
UPDATE public.lease_terms SET status='active' WHERE id IN (SELECT term FROM held_forward_contract_fixture WHERE n>=3);
SELECT is(current_setting('session_replication_role'),'origin','forward fixture keeps all normal triggers enabled');

-- Ordinary checked commands derive both headers and their real cash projections.
SELECT public.record_lease_deposit_event_with_account(s.org,pg_temp.held_forward_id(401),r.account_id,
 'received',DATE '2026-10-01',615,'Held forward receipt')
 FROM held_forward_state s JOIN public.finance_account_roles r ON r.organization_id=s.org AND r.role_code='security_deposits';
SELECT public.record_lease_deposit_event_with_account(s.org,pg_temp.held_forward_id(403),r.account_id,
 'received',DATE '2026-10-01',200,'Returned forward receipt')
 FROM held_forward_state s JOIN public.finance_account_roles r ON r.organization_id=s.org AND r.role_code='security_deposits';
SELECT public.record_lease_deposit_event_with_account(s.org,pg_temp.held_forward_id(403),r.account_id,
 'refunded',DATE '2026-10-02',200,'Returned forward refund')
 FROM held_forward_state s JOIN public.finance_account_roles r ON r.organization_id=s.org AND r.role_code='security_deposits';
-- Also cover a legacy header's separately recorded receipt date. The normal
-- event command derives cash status but does not populate this metadata field.
-- This synthetic date matches the real fixture receipt above; normal triggers
-- remain enabled, and the later exact reset must clear this non-null value.
UPDATE public.lease_deposits SET received_on=DATE '2026-10-01'
 WHERE id=pg_temp.held_forward_id(401);
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE organization_id=(SELECT org FROM held_forward_state)),3::bigint,
 'ordinary receipt and refund commands create three actual deposit cash events');
SELECT is((SELECT count(*) FROM public.ledger_entries WHERE organization_id=(SELECT org FROM held_forward_state) AND source_type='deposit_event'),3::bigint,
 'ordinary deposit commands create three linked ledger projections');
SELECT ok((SELECT status='held' AND received_on=DATE '2026-10-01' AND returned_on IS NULL AND amount=1234.56
 FROM public.lease_deposits WHERE id=pg_temp.held_forward_id(401)),'615 receipt creates a held header without replacing the 1234.56 contract amount');
SELECT is((SELECT status FROM public.lease_deposits WHERE id=pg_temp.held_forward_id(403)),'returned',
 'ordinary 200 receipt and 200 refund create the terminal returned header');

INSERT INTO public.organizations(id,name,slug)
 VALUES(pg_temp.held_forward_id(9500),'Foreign held sentinel','foreign-held-'||extensions.gen_random_uuid()::text);
INSERT INTO public.financial_month_locks(id,organization_id,month_start,locked_by,reason)
 SELECT pg_temp.held_forward_id(9501),pg_temp.held_forward_id(9500),'2026-10-01',maker,'Foreign exact sentinel' FROM held_forward_state;
CREATE TEMP TABLE held_forward_foreign AS
 SELECT to_jsonb(f)::text AS image FROM public.financial_month_locks f WHERE id=pg_temp.held_forward_id(9501);
CREATE TEMP TABLE held_forward_contracts AS SELECT jsonb_build_object(
 'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leases l WHERE organization_id=s.org),
 'terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=s.org),
 'rules',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.lease_billing_terms b WHERE organization_id=s.org))::text AS image
 FROM held_forward_state s;

-- Capture actual rows; reject any unreviewed financial relation in this fixture.
CREATE TEMP TABLE held_forward_archive AS
 SELECT e.key AS relation_name,r.archive_remove,x.value AS image,
  app_private.financial_reset_primary_key(e.key::regclass,x.value) AS pk,
  app_private.financial_reset_hash(x.value) AS hash,
  CASE WHEN e.key='public.lease_deposit_events' THEN x.value||jsonb_build_object('ledger_entry_id',NULL) ELSE x.value END AS staged_image
 FROM held_forward_state s CROSS JOIN LATERAL jsonb_each(app_private.financial_reset_continuation_snapshot(s.org)) e
 JOIN app_private.financial_reset_relation_rules r ON r.relation_name=e.key
 CROSS JOIN LATERAL jsonb_array_elements(e.value) x
 WHERE r.archive_remove OR e.key='public.lease_deposits';
DO $closed_sources$ DECLARE missing text; BEGIN
 SELECT string_agg(relation_name,', ' ORDER BY relation_name) INTO missing FROM held_forward_archive
 WHERE archive_remove AND relation_name NOT IN ('public.owner_invoice_lines','public.owner_invoices',
  'public.management_fee_occurrences','public.tenant_invoice_rent_segments','public.tenant_invoice_lines',
  'public.rent_generation_exceptions','public.tenant_invoices','public.finance_income_items',
  'public.lease_deposit_events','public.ledger_entries');
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'held_forward_unreviewed_source_relations: %',missing; END IF;
 IF NOT EXISTS(SELECT 1 FROM held_forward_archive WHERE relation_name='public.lease_deposits'
  AND image->>'id'=pg_temp.held_forward_id(401)::text AND image->>'status'='held')
 OR NOT EXISTS(SELECT 1 FROM held_forward_archive WHERE relation_name='public.lease_deposits'
  AND image->>'id'=pg_temp.held_forward_id(403)::text AND image->>'status'='returned') THEN
  RAISE EXCEPTION 'held_forward_real_deposit_archive_required';
 END IF;
END $closed_sources$;

-- Order the closed removal set by actual foreign keys after exact cycle staging.
CREATE TEMP TABLE held_order_work(seq integer PRIMARY KEY,relation_name text,pk jsonb,before_row jsonb,payload jsonb,removed boolean DEFAULT false);
CREATE TEMP TABLE held_order_edges(source integer,target integer,PRIMARY KEY(source,target));
CREATE FUNCTION pg_temp.held_forward_order(p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE fk record; chosen record; result jsonb:='[]';
BEGIN
 INSERT INTO held_order_work(seq,relation_name,pk,before_row,payload)
 SELECT ordinality::integer,value->>'relation_name',value->'primary_key',value->'before_row',value
 FROM jsonb_array_elements(p_rows) WITH ORDINALITY;
 FOR fk IN SELECT c.* FROM pg_constraint c WHERE c.contype='f'
  AND EXISTS(SELECT 1 FROM held_order_work WHERE relation_name::regclass=c.conrelid)
  AND EXISTS(SELECT 1 FROM held_order_work WHERE relation_name::regclass=c.confrelid) LOOP
  IF NOT fk.convalidated THEN RAISE EXCEPTION 'held_forward_unvalidated_fk: %',fk.conname; END IF;
  INSERT INTO held_order_edges(source,target)
  SELECT s.seq,t.seq FROM held_order_work s CROSS JOIN held_order_work t
  WHERE s.seq<>t.seq AND s.relation_name::regclass=fk.conrelid AND t.relation_name::regclass=fk.confrelid
   AND NOT EXISTS(SELECT 1 FROM unnest(fk.conkey,fk.confkey) k(source_num,target_num)
    JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.source_num
    JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=k.target_num
    WHERE s.before_row->a.attname IS NULL OR s.before_row->a.attname='null'::jsonb
     OR s.before_row->a.attname IS DISTINCT FROM t.before_row->b.attname)
  ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO held_order_edges(source,target)
 SELECT later.seq,earlier.seq FROM held_order_work later JOIN held_order_work earlier
  ON earlier.relation_name='public.lease_deposit_events' AND later.relation_name=earlier.relation_name
  AND later.before_row->'lease_deposit_id'=earlier.before_row->'lease_deposit_id'
  AND (later.before_row->>'event_date')::date>(earlier.before_row->>'event_date')::date
 ON CONFLICT DO NOTHING;
 LOOP
  SELECT w.* INTO chosen FROM held_order_work w WHERE NOT removed
   AND NOT EXISTS(SELECT 1 FROM held_order_edges e JOIN held_order_work s ON s.seq=e.source WHERE e.target=w.seq AND NOT s.removed)
   ORDER BY w.relation_name,w.pk::text LIMIT 1;
  IF NOT FOUND THEN EXIT; END IF;
  result:=result||jsonb_build_array(chosen.payload);
  UPDATE held_order_work SET removed=true WHERE seq=chosen.seq;
 END LOOP;
 IF EXISTS(SELECT 1 FROM held_order_work WHERE NOT removed) THEN RAISE EXCEPTION 'held_forward_unresolved_cycle'; END IF;
 RETURN result;
END $$;
CREATE TEMP TABLE held_forward_actions(action_id uuid,ordinal integer,relation_name text,primary_key jsonb,kind text,before_row jsonb,after_row jsonb);
INSERT INTO held_forward_actions
 SELECT extensions.gen_random_uuid(),row_number() OVER(ORDER BY relation_name,pk::text)::integer,
  relation_name,pk,'normalization',image,
  CASE WHEN relation_name='public.lease_deposits' THEN image||jsonb_build_object('status','pending','received_on',NULL,'returned_on',NULL) ELSE staged_image END
 FROM held_forward_archive WHERE (relation_name='public.lease_deposits' AND image->>'status' IN ('held','received','partially_returned'))
  OR (relation_name='public.lease_deposit_events' AND image IS DISTINCT FROM staged_image);
INSERT INTO held_forward_actions
 SELECT extensions.gen_random_uuid(),(SELECT count(*)::integer FROM held_forward_actions)+r.ordinality::integer,
  r.value->>'relation_name',r.value->'primary_key','archive-delete',r.value->'before_row',NULL
 FROM jsonb_array_elements(pg_temp.held_forward_order((SELECT jsonb_agg(jsonb_build_object(
  'relation_name',relation_name,'primary_key',pk,'before_row',staged_image)) FROM held_forward_archive WHERE archive_remove))) WITH ORDINALITY r;
CREATE TEMP TABLE held_forward_action_payload AS
 SELECT jsonb_agg(jsonb_build_object('action_id',action_id,'ordinal',ordinal,'relation_name',relation_name,
  'primary_key',primary_key,'kind',kind,'before_row_text',before_row::text,'after_row_text',after_row::text,
  'before_sha256',app_private.financial_reset_hash(before_row),'after_sha256',app_private.financial_reset_hash(after_row)) ORDER BY ordinal) AS value
 FROM held_forward_actions;
SELECT is((SELECT count(*) FROM held_forward_actions WHERE relation_name='public.lease_deposits'),1::bigint,
 'only the actual held header receives a normalization action');
SELECT ok(NOT EXISTS(SELECT 1 FROM held_forward_actions WHERE before_row IS NULL OR kind NOT IN ('normalization','archive-delete')),
 'the exact action plan contains only forward updates and deletions');

INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
 SELECT org,1,'frozen','2026-10-01' FROM held_forward_state;
SELECT app_private.prepare_financial_reset_operation(jsonb_build_object('operation_id',operation,'organization_id',org,
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('a',64),'plan_sha256',repeat('b',64),'schema_sha256',repeat('c',64),
 'archive_count',(SELECT count(*) FROM held_forward_archive),'action_count',(SELECT count(*) FROM held_forward_actions),
 'audit_timestamp',clock_timestamp(),'audit_actor',maker,
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,'row_sha256',hash)
  ORDER BY relation_name,pk::text)) FROM held_forward_archive),
 'action_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(a-ARRAY['before_row_text','after_row_text'] ORDER BY (a->>'ordinal')::integer))
  FROM held_forward_action_payload CROSS JOIN LATERAL jsonb_array_elements(value) a))) FROM held_forward_state;
SELECT app_private.archive_financial_reset_rows(operation,(SELECT jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',pk,
 'row_text',image::text,'row_sha256',hash) ORDER BY relation_name,pk::text) FROM held_forward_archive)) FROM held_forward_state;
SELECT app_private.prepare_financial_reset_actions(operation,value) FROM held_forward_state CROSS JOIN held_forward_action_payload;
WITH review AS(SELECT operation,jsonb_build_object('operation_id',operation,'organization_id',org,'manifest_sha256',repeat('a',64),
 'reset_plan_sha256',repeat('b',64),'maker_actor_id',maker,'reviewer_actor_id',reviewer,'effective_date','2026-10-01','currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_known_zero_scope(operation)) AS value FROM held_forward_state)
SELECT app_private.prepare_financial_reset_zero_plan(operation,value,app_private.financial_reset_hash(value)) FROM review;
SELECT set_config('held_forward.operation',operation::text,true),set_config('held_forward.zero_review',review_sha256,true)
 FROM held_forward_state JOIN app_private.financial_reset_zero_plans ON operation_id=operation;
SELECT pg_temp.held_forward_claims(maker) FROM held_forward_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan(current_setting('held_forward.operation')::uuid,current_setting('held_forward.zero_review'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.held_forward_claims(reviewer) FROM held_forward_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT public.approve_financial_reset_zero_plan(current_setting('held_forward.operation')::uuid,current_setting('held_forward.zero_review'));
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.seal_financial_reset_operation(operation) FROM held_forward_state;
SELECT app_private.start_financial_reset_actions(operation) FROM held_forward_state;
-- Match the current passing native executor role; every write needs its exact arm.
SET LOCAL ROLE postgres;
DO $forward_actions$ DECLARE a app_private.financial_reset_actions%ROWTYPE; setters text; affected bigint; BEGIN
 FOR a IN SELECT * FROM app_private.financial_reset_actions
  WHERE operation_id='fd241054-0000-4000-8000-000000000700' ORDER BY ordinal LOOP
  IF a.before_row IS NULL OR a.kind NOT IN ('normalization','archive-delete') THEN RAISE EXCEPTION 'held_forward_nonforward_action'; END IF;
  PERFORM app_private.arm_financial_reset_action(a.operation_id,a.action_id);
  IF a.after_row IS NULL THEN
   EXECUTE format('DELETE FROM %s t WHERE app_private.financial_reset_primary_key($1,to_jsonb(t))=$2 AND to_jsonb(t)=$3',a.relation_oid::regclass)
    USING a.relation_oid,a.primary_key,a.before_row;
  ELSE
   SELECT string_agg(format('%I=(jsonb_populate_record(NULL::%s,$1)).%I',k,a.relation_oid::regclass,k),',' ORDER BY k)
    INTO setters FROM jsonb_object_keys(a.after_row) k
    WHERE a.before_row->k IS DISTINCT FROM a.after_row->k AND NOT (a.primary_key ? k) AND k<>'organization_id';
   IF setters IS NULL THEN RAISE EXCEPTION 'held_forward_empty_update'; END IF;
   EXECUTE format('UPDATE %s t SET %s WHERE app_private.financial_reset_primary_key($2,to_jsonb(t))=$3 AND to_jsonb(t)=$4',
    a.relation_oid::regclass,setters) USING a.after_row,a.relation_oid,a.primary_key,a.before_row;
  END IF;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'held_forward_exact_action_count: %, %',a.action_id,affected; END IF;
 END LOOP;
END $forward_actions$;
RESET ROLE;
SELECT app_private.complete_financial_reset_actions(operation) FROM held_forward_state;

CREATE TEMP TABLE held_forward_plan AS SELECT jsonb_build_object('version',3,'actor_id',maker,'billing_period_start','2026-10-01',
 'issue_date','2026-10-01','execution_business_date',app_private.rent_business_date(org,statement_timestamp()),
 'invoice_date_policy','original-reviewed-october','source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(org)),
 'original_invoice_sources',(SELECT jsonb_agg(jsonb_build_object('lease_id',image->'lease_id','invoice_id',image->'id','row_sha256',hash) ORDER BY pk::text)
  FROM held_forward_archive WHERE relation_name='public.tenant_invoices'),
 'leases',(SELECT jsonb_agg(CASE WHEN n>=4 THEN jsonb_build_object('lease_id',lease,'term_id',term,'billing_rule_id',rule,
   'disposition','defer-expired-unbilled','reason','renewal-unconfirmed','source_sha256',app_private.financial_reset_hash(app_private.financial_reset_deferred_lease_source(org,lease,'2026-10-01')))
  ELSE jsonb_build_object('lease_id',lease,'term_id',term,'billing_rule_id',rule,'disposition','bill','continue_month_to_month',false,
   'rent_amount',CASE n WHEN 1 THEN 400 WHEN 2 THEN 451.61 ELSE 0 END,'management_fee_amount',CASE n WHEN 2 THEN 45.16 ELSE 0 END,
   'currency','USD','recipient_person_id',tenant,'collection_route','through_ips','due_date','2026-10-07') END ORDER BY n)
  FROM held_forward_contract_fixture)) AS value FROM held_forward_state;
-- Existing v1 SQL component binding, with fixture-only provenance markers.
-- It grants no claim about encrypted artifacts or protected provider readiness.
CREATE TEMP TABLE held_forward_operator(binding jsonb,authorization_id uuid);
GRANT SELECT,UPDATE ON held_forward_operator TO authenticated;
INSERT INTO held_forward_operator(binding)
 SELECT jsonb_build_object('version',1,'operation_id',o.operation_id,'project_ref','syntheticprojectrefa','organization_id',o.organization_id,
  'packet_sha256',repeat('1',64),'main_sha',repeat('a',40),'sources_sha256',repeat('2',64),'schema_sha256',o.schema_sha256,
  'ledger_sha256',repeat('3',64),'source_snapshot_sha256',repeat('4',64),'source_generation',o.source_generation,'target_generation',o.target_generation,
  'cutoff','2026-10-01','issue_date','2026-10-01','timezone',g.operational_timezone,
  'execution_business_date',app_private.rent_business_date(o.organization_id,statement_timestamp()),'invoice_date_policy','original-reviewed-october',
  'manifest_sha256',o.manifest_sha256,'plan_sha256',o.plan_sha256,'archive_sha256',o.archive_sha256,'action_sha256',o.action_sha256,
  'archive_artifact_sha256',repeat('5',64),'archive_count',o.archive_count,'action_count',o.action_count,'zero_review_sha256',z.review_sha256,
  'continuation_semantic_sha256',app_private.financial_reset_hash(p.value-'source_sha256'),'report_review_sha256',repeat('6',64),
  'continuation_semantic',p.value-'source_sha256')
 FROM app_private.financial_reset_operations o JOIN held_forward_state s ON s.operation=o.operation_id
 JOIN app_private.financial_reset_zero_plans z USING(operation_id) JOIN public.organizations g ON g.id=o.organization_id
 CROSS JOIN held_forward_plan p;
SELECT pg_temp.held_forward_claims(maker) FROM held_forward_state;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
UPDATE held_forward_operator SET authorization_id=public.authorize_financial_reset_hosted_action(binding,'execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT app_private.consume_financial_reset_actor_authorization(authorization_id,binding,'execute') FROM held_forward_operator;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT app_private.apply_financial_reset_known_zero(operation) FROM held_forward_state;
UPDATE held_forward_plan SET value=jsonb_set(value,'{source_sha256}',to_jsonb(app_private.financial_reset_hash(
 app_private.financial_reset_continuation_snapshot((SELECT org FROM held_forward_state)))));
SELECT app_private.prepare_financial_reset_continuation(operation,value,app_private.financial_reset_hash(value))
 FROM held_forward_state CROSS JOIN held_forward_plan;
SELECT app_private.apply_financial_reset_continuation(operation) FROM held_forward_state;
SELECT app_private.apply_financial_reset_reports(operation) FROM held_forward_state;

SELECT is((SELECT status FROM public.lease_deposits WHERE id=pg_temp.held_forward_id(401)),'pending','actual held header becomes pending');
SELECT ok((SELECT received_on IS NULL AND returned_on IS NULL AND amount=1234.56 AND currency='USD'
 FROM public.lease_deposits WHERE id=pg_temp.held_forward_id(401)),'held cash clear removes receipt dates and preserves contractual amount and currency');
SELECT is((SELECT (to_jsonb(d)-ARRAY['status','received_on','returned_on'])::text FROM public.lease_deposits d WHERE id=pg_temp.held_forward_id(401)),
 (SELECT (image-ARRAY['status','received_on','returned_on'])::text FROM held_forward_archive
  WHERE relation_name='public.lease_deposits' AND image->>'id'=pg_temp.held_forward_id(401)::text),
 'every other held-header field remains byte-identical');
SELECT is((SELECT to_jsonb(d)::text FROM public.lease_deposits d WHERE id=pg_temp.held_forward_id(403)),
 (SELECT image::text FROM held_forward_archive WHERE relation_name='public.lease_deposits' AND image->>'id'=pg_temp.held_forward_id(403)::text),
 'the real refunded terminal header remains byte-identical');
SELECT is((SELECT count(*) FROM public.lease_deposits WHERE organization_id=(SELECT org FROM held_forward_state)),8::bigint,
 'every original contractual deposit header remains present');
SELECT ok(NOT EXISTS(SELECT 1 FROM held_forward_archive a JOIN public.lease_deposits d ON d.id=(a.image->>'id')::uuid
 WHERE a.relation_name='public.lease_deposits' AND d.id<>pg_temp.held_forward_id(401) AND to_jsonb(d)::text IS DISTINCT FROM a.image::text),
 'all other pending and terminal headers remain byte-identical');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE organization_id=(SELECT org FROM held_forward_state)),0::bigint,
 'all three old deposit cash events are removed');
SELECT is((SELECT count(*) FROM public.ledger_entries WHERE organization_id=(SELECT org FROM held_forward_state) AND source_type='deposit_event'),0::bigint,
 'all old deposit cash ledger projections are removed');
SELECT is((SELECT count(*) FROM app_private.financial_reset_archive_rows a JOIN held_forward_state s ON s.operation=a.operation_id
 WHERE a.relation_name='public.lease_deposit_events'),3::bigint,'all three actual deposit events retain immutable database before-images');
SELECT is((SELECT count(*) FROM app_private.financial_reset_archive_rows a JOIN held_forward_state s ON s.operation=a.operation_id
 WHERE a.relation_name='public.ledger_entries' AND a.row_json->>'source_type'='deposit_event'),3::bigint,
 'all three actual deposit ledger projections retain immutable database before-images');
SELECT is((SELECT jsonb_build_object(
 'leases',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leases l WHERE organization_id=s.org),
 'terms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=s.org),
 'rules',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.lease_billing_terms b WHERE organization_id=s.org))::text FROM held_forward_state s),
 (SELECT image FROM held_forward_contracts),'lease contracts, deposit requirements, terms and billing rules remain byte-identical');
SELECT is((SELECT count(*) FROM public.tenant_invoices WHERE organization_id=(SELECT org FROM held_forward_state)),2::bigint,
 'only the two positive reviewed leases are billed');
SELECT ok((SELECT bool_and(issue_date=DATE '2026-10-01' AND due_date=DATE '2026-10-07') FROM public.tenant_invoices
 WHERE organization_id=(SELECT org FROM held_forward_state)),'rebuilt invoices retain original October 1 issue and October 7 due dates');
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE lease_id=pg_temp.held_forward_id(2)),451.61::numeric,
 'October 14 end keeps normal actual-day proration');
SELECT is((SELECT management_fee_amount FROM public.tenant_invoices WHERE lease_id=pg_temp.held_forward_id(2)),45.16::numeric,
 'the prorated management fee remains unchanged');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.tenant_invoices WHERE lease_id IN (SELECT lease FROM held_forward_contract_fixture WHERE n>=4)),
 'all five September-ended leases remain unbilled');
SELECT is((SELECT result_json->>'billing_complete' FROM app_private.financial_reset_verification_checkpoints
 WHERE operation_id=(SELECT operation FROM held_forward_state)),'false','report checkpoint retains the reviewed deferred billing blockers');
SELECT ok((SELECT bool_and(created_at>=s.started_at AND generated_at>=s.started_at) FROM public.tenant_invoices
 CROSS JOIN held_forward_state s WHERE organization_id=s.org),'generated invoice audit timestamps record the real execution');
SELECT is((SELECT to_jsonb(f)::text FROM public.financial_month_locks f WHERE id=pg_temp.held_forward_id(9501)),
 (SELECT image FROM held_forward_foreign),'the foreign financial sentinel remains byte-identical');
SELECT is((SELECT status FROM app_private.financial_write_controls WHERE organization_id=(SELECT org FROM held_forward_state)),
 'frozen','the complete forward reset remains frozen');
SELECT lives_ok($$SET CONSTRAINTS ALL IMMEDIATE$$,'forward held-deposit reset satisfies all deferred completion guards');
\else
SELECT skip('Forward original-date success is eligible only in October 2026; the real clock is not changed.');
\endif
SELECT * FROM finish();
ROLLBACK;
