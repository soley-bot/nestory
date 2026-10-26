-- Positive, rollback-only phase for the sole local runtime validator.
-- Required psql inputs: journal_expected_database, journal_operation,
-- journal_token, journal_expected_intent_sha256, journal_expected_slot_sha256.
-- The driver must first commit a real checked reset and a separate checked
-- reopening which archived the exact source pair. This file creates neither
-- proof nor authority. SQL claims below are synthetic ordinary-role fixtures,
-- not evidence of a genuine hosted Auth/PostgREST login.
\set ON_ERROR_STOP on
SELECT current_database()=:'journal_expected_database'
 AND current_database() LIKE 'pilot_reset_%' AS journal_disposable_database \gset
\if :journal_disposable_database
\else
\echo 'Refusing journal proof outside the explicitly named disposable database.'
\quit 3
\endif

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(24);
CREATE TEMP TABLE journal_reopened_case AS
SELECT i.organization_id AS org,i.actor_id AS actor,i.lease_id AS lease,
 i.deposit_id AS deposit,i.token AS old_token,i.idempotency_key AS old_key,
 i.payload_hash AS old_payload_hash,i.revision AS old_revision,
 to_jsonb(i) AS old_intent,to_jsonb(s) AS old_slot,
 o.operation_id AS operation,w.generation,w.financial_start_date AS cutoff,
 NULL::date AS today,NULL::uuid AS invoice,NULL::uuid AS line,NULL::uuid AS liability,
 NULL::uuid AS deposit_event,NULL::jsonb AS payload,NULL::jsonb AS prepared,NULL::jsonb AS result,
 NULL::numeric AS before_balance,NULL::bigint AS before_payments,
 (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.operation),'[]') FROM app_private.financial_idempotency_requests f
  WHERE f.organization_id=i.organization_id AND f.idempotency_key=i.idempotency_key::text) AS old_request
FROM app_private.deposit_rent_journal_intents i
JOIN app_private.deposit_rent_journal_slots s ON s.organization_id=i.organization_id
 AND s.actor_id=i.actor_id AND s.lease_id=i.lease_id AND s.current_token=i.token
JOIN app_private.financial_reset_operations o ON o.operation_id=:'journal_operation'::uuid
 AND o.organization_id=i.organization_id AND o.operation_kind='reset' AND o.status='actions_complete'
JOIN app_private.financial_write_controls w ON w.organization_id=o.organization_id
 AND w.generation=o.target_generation AND w.status='open'
WHERE i.token=:'journal_token'::uuid;
GRANT SELECT,UPDATE ON journal_reopened_case TO authenticated;
SELECT count(*)=1 AND bool_and(app_private.financial_reset_hash(old_intent)=:'journal_expected_intent_sha256'
 AND app_private.financial_reset_hash(old_slot)=:'journal_expected_slot_sha256') AS journal_exact_source
FROM journal_reopened_case \gset
\if :journal_exact_source
\else
\echo 'Missing exact original slot/intent and checked reset scope; no positive proof can run.'
\quit 3
\endif
SELECT set_config('request.jwt.claim.sub',actor::text,true),
 set_config('request.headers',jsonb_build_object('x-nestory-financial-generation',generation::text)::text,true)
FROM journal_reopened_case;
DO $$ DECLARE c journal_reopened_case%ROWTYPE; i app_private.deposit_rent_journal_intents%ROWTYPE; BEGIN
 SELECT * INTO STRICT c FROM journal_reopened_case;
 SELECT * INTO STRICT i FROM app_private.deposit_rent_journal_intents WHERE token=c.old_token;
 IF NOT app_private.deposit_rent_journal_slot_is_retired(i,app_private.deposit_rent_journal_authority(c.org,c.lease)) THEN
  RAISE EXCEPTION 'actual_committed_reset_archive_and_reopening_required';
 END IF;
 IF EXISTS(SELECT 1 FROM public.tenant_invoices WHERE organization_id=c.org AND id=i.invoice_id) THEN
  RAISE EXCEPTION 'positive_journal_fixture_requires_actual_old_invoice_removal';
 END IF;
 IF app_private.deposit_rent_held(c.org,c.deposit)<>0 THEN
  RAISE EXCEPTION 'positive_journal_fixture_requires_checked_zero_deposit';
 END IF;
END $$;
SELECT ok(EXISTS(SELECT 1 FROM app_private.financial_reset_reopening_receipts r
 WHERE r.operation_id=c.operation AND r.organization_id=c.org AND r.generation=c.generation
 AND r.transaction_id<>pg_current_xact_id()),'positive fixture uses an actually committed reopening') FROM journal_reopened_case c;
