BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(52);

-- Synthetic rollback-only coverage. A generation change without a committed
-- reset/checkpoint/reopening is deliberately NOT positive retirement proof.
-- The separate post-reopening fixture exercises the successful release path.
CREATE TEMP TABLE journal_retirement_case (
 org uuid DEFAULT 'fa240215-0000-4000-8000-000000000001',
 actor uuid DEFAULT 'fa240215-0000-4000-8000-000000000010',
 outsider uuid DEFAULT 'fa240215-0000-4000-8000-000000000011',
 foreign_org uuid DEFAULT 'fa240215-0000-4000-8000-000000000009',
 branch uuid DEFAULT 'fa240215-0000-4000-8000-000000000020',
 operation uuid DEFAULT 'fa240215-0000-4000-8000-000000000100',
 owner_id uuid,tenant_id uuid,property_id uuid,lease_id uuid,invoice_id uuid,
 deposit_id uuid,liability_id uuid,deposit_event_id uuid,today date,month date,
 payload jsonb,original jsonb,source_intent jsonb,source_slot jsonb,
 archive_rows jsonb,binding jsonb
);
INSERT INTO journal_retirement_case DEFAULT VALUES;
GRANT SELECT,UPDATE ON journal_retirement_case TO authenticated;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 SELECT actor,'authenticated','authenticated',actor||'@journal-retirement.test','{}'::jsonb FROM journal_retirement_case
 UNION ALL SELECT outsider,'authenticated','authenticated',outsider||'@journal-retirement.test','{}'::jsonb FROM journal_retirement_case;
INSERT INTO public.organizations(id,name,slug)
 SELECT org,'Journal retirement fixture','journal-retirement-fixture' FROM journal_retirement_case
 UNION ALL SELECT foreign_org,'Journal retirement foreign fixture','journal-retirement-foreign' FROM journal_retirement_case;
INSERT INTO public.organization_authorization_states(organization_id,ordinary_access_enabled,transition_manifest_required)
 SELECT org,true,false FROM journal_retirement_case
 ON CONFLICT(organization_id) DO UPDATE SET ordinary_access_enabled=true,transition_manifest_required=false;
INSERT INTO public.organization_branches(id,organization_id,name,code)
 SELECT branch,org,'Journal retirement branch','JRET' FROM journal_retirement_case;
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT org,actor,'super_admin' FROM journal_retirement_case;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM journal_retirement_case),true);
SET LOCAL ROLE authenticated;
UPDATE journal_retirement_case SET today=public.get_lease_rent_business_date(org);
UPDATE journal_retirement_case SET month=date_trunc('month',today)::date;
UPDATE journal_retirement_case SET owner_id=public.create_person(
 p_organization_id=>org,p_branch_id=>branch,p_display_name=>'Journal owner',
 p_legal_name=>NULL,p_party_type=>'individual',p_primary_email=>NULL,p_primary_phone=>NULL,
 p_tax_identifier=>NULL,p_notes=>NULL,p_roles=>ARRAY['owner']);
UPDATE journal_retirement_case SET tenant_id=public.create_person(
 p_organization_id=>org,p_branch_id=>branch,p_display_name=>'Journal tenant',
 p_legal_name=>NULL,p_party_type=>'individual',p_primary_email=>NULL,p_primary_phone=>NULL,
 p_tax_identifier=>NULL,p_notes=>NULL,p_roles=>ARRAY['tenant']);
UPDATE journal_retirement_case SET property_id=public.create_property_minimal(
 p_organization_id=>org,p_branch_id=>branch,p_name=>'Journal property',p_code=>'JRET',
 p_property_type=>'Residential apartment',p_address=>NULL,p_registered_date=>NULL,
 p_idempotency_key=>'journal-retirement-property',p_owner_person_id=>owner_id,
 p_owner_started_on=>month,p_owner_ownership_percent=>100);
