BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE activity_scope (
  org uuid DEFAULT gen_random_uuid(), other_org uuid DEFAULT gen_random_uuid(),
  branch uuid DEFAULT gen_random_uuid(), other_branch uuid DEFAULT gen_random_uuid(),
  foreign_branch uuid DEFAULT gen_random_uuid(), property uuid DEFAULT gen_random_uuid(),
  other_property uuid DEFAULT gen_random_uuid(), foreign_property uuid DEFAULT gen_random_uuid(),
  person uuid DEFAULT gen_random_uuid(), lease uuid DEFAULT gen_random_uuid(),
  admin uuid DEFAULT gen_random_uuid(), outsider uuid DEFAULT gen_random_uuid()
);
INSERT INTO activity_scope DEFAULT VALUES;
CREATE TEMP TABLE activity_readers (label text, actor uuid DEFAULT gen_random_uuid(), role_id uuid DEFAULT gen_random_uuid());
INSERT INTO activity_readers(label) VALUES ('operations'), ('maintenance'), ('leases'), ('finance'), ('people'), ('all');
GRANT SELECT ON activity_scope, activity_readers TO authenticated;

INSERT INTO public.organizations(id,name,slug)
SELECT org,'Activity domain test','activity-domain-'||left(org::text,8) FROM activity_scope
UNION ALL SELECT other_org,'Activity foreign test','activity-foreign-'||left(other_org::text,8) FROM activity_scope;
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
SELECT branch,org,'One','ACT1','active' FROM activity_scope
UNION ALL SELECT other_branch,org,'Two','ACT2','active' FROM activity_scope
UNION ALL SELECT foreign_branch,other_org,'Foreign','ACT3','active' FROM activity_scope;
INSERT INTO auth.users(id,email)
SELECT actor,actor::text||'@example.test' FROM activity_readers
UNION ALL SELECT admin,admin::text||'@example.test' FROM activity_scope
UNION ALL SELECT outsider,outsider::text||'@example.test' FROM activity_scope;
INSERT INTO public.organization_roles(id,organization_id,name)
SELECT r.role_id,s.org,'Activity reader '||r.label FROM activity_readers r CROSS JOIN activity_scope s;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
SELECT s.org,r.role_id,k::public.organization_permission_key
FROM activity_scope s CROSS JOIN activity_readers r
CROSS JOIN unnest(ARRAY['properties.view','maintenance.view','leases.view','finance.view','people.view']) k
WHERE r.label='all' OR (r.label='operations' AND k IN ('properties.view','maintenance.view'))
  OR k=r.label||'.view';
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
SELECT s.org,r.actor,'custom',s.branch,r.role_id FROM activity_scope s CROSS JOIN activity_readers r
UNION ALL SELECT org,admin,'super_admin',NULL,NULL FROM activity_scope;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
WHERE organization_id=(SELECT org FROM activity_scope);

-- Sources for polymorphic activity checks. No triggers are disabled while any
-- authenticated SELECT assertion runs.
ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties(id,organization_id,branch_id,name,code,property_type,rental_structure)
SELECT property,org,branch,'Activity property','ACT-P','apartment','multi_unit' FROM activity_scope
UNION ALL SELECT other_property,org,other_branch,'Other branch property','ACT-P2','apartment','multi_unit' FROM activity_scope
UNION ALL SELECT foreign_property,other_org,foreign_branch,'Foreign property','ACT-P3','apartment','multi_unit' FROM activity_scope;
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.people(id,organization_id,display_name)
SELECT person,org,'Synthetic activity tenant' FROM activity_scope;
INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id)
SELECT org,person,branch FROM activity_scope;
INSERT INTO public.person_roles(organization_id,person_id,role,status)
SELECT org,person,'tenant','active' FROM activity_scope;
INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id,status)
SELECT lease,org,property,person,'draft' FROM activity_scope;

CREATE TEMP TABLE activity_sources(label text, id uuid DEFAULT gen_random_uuid());
INSERT INTO activity_sources(label) VALUES ('property_event'),('lease_event'),('maintenance_event'),('property_document'),('lease_document'),('maintenance_document');
GRANT SELECT ON activity_sources TO authenticated;
INSERT INTO public.timeline_events(id,organization_id,property_id,lease_id,event_date,event_type,title)
SELECT a.id,s.org,s.property,CASE WHEN a.label='lease_event' THEN s.lease END,current_date,
  CASE WHEN a.label='maintenance_event' THEN 'Maintenance' ELSE 'General Note' END::public.timeline_event_type,
  'Synthetic '||a.label
