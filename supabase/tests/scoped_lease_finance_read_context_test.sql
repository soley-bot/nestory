BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE read_scope_state AS SELECT gen_random_uuid() org, gen_random_uuid() other_org,
  gen_random_uuid() branch_a, gen_random_uuid() branch_b,
  gen_random_uuid() manager, gen_random_uuid() member, gen_random_uuid() lease_reader,
  gen_random_uuid() outsider, gen_random_uuid() admin,gen_random_uuid() finance_only_reader,
  gen_random_uuid() finance_role, gen_random_uuid() lease_role, gen_random_uuid() other_role,
  gen_random_uuid() finance_only_role;
GRANT SELECT ON read_scope_state TO authenticated;
INSERT INTO auth.users(id,email)
SELECT actor,actor||'@read-scope.test' FROM read_scope_state s,
  LATERAL unnest(ARRAY[s.manager,s.member,s.lease_reader,s.outsider,s.admin,s.finance_only_reader]) actor;
INSERT INTO public.organizations(id,name,slug)
SELECT org,'Read scope','read-'||org FROM read_scope_state UNION ALL
SELECT other_org,'Other scope','read-'||other_org FROM read_scope_state;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
SELECT branch_a,org,'A','A','active' FROM read_scope_state UNION ALL
SELECT branch_b,org,'B','B','active' FROM read_scope_state;
INSERT INTO public.organization_roles(id,organization_id,name,status)
SELECT finance_role,org,'Finance read','active' FROM read_scope_state UNION ALL
SELECT lease_role,org,'Lease read','active' FROM read_scope_state UNION ALL
SELECT other_role,org,'Other read','active' FROM read_scope_state UNION ALL
SELECT finance_only_role,org,'Finance only read','active' FROM read_scope_state;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT org,finance_role,'finance.view'::public.organization_permission_key FROM read_scope_state UNION ALL
SELECT org,finance_role,'leases.view'::public.organization_permission_key FROM read_scope_state UNION ALL
SELECT org,lease_role,'leases.view'::public.organization_permission_key FROM read_scope_state UNION ALL
SELECT org,other_role,'maintenance.view'::public.organization_permission_key FROM read_scope_state UNION ALL
SELECT org,finance_only_role,'finance.view'::public.organization_permission_key FROM read_scope_state;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT org,manager,'custom',branch_a,finance_role FROM read_scope_state UNION ALL
SELECT org,member,'custom',branch_a,finance_role FROM read_scope_state UNION ALL
SELECT org,lease_reader,'custom',branch_a,lease_role FROM read_scope_state UNION ALL
SELECT org,outsider,'custom',branch_a,other_role FROM read_scope_state UNION ALL
SELECT org,admin,'super_admin',NULL,NULL FROM read_scope_state UNION ALL
SELECT org,finance_only_reader,'custom',branch_a,finance_only_role FROM read_scope_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
WHERE organization_id=(SELECT org FROM read_scope_state);
CREATE TEMP TABLE read_scope_rows AS
SELECT kind,gen_random_uuid() property_id,gen_random_uuid() tenant_id,gen_random_uuid() owner_id,
  gen_random_uuid() lease_id,gen_random_uuid() term_id,gen_random_uuid() unit_id,
  gen_random_uuid() party_id,gen_random_uuid() occupancy_id,gen_random_uuid() deposit_id,
  gen_random_uuid() applied_event_id,
  CASE WHEN kind='hidden_b' THEN branch_b WHEN kind='unresolved' THEN NULL ELSE branch_a END branch_id
FROM read_scope_state CROSS JOIN unnest(ARRAY['active_a','archived_a','hidden_b','unresolved']) kind;
GRANT SELECT ON read_scope_rows TO authenticated;
-- Synthetic history is confined to this rollback-only test transaction.
ALTER TABLE public.properties DISABLE TRIGGER USER;
INSERT INTO public.properties(id,organization_id,branch_id,code,name,property_type,rental_structure,archived_at)
SELECT r.property_id,s.org,r.branch_id,r.kind,r.kind,'apartment','multi_unit',
  CASE WHEN kind='archived_a' THEN now() END FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.properties ENABLE TRIGGER USER;
