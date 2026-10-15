BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Entirely fresh, rollback-only fixture. Financial rows are made through the
-- same checked commands as the application; no immutable row is rewritten.
CREATE TEMP TABLE receipt_case (
  org uuid DEFAULT gen_random_uuid(), actor uuid DEFAULT gen_random_uuid(),
  branch uuid DEFAULT gen_random_uuid(), owner_id uuid, tenant_id uuid,
  property_id uuid, lease_id uuid, invoice_id uuid, account_id uuid,
  payment_id uuid, replacement_id uuid, second_replacement_id uuid, extra_payment_id uuid,
  deposit_id uuid, liability_id uuid, deposit_event_id uuid, application_id uuid,
  utility_line_id uuid, submission_id uuid,
  original_source jsonb, replacement_source jsonb, today date, month date
);
INSERT INTO receipt_case DEFAULT VALUES;
GRANT SELECT, UPDATE ON receipt_case TO authenticated;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 SELECT actor,'authenticated','authenticated',actor||'@receipt-snapshot.test','{}' FROM receipt_case;
INSERT INTO public.organizations(id,name,slug)
 SELECT org,'Receipt snapshot regression',org::text FROM receipt_case;
INSERT INTO public.organization_authorization_states(organization_id,ordinary_access_enabled,transition_manifest_required)
 SELECT org,true,false FROM receipt_case
 ON CONFLICT(organization_id) DO UPDATE SET ordinary_access_enabled=true,transition_manifest_required=false;
INSERT INTO public.organization_branches(id,organization_id,name,code)
 SELECT branch,org,'Receipt branch','RECEIPT' FROM receipt_case;
INSERT INTO public.organization_members(organization_id,user_id,role)
 SELECT org,actor,'super_admin' FROM receipt_case;
SELECT set_config('request.jwt.claim.sub',(SELECT actor::text FROM receipt_case),true);
SET LOCAL ROLE authenticated;
UPDATE receipt_case SET today=public.get_lease_rent_business_date(org);
UPDATE receipt_case SET month=date_trunc('month',today)::date;
UPDATE receipt_case SET owner_id=public.create_person(
 p_organization_id=>org,p_branch_id=>branch,p_display_name=>'Receipt owner',
 p_legal_name=>NULL,p_party_type=>'individual',p_primary_email=>NULL,p_primary_phone=>NULL,
 p_tax_identifier=>NULL,p_notes=>NULL,p_roles=>ARRAY['owner']);
UPDATE receipt_case SET tenant_id=public.create_person(
 p_organization_id=>org,p_branch_id=>branch,p_display_name=>'Receipt tenant',
 p_legal_name=>NULL,p_party_type=>'individual',p_primary_email=>NULL,p_primary_phone=>NULL,
 p_tax_identifier=>NULL,p_notes=>NULL,p_roles=>ARRAY['tenant']);
UPDATE receipt_case SET property_id=public.create_property_minimal(
 p_organization_id=>org,p_branch_id=>branch,p_name=>'Receipt property',p_code=>'RECEIPT',
 p_property_type=>'Residential apartment',p_address=>NULL,p_registered_date=>NULL,
 p_idempotency_key=>'receipt-snapshot-property',p_owner_person_id=>owner_id,
 p_owner_started_on=>month,p_owner_ownership_percent=>100);
SELECT public.set_property_rental_structure(org,property_id,'single_space') FROM receipt_case;
UPDATE receipt_case SET lease_id=(public.create_lease_with_deposit_receipt(
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
 p_deposit_received_on=>NULL,p_idempotency_key=>'receipt-snapshot-lease')->>'leaseId')::uuid;
SELECT public.transition_lease_lifecycle(
 p_organization_id=>c.org,p_lease_id=>c.lease_id,p_expected_status=>'draft',
 p_expected_occupancy_id=>o.id,p_transition=>'activate',p_effective_date=>c.month,
 p_scheduled_move_out_date=>NULL,p_reason=>'Receipt regression activation',p_idempotency_key=>'receipt-snapshot-activate')
FROM receipt_case c JOIN public.lease_occupancies o ON o.organization_id=c.org AND o.lease_id=c.lease_id
 WHERE o.archived_at IS NULL AND o.evidence_state='accepted';