FROM activity_sources a CROSS JOIN activity_scope s WHERE a.label LIKE '%event';
INSERT INTO public.documents(id,organization_id,property_id,lease_id,timeline_event_id,category,file_name,storage_path,mime_type,size_bytes)
SELECT a.id,s.org,s.property,CASE WHEN a.label='lease_document' THEN s.lease END,
  CASE WHEN a.label='maintenance_document' THEN (SELECT id FROM activity_sources WHERE label='maintenance_event') END,
  'other',a.label||'.pdf',s.org::text||'/branches/'||s.branch::text||'/documents/'||a.id::text||'.pdf','application/pdf',1
FROM activity_sources a CROSS JOIN activity_scope s WHERE a.label LIKE '%document';

CREATE TEMP TABLE activity_matrix(entity text, domain text);
INSERT INTO activity_matrix VALUES
 ('property','operations'),('unit','operations'),('task','operations'),('tenant_request','operations'),
 ('person','people'),('person_branch_relationship','people'),
 ('lease','leases'),('lease_billing_term','leases'),('lease_occupancy','leases'),
 ('lease_occupancy_participant','leases'),('lease_party','leases'),('lease_term','leases'),
 ('ledger_entry','finance'),('financial_month','finance'),('finance_income_item','finance'),('finance_expense_item','finance'),
 ('finance_receipt','finance'),('finance_receipt_allocation','finance'),('finance_payment','finance'),('finance_payment_allocation','finance'),
 ('tenant_invoice','finance'),('tenant_invoice_line','finance'),('tenant_invoice_payment','finance'),('tenant_invoice_payment_allocation','finance'),
 ('tenant_commercial_document_artifact','finance'),('owner_collection_confirmation','finance'),('owner_collection_confirmation_allocation','finance'),
 ('owner_invoice','finance'),('owner_invoice_line','finance'),('owner_payment','finance'),('owner_payment_allocation','finance'),
 ('owner_charge_cash_allocation','finance'),('property_withdrawal','finance'),('owner_cash_event','finance'),('lease_deposit_event','finance'),
 ('expense_submission','finance'),('expense_transaction','finance'),('expense_customer_adjustment','finance'),
 ('management_fee_occurrence','finance'),('fee_payment_date_correction','finance'),('owner_opening_balance_request','finance'),
 ('petty_cash_entry','finance'),('petty_cash_account','finance'),('petty_cash_period','finance'),('rent_policy_version','finance'),
 ('organization','admin'),('organization_branch','admin'),('organization_invitation','admin'),('organization_membership','admin'),
 ('import','admin'),('future_unknown_entity','admin');
GRANT SELECT ON activity_matrix TO authenticated;