ALTER TABLE public.units DISABLE TRIGGER USER;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status,archived_at)
SELECT r.unit_id,s.org,r.property_id,r.kind,'vacant',CASE WHEN kind='archived_a' THEN now() END
FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.units ENABLE TRIGGER USER;
INSERT INTO public.people(id,organization_id,display_name,primary_email,primary_phone,notes,archived_at)
SELECT r.tenant_id,s.org,r.kind||' tenant','secret@read.test','secret-phone','secret-notes',
  CASE WHEN kind='archived_a' THEN now() END FROM read_scope_rows r CROSS JOIN read_scope_state s UNION ALL
SELECT r.owner_id,s.org,r.kind||' owner','secret@read.test','secret-phone','secret-notes',NULL
FROM read_scope_rows r CROSS JOIN read_scope_state s;
INSERT INTO public.people(organization_id,display_name,primary_email)
SELECT org,'Unrelated person','unrelated-secret@read.test' FROM read_scope_state;
ALTER TABLE public.property_owners DISABLE TRIGGER USER;
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,is_primary,started_on,ended_on)
SELECT s.org,r.property_id,r.owner_id,100,true,'2020-01-01','2025-12-31'
FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.property_owners ENABLE TRIGGER USER;
ALTER TABLE public.leases DISABLE TRIGGER USER;
INSERT INTO public.leases(id,organization_id,property_id,unit_id,primary_tenant_person_id,status,archived_at)
SELECT r.lease_id,s.org,r.property_id,r.unit_id,r.tenant_id,'active',CASE WHEN kind='archived_a' THEN now() END
FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.leases ENABLE TRIGGER USER;
ALTER TABLE public.lease_terms DISABLE TRIGGER USER;
INSERT INTO public.lease_terms(id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,
  rent_due_day,status,confirmed_at,confirmed_by)
SELECT r.term_id,s.org,r.lease_id,1,'2020-01-01','2099-12-31',1234.56,'USD',5,'active',now(),s.admin
FROM read_scope_rows r CROSS JOIN read_scope_state s;
INSERT INTO public.lease_terms(organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,
  rent_due_day,status,confirmed_at,confirmed_by)
SELECT s.org,r.lease_id,2,'2019-01-01','2019-12-31',987.65,'USD',5,'superseded',now(),s.admin
FROM read_scope_rows r CROSS JOIN read_scope_state s WHERE kind='active_a';
ALTER TABLE public.lease_terms ENABLE TRIGGER USER;
ALTER TABLE public.lease_billing_terms DISABLE TRIGGER USER;
INSERT INTO public.lease_billing_terms(organization_id,lease_id,property_id,effective_from,effective_to,
  confirmed_by,rule_source,first_period_prorated_amount)
SELECT s.org,r.lease_id,r.property_id,'2026-09-08','2099-12-31',s.admin,'lease_default_v1',111.11
FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.lease_billing_terms ENABLE TRIGGER USER;
ALTER TABLE public.lease_parties DISABLE TRIGGER USER;
INSERT INTO public.lease_parties(id,organization_id,lease_id,person_id,party_role,is_primary)
SELECT r.party_id,s.org,r.lease_id,r.tenant_id,'primary_tenant',true FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.lease_parties ENABLE TRIGGER USER;
ALTER TABLE public.lease_deposits DISABLE TRIGGER USER;
INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,notes)
SELECT r.deposit_id,s.org,r.lease_id,850,'USD','partially_returned','secret-deposit-notes' FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.lease_deposits ENABLE TRIGGER USER;
ALTER TABLE public.lease_deposit_events DISABLE TRIGGER USER;
INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reference,reversal_of_id)
SELECT CASE WHEN event_kind='applied' THEN r.applied_event_id ELSE gen_random_uuid() END,
  s.org,r.property_id,r.deposit_id,event_kind,'2026-09-01',
  CASE event_kind WHEN 'received' THEN 100 WHEN 'refunded' THEN 40 ELSE 10 END,
  'USD','secret-financial-reference',CASE WHEN event_kind='reversed' THEN r.applied_event_id END
