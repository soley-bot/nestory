BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*) FROM app_private.financial_write_controls),0::bigint,'migration enrolls no organization');
SELECT ok(NOT has_table_privilege('authenticated','app_private.financial_write_controls','INSERT'),'app cannot activate controls');
SELECT ok(NOT has_table_privilege('service_role','app_private.financial_write_controls','UPDATE'),'service role cannot activate controls');
SELECT ok(NOT has_function_privilege('authenticated','app_private.begin_financial_scheduled_scope(uuid)','EXECUTE'),'app cannot acquire scheduler capability');

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES('fa220000-0000-4000-8000-000000000010','authenticated','authenticated',
 'financial-fence@test.invalid','{"provider":"email","providers":["email"]}','{}');
INSERT INTO public.organizations(id,name,slug) VALUES
 ('fa220000-0000-4000-8000-000000000001','Controlled fixture','financial-fence-test'),
 ('fa220000-0000-4000-8000-000000000009','Uncontrolled fixture','financial-fence-other');
INSERT INTO public.organization_members(organization_id,user_id,role)
VALUES('fa220000-0000-4000-8000-000000000001','fa220000-0000-4000-8000-000000000010','super_admin');
INSERT INTO public.people(id,organization_id,display_name)
VALUES('fa220000-0000-4000-8000-000000000003','fa220000-0000-4000-8000-000000000001','Synthetic owner');
INSERT INTO public.person_roles(organization_id,person_id,role,status)
VALUES('fa220000-0000-4000-8000-000000000001','fa220000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.organization_branches(id,organization_id,name,code,status)
VALUES('fa220000-0000-4000-8000-000000000020','fa220000-0000-4000-8000-000000000001','Synthetic branch','FENCE','active');
SELECT set_config('app.property_branch_assignment_context',(SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
INSERT INTO public.properties(id,organization_id,name,code,property_type,branch_id)
VALUES('fa220000-0000-4000-8000-000000000002','fa220000-0000-4000-8000-000000000001','Synthetic property','FENCE','Apartment','fa220000-0000-4000-8000-000000000020');
SELECT set_config('app.property_branch_assignment_context','',true);
INSERT INTO public.property_owners(organization_id,property_id,person_id,ownership_percent,started_on,is_primary)
VALUES('fa220000-0000-4000-8000-000000000001','fa220000-0000-4000-8000-000000000002',
 'fa220000-0000-4000-8000-000000000003',100,current_date-365,true);
SELECT set_config('request.jwt.claim.sub','fa220000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT is(public.get_financial_write_context('fa220000-0000-4000-8000-000000000001')->>'generation','0','unenrolled render context is generation zero');
SELECT lives_ok($$SELECT public.record_owner_contribution('fa220000-0000-4000-8000-000000000001',
 'fa220000-0000-4000-8000-000000000002','fa220000-0000-4000-8000-000000000003','USD',current_date-10,100,
 'Pre-enrollment request','fence-original-key',NULL)$$,'unenrolled contribution keeps existing behavior without header');
RESET ROLE;

INSERT INTO app_private.deposit_rent_journal_intents(token,organization_id,actor_id,lease_id,property_id,deposit_id,invoice_id,
 payload,payload_hash,snapshot_hash,authorization_hash,expires_at)
VALUES('fa220000-0000-4000-8000-000000000030','fa220000-0000-4000-8000-000000000001',
 'fa220000-0000-4000-8000-000000000010',gen_random_uuid(),'fa220000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),
 '{}',repeat('a',64),repeat('a',64),repeat('a',64),now()+interval '1 hour');

SELECT throws_ok($$INSERT INTO app_private.financial_write_controls VALUES
 ('fa220000-0000-4000-8000-000000000001',1,'open',date_trunc('month',current_date)::date,now())$$,
 '23514','financial_control_initial_freeze_required','enrollment starts frozen');
INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date)
VALUES('fa220000-0000-4000-8000-000000000001',1,'frozen',date_trunc('month',current_date)::date);
SET LOCAL ROLE authenticated;
SELECT is(public.get_financial_write_context('fa220000-0000-4000-8000-000000000001')->>'status','frozen','read context remains readable while frozen');
SELECT throws_ok($$SELECT public.record_owner_contribution('fa220000-0000-4000-8000-000000000001',
 'fa220000-0000-4000-8000-000000000002','fa220000-0000-4000-8000-000000000003','USD',current_date-10,100,
 'Pre-enrollment request','fence-original-key',NULL)$$,'55000','financial_writes_frozen','freeze rejects before old completed replay');
RESET ROLE;
SELECT throws_ok($$UPDATE public.people SET display_name='Forbidden stale edit' WHERE id='fa220000-0000-4000-8000-000000000003'$$,
 '55000','financial_writes_frozen','direct master DML cannot change frozen fingerprint');
SELECT throws_ok($$INSERT INTO public.management_fee_occurrences(organization_id) VALUES('fa220000-0000-4000-8000-000000000001')$$,
 '55000','financial_writes_frozen','management fee source cannot mutate while frozen');
SELECT throws_ok($$INSERT INTO public.tenant_credit_occurrences(organization_id) VALUES('fa220000-0000-4000-8000-000000000001')$$,
 '55000','financial_writes_frozen','tenant credit source cannot mutate while frozen');
SELECT throws_ok(format('INSERT INTO public.%I(organization_id) VALUES(%L)',t,'fa220000-0000-4000-8000-000000000001'),
 '55000','financial_writes_frozen',t||' preserves its configuration while frozen')
FROM unnest(ARRAY['finance_account_roles','finance_account_source_links','finance_account_category_links','rent_policy_versions','import_mappings','rent_generation_exceptions',
 'organization_roles','organization_role_permissions','organization_authorization_states','organization_invitations']) t;
SELECT throws_ok($$UPDATE public.organizations SET name='Frozen identity mutation' WHERE id='fa220000-0000-4000-8000-000000000001'$$,
 '55000','financial_writes_frozen','organization identity participates using id as scope key');
SELECT throws_ok($$SELECT app_private.deposit_rent_journal_parent_scope(r,'{}') FROM app_private.deposit_rent_journal_intents r
 WHERE token='fa220000-0000-4000-8000-000000000030'$$,
 '55000','financial_writes_frozen','journal read cannot return parent evidence while frozen');
SELECT lives_ok($$INSERT INTO public.people(organization_id,display_name)
 VALUES('fa220000-0000-4000-8000-000000000009','Other workspace still writable')$$,'other organization remains writable');
SELECT is(app_private.begin_financial_scheduled_scope('fa220000-0000-4000-8000-000000000001'),false,'internal scheduler skips frozen organization');
SELECT lives_ok($$SELECT app_private.run_due_rent_generation(now())$$,'rent runner tolerates frozen organization');
SELECT lives_ok($$SELECT app_private.run_due_lease_activations(now())$$,'activation runner tolerates frozen organization');
SELECT lives_ok($$SELECT app_private.run_deferred_owner_cash(now())$$,'deferred runner tolerates frozen organization');
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa220000-0000-4000-8000-000000000001';
SELECT set_config('app.financial_scheduler_scope','',true);

SELECT lives_ok($$UPDATE public.people SET display_name='Open master edit without financial context' WHERE id='fa220000-0000-4000-8000-000000000003'$$,
 'open master writes do not require a financial intent header');
SELECT lives_ok($$UPDATE public.organization_members SET role=role WHERE organization_id='fa220000-0000-4000-8000-000000000001'$$,
 'open membership bookkeeping does not require a financial intent header');
SELECT throws_ok($$SELECT app_private.assert_financial_write_allowed('fa220000-0000-4000-8000-000000000001')$$,
 '22023','financial_generation_required','missing generation fails after enrollment');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"0"}',true);
SELECT throws_ok($$SELECT app_private.assert_financial_write_allowed('fa220000-0000-4000-8000-000000000001')$$,
 '40001','financial_generation_stale','rendered pre-reset intent is rejected');
SELECT set_config('request.headers','{"x-nestory-financial-generation":"1"}',true);
SELECT throws_ok($$SELECT app_private.deposit_rent_journal_parent_scope(r,'{}') FROM app_private.deposit_rent_journal_intents r
 WHERE token='fa220000-0000-4000-8000-000000000030'$$,
 '55000','financial_intent_retired','current header cannot revive old specialized journal evidence');
SELECT throws_ok($$UPDATE app_private.deposit_rent_journal_intents SET state='attempted',revision=revision+1
 WHERE token='fa220000-0000-4000-8000-000000000030'$$,
 '55000','financial_intent_retired','old specialized journal cannot advance after enrollment');
SELECT throws_ok($$SELECT app_private.get_financial_idempotency_replay('fa220000-0000-4000-8000-000000000001',
 'record_owner_cash_event','fence-original-key','fa220000-0000-4000-8000-000000000010','{}')$$,
 '55000','financial_intent_retired','current header cannot revive known historical request');
SELECT throws_ok($$SELECT app_private.assert_financial_write_allowed('fa220000-0000-4000-8000-000000000001',date_trunc('month',current_date)::date-1)$$,
 '22023','financial_date_before_start','cutoff rejects earlier effective date');
SELECT throws_ok($$SELECT app_private.assert_financial_write_allowed('fa220000-0000-4000-8000-000000000001','-infinity'::date)$$,
 '22023','financial_date_before_start','nonfinite financial dates fail closed');
SELECT lives_ok($$SELECT app_private.assert_financial_write_allowed('fa220000-0000-4000-8000-000000000001',date_trunc('month',current_date)::date)$$,'cutoff is inclusive');
SELECT throws_ok($$INSERT INTO public.management_fee_occurrences(organization_id,fee_date) VALUES('fa220000-0000-4000-8000-000000000001',date_trunc('month',current_date)::date-1)$$,
 '22023','financial_date_before_start','management fee date enforces cutoff');
SELECT throws_ok($$INSERT INTO public.tenant_credit_occurrences(organization_id,occurred_on) VALUES('fa220000-0000-4000-8000-000000000001',date_trunc('month',current_date)::date-1)$$,
 '22023','financial_date_before_start','tenant credit date enforces cutoff');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.record_owner_contribution('fa220000-0000-4000-8000-000000000001',
 'fa220000-0000-4000-8000-000000000002','fa220000-0000-4000-8000-000000000003','USD',date_trunc('month',current_date)::date-1,25,
 'Backdated contribution','fence-backdated-key',NULL)$$,'22023','financial_date_before_start','actual contribution command enforces cutoff');
SELECT lives_ok($$SELECT public.record_owner_contribution('fa220000-0000-4000-8000-000000000001',
 'fa220000-0000-4000-8000-000000000002','fa220000-0000-4000-8000-000000000003','USD',current_date,25,
 'Current contribution','fence-current-key',NULL)$$,'new-generation real contribution succeeds');
SELECT lives_ok($$SELECT public.record_owner_contribution('fa220000-0000-4000-8000-000000000001',
 'fa220000-0000-4000-8000-000000000002','fa220000-0000-4000-8000-000000000003','USD',current_date,25,
 'Current contribution','fence-current-key',NULL)$$,'new-generation replay succeeds once');
RESET ROLE;
SELECT is((SELECT financial_generation FROM app_private.financial_idempotency_requests WHERE organization_id='fa220000-0000-4000-8000-000000000001' AND idempotency_key='fence-current-key'),1,'new request receives database-owned generation');
SELECT is((SELECT count(*) FROM public.owner_cash_events WHERE organization_id='fa220000-0000-4000-8000-000000000001'),2::bigint,'replay did not duplicate cash');

-- Test the real invoice table's BEFORE trigger, before other constraints: a new
-- issue date cannot legalize an old billing period.
SELECT throws_ok($$INSERT INTO public.tenant_invoices(organization_id,billing_period_start,billing_period_end,issue_date)
 VALUES('fa220000-0000-4000-8000-000000000001',current_date-30,date_trunc('month',current_date)::date-1,current_date)$$,
 '22023','financial_date_before_start','invoice billing period is fenced independently of issue date');
SELECT ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.tenant_invoices'::regclass
 AND tgname='a_financial_write_fence' AND encode(tgargs,'escape') LIKE '%billing_period_start%'),'invoice date coverage includes billing month');