SELECT public.set_property_rental_structure(org,property_id,'single_space') FROM journal_retirement_case;
UPDATE journal_retirement_case SET lease_id=(public.create_lease_with_deposit_receipt(
 p_organization_id=>org,p_property_id=>property_id,p_unit_id=>NULL,p_primary_tenant_person_id=>tenant_id,
 p_lease_start_date=>month,p_lease_end_date=>(month+interval '6 months')::date,p_rent_amount=>120,
 p_rent_currency=>'USD',p_rent_due_day=>1,p_payment_frequency=>'monthly',p_term_status=>'draft',
 p_deposit_amount=>100,p_deposit_currency=>'USD',p_lease_status=>'draft',p_relationship_payload=>'{}',
 p_billing_rule=>jsonb_build_object('billingRecipientKind','individual','billingRecipientPersonId',tenant_id,
 'chargeManagementFeeWhenActive',false,'chargeThroughLeaseEnd',true,'collectionRoute','through_ips',
 'finalPeriodProratedAmount',NULL,'firstPeriodProratedAmount',NULL,'fullManagementFeeDuringProration',false,
 'leaseEndProrationRule','actual_days','leaseStartProrationRule','actual_days','managementFeeMode','percentage',
 'managementFeeValue',0,'midPeriodRentChangeRule','next_full_month','rentCalculationTimezone','Asia/Phnom_Penh',
 'shortMonthDueDayRule','last_calendar_day'),p_deposit_received=>false,p_deposit_received_amount=>NULL,
 p_deposit_received_on=>NULL,p_idempotency_key=>'journal-retirement-lease')->>'leaseId')::uuid;
SELECT public.transition_lease_lifecycle(
 p_organization_id=>c.org,p_lease_id=>c.lease_id,p_expected_status=>'draft',
 p_expected_occupancy_id=>o.id,p_transition=>'activate',p_effective_date=>c.month,
 p_scheduled_move_out_date=>NULL,p_reason=>'Journal retirement activation',p_idempotency_key=>'journal-retirement-activate')
FROM journal_retirement_case c JOIN public.lease_occupancies o ON o.organization_id=c.org AND o.lease_id=c.lease_id
 WHERE o.archived_at IS NULL AND o.evidence_state='accepted';
UPDATE journal_retirement_case c SET invoice_id=i.id FROM public.tenant_invoices i
 WHERE i.organization_id=c.org AND i.lease_id=c.lease_id AND i.billing_period_start=c.month;
UPDATE journal_retirement_case c SET deposit_id=d.id FROM public.lease_deposits d
 WHERE d.organization_id=c.org AND d.lease_id=c.lease_id AND d.archived_at IS NULL;
UPDATE journal_retirement_case c SET liability_id=a.id FROM public.finance_accounts a
 WHERE a.organization_id=c.org AND a.use_for_lease_deposits AND a.archived_at IS NULL AND a.property_id IS NULL;
UPDATE journal_retirement_case SET deposit_event_id=public.record_lease_deposit_event_idempotent(
 org,deposit_id,liability_id,'received',today,100,'Journal deposit fixture','journal-retirement-deposit');
SELECT public.allocate_owner_event(org,'security_deposit_receipt',deposit_event_id,'journal-retirement-owner') FROM journal_retirement_case;
SELECT public.confirm_deposit_rent_custody(org,deposit_id,liability_id,'ips',NULL,today,100,
 'Journal verified deposit custody','journal-retirement-custody') FROM journal_retirement_case;
UPDATE journal_retirement_case c SET payload=jsonb_build_object('operation','apply','leaseId',c.lease_id,
 'depositId',c.deposit_id,'invoiceId',c.invoice_id,'lineId',l.id,'amount','20.00','date',c.today,'reason','Journal fresh preview')
FROM public.tenant_invoice_lines l WHERE l.organization_id=c.org AND l.invoice_id=c.invoice_id
 AND l.line_type='rent' AND l.reversal_of_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_invoice_lines n
 WHERE n.organization_id=l.organization_id AND n.supersedes_line_id=l.id);
UPDATE journal_retirement_case SET original=public.prepare_deposit_rent_journal(org,lease_id,payload,
 public.get_local_deposit_rent_candidates(org,lease_id)->>'fingerprint');