UPDATE receipt_case c SET invoice_id=i.id FROM public.tenant_invoices i
 WHERE i.organization_id=c.org AND i.lease_id=c.lease_id AND i.billing_period_start=c.month;
UPDATE receipt_case c SET account_id=a.id FROM public.finance_accounts a
 WHERE a.organization_id=c.org AND a.system_role='operating_bank' AND a.archived_at IS NULL;
SAVEPOINT tied_invoice_era;
UPDATE receipt_case SET utility_line_id=(public.create_manual_tenant_charge(org,lease_id,'utilities',month,today,
 20,'Unaffected utility charge','receipt-utility')->>'lineId')::uuid;
DO $$ DECLARE c receipt_case%ROWTYPE; BEGIN
 SELECT * INTO c FROM receipt_case;
 PERFORM public.correct_historical_rent(c.org,c.invoice_id,100,1,'Tied correction before utility payment',
  public.preview_historical_rent_correction(c.org,c.invoice_id,100,1)->>'previewHash','receipt-tied-correction');
 UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
  c.org,c.invoice_id,5,c.today,c.account_id,'Unaffected-line payment',
  jsonb_build_array(jsonb_build_object('lineId',c.utility_line_id,'amount',5)),'receipt-tied-utility');
END; $$;
SELECT throws_ok(format('SELECT public.get_tenant_commercial_document_publication_source(%L,''receipt'',%L)',org,extra_payment_id),
 '55000','tenant_receipt_snapshot_order_ambiguous','unproven same-statement correction era fails closed even without prior settlements') FROM receipt_case;
ROLLBACK TO tied_invoice_era;

SAVEPOINT adjustment_era;
UPDATE receipt_case SET submission_id=(public.submit_expense(org,property_id,NULL,'general',NULL,'utility',
 'Receipt utility vendor',month,20,5,'USD','tenant',invoice_id,
 (SELECT source_id FROM public.finance_account_source_links WHERE organization_id=org AND account_id=receipt_case.account_id),
 NULL,NULL,'Receipt utility evidence','receipt-utility-expense')->>'submission_id')::uuid;
SELECT public.review_expense(org,submission_id,'approve',NULL,'receipt-utility-approve',NULL) FROM receipt_case;
SAVEPOINT later_adjustment;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,10,today,account_id,'Payment before tenant adjustment',NULL,'receipt-before-adjustment');
SELECT public.reverse_expense(org,submission_id,month,'Later backdated tenant adjustment','receipt-later-adjustment') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{invoice,total_amount}',
 '145.00','later backdated tenant adjustment cannot change earlier receipt charge') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '135.00','later adjustment preserves earlier immediately-after-payment balance') FROM receipt_case;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,5,today,account_id,'Later payment sees tenant adjustment',NULL,'receipt-later-after-adjustment');
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '105.00','new payment sees adjusted total120 less effective prior10 and current5') FROM receipt_case;
ROLLBACK TO later_adjustment;
SELECT public.reverse_expense(org,submission_id,today,'Receipt utility entered in error','receipt-utility-reverse') FROM receipt_case;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,10,today,account_id,'Payment after tenant adjustment',NULL,'receipt-after-adjustment');
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{invoice,total_amount}',
 '120.00','prior signed expense adjustment is part of historical charge') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '110.00','tenant adjustment reduces receipt balance exactly once') FROM receipt_case;
ROLLBACK TO adjustment_era;

UPDATE receipt_case SET payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,40,month,account_id,'Receipt original payment',NULL,'receipt-snapshot-payment');
UPDATE receipt_case SET original_source=public.get_tenant_commercial_document_publication_source(org,'receipt',payment_id);
SELECT is(original_source#>>'{invoice,total_amount}','120.00','original receipt charge is 120') FROM receipt_case;
SELECT is(original_source#>>'{payment,remaining_balance}','80.00','original receipt balance is 80') FROM receipt_case;
SAVEPOINT later_base_charge;
SELECT public.create_manual_tenant_charge(org,lease_id,'utilities',month,today,20,
 'Later utility charge','receipt-later-utility') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',payment_id)#>>'{invoice,total_amount}',
 '120.00','later added base charge does not rewrite an earlier receipt total') FROM receipt_case;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,10,today,account_id,'Payment after added charge',NULL,'receipt-after-added-charge');
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '90.00','new payment includes later base charge140 less prior40 and current10') FROM receipt_case;
SELECT is((SELECT balance_due FROM public.tenant_invoice_balances WHERE id=c.invoice_id),90::numeric,
 'historical reads leave current invoice balance unchanged') FROM receipt_case c;