FROM read_scope_rows r CROSS JOIN read_scope_state s
CROSS JOIN unnest(ARRAY['received','refunded','applied','reversed']) event_kind;
ALTER TABLE public.lease_deposit_events ENABLE TRIGGER USER;
ALTER TABLE public.lease_occupancies DISABLE TRIGGER USER;
INSERT INTO public.lease_occupancies(id,organization_id,lease_id,property_id,unit_id,status)
SELECT r.occupancy_id,s.org,r.lease_id,r.property_id,r.unit_id,'reserved' FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.lease_occupancies ENABLE TRIGGER USER;
ALTER TABLE public.lease_occupancy_participants DISABLE TRIGGER USER;
INSERT INTO public.lease_occupancy_participants(organization_id,lease_occupancy_id,lease_party_id,record_source,evidence_reason)
SELECT s.org,r.occupancy_id,r.party_id,'operator_confirmed','secret-evidence-reason' FROM read_scope_rows r CROSS JOIN read_scope_state s;
ALTER TABLE public.lease_occupancy_participants ENABLE TRIGGER USER;

SELECT set_config('request.jwt.claim.sub',(SELECT manager::text FROM read_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(format('SELECT public.get_scoped_leases_with_effective_rent(%L,%L)',
  (SELECT org FROM read_scope_state),'2026-09-07'),'scoped list exists and permits Finance with leases.view');
SELECT is((SELECT count(*)::integer FROM public.get_scoped_leases_with_effective_rent((SELECT org FROM read_scope_state),'2026-09-07')),2,
  'Finance list returns current branch active and archived lease history');
SELECT is((SELECT monthly_rent_amount FROM public.get_scoped_leases_with_effective_rent((SELECT org FROM read_scope_state),'2026-09-07')
  WHERE id=(SELECT lease_id FROM read_scope_rows WHERE kind='active_a')),1234.56::numeric,'exact original numeric amount survives');
CREATE TEMP TABLE scoped_results AS SELECT
  public.get_lease_read_context((SELECT org FROM read_scope_state),ARRAY[(SELECT lease_id FROM read_scope_rows WHERE kind='active_a')]) lease,
  public.get_finance_read_context((SELECT org FROM read_scope_state)) finance;
SELECT is(jsonb_array_length((SELECT lease->'terms' FROM scoped_results)),2,'detail preserves superseded term history');
SELECT is(jsonb_array_length((SELECT lease->'parties' FROM scoped_results)),1,'detail parties are selected by authorized lease');
SELECT is(jsonb_array_length((SELECT lease->'occupancies' FROM scoped_results)),1,'detail occupancy is selected by authorized lease');
SELECT is(jsonb_array_length((SELECT lease->'occupancies'->0->'participants' FROM scoped_results)),1,'detail occupancy includes only its lease participants');
SELECT is((SELECT (lease->'deposits'->0->>'amount')::numeric FROM scoped_results),850::numeric,'detail expected deposit amount retains original numeric value');
SELECT is(jsonb_array_length((SELECT lease->'deposit_events' FROM scoped_results)),4,'funded deposit includes its received refunded and reversal evidence');
SELECT is((SELECT coalesce(sum(CASE WHEN event->>'event_type'='received' THEN (event->>'amount')::numeric ELSE -(event->>'amount')::numeric END),0)
  FROM scoped_results r CROSS JOIN LATERAL jsonb_array_elements(r.lease->'deposit_events') event
  WHERE event->>'reversal_of_id' IS NULL AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r.lease->'deposit_events') reversal WHERE reversal->>'reversal_of_id'=event->>'id')),
  60::numeric,'received 100 refunded 40 and reversed applied 10 retain held balance 60');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM scoped_results,LATERAL jsonb_object_keys(lease->'deposit_events'->0) key),
  '{amount,currency,event_date,event_type,id,lease_deposit_id,reference,reversal_of_id}','deposit event payload contains only approved evidence fields');