SELECT is(original->>'state','preview','ordinary checked prepare still creates an unused preview') FROM journal_retirement_case;
SELECT is(public.get_deposit_rent_journal(org,lease_id),original,'ordinary current journal read retains the exact packet') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease_id,payload,repeat('f',64)),
 '23514','Candidate snapshot changed','current generation still requires the exact candidate snapshot') FROM journal_retirement_case;
RESET ROLE;
UPDATE journal_retirement_case c SET source_intent=to_jsonb(i),source_slot=to_jsonb(s)
FROM app_private.deposit_rent_journal_intents i JOIN app_private.deposit_rent_journal_slots s ON s.current_token=i.token
 WHERE i.token=(c.original->>'token')::uuid;

SELECT ok(NOT has_function_privilege('authenticated','app_private.deposit_rent_journal_slot_is_retired(app_private.deposit_rent_journal_intents,jsonb)','EXECUTE'),
 'ordinary callers receive no access to the private retirement predicate');
SELECT ok(NOT has_function_privilege('service_role','app_private.deposit_rent_journal_slot_is_retired(app_private.deposit_rent_journal_intents,jsonb)','EXECUTE'),
 'service role receives no retirement capability');
SELECT ok(NOT has_table_privilege('authenticated','app_private.deposit_rent_journal_slots','UPDATE'),
 'ordinary callers cannot directly move a slot');
SELECT is((SELECT count(*) FROM app_private.financial_reset_relation_rules
 WHERE relation_name IN ('app_private.deposit_rent_journal_intents','app_private.deposit_rent_journal_slots')
 AND NOT archive_remove AND normalize_columns='{}' AND generated_columns='{}' AND NOT restore_allowed),2::bigint,
 'both exact journal relations are archive-only without mutation or restore authority');
SELECT is(encode(extensions.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex'),
 '1ec43c14b36138be0d752f384d74ae154d10d3564db86ceb19ce9ebfcd6d570e','original slot guard is unchanged')
FROM pg_proc WHERE oid='app_private.deposit_rent_journal_slot_guard()'::regprocedure;
SELECT is(app_private.deposit_rent_journal_slot_is_retired(i,app_private.deposit_rent_journal_authority(c.org,c.lease_id)),false,
 'unenrolled current intent receives no retirement exemption')
FROM journal_retirement_case c JOIN app_private.deposit_rent_journal_intents i ON i.token=(c.original->>'token')::uuid;

SAVEPOINT current_attempt;
SET LOCAL ROLE authenticated;
SELECT is(public.begin_deposit_rent_journal_attempt(org,lease_id,(original->>'token')::uuid,
 (original->>'idempotencyKey')::uuid,original->>'payloadHash',(original->>'revision')::integer)->>'state','attempted',
 'ordinary begin durably marks the current attempted state') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease_id,payload,original->>'snapshotHash'),
 '55000','Original attempt remains unconfirmed','current unconfirmed action cannot be replaced') FROM journal_retirement_case;
SELECT is(public.get_deposit_rent_journal(org,lease_id)->>'state','attempted','current unconfirmed evidence remains visible') FROM journal_retirement_case;
RESET ROLE;
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
 SELECT org,1,'frozen',month FROM journal_retirement_case;
-- Negative fixture only: no reset operation exists. This ordinary lifecycle
-- transition must not substitute for immutable retirement/reopening evidence.
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT org FROM journal_retirement_case);
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT is(app_private.deposit_rent_journal_slot_is_retired(i,app_private.deposit_rent_journal_authority(c.org,c.lease_id)),false,
 'older generation cannot make an unconfirmed attempt eligible')
FROM journal_retirement_case c JOIN app_private.deposit_rent_journal_intents i ON i.token=(c.original->>'token')::uuid;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease_id,payload,original->>'snapshotHash'),
 '55000','financial_intent_retired','old unconfirmed attempt remains blocked') FROM journal_retirement_case;
