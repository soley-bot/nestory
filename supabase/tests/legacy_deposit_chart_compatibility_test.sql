BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

INSERT INTO public.lease_deposits(id,organization_id,lease_id,amount,currency,status,created_by,updated_by)
SELECT '88000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000001',id,500,'USD','pending',
 '00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101'
FROM public.current_leases WHERE organization_id='00000000-0000-0000-0000-000000000001'
 AND primary_tenant_person_id='80000000-0000-0000-0000-000000000001';

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','received','2026-07-10',500,'LEGACY-CHART-RECEIVE')$$,
 'released application deposit signature records a receipt');
SELECT is((SELECT liability_account_id FROM public.lease_deposit_events WHERE reference='LEGACY-CHART-RECEIVE'),
 (SELECT account_id FROM public.finance_account_roles WHERE organization_id='00000000-0000-0000-0000-000000000001' AND role_code='security_deposits'),
 'legacy receipt binds the checked organization default liability');
SELECT ok((SELECT ledger_entry_id IS NOT NULL FROM public.lease_deposit_events WHERE reference='LEGACY-CHART-RECEIVE'),
 'legacy receipt preserves operational Ledger projection');
SELECT lives_ok($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','refunded','2026-07-11',100,'LEGACY-CHART-REFUND')$$,
 'released application deposit signature records a bounded refund');
SELECT is((SELECT sum(CASE WHEN event_type='received' THEN amount ELSE -amount END) FROM public.lease_deposit_events WHERE lease_deposit_id='88000000-0000-0000-0000-000000000091'),400::numeric,
 'legacy adapter preserves held cash arithmetic');
SELECT throws_matching($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','refunded','2026-07-12',401,'LEGACY-OVERDRAW')$$,
 'exceeds held deposit balance','legacy caller cannot overdraw held cash');
SELECT throws_matching($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000002','88000000-0000-0000-0000-000000000091','received','2026-07-10',1,'LEGACY-FOREIGN')$$,
 'Not authorized','legacy signature rejects cross-organization access');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
SELECT throws_matching($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','received','2026-07-10',1,'LEGACY-DENIED')$$,
 'Not authorized','legacy signature preserves insufficient-role denial');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
SET LOCAL ROLE authenticated;
SELECT public.set_financial_month_lock('00000000-0000-0000-0000-000000000001','2026-07-01',true,'Legacy deposit month guard');
SELECT throws_matching($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','refunded','2026-07-12',1,'LEGACY-LOCKED-MONTH')$$,
 'Financial month is locked','legacy recording preserves the checked financial month lock');
SELECT public.set_financial_month_lock('00000000-0000-0000-0000-000000000001','2026-07-01',false,'Legacy deposit month guard complete');
SELECT lives_ok($$SELECT public.reverse_lease_deposit_event('00000000-0000-0000-0000-000000000001',
 (SELECT id FROM public.lease_deposit_events WHERE reference='LEGACY-CHART-REFUND'),'2026-07-12','LEGACY-CHART-REFUND-REV')$$,
 'a legacy-recorded refund remains reversible through checked reversal');
SELECT ok((SELECT reversal.liability_account_id=original.liability_account_id
 AND reversal.ledger_entry_id IS NOT NULL AND reversal.reversal_of_id=original.id
 FROM public.lease_deposit_events reversal JOIN public.lease_deposit_events original ON original.id=reversal.reversal_of_id
 WHERE reversal.reference='LEGACY-CHART-REFUND-REV'),'legacy reversal preserves liability and Ledger lineage');

RESET ROLE;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
VALUES('88000000-0000-0000-0000-000000000094','00000000-0000-0000-0000-000000000101',now(),now(),'aal1');
INSERT INTO app_private.privileged_email_step_up_policies(organization_id,enforcement_enabled,enabled_at,enabled_by)
VALUES('00000000-0000-0000-0000-000000000001',true,now(),'00000000-0000-0000-0000-000000000101')
ON CONFLICT(organization_id) DO UPDATE SET enforcement_enabled=true,enabled_at=excluded.enabled_at,enabled_by=excluded.enabled_by;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-000000000101","session_id":"88000000-0000-0000-0000-000000000094"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_matching($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','refunded','2026-07-13',1,'LEGACY-NO-GRANT')$$,
 'Privileged email verification required','legacy recording cannot bypass enabled step-up with authenticated JWT claims');
RESET ROLE;
INSERT INTO app_private.privileged_email_step_up_challenges(
 id,organization_id,user_id,session_id,code_digest,email_digest,delivery_status,
 created_at,expires_at,resend_available_at,sent_at,consumed_at)
VALUES('88000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000101','88000000-0000-0000-0000-000000000094',
 repeat('a',64),repeat('b',64),'sent',now()-interval '1 minute',now()+interval '9 minutes',
 now()+interval '30 seconds',now()-interval '50 seconds',now()-interval '40 seconds');
INSERT INTO app_private.privileged_email_step_up_grants(
 organization_id,user_id,session_id,challenge_id,verified_at,expires_at)
VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',
 '88000000-0000-0000-0000-000000000094','88000000-0000-0000-0000-000000000095',now(),now()+interval '15 minutes');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','refunded','2026-07-13',1,'LEGACY-VERIFIED-REFUND')$$,
 'the exact active session grant authorizes legacy recording');
RESET ROLE;
UPDATE app_private.privileged_email_step_up_grants SET revoked_at=now()
WHERE organization_id='00000000-0000-0000-0000-000000000001' AND session_id='88000000-0000-0000-0000-000000000094';
SET LOCAL ROLE authenticated;
SELECT throws_matching($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','refunded','2026-07-13',1,'LEGACY-REVOKED-GRANT')$$,
 'Privileged email verification required','revoking the session grant blocks subsequent legacy recording');
RESET ROLE;
SELECT set_config('request.jwt.claim.role','',true);
SELECT set_config('request.jwt.claims','{}',true);
UPDATE app_private.privileged_email_step_up_policies SET enforcement_enabled=false,enabled_at=NULL,enabled_by=NULL
WHERE organization_id='00000000-0000-0000-0000-000000000001';
DELETE FROM public.finance_account_roles WHERE organization_id='00000000-0000-0000-0000-000000000001' AND role_code='security_deposits';
SET LOCAL ROLE authenticated;
SELECT throws_matching($$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000091','received','2026-07-10',1,'LEGACY-NO-DEFAULT')$$,
 'deposit liability','missing default fails closed without an unmapped event');
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE lease_deposit_id='88000000-0000-0000-0000-000000000091'),4::bigint,
 'failed attempts leave financial history unchanged');
SELECT ok(NOT has_function_privilege('anon','public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)','EXECUTE'),
 'anonymous callers cannot execute the compatibility adapter');
SELECT ok(NOT has_function_privilege('authenticated','app_private.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)','EXECUTE'),
 'raw private deposit writer remains inaccessible');
SELECT * FROM finish();
ROLLBACK;
