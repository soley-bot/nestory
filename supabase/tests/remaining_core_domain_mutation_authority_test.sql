BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT plan(54);

CREATE FUNCTION pg_temp.remaining_relationship_payload(
  p_person_id uuid,
  p_lifecycle text DEFAULT 'planned'
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'primaryParty',jsonb_build_object(
      'personId',p_person_id,'lifecycle',p_lifecycle,
      'recordSource','operator_confirmed','reason','remaining_authority_fixture',
      'startedOn',jsonb_build_object('date',NULL,'kind','unknown','confidence','unknown'),
      'endedOn',jsonb_build_object('date',NULL,'kind','unknown','confidence','unknown')
    ),
    'occupancy',jsonb_build_object(
      'lifecycle',CASE WHEN p_lifecycle='effective' THEN 'occupied' ELSE 'reserved' END,
      'recordSource','operator_confirmed','reason','remaining_authority_fixture',
      'scheduledMoveIn',jsonb_build_object('date',(CURRENT_DATE+30)::text,'kind','known','confidence','confirmed'),
      'scheduledMoveOut',jsonb_build_object('date',(CURRENT_DATE+365)::text,'kind','known','confidence','confirmed'),
      'actualMoveIn',jsonb_build_object('date',CASE WHEN p_lifecycle='effective' THEN CURRENT_DATE::text ELSE NULL END,'kind',CASE WHEN p_lifecycle='effective' THEN 'known' ELSE 'unknown' END,'confidence',CASE WHEN p_lifecycle='effective' THEN 'confirmed' ELSE 'unknown' END),
      'actualMoveOut',jsonb_build_object('date',NULL,'kind','unknown','confidence','unknown')
    ),
    'participants','[]'::jsonb
  );
$$;

CREATE FUNCTION pg_temp.remaining_relationship_payload_for_status(
  p_person_id uuid,
  p_lease_status text
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_temp.remaining_relationship_payload(p_person_id),
      '{primaryParty,lifecycle}',
      pg_catalog.to_jsonb(
        CASE
          WHEN p_lease_status = 'cancelled' THEN 'cancelled_before_effective'
          WHEN p_lease_status IN ('ended','terminated') THEN 'ended'
          WHEN p_lease_status IN ('active','notice_given') THEN 'effective'
          ELSE 'planned'
        END
      )
    ),
    '{occupancy,lifecycle}',
    pg_catalog.to_jsonb(
      CASE
        WHEN p_lease_status = 'cancelled' THEN 'cancelled_before_effective'
        WHEN p_lease_status IN ('ended','terminated') THEN 'vacated'
        WHEN p_lease_status = 'notice_given' THEN 'notice_given'
        WHEN p_lease_status = 'active' THEN 'occupied'
        ELSE 'reserved'
      END
    )
  );
$$;

INSERT INTO auth.users(id,email) VALUES
 ('a1100000-0000-0000-0000-000000000001','remaining-super@example.test'),
 ('a1100000-0000-0000-0000-000000000002','remaining-writer@example.test'),
 ('a1100000-0000-0000-0000-000000000003','remaining-viewer@example.test'),
 ('a1100000-0000-0000-0000-000000000004','remaining-prepare@example.test'),
 ('a1100000-0000-0000-0000-000000000005','remaining-change@example.test'),
 ('a1100000-0000-0000-0000-000000000006','remaining-activate@example.test');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('a1200000-0000-0000-0000-000000000001','Remaining A','remaining-a');
INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES
 ('a1300000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','One','R-ONE'),
 ('a1300000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001','Two','R-TWO');