RESET ROLE;
SELECT is((SELECT state FROM app_private.deposit_rent_journal_intents WHERE token=(SELECT (original->>'token')::uuid FROM journal_retirement_case)),
 'attempted','failed replacement preserves uncertain state');
ROLLBACK TO current_attempt;

INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
 SELECT org,1,'frozen',month FROM journal_retirement_case;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_deposit_rent_journal(%L,%L)',org,lease_id),
 '55000','financial_writes_frozen','frozen reader never treats an old slot as empty') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease_id,payload,original->>'snapshotHash'),
 '55000','financial_writes_frozen','frozen preparation cannot release an old slot') FROM journal_retirement_case;
RESET ROLE;
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=(SELECT org FROM journal_retirement_case);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_deposit_rent_journal(%L,%L)',org,lease_id),
 '22023','financial_generation_required','retirement-aware read requires the current generation header') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease_id,payload,original->>'snapshotHash'),
 '22023','financial_generation_required','fresh preparation still rejects a missing generation') FROM journal_retirement_case;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"0"}',true);
SELECT throws_ok(format('SELECT public.get_deposit_rent_journal(%L,%L)',org,lease_id),
 '40001','financial_generation_stale','stale read cannot conceal the original slot') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease_id,payload,original->>'snapshotHash'),
 '40001','financial_generation_stale','stale preparation remains refused') FROM journal_retirement_case;
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
RESET ROLE;
SELECT is(app_private.deposit_rent_journal_slot_is_retired(
 jsonb_populate_record(NULL::app_private.deposit_rent_journal_intents,source_intent||'{"financial_generation":1}'::jsonb),
 app_private.deposit_rent_journal_authority(org,lease_id)),false,'current generation is never eligible for the retirement exception')
FROM journal_retirement_case;
SELECT is(app_private.deposit_rent_journal_slot_is_retired(
 jsonb_populate_record(NULL::app_private.deposit_rent_journal_intents,source_intent||'{"financial_generation":2}'::jsonb),
 app_private.deposit_rent_journal_authority(org,lease_id)),false,'a future generation is never treated as retired')
FROM journal_retirement_case;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.get_deposit_rent_journal(%L,%L)',org,lease_id),
 '55000','financial_intent_retired','older preview without the exact completed archive remains blocked') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',org,lease_id,payload,original->>'snapshotHash'),
 '55000','financial_intent_retired','new action cannot evict an unproven retired preview') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.begin_deposit_rent_journal_attempt(%L,%L,%L,%L,%L,1)',org,lease_id,
 original->>'token',original->>'idempotencyKey',original->>'payloadHash'),
 '55000','financial_intent_retired','old token and key cannot begin after generation change') FROM journal_retirement_case;
SELECT throws_ok(format('SELECT public.execute_deposit_rent_journal(%L,%L,%L,%L,%L)',org,lease_id,
 original->>'token',original->>'idempotencyKey',original->>'payloadHash'),
 '55000','financial_intent_retired','old token and key cannot execute after generation change') FROM journal_retirement_case;
SELECT set_config('request.jwt.claim.sub',(SELECT outsider::text FROM journal_retirement_case),true);
SELECT throws_ok(format('SELECT public.get_deposit_rent_journal(%L,%L)',org,lease_id),
 '42501','Both current lease and finance authority required','retirement does not grant an unrelated actor access') FROM journal_retirement_case;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM journal_retirement_case),true);
SELECT throws_ok(format('SELECT public.prepare_deposit_rent_journal(%L,%L,%L::jsonb,%L)',foreign_org,lease_id,payload,original->>'snapshotHash'),
 '42501','Lease scope denied','foreign organization cannot use the original lease or slot') FROM journal_retirement_case;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok(format('SELECT public.get_deposit_rent_journal(%L,%L)',org,lease_id),
 '28000','Not authenticated','missing ordinary actor remains denied') FROM journal_retirement_case;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM journal_retirement_case),true);
