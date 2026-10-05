BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
VALUES
 ('d5050000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'date-audit@test.invalid', '{"provider":"email","providers":["email"]}', '{}'),
 ('d5050000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'date-editor@test.invalid', '{"provider":"email","providers":["email"]}', '{}'),
 ('d5050000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'other-date-actor@test.invalid', '{"provider":"email","providers":["email"]}', '{}');
INSERT INTO public.organizations(id, name, slug, operational_timezone)
VALUES
 ('d5050000-0000-4000-8000-000000000001', 'Cambodia date audit', 'date-audit-cambodia', 'Asia/Phnom_Penh'),
 ('d5050000-0000-4000-8000-000000000002', 'UTC date audit', 'date-audit-utc', 'UTC');
INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES
 ('d5050000-0000-4000-8000-000000000001', 'd5050000-0000-4000-8000-000000000010', 'super_admin'),
 ('d5050000-0000-4000-8000-000000000001', 'd5050000-0000-4000-8000-000000000011', 'super_admin'),
 ('d5050000-0000-4000-8000-000000000002', 'd5050000-0000-4000-8000-000000000012', 'super_admin');
INSERT INTO public.properties(id, organization_id, name, code, property_type)
VALUES
 ('d5050000-0000-4000-8000-000000000003', 'd5050000-0000-4000-8000-000000000001', 'Date audit property', 'DATE-AUDIT', 'Apartment'),
 ('d5050000-0000-4000-8000-000000000004', 'd5050000-0000-4000-8000-000000000002', 'Other date property', 'DATE-OTHER', 'Apartment');

INSERT INTO public.ledger_entries(id, organization_id, property_id, transaction_date, direction, category, amount, created_by)
VALUES ('d5050000-0000-4000-8000-000000000007', 'd5050000-0000-4000-8000-000000000002', 'd5050000-0000-4000-8000-000000000004', '2026-01-01', 'income', 'other', 75, 'd5050000-0000-4000-8000-000000000012');
INSERT INTO public.activity_logs(id, organization_id, actor_id, entity_type, entity_id, action, new_values)
VALUES ('d5050000-0000-4000-8000-000000000008', 'd5050000-0000-4000-8000-000000000002', 'd5050000-0000-4000-8000-000000000012', 'property', 'd5050000-0000-4000-8000-000000000004', 'updated', '{"transaction_date":"2026-01-01"}');

SELECT set_config('request.jwt.claim.sub', 'd5050000-0000-4000-8000-000000000010', true);
INSERT INTO public.ledger_entries(id, organization_id, property_id, transaction_date, direction, category, amount, created_at, created_by, updated_at, updated_by)
VALUES ('d5050000-0000-4000-8000-000000000005', 'd5050000-0000-4000-8000-000000000001', 'd5050000-0000-4000-8000-000000000003', '2025-12-31', 'income', 'other', 25, '2025-12-31T00:00:00Z', 'd5050000-0000-4000-8000-000000000011', '2025-12-31T00:00:00Z', 'd5050000-0000-4000-8000-000000000011');

CREATE TEMP TABLE original_date_audit AS
SELECT created_at, created_by, updated_at FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005';
SELECT is((SELECT transaction_date FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005'), '2025-12-31'::date, 'backdated effective date is preserved');
SELECT ok((SELECT created_at >= transaction_timestamp() AND created_at <= clock_timestamp() FROM original_date_audit), 'creation timestamp reflects record entry instead of the financial date');
SELECT is((SELECT created_by FROM original_date_audit), 'd5050000-0000-4000-8000-000000000010'::uuid, 'creation actor comes from the authenticated session');
SELECT is((SELECT updated_at FROM original_date_audit), (SELECT created_at FROM original_date_audit), 'initial edit time equals the automatic creation time');

SELECT set_config('request.jwt.claim.sub', 'd5050000-0000-4000-8000-000000000011', true);
UPDATE public.ledger_entries SET description='Reviewed backdated entry', updated_at='2025-01-01T00:00:00Z', updated_by='d5050000-0000-4000-8000-000000000010', audit_actors='{"createdBy":"d5050000-0000-4000-8000-000000000011","updatedBy":"d5050000-0000-4000-8000-000000000010"}'
WHERE id='d5050000-0000-4000-8000-000000000005';
SELECT is((SELECT created_at FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005'), (SELECT created_at FROM original_date_audit), 'editing preserves the immutable creation timestamp');
SELECT is((SELECT created_by FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005'), (SELECT created_by FROM original_date_audit), 'editing preserves the immutable creator');
SELECT ok((SELECT updated_at > (SELECT created_at FROM original_date_audit) AND updated_at <= clock_timestamp() FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005'), 'edit timestamp is assigned automatically');
SELECT is((SELECT updated_by FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005'), 'd5050000-0000-4000-8000-000000000011'::uuid, 'edit actor comes from the authenticated editor');
SELECT throws_ok($$UPDATE public.ledger_entries SET created_at='2024-01-01T00:00:00Z' WHERE id='d5050000-0000-4000-8000-000000000005'$$, '22023', 'Financial record creation time and actor are immutable', 'creation time cannot be rewritten');
SELECT throws_ok($$UPDATE public.ledger_entries SET created_by='d5050000-0000-4000-8000-000000000011' WHERE id='d5050000-0000-4000-8000-000000000005'$$, '22023', 'Financial record creation time and actor are immutable', 'creator cannot be rewritten');

INSERT INTO public.activity_logs(id, organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values, created_at)
VALUES ('d5050000-0000-4000-8000-000000000006', 'd5050000-0000-4000-8000-000000000001', 'd5050000-0000-4000-8000-000000000010', 'ledger_entry', 'd5050000-0000-4000-8000-000000000005', 'updated', '{"transaction_date":"2025-12-31"}', '{"transaction_date":"2026-01-01"}', '2024-01-01T00:00:00Z');
SELECT ok((SELECT created_at >= transaction_timestamp() AND actor_id='d5050000-0000-4000-8000-000000000011' AND previous_values->>'transaction_date'='2025-12-31' AND new_values->>'transaction_date'='2026-01-01' FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000006'), 'audit records keep old and new financial dates with the actual editor and entry timestamp');
SELECT throws_ok($$UPDATE public.activity_logs SET new_values='{}' WHERE id='d5050000-0000-4000-8000-000000000006'$$, '22023', 'Activity history is immutable', 'audit date history cannot be rewritten');
SELECT throws_ok($$DELETE FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000006'$$, '22023', 'Activity history is immutable', 'audit date history cannot be deleted');

SELECT is((SELECT count(*) FROM public.ledger_entries WHERE organization_id='d5050000-0000-4000-8000-000000000002'), 1::bigint, 'the other organization has a financial record to isolate');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id='d5050000-0000-4000-8000-000000000002'), 1::bigint, 'the other organization has audit evidence to isolate');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.ledger_entries WHERE organization_id='d5050000-0000-4000-8000-000000000002'), 0::bigint, 'financial records remain isolated by organization');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id='d5050000-0000-4000-8000-000000000002'), 0::bigint, 'audit records remain isolated by organization');
RESET ROLE;
SELECT is((SELECT operational_timezone FROM public.organizations WHERE id='d5050000-0000-4000-8000-000000000001'), 'Asia/Phnom_Penh', 'date handling does not rewrite company timezone configuration');

SELECT is((SELECT audit_actors->>'createdBy' FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005'), 'd5050000-0000-4000-8000-000000000010', 'financial creator is retained independently of the actor foreign key');
SELECT is((SELECT audit_actors->>'updatedBy' FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000005'), 'd5050000-0000-4000-8000-000000000011', 'financial editor snapshot follows the authenticated edit');
SELECT throws_ok($$UPDATE public.activity_logs SET actor_id=NULL WHERE id='d5050000-0000-4000-8000-000000000006'$$, '22023', 'Activity history is immutable', 'ordinary updates cannot detach the financial audit actor');
SELECT throws_ok($$UPDATE public.activity_logs SET entity_type='property' WHERE id='d5050000-0000-4000-8000-000000000006'$$, '22023', NULL, 'financial audit protection cannot be bypassed by changing entity type');
SELECT lives_ok($$UPDATE public.activity_logs SET new_values='{}' WHERE id='d5050000-0000-4000-8000-000000000008'$$, 'nonfinancial activity keeps its existing update behavior');
SELECT lives_ok($$DELETE FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000008'$$, 'nonfinancial activity keeps its existing deletion behavior');

SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
VALUES ('d5050000-0000-4000-8000-000000000013', 'authenticated', 'authenticated', 'detached-date-actor@test.invalid', '{"provider":"email","providers":["email"]}', '{}');
INSERT INTO public.ledger_entries(id, organization_id, property_id, transaction_date, direction, category, amount, created_by, updated_by)
VALUES ('d5050000-0000-4000-8000-000000000009', 'd5050000-0000-4000-8000-000000000001', 'd5050000-0000-4000-8000-000000000003', '2025-12-31', 'income', 'other', 10, 'd5050000-0000-4000-8000-000000000013', 'd5050000-0000-4000-8000-000000000013');
INSERT INTO public.activity_logs(id, organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values)
VALUES ('d5050000-0000-4000-8000-000000000009', 'd5050000-0000-4000-8000-000000000001', 'd5050000-0000-4000-8000-000000000013', 'ledger_entry', 'd5050000-0000-4000-8000-000000000009', 'updated', '{"transaction_date":"2025-12-30"}', '{"transaction_date":"2025-12-31"}');
CREATE TEMP TABLE detached_date_audit AS SELECT created_at, updated_at FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000009';
SELECT lives_ok($$DELETE FROM auth.users WHERE id='d5050000-0000-4000-8000-000000000013'$$, 'actual actor deletion keeps existing foreign-key deletion semantics');
SELECT ok((SELECT created_by IS NULL AND updated_by IS NULL AND audit_actors->>'createdBy'='d5050000-0000-4000-8000-000000000013' AND audit_actors->>'updatedBy'='d5050000-0000-4000-8000-000000000013' FROM public.ledger_entries WHERE id='d5050000-0000-4000-8000-000000000009'), 'actor deletion retains financial creator and editor evidence');
SELECT ok((SELECT l.created_at=d.created_at AND l.updated_at=d.updated_at FROM public.ledger_entries l CROSS JOIN detached_date_audit d WHERE l.id='d5050000-0000-4000-8000-000000000009'), 'actor deletion does not invent a financial edit timestamp');
SELECT ok((SELECT actor_id IS NULL AND recorded_actor_id='d5050000-0000-4000-8000-000000000013' AND previous_values->>'transaction_date'='2025-12-30' AND new_values->>'transaction_date'='2025-12-31' FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000009'), 'actor deletion retains the audit actor and old/new dates');

SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug)
VALUES ('d5050000-0000-4000-8000-000000000014', 'Date audit cascade', 'date-audit-cascade');
SET LOCAL session_replication_role = origin;
INSERT INTO public.activity_logs(id, organization_id, entity_type, entity_id, action)
VALUES ('d5050000-0000-4000-8000-000000000014', 'd5050000-0000-4000-8000-000000000014', 'ledger_entry', 'd5050000-0000-4000-8000-000000000014', 'created');
SELECT lives_ok($$DELETE FROM public.organizations WHERE id='d5050000-0000-4000-8000-000000000014'$$, 'actual organization deletion keeps its existing audit cascade');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE organization_id='d5050000-0000-4000-8000-000000000014'), 0::bigint, 'organization cascade leaves no orphan audit row');
INSERT INTO public.activity_logs(id, organization_id, entity_type, entity_id, action)
VALUES ('d5050000-0000-4000-8000-000000000015', 'd5050000-0000-4000-8000-000000000001', 'lease', 'd5050000-0000-4000-8000-000000000015', 'lease_deposit_event_recorded');
SELECT throws_ok($$DELETE FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000015'$$, '22023', 'Activity history is immutable', 'deposit financial history is protected when logged against a lease');
SELECT ok(NOT has_parameter_privilege('authenticated', 'session_replication_role', 'SET'), 'ordinary authenticated callers cannot use the privileged synthetic cleanup override');
SET LOCAL session_replication_role = replica;
DELETE FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000015' AND organization_id='d5050000-0000-4000-8000-000000000001';
SET LOCAL session_replication_role = origin;
SELECT is((SELECT count(*) FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000015'), 0::bigint, 'privileged transaction-local cleanup removes its exact synthetic financial audit');
SELECT is((SELECT count(*) FROM public.activity_logs WHERE id='d5050000-0000-4000-8000-000000000006'), 1::bigint, 'scoped synthetic cleanup preserves unrelated financial audit evidence');
SELECT * FROM finish();
ROLLBACK;