ROLLBACK TO later_base_charge;
SAVEPOINT tied_base_charge;
DO $$ DECLARE c receipt_case%ROWTYPE; BEGIN
 SELECT * INTO c FROM receipt_case;
 PERFORM public.create_manual_tenant_charge(c.org,c.lease_id,'utilities',c.month,c.today,20,
  'Unordered added charge','receipt-tied-base-charge');
 UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
  c.org,c.invoice_id,5,c.today,c.account_id,'Payment to old rent line',NULL,'receipt-tied-base-payment');
END; $$;
SELECT throws_ok(format('SELECT public.get_tenant_commercial_document_publication_source(%L,''receipt'',%L)',org,extra_payment_id),
 '55000','tenant_receipt_snapshot_order_ambiguous','unproven same-statement base charge era fails closed') FROM receipt_case;
ROLLBACK TO tied_base_charge;
SELECT public.allocate_owner_event(c.org,'tenant_rent_receipt',a.id,'receipt-owner-'||a.id)
 FROM receipt_case c JOIN public.tenant_invoice_payment_allocations a ON a.organization_id=c.org AND a.payment_id=c.payment_id;
SAVEPOINT tied_causal_corrections;
DO $$ DECLARE c receipt_case%ROWTYPE; BEGIN
 SELECT * INTO c FROM receipt_case;
 PERFORM public.correct_historical_rent(c.org,c.invoice_id,100,1,'First tied causal correction',
  public.preview_historical_rent_correction(c.org,c.invoice_id,100,1)->>'previewHash','receipt-causal-one');
 UPDATE receipt_case SET replacement_id=r.replacement_settlement_id
  FROM public.historical_rent_settlement_reapplications r WHERE r.organization_id=c.org AND r.original_settlement_id=c.payment_id;
 PERFORM public.correct_historical_rent(c.org,c.invoice_id,90,1,'Second tied causal correction',
  public.preview_historical_rent_correction(c.org,c.invoice_id,90,1)->>'previewHash','receipt-causal-two');
 PERFORM public.correct_historical_rent(c.org,c.invoice_id,80,1,'Third tied causal correction',
  public.preview_historical_rent_correction(c.org,c.invoice_id,80,1)->>'previewHash','receipt-causal-three');
END; $$;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',replacement_id)#>>'{payment,remaining_balance}',
 '60.00','transitive lineage preserves first replacement era across three same-statement corrections') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(c.org,'receipt',r.replacement_settlement_id)#>>'{payment,remaining_balance}',
 '50.00','second tied correction includes its ancestral charge and nets earlier replay')
 FROM receipt_case c JOIN public.historical_rent_settlement_reapplications r ON r.organization_id=c.org AND r.original_settlement_id=c.replacement_id;
SELECT is(public.get_tenant_commercial_document_publication_source(c.org,'receipt',third.replacement_settlement_id)#>>'{payment,remaining_balance}',
 '40.00','third tied correction retains its own eighty-dollar era')
 FROM receipt_case c JOIN public.historical_rent_settlement_reapplications second ON second.organization_id=c.org AND second.original_settlement_id=c.replacement_id
 JOIN public.historical_rent_settlement_reapplications third ON third.organization_id=c.org AND third.original_settlement_id=second.replacement_settlement_id;
ROLLBACK TO tied_causal_corrections;
SAVEPOINT zero_reapplication_guard;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,30,today,account_id,'Zero-reapplication second original',NULL,'receipt-zero-original');
SELECT public.allocate_owner_event(c.org,'tenant_rent_receipt',a.id,'receipt-zero-owner-'||a.id)
 FROM receipt_case c JOIN public.tenant_invoice_payment_allocations a ON a.organization_id=c.org AND a.payment_id=c.extra_payment_id;
