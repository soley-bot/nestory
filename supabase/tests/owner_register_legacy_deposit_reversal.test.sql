BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Synthetic legacy economic history: the receipt/refund and their reversals
-- predate owner allocation capture. No existing fixture rows are rewritten.
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 confirmation_token,recovery_token,email_change_token_new,email_change,
 email_change_token_current,reauthentication_token,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('00000000-0000-0000-0000-000000000000','c1580000-0000-4000-8000-000000000010',
 'authenticated','authenticated','admin@legacy-deposit-register.test','',now(),
 '','','','','','','{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.organizations(id,name,slug)
VALUES ('c1580000-0000-4000-8000-000000000001','Legacy deposit register','legacy-deposit-register');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES ('c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.properties(id,organization_id,name,code,property_type) VALUES
 ('c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000001','Affected property','LEGACY-A','Apartment'),
 ('c1580000-0000-4000-8000-000000000003','c1580000-0000-4000-8000-000000000001','Unrelated property','LEGACY-B','Apartment');
INSERT INTO public.people(id,organization_id,display_name) VALUES
 ('c1580000-0000-4000-8000-000000000004','c1580000-0000-4000-8000-000000000001','Synthetic owner'),
 ('c1580000-0000-4000-8000-000000000005','c1580000-0000-4000-8000-000000000001','Synthetic tenant');
INSERT INTO public.person_roles(organization_id,person_id,role,status)
VALUES ('c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000004','owner','active');
INSERT INTO public.property_owners(id,organization_id,property_id,person_id,ownership_percent,started_on)
VALUES ('c1580000-0000-4000-8000-000000000006','c1580000-0000-4000-8000-000000000001',
 'c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000004',100,'2020-01-01');

-- Only setup bypasses workflow triggers, transaction-locally, to represent
-- imported historical rows. Assertions and authorized writes run normally.
SET LOCAL session_replication_role=replica;
INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id,status)
VALUES ('c1580000-0000-4000-8000-000000000007','c1580000-0000-4000-8000-000000000001',
 'c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000005','ended');
INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status)
VALUES ('c1580000-0000-4000-8000-000000000008','c1580000-0000-4000-8000-000000000001',
 'c1580000-0000-4000-8000-000000000007',750.25,'USD','returned');
INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reversal_of_id) VALUES
 ('c1580000-0000-4000-8000-000000000021','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','received','2029-01-10',750.25,'USD',NULL),
 ('c1580000-0000-4000-8000-000000000022','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','reversed','2029-02-10',750.25,'USD','c1580000-0000-4000-8000-000000000021'),
 ('c1580000-0000-4000-8000-000000000023','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','refunded','2029-01-11',125.50,'USD',NULL),
 ('c1580000-0000-4000-8000-000000000024','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','reversed','2029-02-11',125.50,'USD','c1580000-0000-4000-8000-000000000023');
SET LOCAL session_replication_role=origin;

SELECT is((SELECT count(*) FROM public.owner_event_allocation_sets
 WHERE organization_id='c1580000-0000-4000-8000-000000000001'),0::bigint,
 'fixture has no original or reversal allocation snapshots');
SELECT set_config('request.jwt.claim.sub','c1580000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;

SELECT lives_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000003','USD','2029-02-01','2029-02-28')$$,
 'an unrelated property queue survives missing original deposit allocations');
SELECT lives_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-03-01','2029-03-31')$$,
 'an unrelated month queue survives missing original deposit allocations');
SELECT lives_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-02-01','2029-02-28')$$,
 'the affected month returns blocked deposit reversals instead of throwing source_not_found');

RESET ROLE;

-- Capture read failures as assertion values so the RED run reaches finish().
CREATE FUNCTION pg_temp.legacy_deposit_queue_snapshot(p_property_id uuid,p_start date,p_end date,p_currency public.currency_code DEFAULT 'USD')
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.event_date,q.source_line_id),'[]'::jsonb)
  FROM public.get_owner_event_allocation_queue('c1580000-0000-4000-8000-000000000001',p_property_id,p_currency,p_start,p_end) q);
EXCEPTION WHEN OTHERS THEN
 RETURN jsonb_build_array(jsonb_build_object('error_code',SQLSTATE,'error_message',SQLERRM));