INSERT INTO public.organization_roles(id,organization_id,name) VALUES
 ('a1400000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','Writer'),
 ('a1400000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001','Viewer'),
 ('a1400000-0000-0000-0000-000000000003','a1200000-0000-0000-0000-000000000001','Preparer'),
 ('a1400000-0000-0000-0000-000000000004','a1200000-0000-0000-0000-000000000001','Term changer'),
 ('a1400000-0000-0000-0000-000000000005','a1200000-0000-0000-0000-000000000001','Activator');
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key) VALUES
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','properties.view'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','properties.write'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','properties.archive'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','people.view'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','people.write'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','people.archive'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','leases.prepare'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','leases.activate'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','leases.change_terms'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','leases.close'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001','leases.archive'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000002','properties.view'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000002','people.view'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000003','leases.prepare'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000004','leases.change_terms'),
 ('a1200000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000005','leases.activate');
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id) VALUES
 ('a1200000-0000-0000-0000-000000000001','a1100000-0000-0000-0000-000000000001','super_admin',NULL,NULL),
 ('a1200000-0000-0000-0000-000000000001','a1100000-0000-0000-0000-000000000002','custom','a1300000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000001'),
 ('a1200000-0000-0000-0000-000000000001','a1100000-0000-0000-0000-000000000003','custom','a1300000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000002'),
 ('a1200000-0000-0000-0000-000000000001','a1100000-0000-0000-0000-000000000004','custom','a1300000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000003'),
 ('a1200000-0000-0000-0000-000000000001','a1100000-0000-0000-0000-000000000005','custom','a1300000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000004'),
 ('a1200000-0000-0000-0000-000000000001','a1100000-0000-0000-0000-000000000006','custom','a1300000-0000-0000-0000-000000000001','a1400000-0000-0000-0000-000000000005');
ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties(id,organization_id,branch_id,name,code,property_type,rental_structure) VALUES
 ('a1500000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000001','One Property','R-P1','apartment','undecided'),
 ('a1500000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000002','Two Property','R-P2','apartment','undecided'),
 ('a1500000-0000-0000-0000-000000000003','a1200000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000001','Draft Property','R-P3','apartment','single_space'),
 ('a1500000-0000-0000-0000-000000000004','a1200000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000001','Unit Property','R-P4','apartment','multi_unit');
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.people(id,organization_id,display_name) VALUES
 ('a1600000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','One Person'),
 ('a1600000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001','Two Person'),
 ('a1600000-0000-0000-0000-000000000003','a1200000-0000-0000-0000-000000000001','Draft Person'),
 ('a1600000-0000-0000-0000-000000000004','a1200000-0000-0000-0000-000000000001','Unit Tenant');
INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id) VALUES
 ('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000001','a1300000-0000-0000-0000-000000000001'),
 ('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000002','a1300000-0000-0000-0000-000000000002'),
 ('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000003','a1300000-0000-0000-0000-000000000001'),
 ('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000004','a1300000-0000-0000-0000-000000000001');
INSERT INTO public.person_roles(organization_id,person_id,role) VALUES
 ('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000003','tenant'),
 ('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000004','tenant');
ALTER TABLE public.units DISABLE TRIGGER USER;
INSERT INTO public.units(id,organization_id,property_id,unit_number,status) VALUES
 ('a1800000-0000-0000-0000-000000000004','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000004','U-4','vacant');
ALTER TABLE public.units ENABLE TRIGGER USER;
ALTER TABLE public.leases DISABLE TRIGGER USER;
INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id,status,archived_at) VALUES
 ('a1700000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000001','cancelled',NULL),
 ('a1700000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000002','a1600000-0000-0000-0000-000000000002','cancelled',now()),
 ('a1700000-0000-0000-0000-000000000003','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000003','a1600000-0000-0000-0000-000000000003','draft',NULL),
 ('a1700000-0000-0000-0000-000000000005','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000003','a1600000-0000-0000-0000-000000000003','active',NULL);