-- Current checked commands do not permit tenant-credit/zero-reapplication
-- creation. Preserve that boundary rather than forge financial fixture rows.
SELECT throws_ok(format('SELECT public.correct_historical_rent(%L,%L,20,1,%L,%L,%L)',org,invoice_id,
 'Unsupported zero reapplication',public.preview_historical_rent_correction(org,invoice_id,20,1)->>'previewHash','receipt-zero-denied'),
 '55000','historical_rent_correction_blocked','receipt projection does not enable unsupported tenant-credit corrections') FROM receipt_case;
ROLLBACK TO zero_reapplication_guard;
-- Atomic correction policy: all old settlements net away, then replacements
-- follow original receipt order. Internal loop state is not a receipt balance.
SAVEPOINT multiple_originals;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,30,today,account_id,'Second original payment',NULL,'receipt-snapshot-original-two');
SELECT public.allocate_owner_event(c.org,'tenant_rent_receipt',a.id,'receipt-owner-'||a.id)
 FROM receipt_case c JOIN public.tenant_invoice_payment_allocations a ON a.organization_id=c.org AND a.payment_id=c.extra_payment_id;
SELECT public.correct_historical_rent(c.org,c.invoice_id,100,1,'Batch receipt correction',
 public.preview_historical_rent_correction(c.org,c.invoice_id,100,1)->>'previewHash','receipt-snapshot-batch') FROM receipt_case c;
SELECT is(public.get_tenant_commercial_document_publication_source(c.org,'receipt',r.replacement_settlement_id)#>>'{payment,remaining_balance}',
 CASE WHEN r.original_settlement_id=c.payment_id THEN '60.00' ELSE '30.00' END,
 'atomic batch receipt follows original A40 then B30, not replacement UUID order')
 FROM receipt_case c JOIN public.historical_rent_settlement_reapplications r ON r.organization_id=c.org;
SELECT is(public.get_tenant_commercial_document_publication_source(c.org,'receipt',r.replacement_settlement_id)#>>'{payment,amount_previously_paid}',
 CASE WHEN r.original_settlement_id=c.payment_id THEN '0.00' ELSE '40.00' END,
 'batch removes every old payment/reversal before its ordered replacement receipts')
 FROM receipt_case c JOIN public.historical_rent_settlement_reapplications r ON r.organization_id=c.org;
ROLLBACK TO multiple_originals;
SELECT public.correct_historical_rent(c.org,c.invoice_id,100,1,'Receipt correction to 100',
 public.preview_historical_rent_correction(c.org,c.invoice_id,100,1)->>'previewHash','receipt-snapshot-correct-one') FROM receipt_case c;
UPDATE receipt_case c SET replacement_id=r.replacement_settlement_id
 FROM public.historical_rent_settlement_reapplications r
 WHERE r.organization_id=c.org AND r.original_settlement_id=c.payment_id AND r.settlement_kind='ips_payment';
UPDATE receipt_case SET replacement_source=public.get_tenant_commercial_document_publication_source(org,'receipt',replacement_id);
SELECT is(replacement_source#>>'{invoice,total_amount}','100.00','replacement receipt uses corrected charge, not immutable issued header') FROM receipt_case;
SELECT is(replacement_source#>>'{payment,amount_previously_paid}','0.00','causal original reversal precedes replacement regardless of UUID order') FROM receipt_case;
SELECT is(replacement_source#>>'{payment,remaining_balance}','60.00','replacement receipt balance immediately after payment is 60') FROM receipt_case;
SELECT is((public.get_tenant_commercial_document_publication_source(org,'receipt',payment_id)#>'{payment}')::text,
 (original_source#>'{payment}')::text,'later correction does not rewrite original payment snapshot') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',payment_id)#>>'{invoice,total_amount}',
 '120.00','original unpublished source also retains historical charge') FROM receipt_case;

SAVEPOINT ordinary_after_correction;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,10,today,account_id,'New payment after correction',NULL,'receipt-snapshot-new-ten');
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{invoice,total_amount}',
 '100.00','ordinary payment after correction uses corrected charge without a replay link') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,amount_previously_paid}',
 '40.00','ordinary payment sees effective replacement settlement once') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '50.00','new ten-dollar payment leaves fifty due') FROM receipt_case;
