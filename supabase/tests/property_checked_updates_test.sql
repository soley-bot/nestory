BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('f4940000-0000-4000-8000-000000000001', 'property-check-admin@example.test'),
  ('f4940000-0000-4000-8000-000000000002', 'property-check-viewer@example.test'),
  ('f4940000-0000-4000-8000-000000000003', 'property-check-writer@example.test');
INSERT INTO public.organizations (id, name, slug) VALUES
  ('f4940000-0000-4000-8000-000000000010', 'Property checks', 'property-checked-updates-test'),
  ('f4940000-0000-4000-8000-000000000011', 'Foreign property checks', 'property-checked-updates-foreign-test');
INSERT INTO public.organization_branches (id, organization_id, name, code) VALUES
  ('f4940000-0000-4000-8000-000000000020', 'f4940000-0000-4000-8000-000000000010', 'First', 'FIRST'),
  ('f4940000-0000-4000-8000-000000000021', 'f4940000-0000-4000-8000-000000000010', 'Second', 'SECOND'),
  ('f4940000-0000-4000-8000-000000000022', 'f4940000-0000-4000-8000-000000000011', 'Foreign', 'FOREIGN');
INSERT INTO public.organization_roles (id, organization_id, name) VALUES
  ('f4940000-0000-4000-8000-000000000030', 'f4940000-0000-4000-8000-000000000010', 'Property viewer'),
  ('f4940000-0000-4000-8000-000000000031', 'f4940000-0000-4000-8000-000000000010', 'Property writer');
INSERT INTO public.organization_role_permissions (organization_id, role_id, permission_key) VALUES
  ('f4940000-0000-4000-8000-000000000010', 'f4940000-0000-4000-8000-000000000030', 'properties.view'),
  ('f4940000-0000-4000-8000-000000000010', 'f4940000-0000-4000-8000-000000000031', 'properties.view'),
  ('f4940000-0000-4000-8000-000000000010', 'f4940000-0000-4000-8000-000000000031', 'properties.write');
INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, custom_role_id) VALUES
  ('f4940000-0000-4000-8000-000000000010', 'f4940000-0000-4000-8000-000000000001', 'super_admin', NULL, NULL),
  ('f4940000-0000-4000-8000-000000000010', 'f4940000-0000-4000-8000-000000000002', 'custom', 'f4940000-0000-4000-8000-000000000020', 'f4940000-0000-4000-8000-000000000030'),
  ('f4940000-0000-4000-8000-000000000010', 'f4940000-0000-4000-8000-000000000003', 'custom', 'f4940000-0000-4000-8000-000000000021', 'f4940000-0000-4000-8000-000000000031');
INSERT INTO public.properties (id, organization_id, name, code, property_type) VALUES
  ('f4940000-0000-4000-8000-000000000040', 'f4940000-0000-4000-8000-000000000010', 'Initial', 'CHECK', 'House'),
  ('f4940000-0000-4000-8000-000000000041', 'f4940000-0000-4000-8000-000000000011', 'Initial', 'CHECK', 'House');
SELECT set_config('request.jwt.claim.sub', 'f4940000-0000-4000-8000-000000000001', true);
SELECT public.assign_property_branch('f4940000-0000-4000-8000-000000000010',
  'f4940000-0000-4000-8000-000000000040', 'f4940000-0000-4000-8000-000000000020');
UPDATE public.organization_authorization_states SET ordinary_access_enabled = true
WHERE organization_id = 'f4940000-0000-4000-8000-000000000010';
INSERT INTO public.people (id, organization_id, display_name) VALUES
  ('f4940000-0000-4000-8000-000000000050', 'f4940000-0000-4000-8000-000000000010', 'First owner'),
  ('f4940000-0000-4000-8000-000000000051', 'f4940000-0000-4000-8000-000000000010', 'Second owner');

CREATE TEMP TABLE property_snapshots (label text PRIMARY KEY, record jsonb, activity_count bigint);
INSERT INTO property_snapshots SELECT 'initial', to_jsonb(p),
  (SELECT count(*) FROM public.activity_logs WHERE entity_id = p.id)
FROM public.properties p WHERE p.id = 'f4940000-0000-4000-8000-000000000040';
GRANT ALL ON property_snapshots TO authenticated;

CREATE FUNCTION pg_temp.save_property(
  p_name text, p_version uuid, p_owner uuid DEFAULT NULL,
  p_started date DEFAULT NULL, p_share numeric DEFAULT NULL,
  p_property uuid DEFAULT 'f4940000-0000-4000-8000-000000000040',
  p_org uuid DEFAULT 'f4940000-0000-4000-8000-000000000010'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.update_property_details_checked(p_property, p_org, p_version,
    p_name, 'CHECK', 'House', NULL, NULL, 'active', NULL, NULL, NULL, p_owner, p_started, p_share)
$$;

SELECT has_column('public', 'properties', 'edit_version', 'property editor has an opaque version');
SELECT ok(NOT has_function_privilege('anon',
  'public.update_property_details_checked(uuid,uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric)', 'EXECUTE'),
  'anonymous callers cannot execute checked property edits');

SELECT set_config('request.jwt.claim.sub', 'f4940000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.save_property(' Initial ', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='initial'))->>'changed',
  'false', 'normalized no-op succeeds without a write');
SELECT is((SELECT to_jsonb(p) FROM public.properties p WHERE p.id='f4940000-0000-4000-8000-000000000040'),
  (SELECT record FROM property_snapshots WHERE label='initial'), 'no-op preserves the entire property including audit fields and version');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id='f4940000-0000-4000-8000-000000000040'),
  (SELECT activity_count FROM property_snapshots WHERE label='initial'), 'no-op records no activity');
