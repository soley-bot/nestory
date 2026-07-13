BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000001','received','2026-07-10',500,'DEP-RECEIPT')$$,
  'admin records a deposit receipt through the public wrapper'
);
SELECT lives_ok(
  $$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000001','applied','2026-07-11',100,'DEP-APPLY')$$,
  'admin applies held deposit funds'
);
SELECT is((SELECT sum(CASE WHEN event_type='received' THEN amount WHEN event_type='reversed' THEN 0 ELSE -amount END) FROM public.lease_deposit_events WHERE lease_deposit_id='88000000-0000-0000-0000-000000000001' AND reversal_of_id IS NULL),400::numeric,'signed deposit semantics expose held balance separately from income');
SELECT throws_matching(
  $$SELECT public.reverse_lease_deposit_event('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.lease_deposit_events WHERE reference='DEP-RECEIPT'),'2026-07-12','INVALID-RECEIPT-REV')$$,
  'negative held deposit balance','receipt reversal cannot strand later active dispositions'
);
SELECT is((SELECT sum(CASE WHEN event_type='received' THEN amount ELSE -amount END) FROM public.lease_deposit_events WHERE lease_deposit_id='88000000-0000-0000-0000-000000000001' AND reversal_of_id IS NULL),400::numeric,'rejected reversal preserves held balance');
SELECT throws_matching(
  $$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000001','refunded','2026-07-12',401,'TOO-MUCH')$$,
  'exceeds held deposit balance','refund beyond held balance is rejected'
);
SELECT lives_ok(
  $$SELECT public.reverse_lease_deposit_event('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.lease_deposit_events WHERE reference='DEP-APPLY'),'2026-07-12','DEP-APPLY-REV')$$,
  'admin reverses an eligible deposit event'
);
SELECT throws_matching(
  $$SELECT public.reverse_lease_deposit_event('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.lease_deposit_events WHERE reference='DEP-APPLY'),'2026-07-13','DUP')$$,
  'already reversed','duplicate reversal is rejected'
);
SELECT throws_matching(
  $$SELECT public.reverse_lease_deposit_event('00000000-0000-0000-0000-000000000001',(SELECT id FROM public.lease_deposit_events WHERE reference='DEP-APPLY-REV'),'2026-07-13','CHAIN')$$,
  'Reversal chains are not allowed','chained reversal is rejected'
);
SELECT throws_matching(
  $$SELECT public.record_lease_deposit_event('00000000-0000-0000-0000-000000000002','88000000-0000-0000-0000-000000000001','received','2026-07-10',1,'CROSS-ORG')$$,
  'Not authorized|not found','cross-organization recording is rejected'
);
SELECT ok(NOT has_function_privilege('authenticated','app_private.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)','EXECUTE') AND NOT has_function_privilege('authenticated','app_private.record_finance_receipt(uuid,uuid,numeric,date,text)','EXECUTE'),'authenticated cannot execute private implementations');
SELECT ok(has_function_privilege('authenticated','public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)','EXECUTE') AND has_function_privilege('authenticated','public.reverse_lease_deposit_event(uuid,uuid,date,text)','EXECUTE'),'authenticated can execute checked public wrappers');

SELECT * FROM finish();
ROLLBACK;