SELECT is(public.record_tenant_invoice_payment_with_account(org,invoice_id,10,today,account_id,
 'New payment after correction',NULL,'receipt-snapshot-new-ten'),extra_payment_id,'ordinary payment retry retains source identity') FROM receipt_case;
SELECT public.record_tenant_invoice_payment_with_account(org,invoice_id,5,month,account_id,
 'Later recorded backdated payment',NULL,'receipt-snapshot-backdated') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '50.00','later recorded backdated payment cannot rewrite earlier receipt balance') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',replacement_id)#>>'{payment,remaining_balance}',
 '60.00','ordinary and backdated later payments leave replacement snapshot unchanged') FROM receipt_case;
ROLLBACK TO ordinary_after_correction;

-- Correction headers share now(), but signed lines/payments have the released
-- immutable statement_timestamp() stamp. Internal batch events still tie;
-- replacement lineage, not UUID or today's balance, identifies their era.
SELECT public.correct_historical_rent(c.org,c.invoice_id,90,1,'Receipt correction to 90',
 public.preview_historical_rent_correction(c.org,c.invoice_id,90,1)->>'previewHash','receipt-snapshot-correct-two') FROM receipt_case c;
UPDATE receipt_case c SET second_replacement_id=r.replacement_settlement_id
 FROM public.historical_rent_settlement_reapplications r
 WHERE r.organization_id=c.org AND r.original_settlement_id=c.replacement_id AND r.settlement_kind='ips_payment';
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',replacement_id)#>>'{invoice,total_amount}',
 '100.00','later same-transaction correction does not rewrite first replacement charge') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',replacement_id)#>>'{payment,remaining_balance}',
 '60.00','later correction does not rewrite first replacement remaining balance') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',second_replacement_id)#>>'{invoice,total_amount}',
 '90.00','second replacement includes its causal correction ancestry') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',second_replacement_id)#>>'{payment,remaining_balance}',
 '50.00','second replacement has 50 remaining') FROM receipt_case;
SELECT public.reverse_tenant_invoice_payment(org,second_replacement_id,today,'Reverse latest replacement','receipt-snapshot-reverse') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',second_replacement_id)->>'source_state',
 'reversed','later reversal is visible as receipt status') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',second_replacement_id)#>>'{payment,remaining_balance}',
 '50.00','reversed receipt retains its historical immediately-after-payment balance') FROM receipt_case;
SELECT is((SELECT total_amount FROM public.tenant_invoices WHERE id=c.invoice_id),120::numeric,
 'issued header remains immutable') FROM receipt_case c;
SELECT is((SELECT balance_due FROM public.tenant_invoice_balances WHERE id=c.invoice_id),90::numeric,
 'current receivable remains 90 after reversal') FROM receipt_case c;
SELECT is((SELECT sum(e.amount) FROM public.get_property_cash_events_page(
 c.org,c.property_id,'USD',c.month,c.today,NULL::date,NULL::text,NULL::uuid,200) e),0::numeric,
 'receipt reads do not change zero net cash') FROM receipt_case c;
SELECT throws_ok(format('SELECT public.get_tenant_commercial_document_publication_source(%L,''receipt'',%L)',
 gen_random_uuid(),payment_id),'42501','tenant_commercial_document_source_forbidden','cross-organization receipt is denied') FROM receipt_case;

SAVEPOINT ambiguous_ordinary;
DO $$ DECLARE c receipt_case%ROWTYPE; BEGIN
 SELECT * INTO c FROM receipt_case;
 PERFORM public.record_tenant_invoice_payment_with_account(c.org,c.invoice_id,10,c.today,c.account_id,
  'Unordered ordinary payment one',NULL,'receipt-snapshot-tied-one');
 UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(c.org,c.invoice_id,10,c.today,c.account_id,
  'Unordered ordinary payment two',NULL,'receipt-snapshot-tied-two');