END;
$$;
CREATE FUNCTION pg_temp.legacy_deposit_queue_row(p_source_line_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT row FROM jsonb_array_elements(pg_temp.legacy_deposit_queue_snapshot(
 'c1580000-0000-4000-8000-000000000002','2029-02-01','2029-02-28')) row
 WHERE row->>'source_line_id'=p_source_line_id::text;
$$;

-- Read remediation must never make the strict economic resolver writable.
SELECT throws_ok($$SELECT * FROM app_private.resolve_owner_event_source(
 'c1580000-0000-4000-8000-000000000001','reversal','c1580000-0000-4000-8000-000000000022')$$,
 '23503','source_not_found','receipt reversal strict resolver requires its original allocation');
SELECT throws_ok($$SELECT * FROM app_private.resolve_owner_event_source(
 'c1580000-0000-4000-8000-000000000001','reversal','c1580000-0000-4000-8000-000000000024')$$,
 '23503','source_not_found','refund reversal strict resolver requires its original allocation');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.allocate_owner_event(
 'c1580000-0000-4000-8000-000000000001','reversal','c1580000-0000-4000-8000-000000000022','legacy-receipt-before-original')$$,
 '23503','source_not_found','receipt reversal write remains rejected before original allocation');
SELECT throws_ok($$SELECT public.allocate_owner_event(
 'c1580000-0000-4000-8000-000000000001','reversal','c1580000-0000-4000-8000-000000000024','legacy-refund-before-original')$$,
 '23503','source_not_found','refund reversal write remains rejected before original allocation');

SELECT is(pg_temp.legacy_deposit_queue_snapshot('c1580000-0000-4000-8000-000000000002','2029-02-01','2029-02-28',NULL),
 '[]'::jsonb,'NULL currency selection neither resolves nor leaks USD legacy reversals');
SELECT is(pg_temp.legacy_deposit_queue_snapshot('c1580000-0000-4000-8000-000000000003','2029-02-01','2029-02-28'),
 '[]'::jsonb,'unrelated property has no leaked blocked reversal row');
SELECT is(pg_temp.legacy_deposit_queue_snapshot('c1580000-0000-4000-8000-000000000002','2029-03-01','2029-03-31'),
 '[]'::jsonb,'unrelated month has no leaked blocked reversal row');
SELECT is(jsonb_array_length(pg_temp.legacy_deposit_queue_snapshot(
 'c1580000-0000-4000-8000-000000000002','2029-02-01','2029-02-28')),2,
 'affected month contains exactly the two legacy reversal rows');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000022')->>'gross_signed_amount',
 '-750.25','receipt reversal is negative despite its positive stored amount');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000024')->>'gross_signed_amount',
 '125.50','refund reversal is positive despite its positive stored amount');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000022')->>'allocation_state',
 'blocked','receipt reversal is explicitly blocked, never pending or allocated');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000024')->>'remediation_code',
 'original_deposit_allocation_required','refund reversal provides the original-allocation remediation code');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000022')->>'remediation_code',
 'original_deposit_allocation_required','receipt reversal provides the original-allocation remediation code');
SELECT ok(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000022')->'remediation_detail' @>
 '{"original_source_type":"security_deposit_receipt","original_source_line_id":"c1580000-0000-4000-8000-000000000021","original_event_date":"2029-01-10","lease_id":"c1580000-0000-4000-8000-000000000007","lease_deposit_id":"c1580000-0000-4000-8000-000000000008"}'::jsonb,
 'receipt remediation identifies the original event date, source, lease and deposit');
SELECT ok(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000024')->'remediation_detail' @>
 '{"original_source_type":"security_deposit_refund","original_source_line_id":"c1580000-0000-4000-8000-000000000023","original_event_date":"2029-01-11","lease_id":"c1580000-0000-4000-8000-000000000007","lease_deposit_id":"c1580000-0000-4000-8000-000000000008"}'::jsonb,
 'refund remediation identifies the original refund rather than inventing receipt lineage');
SELECT is((SELECT count(*) FROM public.owner_event_allocation_sets
 WHERE organization_id='c1580000-0000-4000-8000-000000000001'),0::bigint,
 'read remediation and rejected writes manufacture no owner economic history');

SELECT lives_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'security_deposit_receipt','c1580000-0000-4000-8000-000000000021','legacy-allocate-original-receipt')$$,
 'existing authorized allocation RPC repairs the original receipt');