RESET ROLE;
SELECT throws_ok($$UPDATE app_private.deposit_rent_journal_slots SET current_token=NULL WHERE organization_id=(SELECT org FROM journal_retirement_case)$$,
 '55000','Current evidence cannot be cleared','retirement adds no plain slot-clear route');
SELECT throws_ok($$DELETE FROM app_private.deposit_rent_journal_slots WHERE organization_id=(SELECT org FROM journal_retirement_case)$$,
 '55000','Journal slot cannot be deleted','retirement adds no slot deletion route');
SELECT throws_ok($$UPDATE app_private.deposit_rent_journal_intents SET state='attempted',revision=revision+1
 WHERE token=(SELECT (original->>'token')::uuid FROM journal_retirement_case)$$,
 '55000','financial_intent_retired','retained old intent cannot advance through direct DML');
SELECT is((SELECT to_jsonb(i) FROM app_private.deposit_rent_journal_intents i WHERE token=(c.original->>'token')::uuid),
 c.source_intent,'all refused paths preserve the complete original intent') FROM journal_retirement_case c;
SELECT is((SELECT to_jsonb(s) FROM app_private.deposit_rent_journal_slots s WHERE organization_id=c.org AND actor_id=c.actor AND lease_id=c.lease_id),
 c.source_slot,'all refused paths preserve the exact original slot') FROM journal_retirement_case c;

-- Archive-only registration is checked by the same real source/manifest guards.
UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=(SELECT org FROM journal_retirement_case);
UPDATE journal_retirement_case c SET archive_rows=(SELECT jsonb_agg(jsonb_build_object(
 'relation_name',r.relation,'primary_key',app_private.financial_reset_primary_key(r.relation::regclass,r.source_row),
 'row_text',r.source_row::text,'row_sha256',app_private.financial_reset_hash(r.source_row)) ORDER BY r.relation)
 FROM (VALUES('app_private.deposit_rent_journal_intents',c.source_intent),('app_private.deposit_rent_journal_slots',c.source_slot)) r(relation,source_row));
UPDATE journal_retirement_case SET binding=jsonb_build_object('operation_id',operation,'organization_id',org,
 'operation_kind','reset','restore_of',NULL,'source_generation',0,'target_generation',1,
 'manifest_sha256',repeat('1',64),'plan_sha256',repeat('2',64),'schema_sha256',repeat('3',64),
 'archive_count',2,'action_count',0,'audit_timestamp',clock_timestamp(),'audit_actor',NULL,
 'archive_sha256',(SELECT app_private.financial_reset_hash(jsonb_agg(jsonb_build_object('relation_name',r->'relation_name',
 'primary_key',r->'primary_key','row_sha256',r->'row_sha256') ORDER BY r->>'relation_name',(r->'primary_key')::text)) FROM jsonb_array_elements(archive_rows) r),
 'action_sha256',app_private.financial_reset_hash('[]'));
SELECT lives_ok($$SELECT app_private.prepare_financial_reset_operation(binding) FROM journal_retirement_case$$,
 'synthetic operation binds exact two-row archive without any row actions');
SELECT lives_ok($$SELECT app_private.archive_financial_reset_rows(operation,archive_rows) FROM journal_retirement_case$$,
 'normal archive guard captures exact immutable journal and slot rows');
CREATE FUNCTION pg_temp.journal_retirement_action(p_kind text,p_relation text,p_row jsonb) RETURNS jsonb
LANGUAGE sql AS $$
 SELECT jsonb_build_array(jsonb_build_object('action_id',gen_random_uuid(),'ordinal',1,
 'relation_name',p_relation,'primary_key',app_private.financial_reset_primary_key(p_relation::regclass,p_row),
 'kind',p_kind,'before_row_text',p_row::text,'before_sha256',app_private.financial_reset_hash(p_row),
 'after_row_text',CASE WHEN p_kind='archive-delete' THEN NULL ELSE p_row::text END,
 'after_sha256',CASE WHEN p_kind='archive-delete' THEN NULL ELSE app_private.financial_reset_hash(p_row) END))