END; $$;
SELECT throws_ok(format('SELECT public.get_tenant_commercial_document_publication_source(%L,''receipt'',%L)',org,extra_payment_id),
 '55000','tenant_receipt_snapshot_order_ambiguous','unpublished unrelated same-statement payments fail closed instead of sorting UUIDs') FROM receipt_case;
ROLLBACK TO ambiguous_ordinary;

SAVEPOINT deposit_settlement;
CREATE FUNCTION pg_temp.receipt_deposit_command(p_org uuid,p_lease uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE packet jsonb; BEGIN
 packet:=public.prepare_deposit_rent_journal(p_org,p_lease,p_payload,
   public.get_local_deposit_rent_candidates(p_org,p_lease)->>'fingerprint');
 PERFORM public.begin_deposit_rent_journal_attempt(p_org,p_lease,(packet->>'token')::uuid,
   (packet->>'idempotencyKey')::uuid,packet->>'payloadHash',(packet->>'revision')::integer);
 packet:=public.execute_deposit_rent_journal(p_org,p_lease,(packet->>'token')::uuid,
   (packet->>'idempotencyKey')::uuid,packet->>'payloadHash');
 IF packet->>'state'<>'resolved' THEN RAISE EXCEPTION 'Deposit fixture command unresolved'; END IF;
 RETURN (packet#>>'{result,commandId}')::uuid;
END; $$;
UPDATE receipt_case c SET deposit_id=d.id FROM public.lease_deposits d
 WHERE d.organization_id=c.org AND d.lease_id=c.lease_id AND d.archived_at IS NULL;
UPDATE receipt_case c SET liability_id=a.id FROM public.finance_accounts a
 WHERE a.organization_id=c.org AND a.use_for_lease_deposits AND a.archived_at IS NULL AND a.property_id IS NULL;
UPDATE receipt_case SET deposit_event_id=public.record_lease_deposit_event_idempotent(
 org,deposit_id,liability_id,'received',today,100,'Receipt deposit fixture','receipt-deposit-received');
SELECT public.allocate_owner_event(org,'security_deposit_receipt',deposit_event_id,'receipt-deposit-owner') FROM receipt_case;
SELECT public.confirm_deposit_rent_custody(org,deposit_id,liability_id,'ips',NULL,today,100,
 'Receipt deposit held evidence','receipt-deposit-custody') FROM receipt_case;
UPDATE receipt_case c SET application_id=pg_temp.receipt_deposit_command(c.org,c.lease_id,
 jsonb_build_object('operation','apply','leaseId',c.lease_id,'depositId',c.deposit_id,
 'invoiceId',c.invoice_id,'lineId',l.id,'amount','20.00','date',c.today,'reason','Deposit prior to cash receipt'))
 FROM public.tenant_invoice_lines l WHERE l.organization_id=c.org AND l.invoice_id=c.invoice_id
 AND l.reversal_of_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_invoice_lines next
 WHERE next.organization_id=l.organization_id AND next.supersedes_line_id=l.id);
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,10,today,account_id,'Cash after deposit settlement',NULL,'receipt-after-deposit');
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,amount_previously_paid}',
 '20.00','prior deposit application reduces invoice balance without being new cash') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '60.00','ninety charge minus twenty deposit and ten cash leaves sixty') FROM receipt_case;
SELECT pg_temp.receipt_deposit_command(org,lease_id,jsonb_build_object('operation','reverse','leaseId',lease_id,
 'applicationId',application_id,'date',today,'reason','Reverse prior deposit settlement')) FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '60.00','later deposit reversal preserves earlier receipt snapshot') FROM receipt_case;
UPDATE receipt_case SET extra_payment_id=public.record_tenant_invoice_payment_with_account(
 org,invoice_id,5,today,account_id,'Cash after deposit reversal',NULL,'receipt-after-deposit-reverse');
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,amount_previously_paid}',
 '10.00','later receipt nets prior deposit application and its reversal exactly once') FROM receipt_case;
SELECT is(public.get_tenant_commercial_document_publication_source(org,'receipt',extra_payment_id)#>>'{payment,remaining_balance}',
 '75.00','later receipt retains ninety charge minus only fifteen effective cash') FROM receipt_case;