-- Insert synthetic historical snapshots, including deleted-source domains,
-- without constructing unrelated finance workflows. This isolates SELECT RLS.
-- Source/branch write validation has its own regression suite.
ALTER TABLE public.activity_logs DISABLE TRIGGER activity_logs_guard_branch_snapshot;
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action,new_values)
SELECT s.org,s.branch,m.entity,gen_random_uuid(),'domain-matrix',jsonb_build_object('sensitive_snapshot',m.domain)
FROM activity_scope s CROSS JOIN activity_matrix m;
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action)
SELECT org,other_branch,'property',gen_random_uuid(),'other-branch' FROM activity_scope
UNION ALL SELECT other_org,foreign_branch,'property',gen_random_uuid(),'other-company' FROM activity_scope
UNION ALL SELECT org,NULL,'property',gen_random_uuid(),'unresolved-branch' FROM activity_scope;
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action,new_values)
SELECT s.org,s.branch,CASE WHEN a.label LIKE '%document' THEN 'document' ELSE 'timeline_event' END,
  a.id,a.label,'{}'::jsonb FROM activity_scope s CROSS JOIN activity_sources a;
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action,previous_values,new_values)
SELECT s.org,s.branch,'timeline_event',a.id,'historical-lease',jsonb_build_object('lease_id',s.lease),'{}'::jsonb
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='property_event'
UNION ALL SELECT s.org,s.branch,'document',a.id,'historical-finance',jsonb_build_object('ledger_entry_id',gen_random_uuid()),'{}'::jsonb
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='property_document'
UNION ALL SELECT s.org,s.branch,'document',a.id,'historical-timeline',jsonb_build_object('timeline_event_id',gen_random_uuid()),'{}'::jsonb
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='property_document';
-- A currently readable Maintenance event must not expose its former property
-- domain through either side of an older activity record. Document history has
-- the same constraint when a property attachment becomes lease-linked.
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action,previous_values,new_values)
SELECT s.org,s.branch,'timeline_event',a.id,'property-to-maintenance',
  jsonb_build_object('event_type','General Note','title','Property-only title','description','Property-only description'),
  jsonb_build_object('event_type','Maintenance','title','Current maintenance title')
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='maintenance_event'
UNION ALL SELECT s.org,s.branch,'timeline_event',a.id,'property-before-maintenance',NULL,
  jsonb_build_object('event_type','Document Added','title','Former property title')
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='maintenance_event'
UNION ALL SELECT s.org,s.branch,'timeline_event',a.id,'maintenance-history',
  jsonb_build_object('property_id',s.property,'event_type','Maintenance','title','Previous maintenance title'),
  jsonb_build_object('property_id',s.property,'event_type','Maintenance','title','Current maintenance title')
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='maintenance_event'
UNION ALL SELECT s.org,s.branch,'document',a.id,'property-to-lease-document',
  jsonb_build_object('property_id',s.property,'lease_id',NULL,'ledger_entry_id',NULL,'task_id',NULL,'tenant_request_id',NULL,'timeline_event_id',NULL,'file_name','Property-only attachment.pdf'),
  jsonb_build_object('property_id',s.property,'lease_id',s.lease,'ledger_entry_id',NULL,'task_id',NULL,'tenant_request_id',NULL,'timeline_event_id',NULL,'file_name','Lease attachment.pdf')
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='lease_document';
-- Match the legacy update_document payload: its omitted parent links cannot
-- prove whether this metadata belonged to a lease/finance timeline parent.
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action,previous_values,new_values)
SELECT s.org,s.branch,'document',a.id,'ambiguous-document-history',
  jsonb_build_object('category','other','property_id',s.property,'unit_id',NULL,'lease_id',NULL,'task_id',NULL),
  jsonb_build_object('category','maintenance','property_id',s.property,'unit_id',NULL,'lease_id',NULL,'task_id',NULL)
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='maintenance_document';
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action,previous_values,new_values)
SELECT s.org,s.branch,'timeline_event',a.id,'scope-other-branch',
  jsonb_build_object('property_id',s.other_property,'event_type','General Note','title','Other branch history'),'{}'::jsonb
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='property_event'
UNION ALL SELECT s.org,s.branch,'timeline_event',a.id,'scope-other-company',
  jsonb_build_object('property_id',s.foreign_property,'event_type','General Note','title','Other company history'),'{}'::jsonb
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='property_event'
UNION ALL SELECT s.org,s.branch,'timeline_event',a.id,'scope-missing-property','{}'::jsonb,
  jsonb_build_object('property_id',gen_random_uuid(),'event_type','General Note','title','Missing property history')
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='property_event'
UNION ALL SELECT s.org,s.branch,'timeline_event',a.id,'scope-malformed-property','{}'::jsonb,
  jsonb_build_object('property_id','not-a-uuid','event_type','General Note','title','Malformed property history')
FROM activity_scope s CROSS JOIN activity_sources a WHERE a.label='property_event';
INSERT INTO public.activity_logs(organization_id,branch_id,entity_type,entity_id,action)
SELECT org,branch,'timeline_event',gen_random_uuid(),'missing-source' FROM activity_scope
UNION ALL SELECT org,branch,'document',gen_random_uuid(),'missing-source' FROM activity_scope
UNION ALL SELECT org,branch,'lease',lease,'lease_deposit_applied' FROM activity_scope
UNION ALL SELECT org,branch,'lease',lease,'deposit_rent_custody_confirmed' FROM activity_scope
UNION ALL SELECT org,branch,'lease',lease,'apply_deposit_to_rent' FROM activity_scope
UNION ALL SELECT org,branch,'lease',lease,'reverse_deposit_rent_application' FROM activity_scope;
ALTER TABLE public.activity_logs ENABLE TRIGGER activity_logs_guard_branch_snapshot;

SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='activity_logs' AND cmd IN ('SELECT','ALL')),1::bigint,
  'one SELECT policy prevents permissive OR from bypassing domain checks');

SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM activity_readers WHERE label='operations'),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action='domain-matrix'),4::bigint,'Operations sees property/unit/task/request only');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_type IN ('lease','financial_month','ledger_entry')),0::bigint,'Operations cannot read lease or financial snapshots');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('property_event','maintenance_event','property_document')),3::bigint,'Operations reads authorized polymorphic sources');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('lease_event','lease_document')),0::bigint,'lease-linked General Note and document do not fall back to properties');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action LIKE 'historical-%'),0::bigint,'current readable source cannot expose restricted historical snapshots');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('property-to-maintenance','property-before-maintenance')),2::bigint,'combined properties and maintenance reader sees both historical property snapshots');
SELECT is((SELECT count(*) FROM public.documents WHERE id=(SELECT id FROM activity_sources WHERE label='maintenance_document')),1::bigint,'Operations can read the current maintenance document source');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action='ambiguous-document-history'),0::bigint,'readable document cannot expose history with missing domain links');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action LIKE 'scope-%'),0::bigint,'historical properties from other branches, companies, or unresolved scope fail closed');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('other-branch','other-company','unresolved-branch','missing-source')),0::bigint,'branch, company, unresolved and missing-source activity fail closed');
RESET ROLE;