SELECT lives_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'security_deposit_refund','c1580000-0000-4000-8000-000000000023','legacy-allocate-original-refund')$$,
 'existing authorized allocation RPC repairs the original refund');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000022')->>'allocation_state',
 'pending','repairing the original makes its reversal normally allocatable');
SELECT ok(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000022')->>'remediation_code' IS NULL,
 'original-allocation blocker disappears once canonical lineage exists');
SELECT lives_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000024','legacy-allocate-refund-reversal')$$,
 'refund reversal succeeds only after original canonical allocation');
SELECT lives_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000022','legacy-allocate-receipt-reversal')$$,
 'receipt reversal succeeds only after original canonical allocation');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000022')->>'allocation_state',
 'allocated','valid existing receipt reversal output remains allocated');
SELECT is(pg_temp.legacy_deposit_queue_row('c1580000-0000-4000-8000-000000000024')->>'gross_signed_amount',
 '125.50','valid allocated refund reversal retains exact positive economic direction');
SELECT is((SELECT count(*) FROM public.owner_event_allocation_sets
 WHERE organization_id='c1580000-0000-4000-8000-000000000001'),4::bigint,
 'repair produces exactly one allocation per original and reversal');
SELECT is((SELECT sum(signed_amount) FROM public.owner_component_movements
 WHERE organization_id='c1580000-0000-4000-8000-000000000001' AND component='security_deposit_custody'),
 0::numeric,'original receipt/refund and both reversals conserve deposit custody exactly');
SELECT is((SELECT count(*) FROM public.owner_component_movements
 WHERE organization_id='c1580000-0000-4000-8000-000000000001' AND component<>'security_deposit_custody'),
 0::bigint,'deposit remediation does not invent owner operating cash or income');
RESET ROLE;
-- Authorization precedes fallback metadata disclosure.
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-02-01','2029-02-28')$$,
 '42501','owner_allocation_queue_forbidden','missing authenticated identity cannot read remediation');
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES
 ('c1580000-0000-4000-8000-000000000011','branch@legacy-deposit-register.test');
INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES
 ('c1580000-0000-4000-8000-000000000031','c1580000-0000-4000-8000-000000000001','Affected branch','LDR-A'),
 ('c1580000-0000-4000-8000-000000000032','c1580000-0000-4000-8000-000000000001','Other branch','LDR-B');
INSERT INTO public.organization_roles(id,organization_id,name,status)
VALUES ('c1580000-0000-4000-8000-000000000033','c1580000-0000-4000-8000-000000000001','Register reader','active');
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key) VALUES
 ('c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000033','finance.view'),
 ('c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000033','finance.record_payments');
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
VALUES ('c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000011','custom',
 'c1580000-0000-4000-8000-000000000032','c1580000-0000-4000-8000-000000000033');
SET LOCAL session_replication_role=replica;
UPDATE public.properties SET branch_id='c1580000-0000-4000-8000-000000000031'
 WHERE id='c1580000-0000-4000-8000-000000000002' AND organization_id='c1580000-0000-4000-8000-000000000001';
UPDATE public.properties SET branch_id='c1580000-0000-4000-8000-000000000032'
 WHERE id='c1580000-0000-4000-8000-000000000003' AND organization_id='c1580000-0000-4000-8000-000000000001';
SET LOCAL session_replication_role=origin;
UPDATE public.organization_authorization_states SET ordinary_access_enabled=true
 WHERE organization_id='c1580000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','c1580000-0000-4000-8000-000000000011',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-02-01','2029-02-28')$$,
 '42501','owner_allocation_queue_forbidden','finance reader in a different branch cannot read affected deposit lineage');
SELECT is(pg_temp.legacy_deposit_queue_snapshot('c1580000-0000-4000-8000-000000000003','2029-02-01','2029-02-28'),
 '[]'::jsonb,'branch-authorized unrelated queue remains valid and empty');
SELECT throws_matching($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000022','legacy-cross-branch-replay')$$,
 'Not authorized','cross-branch caller cannot replay or allocate valid reversal history');
RESET ROLE;

-- Isolate each malformed same-organization pair so another error cannot mask it.
SELECT set_config('request.jwt.claim.sub','c1580000-0000-4000-8000-000000000010',true);