SELECT throws_ok($$SELECT pg_temp.save_property('Initial', NULL)$$,
  '22023', 'Property version is required', 'missing versions fail closed even on no-op');

SELECT is(pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='initial'))->>'changed',
  'true', 'first editor applies its change');
INSERT INTO property_snapshots SELECT 'first', to_jsonb(p),
  (SELECT count(*) FROM public.activity_logs WHERE entity_id=p.id)
FROM public.properties p WHERE p.id='f4940000-0000-4000-8000-000000000040';
SELECT isnt((SELECT record->>'edit_version' FROM property_snapshots WHERE label='first'),
  (SELECT record->>'edit_version' FROM property_snapshots WHERE label='initial'), 'successful mutation advances the token');
SELECT throws_ok($$SELECT pg_temp.save_property('Editor two', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='initial'))$$,
  '40001', 'Property changed since this editor was opened', 'second editor cannot overwrite the first');
SELECT is(pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='initial'))->>'changed',
  'false', 'retry after an interrupted response recognizes the already-applied state');
SELECT is((SELECT to_jsonb(p) FROM public.properties p WHERE p.id='f4940000-0000-4000-8000-000000000040'),
  (SELECT record FROM property_snapshots WHERE label='first'), 'stale rejection and retry leave the saved record unchanged');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id='f4940000-0000-4000-8000-000000000040'),
  (SELECT activity_count FROM property_snapshots WHERE label='first'), 'stale rejection and retry create no repeated activity');

SELECT is(pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='first'),
  'f4940000-0000-4000-8000-000000000050', '2026-01-01', 100)->>'changed', 'true', 'ownership-only edit is applied');
INSERT INTO property_snapshots SELECT 'owner', to_jsonb(p),
  (SELECT count(*) FROM public.activity_logs WHERE entity_id=p.id)
FROM public.properties p WHERE p.id='f4940000-0000-4000-8000-000000000040';
SELECT isnt((SELECT record->>'edit_version' FROM property_snapshots WHERE label='owner'),
  (SELECT record->>'edit_version' FROM property_snapshots WHERE label='first'), 'ownership-only change advances the property token');
SELECT is(pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='first'),
  'f4940000-0000-4000-8000-000000000050', '2026-01-01', 100.000)->>'changed', 'false', 'owner retry is a normalized no-op');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id='f4940000-0000-4000-8000-000000000040'),
  (SELECT activity_count FROM property_snapshots WHERE label='owner'), 'owner retry does not repeat owner or property activity');
SELECT throws_ok($$SELECT pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='first'),
  'f4940000-0000-4000-8000-000000000051', '2026-02-01', 100)$$,
  '40001', 'Property changed since this editor was opened', 'stale editor cannot replace the newer owner');

RESET ROLE;
UPDATE public.property_owners SET ownership_percent=80
WHERE property_id='f4940000-0000-4000-8000-000000000040';
SELECT isnt((SELECT edit_version::text FROM public.properties WHERE id='f4940000-0000-4000-8000-000000000040'),
  (SELECT record->>'edit_version' FROM property_snapshots WHERE label='owner'), 'external ownership updates invalidate the editor token');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.save_property('Overwrite', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='owner'),
  'f4940000-0000-4000-8000-000000000050', '2026-01-01', 100)$$,
  '40001', 'Property changed since this editor was opened', 'stale details cannot silently restore an older ownership share');

SELECT set_config('request.jwt.claim.sub', 'f4940000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$SELECT pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='owner'),
  'f4940000-0000-4000-8000-000000000050', '2026-01-01', 80)$$,
  '42501', 'Not authorized', 'view-only callers are denied before no-op detection');
SELECT set_config('request.jwt.claim.sub', 'f4940000-0000-4000-8000-000000000003', true);
SELECT throws_ok($$SELECT pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='owner'),
  'f4940000-0000-4000-8000-000000000050', '2026-01-01', 80)$$,
  '42501', 'Not authorized', 'a writer from another branch cannot use the no-op path');
SELECT set_config('request.jwt.claim.sub', 'f4940000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$SELECT pg_temp.save_property('Initial', gen_random_uuid(), NULL, NULL, NULL,
  'f4940000-0000-4000-8000-000000000041', 'f4940000-0000-4000-8000-000000000011')$$,
  '42501', 'Not authorized', 'cross-organization edits are denied');
SELECT throws_ok($$SELECT pg_temp.save_property('Initial', gen_random_uuid(), NULL, NULL, NULL,
  'f4940000-0000-4000-8000-000000000041')$$,
  '23503', 'Property not found', 'spoofing the organization hides the foreign property');

RESET ROLE;
UPDATE public.properties SET status='Active', code='check', name=' Editor one '
WHERE id='f4940000-0000-4000-8000-000000000040';
INSERT INTO property_snapshots SELECT 'legacy', to_jsonb(p),
  (SELECT count(*) FROM public.activity_logs WHERE entity_id=p.id)
FROM public.properties p WHERE p.id='f4940000-0000-4000-8000-000000000040';
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.save_property('Editor one', (SELECT (record->>'edit_version')::uuid FROM property_snapshots WHERE label='legacy'),
  'f4940000-0000-4000-8000-000000000050', '2026-01-01', 80)->>'changed', 'false', 'unchanged legacy display normalization is a no-op');
SELECT is((SELECT to_jsonb(p) FROM public.properties p WHERE p.id='f4940000-0000-4000-8000-000000000040'),
  (SELECT record FROM property_snapshots WHERE label='legacy'), 'unchanged legacy values are not rewritten');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE entity_id='f4940000-0000-4000-8000-000000000040'),
  (SELECT activity_count FROM property_snapshots WHERE label='legacy'), 'legacy no-op adds no activity');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