SELECT ok((SELECT bool_and(event->'reference'='null'::jsonb) FROM scoped_results,LATERAL jsonb_array_elements(lease->'deposit_events') event),
  'scoped deposit events never expose free-text financial references');
SELECT ok((SELECT lease->'deposit_events' @> jsonb_build_array(jsonb_build_object('event_type','reversed','reversal_of_id',r.applied_event_id))
  FROM scoped_results CROSS JOIN read_scope_rows r WHERE r.kind='active_a'),'reversal identity survives for unchanged event math');
SELECT is(jsonb_array_length(public.get_lease_read_context((SELECT org FROM read_scope_state))->'deposit_events'),0,'NULL lease IDs expose no deposit evidence');
SELECT is((SELECT (lease->'billing_terms'->0->>'first_period_prorated_amount')::numeric FROM scoped_results),111.11::numeric,'billing proration amount retains original numeric value');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM scoped_results,LATERAL jsonb_object_keys(lease->'occupancies'->0->'participants'->0) key),
  '{business_lifecycle,evidence_state,id}','participant payload excludes sensitive evidence and person metadata');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM scoped_results,LATERAL jsonb_object_keys(lease->'deposits'->0) key),
  '{amount,archived_at,currency,deposit_type,id,lease_id,status}','deposit payload excludes notes and evidence');
SELECT is(jsonb_array_length((SELECT finance->'terms' FROM scoped_results)),2,'Finance excludes superseded terms but keeps archived lease context');
SELECT is(jsonb_array_length((SELECT finance->'properties' FROM scoped_results)),2,'Finance keeps archived scoped property labels');
SELECT is(jsonb_array_length((SELECT finance->'owner_assignments' FROM scoped_results)),2,'historical ended owners remain available for report date filtering');
SELECT is(jsonb_array_length((SELECT finance->'people' FROM scoped_results)),4,'only related tenants and owners are projected');
SELECT is(public.get_finance_read_context((SELECT org FROM read_scope_state),(SELECT property_id FROM read_scope_rows WHERE kind='active_a')),
  (SELECT finance FROM scoped_results),'requested allowed property preserves selector choices');
SELECT is(jsonb_array_length(public.get_lease_read_context((SELECT org FROM read_scope_state))->'terms'),0,'NULL IDs cannot enumerate lease detail');
SELECT is(jsonb_array_length(public.get_lease_read_context((SELECT org FROM read_scope_state),ARRAY[]::uuid[])->'terms'),0,'empty IDs cannot enumerate lease detail');
SELECT is(jsonb_array_length(public.get_lease_read_context((SELECT org FROM read_scope_state))->'availability_terms'),1,'availability preserves active lease and allowed term-status filtering');
SELECT ok(NOT EXISTS(SELECT 1 FROM scoped_results r CROSS JOIN read_scope_rows hidden
  WHERE hidden.kind IN ('hidden_b','unresolved') AND
    (strpos(r.lease::text,hidden.property_id::text)>0 OR strpos(r.finance::text,hidden.tenant_id::text)>0
      OR strpos(r.finance::text,hidden.kind)>0)),'hidden branch and unresolved identities and labels never leave projections');
SELECT ok((SELECT lease::text NOT LIKE '%secret%' AND finance::text NOT LIKE '%secret%' AND finance::text NOT LIKE '%Unrelated person%' FROM scoped_results),
  'PII and unrelated people are absent');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM scoped_results,LATERAL jsonb_object_keys(lease->'people'->0) key),
  '{display_name,id}','Lease people whitelist is labels only');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM scoped_results,LATERAL jsonb_object_keys(finance->'people'->0) key),
  '{archived_at,display_name,id,party_type}','Finance people whitelist is labels and selector state only');
SELECT is((SELECT array_agg(key ORDER BY key)::text FROM scoped_results,LATERAL jsonb_object_keys(finance->'owner_assignments'->0) key),
  '{archived_at,ended_on,id,is_primary,person_id,property_id,started_on}','owner context excludes shares, money and hashes');