SET LOCAL ROLE authenticated;
SELECT is(public.get_deposit_rent_journal(org,lease),NULL::jsonb,
 'exact archived unused or terminal slot is read as no current action') FROM journal_reopened_case;
SELECT throws_ok(format('SELECT public.begin_deposit_rent_journal_attempt(%L,%L,%L,%L,%L,%s)',
 org,lease,old_token,old_key,old_payload_hash,old_revision),'55000','financial_intent_retired',
 'proved retirement does not permit old-key begin') FROM journal_reopened_case;
SELECT throws_ok(format('SELECT public.execute_deposit_rent_journal(%L,%L,%L,%L,%L)',org,lease,old_token,old_key,old_payload_hash),
 '55000','financial_intent_retired','proved retirement does not permit old-key execution') FROM journal_reopened_case;

-- A real new deposit receipt and custody confirmation, then a fresh current
-- invoice application. Every financial source comes from ordinary commands.
UPDATE journal_reopened_case SET today=public.get_lease_rent_business_date(org);
UPDATE journal_reopened_case c SET invoice=(SELECT i.id FROM public.tenant_invoices i
 JOIN public.tenant_invoice_balances b ON b.organization_id=i.organization_id AND b.id=i.id
 WHERE i.organization_id=c.org AND i.lease_id=c.lease AND i.financial_generation=c.generation
 AND b.balance_due>=20 ORDER BY i.billing_period_start,i.id LIMIT 1);
UPDATE journal_reopened_case c SET line=(SELECT l.id FROM public.tenant_invoice_lines l
 WHERE l.organization_id=c.org AND l.invoice_id=c.invoice AND l.line_type='rent' AND l.reversal_of_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.tenant_invoice_lines n WHERE n.organization_id=l.organization_id AND n.supersedes_line_id=l.id)
 ORDER BY l.id LIMIT 1);
UPDATE journal_reopened_case c SET liability=(SELECT a.id FROM public.finance_accounts a
 WHERE a.organization_id=c.org AND a.use_for_lease_deposits AND a.archived_at IS NULL AND a.property_id IS NULL
 ORDER BY a.id LIMIT 1);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM journal_reopened_case WHERE invoice IS NULL OR line IS NULL OR liability IS NULL OR today<cutoff) THEN
  RAISE EXCEPTION 'current_checked_invoice_and_deposit_liability_required';
 END IF;
END $$;
UPDATE journal_reopened_case SET deposit_event=public.record_lease_deposit_event_idempotent(
 org,deposit,liability,'received',today,20,'Fresh checked deposit after reset','journal-reopen-deposit-'||operation);
SELECT public.allocate_owner_event(org,'security_deposit_receipt',deposit_event,'journal-reopen-owner-'||operation) FROM journal_reopened_case;
SELECT public.confirm_deposit_rent_custody(org,deposit,liability,'ips',NULL,today,20,
 'Fresh verified post-reset deposit custody','journal-reopen-custody-'||operation) FROM journal_reopened_case;
UPDATE journal_reopened_case SET payload=jsonb_build_object('operation','apply','leaseId',lease,'depositId',deposit,
 'invoiceId',invoice,'lineId',line,'amount','20.00','date',today,'reason','Fresh checked deposit application');
UPDATE journal_reopened_case c SET before_balance=(SELECT balance_due FROM public.tenant_invoice_balances WHERE id=c.invoice),
 before_payments=(SELECT count(*) FROM public.tenant_invoice_payments WHERE organization_id=c.org);
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease,payload,repeat('f',64)),
 '23514','Candidate snapshot changed','retirement exception retains current candidate verification') FROM journal_reopened_case;
RESET ROLE;
SELECT is((SELECT to_jsonb(s) FROM app_private.deposit_rent_journal_slots s WHERE s.organization_id=c.org AND s.actor_id=c.actor AND s.lease_id=c.lease),
 old_slot,'failed new preview leaves the original slot unchanged') FROM journal_reopened_case c;
SET LOCAL ROLE authenticated;
UPDATE journal_reopened_case SET prepared=public.prepare_deposit_rent_journal(org,lease,payload,
 public.get_local_deposit_rent_candidates(org,lease)->>'fingerprint');