ALTER TABLE public.leases ENABLE TRIGGER USER;
ALTER TABLE public.lease_terms DISABLE TRIGGER USER;
INSERT INTO public.lease_terms(
  id,organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,
  rent_currency,rent_due_day,payment_frequency,status,authority_kind,
  confirmed_at,confirmed_by
) VALUES (
  'a1900000-0000-0000-0000-000000000005',
  'a1200000-0000-0000-0000-000000000001',
  'a1700000-0000-0000-0000-000000000005',1,
  CURRENT_DATE-30,CURRENT_DATE+29,1000,'USD',1,'monthly','active',
  'authoritative',now(),'a1100000-0000-0000-0000-000000000001'
);
ALTER TABLE public.lease_terms ENABLE TRIGGER USER;
ALTER TABLE public.lease_parties DISABLE TRIGGER USER;
ALTER TABLE public.lease_occupancies DISABLE TRIGGER USER;
INSERT INTO public.lease_parties(
  organization_id,lease_id,person_id,party_role,is_primary,
  evidence_state,business_lifecycle,record_source
) VALUES (
  'a1200000-0000-0000-0000-000000000001',
  'a1700000-0000-0000-0000-000000000001',
  'a1600000-0000-0000-0000-000000000001',
  'primary_tenant',true,'accepted','cancelled_before_effective','operator_confirmed'
);
INSERT INTO public.lease_occupancies(
  organization_id,lease_id,property_id,status,
  evidence_state,business_lifecycle,record_source
) VALUES (
  'a1200000-0000-0000-0000-000000000001',
  'a1700000-0000-0000-0000-000000000001',
  'a1500000-0000-0000-0000-000000000001',
  'cancelled','accepted','cancelled_before_effective','operator_confirmed'
);
ALTER TABLE public.lease_parties ENABLE TRIGGER USER;
ALTER TABLE public.lease_occupancies ENABLE TRIGGER USER;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id='a1200000-0000-0000-0000-000000000001';