SELECT throws_ok(format('SELECT public.get_lease_read_context(%L,ARRAY[%L]::uuid[])',
  (SELECT org FROM read_scope_state),(SELECT lease_id FROM read_scope_rows WHERE kind='hidden_b')),'42501',NULL,'explicit hidden lease fails closed');
SELECT throws_ok(format('SELECT public.get_lease_read_context(%L,ARRAY[%L]::uuid[])',
  (SELECT org FROM read_scope_state),gen_random_uuid()),'42501',NULL,'unknown lease fails closed');
SELECT throws_ok(format('SELECT public.get_lease_read_context(%L,array_fill(%L::uuid,ARRAY[1001]))',
  (SELECT org FROM read_scope_state),(SELECT lease_id FROM read_scope_rows WHERE kind='active_a')),'22023',NULL,'detail IDs are bounded');
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L,%L)',
  (SELECT org FROM read_scope_state),(SELECT property_id FROM read_scope_rows WHERE kind='hidden_b')),'42501',NULL,'explicit hidden property fails closed');
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L)',(SELECT other_org FROM read_scope_state)),'42501',NULL,'cross-organization context denied');
SELECT throws_ok(format('SELECT public.get_scoped_lease_rent_readiness(%L,%L,%L)',
  (SELECT org FROM read_scope_state),(SELECT lease_id FROM read_scope_rows WHERE kind='hidden_b'),'2026-09-07'),'42501',NULL,'readiness cannot leak hidden lease identity');
SELECT is((SELECT reason_code FROM public.get_scoped_lease_rent_readiness((SELECT org FROM read_scope_state),
  (SELECT lease_id FROM read_scope_rows WHERE kind='active_a'),'2026-09-07')),'policy_not_effective','readiness retains policy blocker algorithm');
SELECT is((SELECT reason_code FROM public.get_scoped_lease_rent_readiness((SELECT org FROM read_scope_state),
  (SELECT lease_id FROM read_scope_rows WHERE kind='active_a'),'2026-09-08')),'ready','effective default billing rule resolves readiness');
SELECT is((SELECT reason_code FROM public.get_scoped_lease_rent_readiness((SELECT org FROM read_scope_state),
  (SELECT lease_id FROM read_scope_rows WHERE kind='active_a'),'1900-01-01')),'no_authoritative_term','outside term range remains blocked');
SELECT is((SELECT reason_code FROM public.get_scoped_lease_rent_readiness((SELECT org FROM read_scope_state),
  (SELECT lease_id FROM read_scope_rows WHERE kind='archived_a'),'2026-09-08')),'scope_mismatch','archived authorized lease retains readiness blocker');
SELECT is((SELECT count(*)::integer FROM public.people WHERE organization_id=(SELECT org FROM read_scope_state)),0,'base people remain denied');
SELECT is((SELECT count(*)::integer FROM public.properties WHERE organization_id=(SELECT org FROM read_scope_state)),0,'base properties remain denied');
SELECT is((SELECT count(*)::integer FROM public.lease_terms WHERE organization_id=(SELECT org FROM read_scope_state)),0,'read projection does not grant base term authority');
SELECT is((SELECT count(*)::integer FROM public.lease_deposit_events WHERE organization_id=(SELECT org FROM read_scope_state)),0,'scoped events do not grant direct financial evidence authority');
SELECT ok(NOT app_private.can_read_finance((SELECT org FROM read_scope_state)),'projection never establishes global finance authority');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM read_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.get_scoped_leases_with_effective_rent((SELECT org FROM read_scope_state),'2026-09-07')),4,'Super Admin retains both branches and unresolved administrative scope');
SELECT results_eq(
  format('SELECT * FROM public.get_scoped_lease_rent_readiness(%L,%L,%L)',s.org,r.lease_id,date),
  format('SELECT * FROM public.resolve_lease_rent_readiness(%L,%L,%L)',s.org,r.lease_id,date),
  'scoped readiness equals released algorithm at '||date)