SELECT is(prepared->>'state','preview','fresh checked preparation succeeds after actual reset/reopening') FROM journal_reopened_case;
SELECT ok((prepared->>'token')::uuid<>old_token AND (prepared->>'idempotencyKey')::uuid<>old_key,
 'fresh preview has a new token and idempotency key') FROM journal_reopened_case;
SELECT is(public.get_deposit_rent_journal(org,lease),prepared,'reader returns the fresh current action') FROM journal_reopened_case;
SELECT throws_ok(format('SELECT public.begin_deposit_rent_journal_attempt(%L,%L,%L,%L,%L,%s)',
 org,lease,old_token,old_key,old_payload_hash,old_revision),'23514','Stale intent token','replaced old token cannot begin') FROM journal_reopened_case;
SELECT throws_ok(format('SELECT public.execute_deposit_rent_journal(%L,%L,%L,%L,%L)',org,lease,old_token,old_key,old_payload_hash),
 '23514','Stale intent token','replaced old token cannot execute') FROM journal_reopened_case;
SELECT is(public.begin_deposit_rent_journal_attempt(org,lease,(prepared->>'token')::uuid,(prepared->>'idempotencyKey')::uuid,
 prepared->>'payloadHash',(prepared->>'revision')::integer)->>'state','attempted','fresh checked attempt becomes durable') FROM journal_reopened_case;
UPDATE journal_reopened_case SET result=public.execute_deposit_rent_journal(org,lease,(prepared->>'token')::uuid,
 (prepared->>'idempotencyKey')::uuid,prepared->>'payloadHash');
SELECT is(result->>'state','resolved','fresh ordinary financial action resolves') FROM journal_reopened_case;
SELECT is(public.execute_deposit_rent_journal(org,lease,(prepared->>'token')::uuid,
 (prepared->>'idempotencyKey')::uuid,prepared->>'payloadHash'),result,'fresh-key retry returns the identical result') FROM journal_reopened_case;
SELECT is((SELECT balance_due FROM public.tenant_invoice_balances WHERE id=c.invoice),before_balance-20,
 'fresh application reduces the current invoice by exactly twenty') FROM journal_reopened_case c;
SELECT is((SELECT count(*) FROM public.tenant_invoice_payments WHERE organization_id=c.org),before_payments,
 'deposit application creates no tenant cash payment') FROM journal_reopened_case c;
RESET ROLE;
SELECT is(app_private.deposit_rent_held(org,deposit),0::numeric,'fresh deposit custody is conserved after full application') FROM journal_reopened_case;
SELECT is((SELECT count(*) FROM public.deposit_rent_applications a WHERE a.organization_id=c.org AND a.id=(c.result#>>'{result,commandId}')::uuid),
 1::bigint,'retry leaves exactly one checked application') FROM journal_reopened_case c;
SELECT is((SELECT financial_generation FROM app_private.deposit_rent_journal_intents WHERE token=(c.prepared->>'token')::uuid),
 generation,'fresh intent is bound to the reopened current generation') FROM journal_reopened_case c;
SELECT is((SELECT to_jsonb(i) FROM app_private.deposit_rent_journal_intents i WHERE token=c.old_token),old_intent,
 'original intent, key and audit fields remain byte-identical') FROM journal_reopened_case c;
SELECT is((SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.operation),'[]') FROM app_private.financial_idempotency_requests f WHERE f.organization_id=c.org AND f.idempotency_key=c.old_key::text),
 old_request,'original checked-request evidence remains unchanged') FROM journal_reopened_case c;
SELECT is((SELECT current_token FROM app_private.deposit_rent_journal_slots s
 WHERE s.organization_id=c.org AND s.actor_id=c.actor AND s.lease_id=c.lease),(prepared->>'token')::uuid,
 'only the exact original actor/lease slot points to the fresh token') FROM journal_reopened_case c;
SELECT is((SELECT row_json FROM app_private.financial_reset_archive_rows a WHERE a.operation_id=c.operation
 AND a.relation_name='app_private.deposit_rent_journal_intents' AND a.primary_key=jsonb_build_object('token',c.old_token)),
 old_intent,'immutable archived source intent remains unchanged') FROM journal_reopened_case c;
SELECT is((SELECT row_json FROM app_private.financial_reset_archive_rows a WHERE a.operation_id=c.operation
 AND a.relation_name='app_private.deposit_rent_journal_slots' AND a.primary_key=jsonb_build_object('organization_id',c.org,'actor_id',c.actor,'lease_id',c.lease)),
 old_slot,'immutable archived source slot remains unchanged') FROM journal_reopened_case c;

SELECT * FROM finish();
ROLLBACK;