ROLLBACK TO deposit_settlement;

SAVEPOINT receipt_role_scope;
RESET ROLE;
CREATE TEMP TABLE receipt_roles AS SELECT gen_random_uuid() AS reader,gen_random_uuid() AS foreign_reader,
 gen_random_uuid() AS denied_reader,gen_random_uuid() AS other_branch,gen_random_uuid() AS finance_role,
 gen_random_uuid() AS nonfinance_role;
GRANT SELECT ON receipt_roles TO authenticated;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 SELECT id,'authenticated','authenticated',id||'@receipt-scope.test','{}'
 FROM receipt_roles CROSS JOIN LATERAL unnest(ARRAY[reader,foreign_reader,denied_reader]) id;
INSERT INTO public.organization_branches(id,organization_id,name,code)
 SELECT other_branch,org,'Other receipt branch','OTHER' FROM receipt_roles CROSS JOIN receipt_case;
INSERT INTO public.organization_roles(id,organization_id,name,status)
 SELECT finance_role,org,'Receipt reader','active' FROM receipt_roles CROSS JOIN receipt_case UNION ALL
 SELECT nonfinance_role,org,'Receipt denied','active' FROM receipt_roles CROSS JOIN receipt_case;
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
 SELECT org,finance_role,'finance.view'::public.organization_permission_key FROM receipt_roles CROSS JOIN receipt_case UNION ALL
 SELECT org,nonfinance_role,'properties.view'::public.organization_permission_key FROM receipt_roles CROSS JOIN receipt_case;
INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
 SELECT org,reader,'custom',branch,finance_role FROM receipt_roles CROSS JOIN receipt_case UNION ALL
 SELECT org,foreign_reader,'custom',other_branch,finance_role FROM receipt_roles CROSS JOIN receipt_case UNION ALL
 SELECT org,denied_reader,'custom',branch,nonfinance_role FROM receipt_roles CROSS JOIN receipt_case;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT reader::text FROM receipt_roles),true);
SELECT lives_ok(format('SELECT public.get_tenant_commercial_document_publication_source(%L,''receipt'',%L)',org,replacement_id),
 'ordinary finance reader can read receipt in assigned branch') FROM receipt_case;
SELECT set_config('request.jwt.claim.sub',(SELECT foreign_reader::text FROM receipt_roles),true);
SELECT throws_ok(format('SELECT public.get_tenant_commercial_document_publication_source(%L,''receipt'',%L)',org,replacement_id),
 '42501',NULL,'finance permission does not expose another branch receipt') FROM receipt_case;
SELECT set_config('request.jwt.claim.sub',(SELECT denied_reader::text FROM receipt_roles),true);
SELECT throws_ok(format('SELECT public.get_tenant_commercial_document_publication_source(%L,''receipt'',%L)',org,replacement_id),
 '42501',NULL,'same branch without finance view is denied') FROM receipt_case;
ROLLBACK TO receipt_role_scope;

RESET ROLE;
SELECT ok(NOT has_function_privilege('authenticated','app_private.tenant_receipt_historical_money(uuid,uuid)','EXECUTE'),
 'raw historical money helper is not an authenticated API');
SELECT ok(NOT has_function_privilege('anon','public.get_tenant_commercial_document_publication_source(uuid,text,uuid)','EXECUTE'),
 'anonymous access remains revoked');
SET LOCAL ROLE authenticated;
SELECT 'RECEIPT_SOURCE_PACKET '||jsonb_build_object(
 'organizationId',c.org,'issuer',jsonb_build_object('name',o.name,'logo_storage_path',NULL,'operational_timezone',o.operational_timezone),
 'sources',jsonb_build_object('original',c.original_source,'replacement',c.replacement_source,
 'delayedReplacement',public.get_tenant_commercial_document_publication_source(c.org,'receipt',c.replacement_id),
 'secondReplacement',public.get_tenant_commercial_document_publication_source(c.org,'receipt',c.second_replacement_id)))::text
 FROM receipt_case c JOIN public.organizations o ON o.id=c.org;
SELECT * FROM finish();
ROLLBACK;