SAVEPOINT malformed_deposit_property;
SET LOCAL session_replication_role=replica;

INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reversal_of_id) VALUES
 ('c1580000-0000-4000-8000-000000000051','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','received','2029-01-17',77.77,'USD',NULL),
 ('c1580000-0000-4000-8000-000000000052','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000003','c1580000-0000-4000-8000-000000000008','reversed','2029-02-17',77.77,'USD','c1580000-0000-4000-8000-000000000051');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;

SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000003','USD','2029-02-01','2029-02-28')$$,
 '23503','source_not_found','same-org property mismatch stays a strict read failure, never actionable fallback');
SELECT throws_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000052','legacy-malformed-property')$$,
 '23503','source_not_found','same-org property mismatch stays unwritable without original allocation');
RESET ROLE;
ROLLBACK TO SAVEPOINT malformed_deposit_property;
RELEASE SAVEPOINT malformed_deposit_property;

SAVEPOINT malformed_deposit_currency;
SET LOCAL ROLE authenticated;
-- The actual currency enum permits USD only; a stored same-org currency
-- mismatch cannot be constructed without changing the product schema.
-- Verify rejection at the real typed read/write boundaries instead.
SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','KHR'::public.currency_code,'2029-02-01','2029-02-28')$$,
 '22P02','invalid input value for enum currency_code: "KHR"','unsupported currency is rejected before queue discovery');
RESET ROLE;
SELECT throws_ok($$INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reversal_of_id)
 VALUES ('c1580000-0000-4000-8000-000000000052','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','reversed','2029-02-17',77.77,'KHR'::public.currency_code,'c1580000-0000-4000-8000-000000000021')$$,
 '22P02','invalid input value for enum currency_code: "KHR"','stored foreign-currency reversal is rejected by the real enum before any trigger bypass');
ROLLBACK TO SAVEPOINT malformed_deposit_currency;
RELEASE SAVEPOINT malformed_deposit_currency;

SAVEPOINT malformed_deposit_deposit;
SET LOCAL session_replication_role=replica;
INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status)
VALUES ('c1580000-0000-4000-8000-000000000009','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000007',77.77,'USD','returned');
INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reversal_of_id) VALUES
 ('c1580000-0000-4000-8000-000000000051','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','received','2029-01-17',77.77,'USD',NULL),
 ('c1580000-0000-4000-8000-000000000052','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000009','reversed','2029-02-17',77.77,'USD','c1580000-0000-4000-8000-000000000051');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;

SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-02-01','2029-02-28')$$,
 '23503','source_not_found','same-org deposit mismatch stays a strict read failure, never actionable fallback');
SELECT throws_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000052','legacy-malformed-deposit')$$,
 '23503','source_not_found','same-org deposit mismatch stays unwritable without original allocation');
RESET ROLE;
ROLLBACK TO SAVEPOINT malformed_deposit_deposit;
RELEASE SAVEPOINT malformed_deposit_deposit;

SAVEPOINT malformed_deposit_amount;
SET LOCAL session_replication_role=replica;

INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reversal_of_id) VALUES
 ('c1580000-0000-4000-8000-000000000051','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','received','2029-01-17',77.77,'USD',NULL),
 ('c1580000-0000-4000-8000-000000000052','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','reversed','2029-02-17',77.78,'USD','c1580000-0000-4000-8000-000000000051');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;

SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-02-01','2029-02-28')$$,
 '23503','source_not_found','same-org amount mismatch stays a strict read failure, never actionable fallback');
SELECT throws_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000052','legacy-malformed-amount')$$,
 '23503','source_not_found','same-org amount mismatch stays unwritable without original allocation');
RESET ROLE;
ROLLBACK TO SAVEPOINT malformed_deposit_amount;
RELEASE SAVEPOINT malformed_deposit_amount;

SAVEPOINT malformed_deposit_nonfinite;
SET LOCAL session_replication_role=replica;

INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reversal_of_id) VALUES
 ('c1580000-0000-4000-8000-000000000051','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','received','2029-01-17','NaN'::numeric,'USD',NULL),
 ('c1580000-0000-4000-8000-000000000052','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','reversed','2029-02-17','NaN'::numeric,'USD','c1580000-0000-4000-8000-000000000051');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT is((SELECT amount::text FROM public.lease_deposit_events WHERE id='c1580000-0000-4000-8000-000000000051'),
 'NaN','legacy numeric column admits NaN, so read fallback must validate finite economic money');
SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-02-01','2029-02-28')$$,
 '23503','source_not_found','same-org nonfinite mismatch stays a strict read failure, never actionable fallback');
SELECT throws_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000052','legacy-malformed-nonfinite')$$,
 '23503','source_not_found','same-org nonfinite mismatch stays unwritable without original allocation');
RESET ROLE;
ROLLBACK TO SAVEPOINT malformed_deposit_nonfinite;
RELEASE SAVEPOINT malformed_deposit_nonfinite;

-- Historical corruption must not be presented as actionable cross-org repair.
INSERT INTO public.organizations(id,name,slug)
VALUES ('c1580000-0000-4000-8000-000000000041','Foreign legacy register','foreign-legacy-register');
SET LOCAL session_replication_role=replica;
INSERT INTO public.properties(id,organization_id,name,code,property_type)
VALUES ('c1580000-0000-4000-8000-000000000042','c1580000-0000-4000-8000-000000000041','Foreign property','FOREIGN-LDR','Apartment');
INSERT INTO public.people(id,organization_id,display_name)
VALUES ('c1580000-0000-4000-8000-000000000045','c1580000-0000-4000-8000-000000000041','Foreign tenant');
INSERT INTO public.leases(id,organization_id,property_id,primary_tenant_person_id,status)
VALUES ('c1580000-0000-4000-8000-000000000047','c1580000-0000-4000-8000-000000000041',
 'c1580000-0000-4000-8000-000000000042','c1580000-0000-4000-8000-000000000045','ended');
INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status)
VALUES ('c1580000-0000-4000-8000-000000000048','c1580000-0000-4000-8000-000000000041',
 'c1580000-0000-4000-8000-000000000047',77.77,'USD','returned');
INSERT INTO public.lease_deposit_events(id,organization_id,property_id,lease_deposit_id,event_type,event_date,amount,currency,reversal_of_id) VALUES
 ('c1580000-0000-4000-8000-000000000025','c1580000-0000-4000-8000-000000000041','c1580000-0000-4000-8000-000000000042','c1580000-0000-4000-8000-000000000048','received','2029-01-15',77.77,'USD',NULL),
 ('c1580000-0000-4000-8000-000000000026','c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','c1580000-0000-4000-8000-000000000008','reversed','2029-02-15',77.77,'USD','c1580000-0000-4000-8000-000000000025');
SET LOCAL session_replication_role=origin;
SELECT set_config('request.jwt.claim.sub','c1580000-0000-4000-8000-000000000010',true);
SELECT throws_ok($$SELECT * FROM app_private.resolve_owner_event_source(
 'c1580000-0000-4000-8000-000000000001','reversal','c1580000-0000-4000-8000-000000000026')$$,
 '23503','source_not_found','strict resolver never accepts a cross-organization original link');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000001','c1580000-0000-4000-8000-000000000002','USD','2029-02-01','2029-02-28')$$,
 '23503','source_not_found','malformed in-scope foreign-original link fails closed instead of leaking repair metadata');
SELECT throws_ok($$SELECT public.allocate_owner_event('c1580000-0000-4000-8000-000000000001',
 'reversal','c1580000-0000-4000-8000-000000000026','legacy-foreign-original')$$,
 '23503','source_not_found','cross-organization original link is never writable');
SELECT is(pg_temp.legacy_deposit_queue_snapshot('c1580000-0000-4000-8000-000000000003','2029-02-01','2029-02-28'),
 '[]'::jsonb,'malformed foreign-original history cannot poison an unrelated property queue');
SELECT is(pg_temp.legacy_deposit_queue_snapshot('c1580000-0000-4000-8000-000000000002','2029-03-01','2029-03-31'),
 '[]'::jsonb,'malformed foreign-original history cannot poison an unrelated month queue');
SELECT throws_ok($$SELECT * FROM public.get_owner_event_allocation_queue(
 'c1580000-0000-4000-8000-000000000041','c1580000-0000-4000-8000-000000000042','USD','2029-01-01','2029-01-31')$$,
 '42501','owner_allocation_queue_forbidden','organization admin has no authority over foreign organization queue');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
