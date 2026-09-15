-- Corrections append a reversal on the original date and a replacement payout.
-- Both commands, their cash reservations, and the audit log commit atomically.
CREATE FUNCTION public.correct_owner_distribution_date(
  p_organization_id uuid, p_withdrawal_id uuid, p_distribution_date date,
  p_reason text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_original public.property_withdrawals%ROWTYPE;
  v_payload jsonb;
  v_replay jsonb;
  v_claim record;
  v_result jsonb;
  v_reversal jsonb;
  v_replacement jsonb;
  v_queue jsonb;
  v_locked_queue jsonb;
  v_month date;
  v_owner uuid;
  v_cash_before numeric;
  v_end date;
  v_source record;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_reason text := pg_catalog.btrim(p_reason);
BEGIN
  SELECT * INTO v_original FROM public.property_withdrawals
    WHERE organization_id = p_organization_id AND id = p_withdrawal_id;
  IF v_actor IS NULL OR v_original.id IS NULL
    OR NOT app_private.can_access_property(p_organization_id, v_original.property_id, 'finance.correct_records')
    OR NOT app_private.can_access_property(p_organization_id, v_original.property_id, 'finance.record_payments') THEN
    RAISE EXCEPTION 'owner_distribution_correction_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_distribution_date IS NULL OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 120
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'owner_distribution_correction_inputs_invalid' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('withdrawalId', p_withdrawal_id,
    'newDate', p_distribution_date, 'reason', v_reason);
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'correct_owner_distribution_date', v_key, v_actor, v_payload);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_distribution_date = v_original.withdrawal_date THEN
    RAISE EXCEPTION 'owner_distribution_date_unchanged' USING ERRCODE = '22023';
  END IF;
  IF greatest(p_distribution_date, v_original.withdrawal_date) > app_private.rent_business_date(p_organization_id) THEN
    RAISE EXCEPTION 'owner_distribution_date_in_future' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.event_date,q.source_type,q.source_line_id),'[]')
    INTO v_queue FROM public.get_owner_event_allocation_queue(
      p_organization_id,v_original.property_id,v_original.currency,DATE '0001-01-01',DATE '9999-12-31') q;
  -- Follow the global financial-month -> owner-lifecycle -> source-row order.
  FOR v_month IN SELECT DISTINCT date_trunc('month', d)::date FROM (
    SELECT (q->>'event_date')::date d FROM jsonb_array_elements(v_queue) q
    UNION SELECT p_distribution_date UNION SELECT v_original.withdrawal_date
  ) dates ORDER BY 1 LOOP
    -- Match record_owner_distribution: all legacy month locks precede
    -- lifecycle locks. The branch-aware open-period checks follow below.
    PERFORM app_private.lock_property_financial_month(p_organization_id,v_original.property_id,v_original.currency,v_month);
  END LOOP;
  FOR v_owner IN SELECT person_id FROM (
    SELECT v_original.owner_person_id person_id
    UNION SELECT person_id FROM public.property_owners WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.owner_component_movements WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.owner_cash_events WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT owner_person_id FROM public.property_withdrawals WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT from_owner_person_id FROM public.owner_component_transfer_instructions WHERE organization_id=p_organization_id AND property_id=v_original.property_id
    UNION SELECT to_owner_person_id FROM public.owner_component_transfer_instructions WHERE organization_id=p_organization_id AND property_id=v_original.property_id
  ) owners WHERE person_id IS NOT NULL ORDER BY person_id LOOP
    PERFORM app_private.lock_owner_balance_lifecycle(p_organization_id,v_original.property_id,v_owner,v_original.currency);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.event_date,q.source_type,q.source_line_id),'[]')
    INTO v_locked_queue FROM public.get_owner_event_allocation_queue(
      p_organization_id,v_original.property_id,v_original.currency,DATE '0001-01-01',DATE '9999-12-31') q;
  IF v_locked_queue IS DISTINCT FROM v_queue THEN
    RAISE EXCEPTION 'owner_distribution_sources_changed' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO STRICT v_claim FROM app_private.claim_financial_idempotency(
    p_organization_id,'correct_owner_distribution_date',v_key,v_actor,v_payload);
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  SELECT * INTO STRICT v_original FROM public.property_withdrawals
    WHERE organization_id=p_organization_id AND id=p_withdrawal_id FOR UPDATE;
  IF v_original.reversal_of_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.property_withdrawals WHERE organization_id=p_organization_id AND reversal_of_id=p_withdrawal_id
  ) THEN RAISE EXCEPTION 'owner_distribution_already_reversed' USING ERRCODE='23514'; END IF;
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,v_original.property_id,v_original.currency,v_original.withdrawal_date);
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,v_original.property_id,v_original.currency,p_distribution_date);
  IF EXISTS (SELECT 1 FROM public.owner_balance_periods WHERE organization_id=p_organization_id
    AND property_id=v_original.property_id AND owner_person_id=v_original.owner_person_id
    AND currency=v_original.currency AND status='closed'
    AND month_start>=date_trunc('month',least(p_distribution_date,v_original.withdrawal_date))::date
  ) THEN RAISE EXCEPTION 'owner_distribution_owner_period_closed' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_private.validate_owner_roster_on_date(
    p_organization_id,v_original.property_id,p_distribution_date) WHERE owner_person_id=v_original.owner_person_id
  ) THEN RAISE EXCEPTION 'owner_distribution_owner_mismatch' USING ERRCODE='23514'; END IF;
  SELECT greatest(p_distribution_date,v_original.withdrawal_date,max((q->>'event_date')::date)) INTO v_end
    FROM jsonb_array_elements(v_queue) q WHERE CASE WHEN q->>'source_type' IN (
      'owner_distribution','owner_invoice_payment','reversal','owner_component_transfer'
    ) THEN app_private.owner_distribution_source_cash(p_organization_id,q->>'source_type',
      (q->>'source_line_id')::uuid,v_original.owner_person_id)<0 ELSE false END;
  -- Required non-cash originals can post after their historical cash payments.
  FOR v_source IN SELECT q.* FROM public.get_owner_event_allocation_queue(
    p_organization_id,v_original.property_id,v_original.currency,DATE '0001-01-01',DATE '9999-12-31') q
    WHERE q.allocation_state='pending' AND q.source_type IN ('management_fee_occurrence','owner_paid_cost')
    AND EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations c
      JOIN public.owner_invoice_lines l ON l.organization_id=c.organization_id AND l.id=c.owner_invoice_line_id
      JOIN public.owner_invoices i ON i.organization_id=l.organization_id AND i.id=l.invoice_id
      WHERE c.organization_id=p_organization_id AND c.property_id=v_original.property_id AND c.allocation_date<=v_end
        AND i.owner_person_id=v_original.owner_person_id AND l.source_id=q.source_line_id
        AND q.source_type=CASE l.source_type WHEN 'management_fee' THEN 'management_fee_occurrence' ELSE 'owner_paid_cost' END)
    ORDER BY q.event_date,q.source_type,q.source_line_id LOOP
    PERFORM public.allocate_owner_event(p_organization_id,v_source.source_type,v_source.source_line_id,
      'distribution-source:'||v_source.source_type||':'||v_source.source_line_id::text);
  END LOOP;
  PERFORM app_private.prepare_owner_distribution_sources(p_organization_id,v_original.property_id,v_original.currency,
    DATE '0001-01-01',v_end,v_original.owner_person_id);
  PERFORM app_private.assert_owner_distribution_sources_allocated(p_organization_id,v_original.property_id,v_original.currency,
    v_end,v_original.owner_person_id);
  SELECT coalesce(sum(signed_amount),0) INTO v_cash_before FROM public.owner_component_movements
    WHERE organization_id=p_organization_id AND property_id=v_original.property_id
      AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash';
  v_reversal := public.reverse_property_withdrawal(p_organization_id,p_withdrawal_id,
    v_original.withdrawal_date,v_reason,'date-reversal:'||v_claim.request_id::text);
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_original.property_id,'finance.record_payments');
  -- Existing later consumers retain their reservations. Only the original
  -- payout's released cash is reusable, and sources must predate the new date.
  -- This intentionally uses the checked baseline, not the blanket prohibition
  -- on inserting a new payout before any later consumer.
  v_replacement := app_private.record_owner_distribution_baseline(p_organization_id,
    v_original.property_id,v_original.owner_person_id,v_original.currency,v_original.amount,
    p_distribution_date,v_original.reference,'date-replacement:'||v_claim.request_id::text);
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false);
  IF (SELECT coalesce(sum(signed_amount),0) FROM public.owner_component_movements
    WHERE organization_id=p_organization_id AND property_id=v_original.property_id
      AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash'
  ) IS DISTINCT FROM v_cash_before THEN
    RAISE EXCEPTION 'owner_distribution_correction_cash_changed' USING ERRCODE='23514';
  END IF;
  IF EXISTS (WITH daily AS (
    SELECT effective_date d,signed_amount amount FROM public.owner_opening_balance_entries
      WHERE organization_id=p_organization_id AND property_id=v_original.property_id
        AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash'
    UNION ALL SELECT event_date,signed_amount FROM public.owner_component_movements
      WHERE organization_id=p_organization_id AND property_id=v_original.property_id
        AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash'
  ), totals AS (SELECT d,sum(amount) amount FROM daily GROUP BY d), running AS (
    SELECT d,sum(amount) OVER (ORDER BY d) balance FROM totals
  ) SELECT 1 FROM running WHERE d>=least(p_distribution_date,v_original.withdrawal_date) AND balance<0) THEN
    RAISE EXCEPTION 'owner_distribution_date_would_underfund_owner_cash' USING ERRCODE='23514';
  END IF;
  v_result := jsonb_build_object('withdrawalId',v_replacement->>'property_withdrawal_id',
    'reversalId',v_reversal->>'property_withdrawal_id','originalWithdrawalId',p_withdrawal_id,
    'oldDate',v_original.withdrawal_date,'newDate',p_distribution_date,'amount',v_original.amount);
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
    VALUES(p_organization_id,v_actor,'owner_distribution_date_correction',p_withdrawal_id,'corrected',
      v_result||jsonb_build_object('reason',v_reason));
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,v_actor,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.correct_owner_distribution_date(uuid,uuid,date,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.correct_owner_distribution_date(uuid,uuid,date,text,text) TO authenticated;

-- Preserve recorded signs, contributions and correction history in the account register.
CREATE OR REPLACE VIEW "public"."property_account_entries" WITH ("security_invoker"='true') AS
 WITH "events" AS (
         SELECT "allocation"."organization_id",
            "invoice"."property_id",
            "invoice"."unit_id",
            "invoice"."lease_id",
            "payment"."received_date" AS "event_date",
            'rent_income'::"text" AS "category",
                CASE
                    WHEN ("allocation"."reversal_of_allocation_id" IS NULL) THEN 'Rent'::"text"
                    ELSE 'Rent reversal'::"text"
                END AS "label",
                CASE
                    WHEN ("allocation"."reversal_of_allocation_id" IS NULL) THEN 'Collected by IPS'::"text"
                    ELSE 'IPS collection reversed'::"text"
                END AS "note",
            "allocation"."signed_amount" AS "amount",
            "allocation"."signed_amount" AS "balance_effect",
            'tenant_invoice_payment'::"text" AS "source_type",
            "allocation"."id" AS "source_id",
            "allocation"."created_at"
           FROM ((("public"."tenant_invoice_payment_allocations" "allocation"
             JOIN "public"."tenant_invoice_payments" "payment" ON ((("payment"."organization_id" = "allocation"."organization_id") AND ("payment"."id" = "allocation"."payment_id"))))
             JOIN "public"."tenant_invoice_lines" "line" ON ((("line"."organization_id" = "allocation"."organization_id") AND ("line"."id" = "allocation"."invoice_line_id"))))
             JOIN "public"."tenant_invoices" "invoice" ON ((("invoice"."organization_id" = "allocation"."organization_id") AND ("invoice"."id" = "allocation"."invoice_id"))))
          WHERE ("line"."line_type" = 'rent'::"text")
        UNION ALL
         SELECT "allocation"."organization_id",
            "invoice"."property_id",
            "invoice"."unit_id",
            "invoice"."lease_id",
            "confirmation"."confirmed_date",
            'rent_income'::"text" AS "text",
                CASE
                    WHEN ("allocation"."reversal_of_allocation_id" IS NULL) THEN 'Rent'::"text"
                    ELSE 'Rent reversal'::"text"
                END AS "text",
                CASE
                    WHEN ("allocation"."reversal_of_allocation_id" IS NULL) THEN 'Collected by owner'::"text"
                    ELSE 'Owner collection reversed'::"text"
                END AS "text",
            "allocation"."signed_amount",
            "allocation"."signed_amount",
            'owner_collection_confirmation'::"text" AS "text",
            "allocation"."id",
            "allocation"."created_at"
           FROM ((("public"."owner_collection_confirmation_allocations" "allocation"
             JOIN "public"."owner_collection_confirmations" "confirmation" ON ((("confirmation"."organization_id" = "allocation"."organization_id") AND ("confirmation"."id" = "allocation"."confirmation_id"))))
             JOIN "public"."tenant_invoice_lines" "line" ON ((("line"."organization_id" = "allocation"."organization_id") AND ("line"."id" = "allocation"."invoice_line_id"))))
             JOIN "public"."tenant_invoices" "invoice" ON ((("invoice"."organization_id" = "allocation"."organization_id") AND ("invoice"."id" = "allocation"."invoice_id"))))
          WHERE (("line"."line_type" = 'rent'::"text") AND ("allocation"."settlement_contract_version" = 'owner_collection.v1'::"text"))
        UNION ALL
         SELECT "fee"."organization_id",
            "fee"."property_id",
            "invoice"."unit_id",
            "fee"."lease_id",
            "fee"."fee_date",
            'management_fee_expense'::"text" AS "text",
            'Management fee'::"text" AS "text",
            NULL::"text" AS "text",
            "fee"."amount",
            (- "fee"."amount"),
            'management_fee_occurrence'::"text" AS "text",
            "fee"."id",
            "fee"."created_at"
           FROM ("public"."management_fee_occurrences" "fee"
             JOIN "public"."tenant_invoices" "invoice" ON ((("invoice"."organization_id" = "fee"."organization_id") AND ("invoice"."id" = "fee"."tenant_invoice_id"))))
        UNION ALL
         SELECT "responsibility"."organization_id",
            "responsibility"."property_id",
            "expense"."unit_id",
            NULL::"uuid" AS "uuid",
            "expense"."invoice_date",
            'owner_expense'::"text" AS "text",
            "responsibility"."customer_label",
            "expense"."vendor_label",
            "responsibility"."customer_total_amount",
            (- "responsibility"."customer_total_amount"),
            'ips_expense_responsibility'::"text" AS "text",
            "responsibility"."id",
            "responsibility"."created_at"
           FROM ("public"."ips_expense_responsibilities" "responsibility"
             JOIN "public"."finance_expense_items" "expense" ON ((("expense"."organization_id" = "responsibility"."organization_id") AND ("expense"."id" = "responsibility"."finance_expense_item_id"))))
          WHERE ("responsibility"."responsibility" = 'owner'::"text")
        UNION ALL
         SELECT "adjustment"."organization_id",
            "adjustment"."property_id",
            "expense"."unit_id",
            NULL::"uuid" AS "uuid",
            "adjustment"."adjustment_date",
            'owner_expense_reversal'::"text" AS "text",
            'Expense reversal'::"text" AS "text",
            "adjustment"."reason",
            "adjustment"."amount",
            (- "adjustment"."amount"),
            'expense_customer_adjustment'::"text" AS "text",
            "adjustment"."id",
            "adjustment"."created_at"
           FROM (("public"."expense_customer_adjustments" "adjustment"
             JOIN "public"."expense_submissions" "submission" ON ((("submission"."organization_id" = "adjustment"."organization_id") AND ("submission"."id" = "adjustment"."submission_id"))))
             JOIN "public"."finance_expense_items" "expense" ON ((("expense"."organization_id" = "submission"."organization_id") AND ("expense"."id" = "submission"."approved_finance_expense_item_id"))))
          WHERE ("adjustment"."responsibility" = 'owner'::"text")
        UNION ALL
         SELECT "withdrawal"."organization_id",
            "withdrawal"."property_id",
            NULL::"uuid" AS "uuid",
            NULL::"uuid" AS "uuid",
            "withdrawal"."withdrawal_date",
            'withdrawal'::"text" AS "text",
            CASE WHEN withdrawal.reversal_of_id IS NULL THEN 'Owner distribution' ELSE 'Distribution reversal' END AS text,
            "withdrawal"."reference",
            (CASE WHEN withdrawal.reversal_of_id IS NULL THEN withdrawal.amount ELSE -withdrawal.amount END)::numeric(14,2),
            CASE WHEN withdrawal.reversal_of_id IS NULL THEN -withdrawal.amount ELSE withdrawal.amount END,
            CASE WHEN withdrawal.reversal_of_id IS NULL THEN 'property_withdrawal' ELSE 'property_withdrawal_reversal' END AS text,
            "withdrawal"."id",
            "withdrawal"."created_at"
           FROM "public"."property_withdrawals" "withdrawal"
        UNION ALL
         SELECT cash.organization_id, cash.property_id, NULL::uuid, NULL::uuid,
            cash.event_date, 'owner_contribution'::text, 'Owner contribution'::text,
            cash.reason, cash.amount, cash.amount, 'owner_contribution'::text,
            cash.id, cash.created_at
           FROM public.owner_cash_events cash WHERE cash.event_type = 'owner_contribution'
        )
 SELECT "organization_id",
    "property_id",
    "unit_id",
    "lease_id",
    "event_date",
    "category",
    "label",
    "note",
    "amount",
    "balance_effect",
    ("sum"("balance_effect") OVER (PARTITION BY "organization_id", "property_id" ORDER BY "event_date", "created_at", "source_type", "source_id" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::numeric(14,2) AS "running_balance",
    "source_type",
    "source_id",
    "created_at"
   FROM "events";

CREATE OR REPLACE VIEW "public"."property_finance_positions" WITH ("security_invoker"='true') AS
 WITH "current_owner" AS (
         SELECT "owner_link"."organization_id",
            "owner_link"."property_id",
            "owner_link"."person_id" AS "owner_person_id"
           FROM "public"."property_owners" "owner_link"
          WHERE ("owner_link"."is_primary" AND ("owner_link"."archived_at" IS NULL) AND (("owner_link"."started_on" IS NULL) OR ("owner_link"."started_on" <= CURRENT_DATE)) AND (("owner_link"."ended_on" IS NULL) OR ("owner_link"."ended_on" >= CURRENT_DATE)))
        ), "rent_income" AS (
         SELECT "entry"."organization_id",
            "entry"."property_id",
            ("sum"("entry"."amount"))::numeric(14,2) AS "amount"
           FROM "public"."property_account_entries" "entry"
          WHERE ("entry"."category" = 'rent_income'::"text")
          GROUP BY "entry"."organization_id", "entry"."property_id"
        ), "fee_expense" AS (
         SELECT "fee"."organization_id",
            "fee"."property_id",
            ("sum"("fee"."amount"))::numeric(14,2) AS "amount"
           FROM "public"."management_fee_occurrences" "fee"
          GROUP BY "fee"."organization_id", "fee"."property_id"
        ), "owner_expense" AS (
         SELECT "effect"."organization_id",
            "effect"."property_id",
            ("sum"("effect"."amount"))::numeric(14,2) AS "amount"
           FROM ( SELECT "responsibility"."organization_id",
                    "responsibility"."property_id",
                    "responsibility"."customer_total_amount" AS "amount"
                   FROM "public"."ips_expense_responsibilities" "responsibility"
                  WHERE ("responsibility"."responsibility" = 'owner'::"text")
                UNION ALL
                 SELECT "adjustment"."organization_id",
                    "adjustment"."property_id",
                    "adjustment"."amount"
                   FROM "public"."expense_customer_adjustments" "adjustment"
                  WHERE ("adjustment"."responsibility" = 'owner'::"text")) "effect"
          GROUP BY "effect"."organization_id", "effect"."property_id"
        ), "withdrawal_total" AS (
         SELECT "withdrawal"."organization_id",
            "withdrawal"."property_id",
            (sum(CASE WHEN withdrawal.reversal_of_id IS NULL THEN withdrawal.amount ELSE -withdrawal.amount END))::numeric(14,2) AS "amount"
           FROM "public"."property_withdrawals" "withdrawal"
          GROUP BY "withdrawal"."organization_id", "withdrawal"."property_id"
        ), "ips_rent_cash" AS (
         SELECT "invoice"."organization_id",
            "invoice"."property_id",
            ("sum"("allocation"."amount"))::numeric(14,2) AS "amount"
           FROM ((("public"."tenant_invoice_payment_allocations" "allocation"
             JOIN "public"."tenant_invoice_lines" "line" ON ((("line"."organization_id" = "allocation"."organization_id") AND ("line"."id" = "allocation"."invoice_line_id"))))
             JOIN "public"."tenant_invoices" "invoice" ON ((("invoice"."organization_id" = "allocation"."organization_id") AND ("invoice"."id" = "allocation"."invoice_id"))))
             JOIN "public"."finance_receipts" "receipt" ON ((("receipt"."organization_id" = "allocation"."organization_id") AND ("receipt"."id" = "allocation"."finance_receipt_id"))))
          WHERE (("line"."line_type" = 'rent'::"text") AND ("receipt"."reversal_of_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."finance_receipts" "reversal"
                  WHERE (("reversal"."organization_id" = "receipt"."organization_id") AND ("reversal"."reversal_of_id" = "receipt"."id"))))))
          GROUP BY "invoice"."organization_id", "invoice"."property_id"
        ), "charge_cash" AS (
         SELECT "allocation"."organization_id",
            "allocation"."property_id",
            ("sum"("allocation"."amount"))::numeric(14,2) AS "amount"
           FROM "public"."owner_charge_cash_allocations" "allocation"
          GROUP BY "allocation"."organization_id", "allocation"."property_id"
        ), "owner_charge_total" AS (
         SELECT "charge"."organization_id",
            "charge"."property_id",
            ("sum"("charge"."amount"))::numeric(14,2) AS "amount"
           FROM ( SELECT "line"."organization_id",
                    "line"."property_id",
                    "line"."amount"
                   FROM "public"."owner_invoice_lines" "line"
                UNION ALL
                 SELECT "adjustment"."organization_id",
                    "adjustment"."property_id",
                    "adjustment"."amount"
                   FROM "public"."expense_customer_adjustments" "adjustment"
                  WHERE ("adjustment"."responsibility" = 'owner'::"text")) "charge"
          GROUP BY "charge"."organization_id", "charge"."property_id"
        ), "owner_paid" AS (
         SELECT "invoice"."organization_id",
            "invoice"."property_id",
            ("sum"("allocation"."amount"))::numeric(14,2) AS "amount"
           FROM ("public"."owner_payment_allocations" "allocation"
             JOIN "public"."owner_invoices" "invoice" ON ((("invoice"."organization_id" = "allocation"."organization_id") AND ("invoice"."id" = "allocation"."owner_invoice_id"))))
          GROUP BY "invoice"."organization_id", "invoice"."property_id"
        )
 SELECT "property"."organization_id",
    "property"."id" AS "property_id",
    "property"."code" AS "property_code",
    "property"."name" AS "property_name",
    "current_owner"."owner_person_id",
    'USD'::"public"."currency_code" AS "currency",
    (COALESCE("rent_income"."amount", (0)::numeric))::numeric(14,2) AS "rent_income",
    (COALESCE("fee_expense"."amount", (0)::numeric))::numeric(14,2) AS "management_fee_expense",
    (COALESCE("owner_expense"."amount", (0)::numeric))::numeric(14,2) AS "owner_expense",
    (COALESCE("withdrawal_total"."amount", (0)::numeric))::numeric(14,2) AS "withdrawals",
    ((((COALESCE("rent_income"."amount", (0)::numeric) - COALESCE("fee_expense"."amount", (0)::numeric)) - COALESCE("owner_expense"."amount", (0)::numeric)) + COALESCE((SELECT sum(c.amount) FROM public.owner_cash_events c WHERE c.organization_id=property.organization_id AND c.property_id=property.id AND c.event_type='owner_contribution'),0) - COALESCE("withdrawal_total"."amount", (0)::numeric)))::numeric(14,2) AS "running_balance",
    (GREATEST(((COALESCE("ips_rent_cash"."amount", (0)::numeric) - COALESCE("charge_cash"."amount", (0)::numeric)) + COALESCE((SELECT sum(c.amount) FROM public.owner_cash_events c WHERE c.organization_id=property.organization_id AND c.property_id=property.id AND c.event_type='owner_contribution'),0) - COALESCE("withdrawal_total"."amount", (0)::numeric)), (0)::numeric))::numeric(14,2) AS "cash_held_by_ips",
    (GREATEST(((COALESCE("owner_charge_total"."amount", (0)::numeric) - COALESCE("charge_cash"."amount", (0)::numeric)) - COALESCE("owner_paid"."amount", (0)::numeric)), (0)::numeric))::numeric(14,2) AS "owner_owes_ips",
    (GREATEST(((COALESCE("ips_rent_cash"."amount", (0)::numeric) - COALESCE("charge_cash"."amount", (0)::numeric)) + COALESCE((SELECT sum(c.amount) FROM public.owner_cash_events c WHERE c.organization_id=property.organization_id AND c.property_id=property.id AND c.event_type='owner_contribution'),0) - COALESCE("withdrawal_total"."amount", (0)::numeric)), (0)::numeric))::numeric(14,2) AS "available_withdrawal"
   FROM ((((((((("public"."properties" "property"
     LEFT JOIN "current_owner" ON ((("current_owner"."organization_id" = "property"."organization_id") AND ("current_owner"."property_id" = "property"."id"))))
     LEFT JOIN "rent_income" ON ((("rent_income"."organization_id" = "property"."organization_id") AND ("rent_income"."property_id" = "property"."id"))))
     LEFT JOIN "fee_expense" ON ((("fee_expense"."organization_id" = "property"."organization_id") AND ("fee_expense"."property_id" = "property"."id"))))
     LEFT JOIN "owner_expense" ON ((("owner_expense"."organization_id" = "property"."organization_id") AND ("owner_expense"."property_id" = "property"."id"))))
     LEFT JOIN "withdrawal_total" ON ((("withdrawal_total"."organization_id" = "property"."organization_id") AND ("withdrawal_total"."property_id" = "property"."id"))))
     LEFT JOIN "ips_rent_cash" ON ((("ips_rent_cash"."organization_id" = "property"."organization_id") AND ("ips_rent_cash"."property_id" = "property"."id"))))
     LEFT JOIN "charge_cash" ON ((("charge_cash"."organization_id" = "property"."organization_id") AND ("charge_cash"."property_id" = "property"."id"))))
     LEFT JOIN "owner_charge_total" ON ((("owner_charge_total"."organization_id" = "property"."organization_id") AND ("owner_charge_total"."property_id" = "property"."id"))))
     LEFT JOIN "owner_paid" ON ((("owner_paid"."organization_id" = "property"."organization_id") AND ("owner_paid"."property_id" = "property"."id"))))
  WHERE ("property"."archived_at" IS NULL);