-- Each role sees exactly its permitted entity family, not merely a subset.
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM activity_readers WHERE label='maintenance'),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.timeline_events WHERE id=(SELECT id FROM activity_sources WHERE label='maintenance_event')),1::bigint,'maintenance-only reader can read the current event source');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('maintenance_event','maintenance-history')),2::bigint,'maintenance-only reader retains current and historical maintenance activity');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('property-to-maintenance','property-before-maintenance')),0::bigint,'maintenance-only reader cannot read previous or new property-domain snapshots');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM activity_readers WHERE label='leases'),true);
SET LOCAL ROLE authenticated;
SELECT results_eq($$SELECT entity_type FROM public.activity_logs WHERE action='domain-matrix' ORDER BY entity_type$$,
  $$SELECT entity FROM activity_matrix WHERE domain='leases' ORDER BY entity$$,'lease reader sees only the complete lease family');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('lease_event','lease_document')),2::bigint,'lease reader sees lease sources');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action='property-to-lease-document'),0::bigint,'lease reader cannot read the document former property-domain snapshot');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('lease_deposit_applied','deposit_rent_custody_confirmed','apply_deposit_to_rent','reverse_deposit_rent_application')),0::bigint,'legacy and deposit-rent snapshots require finance permission too');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM activity_readers WHERE label='finance'),true);
SET LOCAL ROLE authenticated;
SELECT results_eq($$SELECT entity_type FROM public.activity_logs WHERE action='domain-matrix' ORDER BY entity_type$$,
  $$SELECT entity FROM activity_matrix WHERE domain='finance' ORDER BY entity$$,'finance reader sees only the complete finance family');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM activity_readers WHERE label='people'),true);
SET LOCAL ROLE authenticated;
SELECT results_eq($$SELECT entity_type FROM public.activity_logs WHERE action='domain-matrix' ORDER BY entity_type$$,
  $$SELECT entity FROM activity_matrix WHERE domain='people' ORDER BY entity$$,'people reader sees only people activity');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM activity_readers WHERE label='all'),true);
SET LOCAL ROLE authenticated;
SELECT results_eq($$SELECT entity_type FROM public.activity_logs WHERE action='domain-matrix' ORDER BY entity_type$$,
  $$SELECT entity FROM activity_matrix WHERE domain<>'admin' ORDER BY entity$$,'all domain permissions still do not expose admin or unknown entities');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action LIKE 'historical-%'),3::bigint,'combined reader can read historical cross-domain snapshots');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('property-to-maintenance','property-before-maintenance','property-to-lease-document')),3::bigint,'combined reader retains historical property-domain activity after domain changes');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action='ambiguous-document-history'),1::bigint,'all-domain reader retains legacy document history with missing domain links');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action LIKE 'scope-%'),0::bigint,'combined domain permissions cannot bypass historical property scope');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('lease_deposit_applied','deposit_rent_custody_confirmed','apply_deposit_to_rent','reverse_deposit_rent_application')),4::bigint,'combined lease and finance reader sees legacy and deposit-rent snapshots');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action='missing-source'),0::bigint,'even combined reader cannot infer a missing polymorphic source');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT outsider::text FROM activity_scope),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id IN (SELECT org FROM activity_scope UNION ALL SELECT other_org FROM activity_scope)),0::bigint,'authenticated nonmember has no activity access');
RESET ROLE;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=false WHERE organization_id=(SELECT org FROM activity_scope);
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM activity_readers WHERE label='all'),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id=(SELECT org FROM activity_scope)),0::bigint,'disabled ordinary access denies all activity');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT admin::text FROM activity_scope),true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action='domain-matrix'),(SELECT count(*) FROM activity_matrix),'Super Admin retains all own-company domains including unknown');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action IN ('other-branch','unresolved-branch','missing-source')),4::bigint,'Super Admin retains own-company historical and unresolved activity');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action LIKE 'scope-%'),4::bigint,'Super Admin retains own-company activity even when historical property scope is unresolved');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE action='other-company'),0::bigint,'Super Admin cannot read another company');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