FROM read_scope_state s CROSS JOIN read_scope_rows r CROSS JOIN unnest(ARRAY['1900-01-01','2026-09-07','2026-09-08']) date
WHERE r.kind='active_a';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT member::text FROM read_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_finance_read_context((SELECT org FROM read_scope_state)),(SELECT finance FROM scoped_results),'Finance Member shares authorized read contract');
SELECT is(public.get_lease_read_context((SELECT org FROM read_scope_state),ARRAY[(SELECT lease_id FROM read_scope_rows WHERE kind='active_a')]),
  (SELECT lease FROM scoped_results),'Finance Member shares funded-deposit read evidence without write authority');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT lease_reader::text FROM read_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.get_scoped_leases_with_effective_rent((SELECT org FROM read_scope_state),'2026-09-07')),2,'lease-only permission can read Lease projection');
SELECT is(jsonb_array_length(public.get_lease_read_context((SELECT org FROM read_scope_state),ARRAY[(SELECT lease_id FROM read_scope_rows WHERE kind='active_a')])->'deposits'),0,
  'lease-only permission cannot read new deposit financial metadata');
SELECT is(jsonb_array_length(public.get_lease_read_context((SELECT org FROM read_scope_state),ARRAY[(SELECT lease_id FROM read_scope_rows WHERE kind='active_a')])->'deposit_events'),0,
  'lease-only permission cannot read new deposit financial evidence');
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L)',(SELECT org FROM read_scope_state)),'42501',NULL,'lease-only permission does not grant Finance context');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT finance_only_reader::text FROM read_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_read_context(%L,ARRAY[%L]::uuid[])',
  (SELECT org FROM read_scope_state),(SELECT lease_id FROM read_scope_rows WHERE kind='active_a')),'42501',NULL,
  'finance-only permission cannot bypass the Lease domain requirement for deposit evidence');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT outsider::text FROM read_scope_state),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_read_context(%L)',(SELECT org FROM read_scope_state)),'42501',NULL,'wrong domain permission denied');
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L)',(SELECT org FROM read_scope_state)),'42501',NULL,'non-Finance permission denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT manager::text FROM read_scope_state),true);
ALTER TABLE public.organization_roles DISABLE TRIGGER USER;
UPDATE public.organization_roles SET status='archived',archived_at=now() WHERE id=(SELECT finance_role FROM read_scope_state);
ALTER TABLE public.organization_roles ENABLE TRIGGER USER;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L)',(SELECT org FROM read_scope_state)),'42501',NULL,'inactive role denied');
RESET ROLE;
UPDATE public.organization_roles SET status='active',archived_at=NULL WHERE id=(SELECT finance_role FROM read_scope_state);
DELETE FROM public.organization_members WHERE user_id=(SELECT manager FROM read_scope_state);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_lease_read_context(%L)',(SELECT org FROM read_scope_state)),'42501',NULL,'removed membership denied');
RESET ROLE;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT org,manager,'custom',branch_a,finance_role FROM read_scope_state;
UPDATE public.organization_branches SET status='inactive' WHERE id=(SELECT branch_a FROM read_scope_state);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L)',(SELECT org FROM read_scope_state)),'42501',NULL,'inactive branch denied');
RESET ROLE;
UPDATE public.organization_branches SET status='active' WHERE id=(SELECT branch_a FROM read_scope_state);
UPDATE public.organization_authorization_states SET ordinary_access_enabled=false WHERE organization_id=(SELECT org FROM read_scope_state);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L)',(SELECT org FROM read_scope_state)),'42501',NULL,'disabled ordinary access denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_finance_read_context(%L)',(SELECT org FROM read_scope_state)),'28000',NULL,'missing authentication denied');
RESET ROLE;
SELECT ok(NOT has_function_privilege(role_name,'public.'||signature,'EXECUTE'),role_name||' denied '||signature)
FROM unnest(ARRAY['anon','service_role']) role_name CROSS JOIN unnest(ARRAY[
  'get_scoped_leases_with_effective_rent(uuid,date)','get_lease_read_context(uuid,uuid[])',
  'get_finance_read_context(uuid,uuid)','get_scoped_lease_rent_readiness(uuid,uuid,date)']) signature;
SELECT * FROM finish();
ROLLBACK;