SELECT set_config('request.jwt.claim.sub','a1100000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.set_property_rental_structure('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000001','single_space')$$,'same-branch properties.write edits Property');
SELECT throws_ok($$SELECT public.set_property_rental_structure('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000002','single_space')$$,'42501',NULL,'other-branch Property edit denied');
SELECT lives_ok($$SELECT public.update_property_details('a1500000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','One Property','R-P1','apartment',NULL,NULL,'active',NULL,NULL,NULL,'a1600000-0000-0000-0000-000000000001',DATE '2026-01-01',100)$$,'same-branch properties.write sets Property owner relationship');
SELECT throws_ok($$SELECT public.update_property_details('a1500000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','One Property','R-P1','apartment',NULL,NULL,'active',NULL,NULL,NULL,'a1600000-0000-0000-0000-000000000002',DATE '2026-01-01',100)$$,'42501',NULL,'cross-branch Property owner relationship denied');
SELECT lives_ok($$SELECT public.archive_property('a1500000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001')$$,'same-branch properties.archive archives Property');
SELECT lives_ok($$SELECT public.restore_property('a1500000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001')$$,'same-branch properties.archive restores Property');
SELECT throws_ok($$SELECT public.archive_property('a1500000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001')$$,'42501',NULL,'other-branch Property archive denied');
SELECT lives_ok($$SELECT public.update_person('a1600000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','One Person Updated',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'])$$,'same-branch people.write edits Person');
SELECT throws_ok($$SELECT public.update_person('a1600000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001','Denied',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'])$$,'42501',NULL,'other-branch Person edit denied');
SELECT lives_ok($$SELECT public.archive_person('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000001')$$,'same-branch people.archive archives Person');
SELECT lives_ok($$SELECT public.restore_person('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000001')$$,'same-branch people.archive restores Person');
SELECT throws_ok($$SELECT public.archive_person('a1200000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000002')$$,'42501',NULL,'other-branch Person archive denied');
SELECT lives_ok($$SELECT public.create_asset_photo('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000001',NULL,'one.jpg','remaining/one.jpg','image/jpeg',100,NULL,false,NULL)$$,'same-branch properties.write creates asset');
SELECT throws_ok($$SELECT public.create_asset_photo('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000002',NULL,'two.jpg','remaining/two.jpg','image/jpeg',100,NULL,false,NULL)$$,'42501',NULL,'other-branch asset create denied');
SELECT lives_ok($$SELECT public.set_asset_photo_cover('a1200000-0000-0000-0000-000000000001',(SELECT id FROM public.asset_photos WHERE storage_path='remaining/one.jpg'))$$,'same-branch properties.write sets asset cover');
SELECT lives_ok($$SELECT public.archive_asset_photo('a1200000-0000-0000-0000-000000000001',(SELECT id FROM public.asset_photos WHERE storage_path='remaining/one.jpg'))$$,'same-branch properties.archive archives asset');
SELECT lives_ok($$SELECT public.archive_lease('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000001')$$,'same-branch leases.archive archives terminal Lease');
SELECT throws_ok($$SELECT public.restore_lease('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000001')$$,'0A000',NULL,'same-branch leases.archive reaches protected restore invariant');
SELECT throws_ok($$SELECT public.restore_lease('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000002')$$,'42501',NULL,'other-branch Lease restore denied');
SELECT throws_ok($$SELECT public.create_property_lease('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000001','a1600000-0000-0000-0000-000000000001',DATE '2026-12-31',DATE '2026-01-01',1000,'USD',1,'monthly','draft',NULL,NULL,'draft','remaining-create-one')$$,'22007',NULL,'same-branch leases.prepare reaches Lease date invariant');
SELECT throws_ok($$SELECT public.create_property_lease('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000002','a1600000-0000-0000-0000-000000000002',DATE '2026-12-31',DATE '2026-01-01',1000,'USD',1,'monthly','draft',NULL,NULL,'draft','remaining-create-two')$$,'42501',NULL,'other-branch leases.prepare denied');
SELECT throws_ok($$SELECT public.update_lease_with_authoritative_term('a1700000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000001',NULL,'a1600000-0000-0000-0000-000000000001',DATE '2026-01-01',DATE '2026-12-31',1000,'USD',1,'monthly','draft',NULL,NULL,'cancelled','remaining-change-one')$$,'23503',NULL,'same-branch leases.change_terms reaches archived Lease invariant');
SELECT throws_ok($$SELECT public.update_lease_with_authoritative_term('a1700000-0000-0000-0000-000000000002','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000002',NULL,'a1600000-0000-0000-0000-000000000002',DATE '2026-01-01',DATE '2026-12-31',1000,'USD',1,'monthly','draft',NULL,NULL,'cancelled','remaining-change-two')$$,'42501',NULL,'other-branch leases.change_terms denied');
SELECT throws_ok($$SELECT public.request_lease_activation('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000001','draft',gen_random_uuid(),CURRENT_DATE,'')$$,'22023',NULL,'same-branch leases.activate reaches activation invariant');
SELECT throws_ok($$SELECT public.request_lease_activation('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000002','draft',gen_random_uuid(),CURRENT_DATE,'')$$,'42501',NULL,'other-branch leases.activate denied');
SELECT throws_ok($$SELECT public.transition_lease_lifecycle('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000001','cancelled',gen_random_uuid(),'end',NULL,NULL,'sufficient close reason','remaining-close-one')$$,'22023',NULL,'same-branch leases.close reaches lifecycle invariant');
SELECT throws_ok($$SELECT public.transition_lease_lifecycle('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000002','cancelled',gen_random_uuid(),'end',NULL,NULL,'sufficient close reason','remaining-close-two')$$,'42501',NULL,'other-branch leases.close denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a1100000-0000-0000-0000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.update_lease_with_authoritative_term('a1700000-0000-0000-0000-000000000003','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000003',NULL,'a1600000-0000-0000-0000-000000000003',CURRENT_DATE+30,CURRENT_DATE+365,1000,'USD',1,'monthly','draft',NULL,NULL,'draft','remaining-prepare-draft')$$,'prepare-only actor completes a valid draft Lease edit');
SELECT lives_ok($$SELECT public.create_lease_with_relationships('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000004','a1800000-0000-0000-0000-000000000004','a1600000-0000-0000-0000-000000000004',CURRENT_DATE+30,CURRENT_DATE+365,900,'USD',1,'monthly','draft',NULL,NULL,'draft',pg_temp.remaining_relationship_payload('a1600000-0000-0000-0000-000000000004'),'remaining-prepare-create')$$,'prepare-only actor completes valid relationship Lease creation');
SELECT throws_ok($$SELECT public.create_lease_with_relationships('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000004','a1800000-0000-0000-0000-000000000004','a1600000-0000-0000-0000-000000000004',CURRENT_DATE,CURRENT_DATE+365,900,'USD',1,'monthly','active',NULL,NULL,'active',pg_temp.remaining_relationship_payload('a1600000-0000-0000-0000-000000000004','effective'),'remaining-prepare-active-create')$$,'42501',NULL,'prepare-only actor cannot directly create an active Lease');
SELECT throws_ok($$SELECT public.create_lease_with_relationships('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000004','a1800000-0000-0000-0000-000000000004','a1600000-0000-0000-0000-000000000004',CURRENT_DATE,CURRENT_DATE+365,900,'USD',1,'monthly','draft',NULL,NULL,'cancelled',pg_temp.remaining_relationship_payload_for_status('a1600000-0000-0000-0000-000000000004','cancelled'),'remaining-prepare-cancelled-create')$$,'42501',NULL,'prepare-only actor cannot directly create a cancelled Lease');
SELECT throws_ok($$SELECT public.create_lease_with_relationships('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000004','a1800000-0000-0000-0000-000000000004','a1600000-0000-0000-0000-000000000004',CURRENT_DATE,CURRENT_DATE+365,900,'USD',1,'monthly','active',NULL,NULL,'notice_given',pg_temp.remaining_relationship_payload_for_status('a1600000-0000-0000-0000-000000000004','notice_given'),'remaining-prepare-notice-create')$$,'42501',NULL,'prepare-only actor cannot directly create a notice-given Lease');
SELECT throws_ok($$SELECT public.create_lease_with_relationships('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000004','a1800000-0000-0000-0000-000000000004','a1600000-0000-0000-0000-000000000004',CURRENT_DATE,CURRENT_DATE+365,900,'USD',1,'monthly','ended',NULL,NULL,'ended',pg_temp.remaining_relationship_payload_for_status('a1600000-0000-0000-0000-000000000004','ended'),'remaining-prepare-ended-create')$$,'42501',NULL,'prepare-only actor cannot directly create an ended Lease');
SELECT throws_ok($$SELECT public.create_lease_with_relationships('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000004','a1800000-0000-0000-0000-000000000004','a1600000-0000-0000-0000-000000000004',CURRENT_DATE,CURRENT_DATE+365,900,'USD',1,'monthly','ended',NULL,NULL,'terminated',pg_temp.remaining_relationship_payload_for_status('a1600000-0000-0000-0000-000000000004','terminated'),'remaining-prepare-terminated-create')$$,'42501',NULL,'prepare-only actor cannot directly create a terminated Lease');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a1100000-0000-0000-0000-000000000005',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.update_lease_with_authoritative_term('a1700000-0000-0000-0000-000000000003','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000003',NULL,gen_random_uuid(),DATE '2026-01-01',DATE '2026-12-31',1000,'USD',1,'monthly','draft',NULL,NULL,'draft','remaining-change-draft')$$,'42501',NULL,'change-terms-only actor cannot edit a draft Lease');
SELECT lives_ok($$SELECT public.update_lease_with_authoritative_term('a1700000-0000-0000-0000-000000000005','a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000003',NULL,'a1600000-0000-0000-0000-000000000003',CURRENT_DATE-30,CURRENT_DATE+29,1100,'USD',1,'monthly','active',NULL,NULL,'active','remaining-change-active')$$,'change-terms-only actor completes a valid non-draft term edit');
SELECT throws_ok($$SELECT public.record_current_lease_occupancy_evidence('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000005',gen_random_uuid(),NULL,NULL,NULL,'remaining occupancy proof')$$,'42501',NULL,'change-terms-only actor cannot record current occupancy evidence');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a1100000-0000-0000-0000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.record_current_lease_occupancy_evidence('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000005',gen_random_uuid(),NULL,NULL,NULL,'remaining occupancy proof')$$,'22023',NULL,'activate-only actor reaches the occupancy lifecycle invariant');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a1100000-0000-0000-0000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.set_property_rental_structure('a1200000-0000-0000-0000-000000000001','a1500000-0000-0000-0000-000000000001','multi_unit')$$,'42501',NULL,'missing properties.write denied');
SELECT throws_ok($$SELECT public.update_person('a1600000-0000-0000-0000-000000000001','a1200000-0000-0000-0000-000000000001','Denied',NULL,'individual',NULL,NULL,NULL,NULL,ARRAY['tenant'])$$,'42501',NULL,'missing people.write denied');
SELECT throws_ok($$SELECT public.restore_lease('a1200000-0000-0000-0000-000000000001','a1700000-0000-0000-0000-000000000001')$$,'42501',NULL,'missing leases.archive denied');
RESET ROLE;
SELECT ok(NOT has_table_privilege('authenticated','public.properties','UPDATE') AND NOT has_table_privilege('authenticated','public.people','UPDATE'),'direct core DML remains closed');
SELECT ok(NOT has_table_privilege('authenticated','public.asset_photos','INSERT') AND NOT has_table_privilege('authenticated','public.asset_photos','UPDATE') AND NOT has_table_privilege('authenticated','public.asset_photos','DELETE'),'direct asset DML is closed');
SELECT ok(NOT has_table_privilege('authenticated','public.leases','INSERT') AND NOT has_table_privilege('authenticated','public.leases','UPDATE') AND NOT has_table_privilege('authenticated','public.lease_parties','INSERT') AND NOT has_table_privilege('authenticated','public.lease_occupancies','UPDATE') AND NOT has_table_privilege('authenticated','public.lease_terms','INSERT'),'direct Lease and relationship DML is closed');
SELECT ok(NOT has_table_privilege('authenticated','public.tenant_requests','INSERT') AND NOT has_table_privilege('authenticated','public.tenant_requests','UPDATE') AND NOT has_table_privilege('authenticated','public.tenant_requests','DELETE'),'direct tenant-request DML is contained pending checked workflow RPCs');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('set_property_rental_structure','archive_property','restore_property','update_person','archive_person','restore_person') AND NOT ('search_path=""'=ANY(coalesce(p.proconfig,'{}')))),'touched Property and Person RPCs use empty search paths');
SELECT ok(has_function_privilege('authenticated','public.archive_property(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.archive_property(uuid,uuid)','EXECUTE'),'Property RPC ACL remains authenticated-only');
SELECT ok(has_function_privilege('authenticated','public.archive_person(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.archive_person(uuid,uuid)','EXECUTE'),'Person RPC ACL remains authenticated-only');
SELECT ok(has_function_privilege('authenticated','public.create_asset_photo(uuid,uuid,uuid,text,text,text,bigint,text,boolean,date)','EXECUTE') AND NOT has_function_privilege('anon','public.create_asset_photo(uuid,uuid,uuid,text,text,text,bigint,text,boolean,date)','EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('create_asset_photo','set_asset_photo_cover','archive_asset_photo') AND (NOT p.prosecdef OR NOT ('search_path=""'=ANY(coalesce(p.proconfig,'{}'))))),'asset RPCs are definer, empty-path, authenticated-only');
SELECT ok(has_function_privilege('authenticated','public.archive_lease(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.archive_lease(uuid,uuid)','EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('archive_lease','restore_lease') AND NOT ('search_path=""'=ANY(coalesce(p.proconfig,'{}')))),'Lease archive RPCs remain empty-path and authenticated-only');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('create_lease_with_relationships','cancel_lease_activation','correct_authoritative_lease_term','create_authoritative_lease_term','record_current_lease_occupancy_evidence','schedule_authoritative_lease_term','set_lease_billing_term') AND (pg_get_functiondef(p.oid) LIKE '%app_private.is_org_admin(p_organization_id)%' OR pg_get_functiondef(p.oid) LIKE '%app_private.can_configure_leases(p_organization_id)%')),'remaining public Lease mutation RPCs no longer use fixed-role gates');
SELECT ok(NOT has_function_privilege('authenticated','public.create_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)','EXECUTE'),'low-level authoritative Lease term writer remains internal-only');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id='a1200000-0000-0000-0000-000000000001' AND action IN('property_archived','property_restored','archived','restored')),4::bigint,'successful lifecycle mutations remain audited');
SELECT ok((SELECT ordinary_access_enabled FROM public.organization_authorization_states WHERE organization_id='a1200000-0000-0000-0000-000000000001'),'authorization remains active');
SELECT * FROM finish();
ROLLBACK;