SELECT throws_ok($$UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id='fa220000-0000-4000-8000-000000000001'$$,
 '23514','financial_control_generation_change_requires_freeze','generation cannot advance while open');
UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id='fa220000-0000-4000-8000-000000000001';
UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id='fa220000-0000-4000-8000-000000000001';
UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id='fa220000-0000-4000-8000-000000000001';
SELECT throws_ok($$SELECT app_private.assert_financial_write_allowed('fa220000-0000-4000-8000-000000000001')$$,
 '40001','financial_generation_stale','second generation invalidates previous open forms');
SELECT throws_ok($$DELETE FROM app_private.financial_write_controls WHERE organization_id='fa220000-0000-4000-8000-000000000001'$$,
 '23514','financial_control_removal_forbidden','control cannot be silently disabled');

SELECT set_config('request.method','POST',true);
SELECT throws_ok($$SELECT app_private.begin_financial_scheduled_scope('fa220000-0000-4000-8000-000000000001')$$,
 '42501','financial_scheduler_context_forbidden','HTTP context cannot acquire scheduler bypass');
SELECT set_config('request.method','',true);
SELECT is(app_private.begin_financial_scheduled_scope('fa220000-0000-4000-8000-000000000001'),true,'genuine operator scheduler context can enter open scope');
SELECT lives_ok($$SELECT app_private.assert_financial_write_allowed('fa220000-0000-4000-8000-000000000001',current_date)$$,'scheduled scope needs no client generation');
SELECT set_config('app.financial_scheduler_scope','',true);
SELECT set_config('request.jwt.claim.sub','fa220000-0000-4000-8000-000000000099',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.get_financial_write_context('fa220000-0000-4000-8000-000000000001')$$,
 '42501','financial_context_forbidden','foreign actor cannot read reset context');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
