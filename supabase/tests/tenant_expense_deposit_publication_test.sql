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
CREATE TEMP TABLE tenant_protected_case AS SELECT
 public.create_finance_account(org,'expense','expense','Tenant protected utility',NULL,NULL,NULL,NULL,false,true,false) category,
 NULL::uuid transaction_id,NULL::uuid corrected_id,NULL::uuid revision_id,NULL::uuid publication_id,NULL::jsonb publication
 FROM receipt_case;
CREATE TEMP TABLE tenant_protected_lines AS SELECT jsonb_build_array(jsonb_build_object('property_id',property_id,
 'tenant_invoice_id',invoice_id,'category_account_id',category,'description','Protected tenant utility','amount','20.00','internal_markup_amount','5.00')) payload
 FROM receipt_case CROSS JOIN tenant_protected_case;
UPDATE tenant_protected_case SET transaction_id=(public.submit_expense_transaction(org,NULL,'Protected vendor',today,'USD',account_id,NULL,NULL,'tenant',payload,'tenant-protected-original')->>'transaction_id')::uuid FROM receipt_case CROSS JOIN tenant_protected_lines;
SELECT public.review_expense_transaction(org,transaction_id,'approve','Checked utility','tenant-protected-review') FROM receipt_case CROSS JOIN tenant_protected_case;
UPDATE receipt_case c SET application_id=pg_temp.receipt_deposit_command(c.org,c.lease_id,
 jsonb_build_object('operation','apply','leaseId',c.lease_id,'depositId',c.deposit_id,
 'invoiceId',c.invoice_id,'lineId',l.id,'amount','20.00','date',c.today,'reason','Deposit prior to cash receipt'))
 FROM public.tenant_invoice_lines l WHERE l.organization_id=c.org AND l.invoice_id=c.invoice_id
 AND l.line_type='rent' AND l.reversal_of_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_invoice_lines next
 WHERE next.organization_id=l.organization_id AND next.supersedes_line_id=l.id);

SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,transaction_id,'approved','Correct protected utility',today,'Protected vendor',today,'USD',account_id,'tenant',payload,'tenant-deposit-denied'),'23514','Reverse linked deposit settlement before changing settled rent obligation','active rent deposit blocks expense correction on same invoice') FROM receipt_case CROSS JOIN tenant_protected_case CROSS JOIN tenant_protected_lines;
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT transaction_id FROM tenant_protected_case)),'approved','deposit denial rolls back original expense reversal');
SELECT is((SELECT count(*) FROM public.expense_customer_adjustments a JOIN public.expense_transaction_lines l ON l.submission_id=a.submission_id WHERE l.transaction_id=(SELECT transaction_id FROM tenant_protected_case)),0::bigint,'deposit denial leaves no adjustment');
SELECT is((SELECT sum(signed_amount) FROM public.deposit_rent_allocations WHERE application_id=(SELECT application_id FROM receipt_case)),20::numeric,'denied expense correction preserves deposit application');
SELECT pg_temp.receipt_deposit_command(org,lease_id,jsonb_build_object('operation','reverse','leaseId',lease_id,'applicationId',application_id,'date',today,'reason','Reverse synthetic deposit settlement')) FROM receipt_case;
RESET ROLE;
CREATE TEMP TABLE tenant_publication_reviewer AS SELECT gen_random_uuid() id;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) SELECT id,'authenticated','authenticated',id||'@tenant-publication.test','{}' FROM tenant_publication_reviewer;
INSERT INTO public.organization_members(organization_id,user_id,role) SELECT org,id,'super_admin' FROM receipt_case CROSS JOIN tenant_publication_reviewer;
GRANT SELECT ON tenant_publication_reviewer TO authenticated;
SET LOCAL ROLE authenticated;
SELECT public.submit_owner_opening_balance(org,property_id,owner_id,'USD',month,c::public.owner_balance_component,0,'Zero synthetic opening','Verified test opening',NULL,repeat('a',64),NULL,'tenant-opening-'||c) FROM receipt_case CROSS JOIN unnest(ARRAY['ips_held_owner_cash','owner_due_to_ips','ips_due_to_owner','security_deposit_custody']) c;
SELECT set_config('request.jwt.claim.sub',id::text,true) FROM tenant_publication_reviewer;
SELECT public.review_owner_opening_balance(r.organization_id,r.id,'approve','Verified opening','tenant-opening-review-'||component::text) FROM public.owner_opening_balance_requests r JOIN receipt_case c ON c.org=r.organization_id;
SELECT set_config('request.jwt.claim.sub',actor::text,true) FROM receipt_case;
SELECT public.generate_owner_balance_period(org,property_id,owner_id,'USD',month,'tenant-publication-period') FROM receipt_case;
SELECT public.set_financial_month_lock(org,month,true,'Publish synthetic tenant period') FROM receipt_case;
UPDATE tenant_protected_case SET revision_id=(public.close_owner_month(org,property_id,owner_id,'USD',month,'Close synthetic tenant statement','tenant-publication-close')->>'revision_id')::uuid FROM receipt_case;
UPDATE tenant_protected_case SET publication_id=(public.publish_owner_statement(org,revision_id,'tenant-publication-publish')->>'publication_id')::uuid FROM receipt_case;
UPDATE tenant_protected_case SET publication=public.get_owner_statement_publication(org,publication_id) FROM receipt_case;
SELECT throws_ok(format('SELECT public.replace_expense_transaction(%L,%L,%L,%L,%L,NULL,%L,%L,%L,%L,NULL,NULL,%L,%L::jsonb,%L)',org,transaction_id,'approved','Correct published utility',today,'Protected vendor',today,'USD',account_id,'tenant',payload,'tenant-publication-denied'),'55000','Financial month is locked','published closed month rejects original-period expense correction') FROM receipt_case CROSS JOIN tenant_protected_case CROSS JOIN tenant_protected_lines;
UPDATE tenant_protected_case SET corrected_id=(public.replace_expense_transaction(org,transaction_id,'approved','Correct utility in open period',(month+interval '1 month')::date,NULL,'Protected vendor',(month+interval '1 month')::date,'USD',account_id,NULL,NULL,'tenant',jsonb_set(payload,'{0,amount}','"30.00"'),'tenant-next-period-correction')->>'transaction_id')::uuid FROM receipt_case CROSS JOIN tenant_protected_lines;
SELECT is((SELECT status FROM public.expense_transactions WHERE id=(SELECT corrected_id FROM tenant_protected_case)),'approved','open later period allows audited tenant correction after deposit reversal');
SELECT is(public.get_owner_statement_publication(org,publication_id),publication,'later tenant correction preserves exact frozen publication and hash') FROM receipt_case CROSS JOIN tenant_protected_case;
-- The later correction changes vendor cash and tenant charges, not owner costs.
SELECT is((SELECT sum(a.signed_amount) FROM public.finance_payment_allocations a
 JOIN public.expense_submissions s ON a.id IN(s.approved_payment_allocation_id,s.reversal_payment_allocation_id)
 JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE l.transaction_id IN(SELECT transaction_id FROM tenant_protected_case UNION SELECT corrected_id FROM tenant_protected_case)
 AND a.paid_date=(SELECT (month+interval '1 month')::date FROM receipt_case)), -10::numeric,
 'later-period payment allocation details reconcile to the additional ten dollars vendor cost');