$$;
SELECT throws_ok(format('SELECT app_private.prepare_financial_reset_actions(%L,pg_temp.journal_retirement_action(%L,%L,%L::jsonb))',
 c.operation,'archive-delete',r.relation,r.source_row),'23514','financial_reset_delete_not_allowed',
 r.relation||' cannot receive reset deletion authority')
FROM journal_retirement_case c CROSS JOIN LATERAL (VALUES('app_private.deposit_rent_journal_intents',c.source_intent),
 ('app_private.deposit_rent_journal_slots',c.source_slot)) r(relation,source_row);
SELECT throws_ok(format('SELECT app_private.prepare_financial_reset_actions(%L,pg_temp.journal_retirement_action(%L,%L,%L::jsonb))',
 c.operation,'normalization',r.relation,r.source_row),'23514','financial_reset_normalization_not_allowed',
 r.relation||' cannot receive reset normalization authority')
FROM journal_retirement_case c CROSS JOIN LATERAL (VALUES('app_private.deposit_rent_journal_intents',c.source_intent),
 ('app_private.deposit_rent_journal_slots',c.source_slot)) r(relation,source_row);
SELECT throws_ok(format('SELECT app_private.prepare_financial_reset_actions(%L,pg_temp.journal_retirement_action(%L,%L,%L::jsonb))',
 c.operation,'restore',r.relation,r.source_row),'23514','financial_reset_restore_image_invalid',
 r.relation||' cannot receive restore authority from the reset')
FROM journal_retirement_case c CROSS JOIN LATERAL (VALUES('app_private.deposit_rent_journal_intents',c.source_intent),
 ('app_private.deposit_rent_journal_slots',c.source_slot)) r(relation,source_row);
SELECT is(app_private.financial_reset_archive_digest(operation),binding->>'archive_sha256',
 'archive digest binds the full exact pair') FROM journal_retirement_case;
SELECT throws_ok($$UPDATE app_private.financial_reset_archive_rows SET row_sha256=repeat('f',64)
 WHERE operation_id=(SELECT operation FROM journal_retirement_case)$$,
 '23514','financial_reset_evidence_immutable','captured retirement proof cannot be rewritten');
SELECT throws_ok($$UPDATE app_private.financial_reset_relation_rules SET archive_remove=true
 WHERE relation_name='app_private.deposit_rent_journal_slots'$$,
 '23514','financial_reset_evidence_immutable','new archive-only rules remain immutable');
SELECT is(app_private.financial_reset_normalized_image('app_private.deposit_rent_journal_slots'::regclass,
 source_slot,source_slot,clock_timestamp(),NULL),false,'even a no-op slot normalization is forbidden') FROM journal_retirement_case;
SELECT is(app_private.financial_reset_normalized_image('app_private.deposit_rent_journal_intents'::regclass,
 source_intent,source_intent,clock_timestamp(),NULL),false,'even a no-op intent normalization is forbidden') FROM journal_retirement_case;
SELECT throws_ok($$UPDATE app_private.financial_write_controls SET status='open'
 WHERE organization_id=(SELECT org FROM journal_retirement_case)$$,
 '42501','financial_reset_checked_reopening_required','prepared archive alone grants no reopening or slot release');
SELECT is((SELECT count(*) FROM app_private.financial_reset_reopening_receipts WHERE organization_id=c.org),0::bigint,
 'negative fixture has not manufactured a committed reopening receipt') FROM journal_retirement_case c;
SELECT is((SELECT to_jsonb(i) FROM app_private.deposit_rent_journal_intents i WHERE token=(c.original->>'token')::uuid),
 c.source_intent,'archive-only registration preserves original intent bytes') FROM journal_retirement_case c;
SELECT is((SELECT to_jsonb(s) FROM app_private.deposit_rent_journal_slots s WHERE organization_id=c.org AND actor_id=c.actor AND lease_id=c.lease_id),
 c.source_slot,'archive-only registration preserves original slot bytes') FROM journal_retirement_case c;

SELECT * FROM finish();
ROLLBACK;