SELECT is((SELECT sum(CASE WHEN e.direction='income' THEN e.amount ELSE -e.amount END)
 FROM public.ledger_entries e JOIN public.expense_submissions s ON e.id IN(s.approved_ledger_entry_id,s.reversal_ledger_entry_id)
 JOIN public.expense_transaction_lines l ON l.submission_id=s.id
 WHERE (l.transaction_id=(SELECT transaction_id FROM tenant_protected_case) AND e.id=s.reversal_ledger_entry_id)
 OR l.transaction_id=(SELECT corrected_id FROM tenant_protected_case)), -10::numeric,
 'ledger reversal and replacement details agree with later-period cash allocation delta');
SELECT is((SELECT sum(s.customer_total_amount) FROM public.expense_submissions s JOIN public.expense_transaction_lines l ON l.submission_id=s.id WHERE l.transaction_id=(SELECT corrected_id FROM tenant_protected_case))
 +(SELECT sum(a.amount) FROM public.expense_customer_adjustments a JOIN public.expense_transaction_lines l ON l.submission_id=a.submission_id WHERE l.transaction_id=(SELECT transaction_id FROM tenant_protected_case)),10::numeric,
 'tenant charge detail nets the same ten-dollar correction while retaining five-dollar markup');
-- Continuing rent needs its own invoice before the later owner month can close.
-- The fixture has no management fee or rent collection, so this does not add
-- an owner cash movement to the tenant-only expense correction below.
RESET ROLE;
SELECT app_private.generate_simple_lease_rent_invoice(org,lease_id,
 (month+interval '1 month')::date,(month+interval '1 month')::date,'manual_recovery',actor)
 FROM receipt_case;
SET LOCAL ROLE authenticated;
SELECT public.generate_owner_balance_period(org,property_id,owner_id,'USD',(month+interval '1 month')::date,'tenant-next-publication-period') FROM receipt_case;
SELECT public.set_financial_month_lock(org,(month+interval '1 month')::date,true,'Publish next synthetic tenant period') FROM receipt_case;
CREATE TEMP TABLE tenant_next_publication AS SELECT
 (public.close_owner_month(org,property_id,owner_id,'USD',(month+interval '1 month')::date,'Close corrected tenant period','tenant-next-publication-close')->>'revision_id')::uuid revision_id,
 NULL::uuid publication_id FROM receipt_case;
UPDATE tenant_next_publication n SET publication_id=(public.publish_owner_statement(org,n.revision_id,'tenant-next-publication-publish')->>'publication_id')::uuid FROM receipt_case;
SELECT results_eq($$SELECT component,signed_amount FROM public.owner_close_lines WHERE owner_close_revision_id=(SELECT revision_id FROM tenant_next_publication) AND line_kind='closing' ORDER BY component$$,
 $$SELECT component,signed_amount FROM public.owner_close_lines WHERE owner_close_revision_id=(SELECT revision_id FROM tenant_protected_case) AND line_kind='closing' ORDER BY component$$,
 'new owner statement carries prior closing components unchanged for tenant-responsible correction');
SELECT is((SELECT coalesce(sum(signed_amount),0) FROM public.owner_close_lines WHERE owner_close_revision_id=(SELECT revision_id FROM tenant_next_publication) AND line_kind='movement'),0::numeric,
 'tenant correction does not introduce an owner cash or charge movement');
SELECT ok(public.get_owner_statement_publication(org,n.publication_id) IS NOT NULL,'new corrected-period owner publication is readable') FROM receipt_case CROSS JOIN tenant_next_publication n;
SELECT is(public.get_owner_statement_publication(org,publication_id),publication,'publishing corrected later period leaves prior publication byte-for-byte unchanged') FROM receipt_case CROSS JOIN tenant_protected_case;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;



