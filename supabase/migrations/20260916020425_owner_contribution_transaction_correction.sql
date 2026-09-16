-- Contribution corrections preserve immutable originals and reuse checked allocation reversals.
ALTER TABLE public.owner_cash_events
 ADD COLUMN reversal_of_id uuid,
 ADD COLUMN corrects_event_id uuid,
 ADD CONSTRAINT owner_cash_events_reversal_fk FOREIGN KEY (organization_id,reversal_of_id) REFERENCES public.owner_cash_events(organization_id,id),
 ADD CONSTRAINT owner_cash_events_correction_fk FOREIGN KEY (organization_id,corrects_event_id) REFERENCES public.owner_cash_events(organization_id,id),
 ADD CONSTRAINT owner_cash_events_reversal_unique UNIQUE (reversal_of_id),
 ADD CONSTRAINT owner_cash_events_correction_unique UNIQUE (corrects_event_id),
 DROP CONSTRAINT owner_cash_events_amount_check,
 ADD CONSTRAINT owner_cash_events_amount_check CHECK (
   amount = round(amount,2) AND amount::text NOT IN ('NaN','Infinity','-Infinity')
   AND ((reversal_of_id IS NULL AND amount>0) OR
        (reversal_of_id IS NOT NULL AND amount<0 AND event_type='owner_contribution' AND corrects_event_id IS NULL)));
CREATE FUNCTION app_private.guard_owner_cash_event_correction() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_original public.owner_cash_events%ROWTYPE;
BEGIN
 IF NEW.reversal_of_id IS NOT NULL OR NEW.corrects_event_id IS NOT NULL THEN
   SELECT * INTO v_original FROM public.owner_cash_events
   WHERE organization_id=NEW.organization_id AND id=coalesce(NEW.reversal_of_id,NEW.corrects_event_id) FOR KEY SHARE;
   IF v_original.id IS NULL OR v_original.reversal_of_id IS NOT NULL OR v_original.event_type<>'owner_contribution'
      OR ROW(NEW.property_id,NEW.owner_person_id,NEW.currency,NEW.event_type)
      IS DISTINCT FROM ROW(v_original.property_id,v_original.owner_person_id,v_original.currency,v_original.event_type)
      OR (NEW.reversal_of_id IS NOT NULL AND (NEW.amount<>-v_original.amount OR NEW.event_date<>v_original.event_date))
      OR (NEW.corrects_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.owner_cash_events
           WHERE organization_id=NEW.organization_id AND reversal_of_id=NEW.corrects_event_id)) THEN
     RAISE EXCEPTION 'owner_contribution_correction_lineage_invalid' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_owner_cash_event_correction() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_owner_cash_event_correction BEFORE INSERT ON public.owner_cash_events
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_cash_event_correction();
CREATE OR REPLACE FUNCTION app_private.resolve_owner_event_source(p_organization_id uuid, p_source_type text, p_source_line_id uuid)
 RETURNS TABLE(source_id uuid, property_id uuid, currency currency_code, event_date date, gross_signed_amount numeric, allocation_basis text, explicit_owner_person_id uuid, component owner_balance_component, activity_only boolean, source_fingerprint text, reversal_of_allocation_set_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_source_type text := pg_catalog.btrim(p_source_type);
  v_reversal record;
  v_reversal_count integer := 0;
BEGIN
  IF (v_source_type = 'owner_invoice_payment' AND EXISTS (
    SELECT 1 FROM public.owner_charge_cash_allocations AS cash
    WHERE cash.organization_id = p_organization_id
      AND cash.id = p_source_line_id
  )) OR (v_source_type = 'reversal' AND (
    EXISTS (
      SELECT 1 FROM public.owner_charge_cash_allocations AS cash
      WHERE cash.organization_id = p_organization_id
        AND cash.id = p_source_line_id
        AND cash.reversal_of_id IS NOT NULL
    ) OR EXISTS (
      SELECT 1 FROM public.expense_customer_adjustments AS adjustment
      WHERE adjustment.organization_id = p_organization_id
        AND adjustment.id = p_source_line_id
        AND adjustment.responsibility = 'owner'
    )
  )) THEN
    RETURN QUERY
    SELECT resolved.*
    FROM app_private.resolve_legacy_owner_cash_source(
      p_organization_id, v_source_type, p_source_line_id
    ) AS resolved;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app_private.owner_event_source_rule(v_source_type)
  ) THEN
    RAISE EXCEPTION 'source_unsupported' USING ERRCODE = '22023';
  END IF;

  IF v_source_type = 'tenant_rent_receipt' THEN
    RETURN QUERY
    SELECT
      allocation.payment_id,
      invoice.property_id,
      payment.currency,
      payment.received_date,
      allocation.signed_amount::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'ips_held_owner_cash'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', allocation.id::text,
          'payment_id', allocation.payment_id::text,
          'invoice_id', allocation.invoice_id::text,
          'invoice_line_id', allocation.invoice_line_id::text,
          'property_id', invoice.property_id::text,
          'currency', payment.currency::text,
          'event_date', payment.received_date::text,
          'signed_amount', pg_catalog.to_char(allocation.signed_amount, 'FM999999999990.00')
        )
      ),
      NULL::uuid
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_payments AS payment
      ON payment.organization_id = allocation.organization_id
      AND payment.id = allocation.payment_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = allocation.organization_id
      AND invoice.id = allocation.invoice_id
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id
      AND line.id = allocation.invoice_line_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.id = p_source_line_id
      AND allocation.reversal_of_allocation_id IS NULL
      AND allocation.signed_amount > 0
      AND line.line_type = 'rent';
  ELSIF v_source_type = 'owner_direct_rent_receipt' THEN
    RETURN QUERY
    SELECT
      allocation.confirmation_id,
      allocation.property_id,
      allocation.currency,
      allocation.confirmed_date,
      allocation.signed_amount::numeric(14,2),
      'explicit_owner'::text,
      allocation.owner_person_id_snapshot,
      NULL::public.owner_balance_component,
      true,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', allocation.id::text,
          'confirmation_id', allocation.confirmation_id::text,
          'invoice_line_id', allocation.invoice_line_id::text,
          'property_id', allocation.property_id::text,
          'owner_person_id', allocation.owner_person_id_snapshot::text,
          'currency', allocation.currency::text,
          'event_date', allocation.confirmed_date::text,
          'signed_amount', pg_catalog.to_char(allocation.signed_amount, 'FM999999999990.00'),
          'contract', allocation.settlement_contract_version
        )
      ),
      NULL::uuid
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.id = p_source_line_id
      AND allocation.reversal_of_allocation_id IS NULL
      AND allocation.signed_amount > 0
      AND allocation.settlement_contract_version = 'owner_collection.v1';
  ELSIF v_source_type = 'management_fee_occurrence' THEN
    RETURN QUERY
    SELECT
      fee.id,
      fee.property_id,
      fee.currency,
      fee.fee_date,
      fee.amount::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'owner_due_to_ips'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', fee.id::text,
          'tenant_invoice_id', fee.tenant_invoice_id::text,
          'property_id', fee.property_id::text,
          'currency', fee.currency::text,
          'event_date', fee.fee_date::text,
          'amount', pg_catalog.to_char(fee.amount, 'FM999999999990.00'),
          'fee_mode', fee.fee_mode,
          'fee_value', fee.fee_value::text
        )
      ),
      NULL::uuid
    FROM public.management_fee_occurrences AS fee
    WHERE fee.organization_id = p_organization_id
      AND fee.id = p_source_line_id;
  ELSIF v_source_type = 'owner_paid_cost' THEN
    RETURN QUERY
    SELECT
      responsibility.finance_expense_item_id,
      responsibility.property_id,
      expense.currency,
      expense.invoice_date,
      responsibility.customer_total_amount::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'owner_due_to_ips'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', responsibility.id::text,
          'finance_expense_item_id', responsibility.finance_expense_item_id::text,
          'property_id', responsibility.property_id::text,
          'currency', expense.currency::text,
          'event_date', expense.invoice_date::text,
          'amount', pg_catalog.to_char(responsibility.customer_total_amount, 'FM999999999990.00'),
          'responsibility', responsibility.responsibility,
          'responsible_person_id', responsibility.responsible_person_id::text
        )
      ),
      NULL::uuid
    FROM public.ips_expense_responsibilities AS responsibility
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = responsibility.organization_id
      AND expense.id = responsibility.finance_expense_item_id
    WHERE responsibility.organization_id = p_organization_id
      AND responsibility.id = p_source_line_id
      AND responsibility.responsibility = 'owner'
      AND expense.status IN ('approved', 'posted', 'paid')
      AND expense.archived_at IS NULL;
  ELSIF v_source_type = 'owner_invoice_payment' THEN
    RETURN QUERY
    SELECT
      allocation.owner_payment_id,
      payment.property_id,
      payment.currency,
      payment.received_date,
      (-allocation.amount)::numeric(14,2),
      'explicit_owner'::text,
      payment.owner_person_id,
      'owner_due_to_ips'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', allocation.id::text,
          'owner_payment_id', allocation.owner_payment_id::text,
          'owner_invoice_line_id', allocation.owner_invoice_line_id::text,
          'property_id', payment.property_id::text,
          'owner_person_id', payment.owner_person_id::text,
          'currency', payment.currency::text,
          'event_date', payment.received_date::text,
          'signed_amount', pg_catalog.to_char(-allocation.amount, 'FM999999999990.00')
        )
      ),
      NULL::uuid
    FROM public.owner_payment_allocations AS allocation
    JOIN public.owner_payments AS payment
      ON payment.organization_id = allocation.organization_id
      AND payment.id = allocation.owner_payment_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.id = p_source_line_id
      AND allocation.reversal_of_allocation_id IS NULL
      AND payment.reversal_of_id IS NULL;
  ELSIF v_source_type IN ('owner_contribution', 'owner_reimbursement') THEN
    RETURN QUERY
    SELECT
      event.id,
      event.property_id,
      event.currency,
      event.event_date,
      (CASE
        WHEN event.event_type = 'owner_contribution' THEN event.amount
        ELSE -event.amount
      END)::numeric(14,2),
      'explicit_owner'::text,
      event.owner_person_id,
      (CASE
        WHEN event.event_type = 'owner_contribution'
          THEN 'ips_held_owner_cash'::public.owner_balance_component
        ELSE 'ips_due_to_owner'::public.owner_balance_component
      END),
      false,
      event.payload_hash,
      NULL::uuid
    FROM public.owner_cash_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.id = p_source_line_id
      AND event.event_type = v_source_type AND event.reversal_of_id IS NULL;
  ELSIF v_source_type = 'owner_distribution' THEN
    RETURN QUERY
    SELECT
      withdrawal.id,
      withdrawal.property_id,
      withdrawal.currency,
      withdrawal.withdrawal_date,
      (-withdrawal.amount)::numeric(14,2),
      'explicit_owner'::text,
      withdrawal.owner_person_id,
      'ips_held_owner_cash'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', withdrawal.id::text,
          'property_id', withdrawal.property_id::text,
          'owner_person_id', withdrawal.owner_person_id::text,
          'currency', withdrawal.currency::text,
          'event_date', withdrawal.withdrawal_date::text,
          'signed_amount', pg_catalog.to_char(-withdrawal.amount, 'FM999999999990.00'),
          'reference', withdrawal.reference
        )
      ),
      NULL::uuid
    FROM public.property_withdrawals AS withdrawal
    WHERE withdrawal.organization_id = p_organization_id
      AND withdrawal.id = p_source_line_id
      AND withdrawal.reversal_of_id IS NULL;
  ELSIF v_source_type IN ('security_deposit_receipt', 'security_deposit_refund') THEN
    RETURN QUERY
    SELECT
      event.lease_deposit_id,
      event.property_id,
      event.currency,
      event.event_date,
      (CASE WHEN event.event_type = 'received' THEN event.amount ELSE -event.amount END)::numeric(14,2),
      'effective_roster'::text,
      NULL::uuid,
      'security_deposit_custody'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', event.id::text,
          'lease_deposit_id', event.lease_deposit_id::text,
          'property_id', event.property_id::text,
          'currency', event.currency::text,
          'event_date', event.event_date::text,
          'event_type', event.event_type,
          'amount', pg_catalog.to_char(event.amount, 'FM999999999990.00')
        )
      ),
      NULL::uuid
    FROM public.lease_deposit_events AS event
    WHERE event.organization_id = p_organization_id
      AND event.id = p_source_line_id
      AND event.reversal_of_id IS NULL
      AND (
        (v_source_type = 'security_deposit_receipt' AND event.event_type = 'received')
        OR
        (v_source_type = 'security_deposit_refund' AND event.event_type = 'refunded')
      );
  ELSIF v_source_type = 'owner_component_transfer' THEN
    RETURN QUERY
    SELECT
      line.transfer_instruction_id,
      instruction.property_id,
      instruction.currency,
      instruction.effective_date,
      line.signed_amount::numeric(14,2),
      'explicit_owner'::text,
      line.owner_person_id,
      instruction.component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', v_source_type,
          'source_line_id', line.id::text,
          'instruction_id', instruction.id::text,
          'property_id', instruction.property_id::text,
          'owner_person_id', line.owner_person_id::text,
          'currency', instruction.currency::text,
          'event_date', instruction.effective_date::text,
          'component', instruction.component::text,
          'signed_amount', pg_catalog.to_char(line.signed_amount, 'FM999999999990.00'),
          'evidence_sha256', instruction.evidence_sha256
        )
      ),
      NULL::uuid
    FROM public.owner_component_transfer_lines AS line
    JOIN public.owner_component_transfer_instructions AS instruction
      ON instruction.organization_id = line.organization_id
      AND instruction.id = line.transfer_instruction_id
    WHERE line.organization_id = p_organization_id
      AND line.id = p_source_line_id;
  ELSIF v_source_type = 'reversal' THEN
    FOR v_reversal IN
      SELECT candidate.*
      FROM (
        SELECT
          reversal.payment_id AS source_id,
          original_set.property_id,
          payment.currency,
          payment.received_date AS event_date,
          (-original_set.gross_signed_amount)::numeric(14,2) AS gross_signed_amount,
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id AS reversal_line_id,
          original_set.id AS reversal_of_allocation_set_id,
          original_set.source_fingerprint
        FROM public.tenant_invoice_payment_allocations AS reversal
        JOIN public.tenant_invoice_payments AS payment
          ON payment.organization_id = reversal.organization_id
          AND payment.id = reversal.payment_id
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'tenant_rent_receipt'
          AND original_set.source_line_id = reversal.reversal_of_allocation_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_allocation_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.confirmation_id,
          original_set.property_id,
          reversal.currency,
          reversal.confirmed_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.owner_collection_confirmation_allocations AS reversal
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'owner_direct_rent_receipt'
          AND original_set.source_line_id = reversal.reversal_of_allocation_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_allocation_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.lease_deposit_id,
          original_set.property_id,
          reversal.currency,
          reversal.event_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.lease_deposit_events AS reversal
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type IN ('security_deposit_receipt', 'security_deposit_refund')
          AND original_set.source_line_id = reversal.reversal_of_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.owner_payment_id,
          original_set.property_id,
          payment.currency,
          payment.received_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.owner_payment_allocations AS reversal
        JOIN public.owner_payments AS payment
          ON payment.organization_id = reversal.organization_id
          AND payment.id = reversal.owner_payment_id
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'owner_invoice_payment'
          AND original_set.source_line_id = reversal.reversal_of_allocation_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_allocation_id IS NOT NULL

        UNION ALL

        SELECT
          reversal.id,
          original_set.property_id,
          reversal.currency,
          reversal.withdrawal_date,
          (-original_set.gross_signed_amount)::numeric(14,2),
          original_set.allocation_basis,
          original_set.explicit_owner_person_id,
          reversal.id,
          original_set.id,
          original_set.source_fingerprint
        FROM public.property_withdrawals AS reversal
        JOIN public.owner_event_allocation_sets AS original_set
          ON original_set.organization_id = reversal.organization_id
          AND original_set.source_type = 'owner_distribution'
          AND original_set.source_line_id = reversal.reversal_of_id
        WHERE reversal.organization_id = p_organization_id
          AND reversal.id = p_source_line_id
          AND reversal.reversal_of_id IS NOT NULL
        UNION ALL
        SELECT reversal.id,original_set.property_id,reversal.currency,reversal.event_date,
          (-original_set.gross_signed_amount)::numeric(14,2),original_set.allocation_basis,
          original_set.explicit_owner_person_id,reversal.id,original_set.id,original_set.source_fingerprint
        FROM public.owner_cash_events reversal
        JOIN public.owner_event_allocation_sets original_set ON original_set.organization_id=reversal.organization_id
          AND original_set.source_type='owner_contribution' AND original_set.source_line_id=reversal.reversal_of_id
        WHERE reversal.organization_id=p_organization_id AND reversal.id=p_source_line_id AND reversal.reversal_of_id IS NOT NULL
      ) AS candidate
    LOOP
      v_reversal_count := v_reversal_count + 1;
      IF v_reversal_count > 1 THEN
        RAISE EXCEPTION 'ambiguous_event_ownership' USING ERRCODE = '23514';
      END IF;

      source_id := v_reversal.source_id;
      property_id := v_reversal.property_id;
      currency := v_reversal.currency;
      event_date := v_reversal.event_date;
      gross_signed_amount := v_reversal.gross_signed_amount;
      allocation_basis := v_reversal.allocation_basis;
      explicit_owner_person_id := v_reversal.explicit_owner_person_id;
      component := NULL;
      activity_only := false;
      source_fingerprint := app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', 'reversal',
          'source_line_id', p_source_line_id::text,
          'source_id', v_reversal.source_id::text,
          'event_date', v_reversal.event_date::text,
          'gross_signed_amount', pg_catalog.to_char(v_reversal.gross_signed_amount, 'FM999999999990.00'),
          'reversal_of_allocation_set_id', v_reversal.reversal_of_allocation_set_id::text,
          'original_source_fingerprint', v_reversal.source_fingerprint
        )
      );
      reversal_of_allocation_set_id := v_reversal.reversal_of_allocation_set_id;
      RETURN NEXT;
    END LOOP;

    IF v_reversal_count = 0 THEN
      RAISE EXCEPTION 'source_not_found' USING ERRCODE = '23503';
    END IF;
    RETURN;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = '23503';
  END IF;
END;
$function$

;
CREATE OR REPLACE FUNCTION app_private.get_owner_event_allocation_queue_baseline(p_organization_id uuid, p_property_id uuid, p_currency currency_code, p_period_start date, p_period_end date)
 RETURNS TABLE(source_type text, source_id uuid, source_line_id uuid, event_date date, gross_signed_amount text, allocation_state text, remediation_code text, remediation_detail jsonb, allocation_set_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance_property(
      p_organization_id,p_property_id
    ) THEN
    RAISE EXCEPTION 'owner_event_queue_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'owner_event_queue_period_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH missing_deposit_originals AS MATERIALIZED (
    -- Discovery only: legacy reversals cannot be allocated before their original.
    -- Do not weaken the shared strict resolver or synthesize financial movements.
    SELECT reversal.id, reversal.lease_deposit_id, reversal.event_date,
      original.id AS original_source_line_id, original.event_date AS original_event_date,
      CASE WHEN original.event_type = 'received' THEN 'security_deposit_receipt'
        ELSE 'security_deposit_refund' END AS original_source_type,
      CASE WHEN original.event_type = 'received' THEN -original.amount
        ELSE original.amount END AS gross_signed_amount,
      deposit.lease_id
    FROM public.lease_deposit_events AS reversal
    JOIN public.lease_deposit_events AS original
      ON original.organization_id = reversal.organization_id
      AND original.id = reversal.reversal_of_id
      AND original.lease_deposit_id = reversal.lease_deposit_id
      AND original.property_id = reversal.property_id
      AND original.currency = reversal.currency
      AND original.amount = reversal.amount
      AND original.reversal_of_id IS NULL
      AND original.event_type IN ('received', 'refunded')
    JOIN public.lease_deposits AS deposit
      ON deposit.organization_id = reversal.organization_id
      AND deposit.id = reversal.lease_deposit_id
    JOIN public.leases AS lease
      ON lease.organization_id = deposit.organization_id
      AND lease.id = deposit.lease_id
      AND lease.property_id = reversal.property_id
    WHERE reversal.organization_id = p_organization_id
      AND reversal.property_id = p_property_id
      AND reversal.currency = p_currency
      AND reversal.event_date BETWEEN p_period_start AND p_period_end
      AND reversal.event_type = 'reversed'
      AND original.amount > 0
      AND original.amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_event_allocation_sets AS original_set
        WHERE original_set.organization_id = reversal.organization_id
          AND original_set.source_line_id = original.id
          AND original_set.source_type IN ('security_deposit_receipt', 'security_deposit_refund')
      )
      -- A colliding source identity must still take the strict resolver path.
      AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_payment_allocations AS other
        WHERE other.organization_id = reversal.organization_id AND other.id = reversal.id)
      AND NOT EXISTS (SELECT 1 FROM public.owner_collection_confirmation_allocations AS other
        WHERE other.organization_id = reversal.organization_id AND other.id = reversal.id)
      AND NOT EXISTS (SELECT 1 FROM public.owner_payment_allocations AS other
        WHERE other.organization_id = reversal.organization_id AND other.id = reversal.id)
      AND NOT EXISTS (SELECT 1 FROM public.property_withdrawals AS other
        WHERE other.organization_id = reversal.organization_id AND other.id = reversal.id)
      AND NOT EXISTS (SELECT 1 FROM public.owner_charge_cash_allocations AS other
        WHERE other.organization_id = reversal.organization_id AND other.id = reversal.id)
      AND NOT EXISTS (SELECT 1 FROM public.expense_customer_adjustments AS other
        WHERE other.organization_id = reversal.organization_id AND other.id = reversal.id)
  ), candidate_ids AS MATERIALIZED (
    -- Scope each canonical source BEFORE invoking the strict resolver. Reversal
    -- property authority remains the original allocation snapshot when present.
    SELECT
      CASE WHEN allocation.reversal_of_allocation_id IS NULL
        THEN 'tenant_rent_receipt' ELSE 'reversal' END AS source_type,
      allocation.id AS source_line_id
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id AND line.id = allocation.invoice_line_id
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = allocation.organization_id AND invoice.id = allocation.invoice_id
    JOIN public.tenant_invoice_payments AS payment
      ON payment.organization_id = allocation.organization_id AND payment.id = allocation.payment_id
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = allocation.organization_id
      AND original_set.source_type = 'tenant_rent_receipt'
      AND original_set.source_line_id = allocation.reversal_of_allocation_id
    WHERE allocation.organization_id = p_organization_id AND line.line_type = 'rent'
      AND coalesce(original_set.property_id, invoice.property_id) = p_property_id
      AND payment.currency = p_currency
      AND payment.received_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT CASE WHEN allocation.reversal_of_allocation_id IS NULL
        THEN 'owner_direct_rent_receipt' ELSE 'reversal' END, allocation.id
    FROM public.owner_collection_confirmation_allocations AS allocation
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = allocation.organization_id
      AND original_set.source_type = 'owner_direct_rent_receipt'
      AND original_set.source_line_id = allocation.reversal_of_allocation_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.settlement_contract_version = 'owner_collection.v1'
      AND coalesce(original_set.property_id, allocation.property_id) = p_property_id
      AND allocation.currency = p_currency
      AND allocation.confirmed_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT 'management_fee_occurrence', fee.id
    FROM public.management_fee_occurrences AS fee
    WHERE fee.organization_id = p_organization_id AND fee.property_id = p_property_id
      AND fee.currency = p_currency AND fee.fee_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT 'owner_paid_cost', responsibility.id
    FROM public.ips_expense_responsibilities AS responsibility
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = responsibility.organization_id
      AND expense.id = responsibility.finance_expense_item_id
    WHERE responsibility.organization_id = p_organization_id
      AND responsibility.responsibility = 'owner'
      AND expense.status IN ('approved', 'posted', 'paid') AND expense.archived_at IS NULL
      AND responsibility.property_id = p_property_id AND expense.currency = p_currency
      AND expense.invoice_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT CASE WHEN allocation.reversal_of_allocation_id IS NULL
        THEN 'owner_invoice_payment' ELSE 'reversal' END, allocation.id
    FROM public.owner_payment_allocations AS allocation
    JOIN public.owner_payments AS payment
      ON payment.organization_id = allocation.organization_id AND payment.id = allocation.owner_payment_id
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = allocation.organization_id
      AND original_set.source_type = 'owner_invoice_payment'
      AND original_set.source_line_id = allocation.reversal_of_allocation_id
    WHERE allocation.organization_id = p_organization_id
      AND coalesce(original_set.property_id, payment.property_id) = p_property_id
      AND payment.currency = p_currency
      AND payment.received_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT CASE WHEN event.reversal_of_id IS NULL THEN event.event_type ELSE 'reversal' END, event.id
    FROM public.owner_cash_events AS event
    WHERE event.organization_id = p_organization_id AND event.property_id = p_property_id
      AND event.currency = p_currency AND event.event_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT CASE WHEN withdrawal.reversal_of_id IS NULL
        THEN 'owner_distribution' ELSE 'reversal' END, withdrawal.id
    FROM public.property_withdrawals AS withdrawal
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = withdrawal.organization_id
      AND original_set.source_type = 'owner_distribution'
      AND original_set.source_line_id = withdrawal.reversal_of_id
    WHERE withdrawal.organization_id = p_organization_id
      AND coalesce(original_set.property_id, withdrawal.property_id) = p_property_id
      AND withdrawal.currency = p_currency
      AND withdrawal.withdrawal_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT CASE WHEN event.reversal_of_id IS NOT NULL THEN 'reversal'
        WHEN event.event_type = 'received' THEN 'security_deposit_receipt'
        ELSE 'security_deposit_refund' END, event.id
    FROM public.lease_deposit_events AS event
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = event.organization_id
      AND original_set.source_type IN ('security_deposit_receipt', 'security_deposit_refund')
      AND original_set.source_line_id = event.reversal_of_id
    WHERE event.organization_id = p_organization_id
      AND (event.reversal_of_id IS NOT NULL OR event.event_type IN ('received', 'refunded'))
      AND coalesce(original_set.property_id, event.property_id) = p_property_id
      AND event.currency = p_currency AND event.event_date BETWEEN p_period_start AND p_period_end

    UNION ALL
    SELECT 'owner_component_transfer', line.id
    FROM public.owner_component_transfer_lines AS line
    JOIN public.owner_component_transfer_instructions AS instruction
      ON instruction.organization_id = line.organization_id AND instruction.id = line.transfer_instruction_id
    WHERE line.organization_id = p_organization_id AND instruction.property_id = p_property_id
      AND instruction.currency = p_currency
      AND instruction.effective_date BETWEEN p_period_start AND p_period_end
  ), strict_candidate_ids AS MATERIALIZED (
    SELECT candidate_ids.* FROM candidate_ids
    WHERE NOT EXISTS (
      SELECT 1 FROM missing_deposit_originals AS blocked
      WHERE candidate_ids.source_type = 'reversal' AND blocked.id = candidate_ids.source_line_id
    )
  ), candidates AS MATERIALIZED (
    SELECT strict_ids.source_type, strict_ids.source_line_id, resolved.*
    FROM strict_candidate_ids AS strict_ids
    CROSS JOIN LATERAL app_private.resolve_owner_event_source(
      p_organization_id, strict_ids.source_type, strict_ids.source_line_id
    ) AS resolved
  ), assessed AS (
    SELECT
      candidates.*,
      allocation_set.id AS existing_allocation_set_id,
      allocation_set.source_fingerprint AS existing_source_fingerprint,
      roster.active_count,
      roster.share_total,
      roster.inactive_count,
      roster.explicit_owner_match_count
    FROM candidates
    LEFT JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = p_organization_id
      AND allocation_set.source_type = candidates.source_type
      AND allocation_set.source_line_id = candidates.source_line_id
    CROSS JOIN LATERAL (
      SELECT
        count(*)::integer AS active_count,
        coalesce(sum(property_owner.ownership_percent), 0)::numeric(9,3) AS share_total,
        count(*) FILTER (
          WHERE person.archived_at IS NOT NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public.person_roles AS role
              WHERE role.organization_id = property_owner.organization_id
                AND role.person_id = property_owner.person_id
                AND role.role = 'owner'
                AND role.status = 'active'
                AND role.archived_at IS NULL
            )
        )::integer AS inactive_count,
        count(*) FILTER (
          WHERE property_owner.person_id = candidates.explicit_owner_person_id
        )::integer AS explicit_owner_match_count
      FROM public.property_owners AS property_owner
      JOIN public.people AS person
        ON person.organization_id = property_owner.organization_id
        AND person.id = property_owner.person_id
      WHERE property_owner.organization_id = p_organization_id
        AND property_owner.property_id = candidates.property_id
        AND property_owner.archived_at IS NULL
        AND property_owner.started_on <= candidates.event_date
        AND (
          property_owner.ended_on IS NULL
          OR candidates.event_date < property_owner.ended_on
        )
    ) AS roster
    WHERE candidates.property_id = p_property_id
      AND candidates.currency = p_currency
      AND candidates.event_date BETWEEN p_period_start AND p_period_end
  )
  SELECT
    assessed.source_type,
    assessed.source_id,
    assessed.source_line_id,
    assessed.event_date,
    pg_catalog.to_char(assessed.gross_signed_amount, 'FM999999999990.00'),
    CASE
      WHEN assessed.existing_allocation_set_id IS NOT NULL
        AND assessed.existing_source_fingerprint = assessed.source_fingerprint
        THEN 'allocated'
      WHEN assessed.existing_allocation_set_id IS NOT NULL THEN 'blocked'
      WHEN assessed.active_count = 0 THEN 'blocked'
      WHEN assessed.share_total <> 100.000 THEN 'blocked'
      WHEN assessed.inactive_count > 0 THEN 'blocked'
      WHEN assessed.allocation_basis = 'explicit_owner'
        AND assessed.explicit_owner_match_count <> 1 THEN 'blocked'
      ELSE 'pending'
    END,
    CASE
      WHEN assessed.existing_allocation_set_id IS NOT NULL
        AND assessed.existing_source_fingerprint <> assessed.source_fingerprint
        THEN 'source_fingerprint_drift'
      WHEN assessed.active_count = 0 THEN 'owner_roster_missing'
      WHEN assessed.share_total <> 100.000 THEN 'owner_share_total_not_100'
      WHEN assessed.inactive_count > 0 THEN 'owner_person_inactive'
      WHEN assessed.allocation_basis = 'explicit_owner'
        AND assessed.explicit_owner_match_count <> 1
        THEN 'ambiguous_event_ownership'
      ELSE NULL
    END,
    CASE
      WHEN assessed.existing_allocation_set_id IS NOT NULL
        AND assessed.existing_source_fingerprint <> assessed.source_fingerprint
        THEN pg_catalog.jsonb_build_object(
          'persisted_fingerprint', assessed.existing_source_fingerprint,
          'current_fingerprint', assessed.source_fingerprint
        )
      WHEN assessed.active_count = 0
        OR assessed.share_total <> 100.000
        OR assessed.inactive_count > 0
        OR (
          assessed.allocation_basis = 'explicit_owner'
          AND assessed.explicit_owner_match_count <> 1
        )
        THEN pg_catalog.jsonb_build_object(
          'active_owner_count', assessed.active_count,
          'ownership_percent_total', pg_catalog.to_char(assessed.share_total, 'FM990.000'),
          'inactive_owner_count', assessed.inactive_count,
          'explicit_owner_match_count', assessed.explicit_owner_match_count
        )
      ELSE NULL
    END,
    assessed.existing_allocation_set_id
  FROM assessed
  UNION ALL
  SELECT 'reversal'::text, blocked.lease_deposit_id, blocked.id, blocked.event_date,
    pg_catalog.to_char(blocked.gross_signed_amount, 'FM999999999990.00'),
    'blocked'::text, 'original_deposit_allocation_required'::text,
    pg_catalog.jsonb_build_object(
      'original_source_type', blocked.original_source_type,
      'original_source_line_id', blocked.original_source_line_id,
      'original_event_date', blocked.original_event_date,
      'lease_id', blocked.lease_id,
      'lease_deposit_id', blocked.lease_deposit_id
    ),
    NULL::uuid
  FROM missing_deposit_originals AS blocked
  ORDER BY 4, 1, 3;
END;
$function$

;
CREATE OR REPLACE FUNCTION app_private.record_corrected_owner_contribution(p_organization_id uuid, p_property_id uuid, p_owner_person_id uuid, p_currency currency_code, p_event_type text, p_event_date date, p_amount numeric, p_reason text, p_idempotency_key text, p_reference text, p_corrects_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_event_type text := pg_catalog.btrim(p_event_type);
  v_reason text := pg_catalog.btrim(p_reason);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_claim record;
  v_existing public.owner_cash_events%ROWTYPE;
  v_owner record;
  v_event_id uuid;
  v_allocation_set_id uuid;
  v_owner_allocation_id uuid;
  v_movement_id uuid;
  v_component public.owner_balance_component;
  v_signed_amount numeric(14,2);
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_access_property(
      p_organization_id,p_property_id,'finance.record_payments'
    ) THEN
    RAISE EXCEPTION 'owner_cash_event_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_event_type NOT IN ('owner_contribution', 'owner_reimbursement') THEN
    RAISE EXCEPTION 'owner_cash_event_type_unsupported' USING ERRCODE = '22023';
  END IF;
  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'owner_cash_event_date_required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
    OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'owner_cash_event_amount_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'owner_cash_event_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_cash_event_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'event_type', v_event_type,
    'event_date', p_event_date::text,
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
    'reason', v_reason, 'reference', p_reference, 'corrects_event_id', p_corrects_event_id
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'record_corrected_owner_contribution',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  PERFORM app_private.lock_owner_balance_mutation(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_event_date
  );

  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,p_property_id,p_currency,p_event_date
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_balance_source_v1',
        p_organization_id::text,
        p_property_id::text,
        p_owner_person_id::text,
        p_currency::text,
        p_event_date::text,
        v_event_type,
        v_idempotency_key
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'record_corrected_owner_contribution',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT event.*
  INTO v_existing
  FROM public.owner_cash_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT allocation_set.id
    INTO STRICT v_allocation_set_id
    FROM public.owner_event_allocation_sets AS allocation_set
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.source_type = v_event_type
      AND allocation_set.source_line_id = v_existing.id;
    v_result := pg_catalog.jsonb_build_object(
      'status', 'replayed',
      'owner_cash_event_id', v_existing.id::text,
      'allocation_set_id', v_allocation_set_id::text
    );
    PERFORM app_private.complete_financial_idempotency(
      v_claim.request_id,
      p_organization_id,
      v_actor_id,
      v_result
    );
    RETURN v_result;
  END IF;

  SELECT roster.*
  INTO v_owner
  FROM app_private.validate_owner_roster_on_date(
    p_organization_id,
    p_property_id,
    p_event_date
  ) AS roster
  WHERE roster.owner_person_id = p_owner_person_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'explicit_owner_not_in_effective_roster'
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context',
    'checked-owner-balance-v1',
    true
  );

  INSERT INTO public.owner_cash_events (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    event_type,
    event_date,
    amount,
    reason,
    reference,
    corrects_event_id,
    idempotency_key,
    payload_hash,
    created_by
  ) VALUES (
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    v_event_type,
    p_event_date,
    p_amount::numeric(14,2),
    v_reason,
    p_reference,
    p_corrects_event_id,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_event_id;

  v_signed_amount := CASE
    WHEN v_event_type = 'owner_contribution' THEN p_amount
    ELSE -p_amount
  END::numeric(14,2);
  v_component := CASE
    WHEN v_event_type = 'owner_contribution'
      THEN 'ips_held_owner_cash'::public.owner_balance_component
    ELSE 'ips_due_to_owner'::public.owner_balance_component
  END;

  INSERT INTO public.owner_event_allocation_sets (
    organization_id,
    property_id,
    currency,
    event_date,
    source_type,
    source_id,
    source_line_id,
    gross_signed_amount,
    source_fingerprint,
    allocation_basis,
    explicit_owner_person_id,
    idempotency_key,
    command_payload_hash,
    created_by
  ) VALUES (
    p_organization_id,
    p_property_id,
    p_currency,
    p_event_date,
    v_event_type,
    v_event_id,
    v_event_id,
    v_signed_amount,
    v_payload_hash,
    'explicit_owner',
    p_owner_person_id,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_allocation_set_id;

  INSERT INTO public.owner_event_owner_allocations (
    allocation_set_id,
    organization_id,
    property_owner_id,
    owner_person_id,
    ownership_percent_snapshot,
    ownership_started_on_snapshot,
    ownership_ended_on_snapshot,
    ownership_roster_hash,
    allocated_gross_signed_amount,
    allocation_order,
    created_by
  ) VALUES (
    v_allocation_set_id,
    p_organization_id,
    v_owner.property_owner_id,
    p_owner_person_id,
    100.000,
    v_owner.started_on,
    v_owner.ended_on,
    v_owner.ownership_roster_hash,
    v_signed_amount,
    1,
    v_actor_id
  )
  RETURNING id INTO v_owner_allocation_id;

  INSERT INTO public.owner_component_movements (
    organization_id,
    owner_event_owner_allocation_id,
    property_id,
    owner_person_id,
    currency,
    event_date,
    month_start,
    component,
    signed_amount,
    movement_order,
    created_by
  ) VALUES (
    p_organization_id,
    v_owner_allocation_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_event_date,
    pg_catalog.date_trunc('month', p_event_date)::date,
    v_component,
    v_signed_amount,
    1,
    v_actor_id
  )
  RETURNING id INTO v_movement_id;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context',
    'checked-rollforward-v1',
    true
  );
  UPDATE public.owner_balance_periods AS period
  SET
    status = 'stale',
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = 'source_allocation_changed'
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.currency = p_currency
    AND period.month_start >= pg_catalog.date_trunc('month', p_event_date)::date
    AND period.status IN ('ready', 'stale');

  v_result := pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'owner_cash_event_id', v_event_id::text,
    'allocation_set_id', v_allocation_set_id::text,
    'owner_allocation_id', v_owner_allocation_id::text,
    'movement_id', v_movement_id::text,
    'amount', pg_catalog.to_char(v_signed_amount, 'FM999999999990.00'),
    'component', v_component::text
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
  RETURN v_result;
END;
$function$

;
REVOKE ALL ON FUNCTION app_private.record_corrected_owner_contribution(uuid,uuid,uuid,public.currency_code,text,date,numeric,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE VIEW public.property_account_entries WITH (security_invoker=true) AS
 WITH events AS (
         SELECT allocation.organization_id,
            invoice.property_id,
            invoice.unit_id,
            invoice.lease_id,
            payment.received_date AS event_date,
            'rent_income'::text AS category,
                CASE
                    WHEN allocation.reversal_of_allocation_id IS NULL THEN 'Rent'::text
                    ELSE 'Rent reversal'::text
                END AS label,
                CASE
                    WHEN allocation.reversal_of_allocation_id IS NULL THEN 'Collected by IPS'::text
                    ELSE 'IPS collection reversed'::text
                END AS note,
            allocation.signed_amount AS amount,
            allocation.signed_amount AS balance_effect,
            'tenant_invoice_payment'::text AS source_type,
            allocation.id AS source_id,
            allocation.created_at
           FROM tenant_invoice_payment_allocations allocation
             JOIN tenant_invoice_payments payment ON payment.organization_id = allocation.organization_id AND payment.id = allocation.payment_id
             JOIN tenant_invoice_lines line ON line.organization_id = allocation.organization_id AND line.id = allocation.invoice_line_id
             JOIN tenant_invoices invoice ON invoice.organization_id = allocation.organization_id AND invoice.id = allocation.invoice_id
          WHERE line.line_type = 'rent'::text
        UNION ALL
         SELECT allocation.organization_id,
            invoice.property_id,
            invoice.unit_id,
            invoice.lease_id,
            confirmation.confirmed_date,
            'rent_income'::text AS text,
                CASE
                    WHEN allocation.reversal_of_allocation_id IS NULL THEN 'Rent'::text
                    ELSE 'Rent reversal'::text
                END AS text,
                CASE
                    WHEN allocation.reversal_of_allocation_id IS NULL THEN 'Collected by owner'::text
                    ELSE 'Owner collection reversed'::text
                END AS text,
            allocation.signed_amount,
            allocation.signed_amount,
            'owner_collection_confirmation'::text AS text,
            allocation.id,
            allocation.created_at
           FROM owner_collection_confirmation_allocations allocation
             JOIN owner_collection_confirmations confirmation ON confirmation.organization_id = allocation.organization_id AND confirmation.id = allocation.confirmation_id
             JOIN tenant_invoice_lines line ON line.organization_id = allocation.organization_id AND line.id = allocation.invoice_line_id
             JOIN tenant_invoices invoice ON invoice.organization_id = allocation.organization_id AND invoice.id = allocation.invoice_id
          WHERE line.line_type = 'rent'::text AND allocation.settlement_contract_version = 'owner_collection.v1'::text
        UNION ALL
         SELECT fee.organization_id,
            fee.property_id,
            invoice.unit_id,
            fee.lease_id,
            fee.fee_date,
            'management_fee_expense'::text AS text,
            'Management fee'::text AS text,
            NULL::text AS text,
            fee.amount,
            - fee.amount,
            'management_fee_occurrence'::text AS text,
            fee.id,
            fee.created_at
           FROM management_fee_occurrences fee
             JOIN tenant_invoices invoice ON invoice.organization_id = fee.organization_id AND invoice.id = fee.tenant_invoice_id
        UNION ALL
         SELECT responsibility.organization_id,
            responsibility.property_id,
            expense.unit_id,
            NULL::uuid AS uuid,
            expense.invoice_date,
            'owner_expense'::text AS text,
            responsibility.customer_label,
            expense.vendor_label,
            responsibility.customer_total_amount,
            - responsibility.customer_total_amount,
            'ips_expense_responsibility'::text AS text,
            responsibility.id,
            responsibility.created_at
           FROM ips_expense_responsibilities responsibility
             JOIN finance_expense_items expense ON expense.organization_id = responsibility.organization_id AND expense.id = responsibility.finance_expense_item_id
          WHERE responsibility.responsibility = 'owner'::text
        UNION ALL
         SELECT adjustment.organization_id,
            adjustment.property_id,
            expense.unit_id,
            NULL::uuid AS uuid,
            adjustment.adjustment_date,
            'owner_expense_reversal'::text AS text,
            'Expense reversal'::text AS text,
            adjustment.reason,
            adjustment.amount,
            - adjustment.amount,
            'expense_customer_adjustment'::text AS text,
            adjustment.id,
            adjustment.created_at
           FROM expense_customer_adjustments adjustment
             JOIN expense_submissions submission ON submission.organization_id = adjustment.organization_id AND submission.id = adjustment.submission_id
             JOIN finance_expense_items expense ON expense.organization_id = submission.organization_id AND expense.id = submission.approved_finance_expense_item_id
          WHERE adjustment.responsibility = 'owner'::text
        UNION ALL
         SELECT withdrawal.organization_id,
            withdrawal.property_id,
            NULL::uuid AS uuid,
            NULL::uuid AS uuid,
            withdrawal.withdrawal_date,
            'withdrawal'::text AS text,
                CASE
                    WHEN withdrawal.reversal_of_id IS NULL THEN 'Owner distribution'::text
                    ELSE 'Distribution reversal'::text
                END AS text,
            withdrawal.reference,
                CASE
                    WHEN withdrawal.reversal_of_id IS NULL THEN withdrawal.amount
                    ELSE - withdrawal.amount
                END::numeric(14,2) AS "numeric",
                CASE
                    WHEN withdrawal.reversal_of_id IS NULL THEN - withdrawal.amount
                    ELSE withdrawal.amount
                END AS amount,
                CASE
                    WHEN withdrawal.reversal_of_id IS NULL THEN 'property_withdrawal'::text
                    ELSE 'property_withdrawal_reversal'::text
                END AS text,
            withdrawal.id,
            withdrawal.created_at
           FROM property_withdrawals withdrawal
        UNION ALL
         SELECT cash.organization_id,
            cash.property_id,
            NULL::uuid AS uuid,
            NULL::uuid AS uuid,
            cash.event_date,
            'owner_contribution'::text AS text,
            CASE WHEN cash.reversal_of_id IS NOT NULL THEN 'Owner contribution reversal' ELSE 'Owner contribution' END AS text,
            CASE WHEN cash.corrects_event_id IS NOT NULL THEN cash.reference ELSE coalesce(cash.reference,cash.reason) END,
            cash.amount,
            cash.amount,
            'owner_contribution'::text AS text,
            cash.id,
            cash.created_at
           FROM owner_cash_events cash
          WHERE cash.event_type = 'owner_contribution'::text
        )
 SELECT organization_id,
    property_id,
    unit_id,
    lease_id,
    event_date,
    category,
    label,
    note,
    amount,
    balance_effect,
    sum(balance_effect) OVER (PARTITION BY organization_id, property_id ORDER BY event_date, created_at, source_type, source_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::numeric(14,2) AS running_balance,
    source_type,
    source_id,
    created_at
   FROM events;

DO $migration$
DECLARE v_def text;v_anchor text := 'SELECT coalesce(nullif(btrim(e.reason),''''),nullif(btrim(e.reference),'''')) INTO v_description';
BEGIN
 v_def:=pg_get_functiondef('app_private.owner_statement_source_description(uuid,uuid)'::regprocedure);
 IF strpos(v_def,v_anchor)=0 THEN RAISE EXCEPTION 'Unexpected owner statement predecessor'; END IF;
 EXECUTE replace(v_def,v_anchor,'SELECT CASE WHEN e.corrects_event_id IS NOT NULL THEN nullif(btrim(e.reference),'''') ELSE coalesce(nullif(btrim(e.reference),''''),nullif(btrim(e.reason),'''')) END INTO v_description');
END;
$migration$;

CREATE FUNCTION public.correct_owner_contribution(
  p_organization_id uuid, p_cash_event_id uuid, p_event_date date,
  p_amount numeric, p_reference text, p_reason text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_original public.owner_cash_events%ROWTYPE;
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
  v_reference text := nullif(pg_catalog.btrim(p_reference), '');
BEGIN
  SELECT * INTO v_original FROM public.owner_cash_events
    WHERE organization_id = p_organization_id AND id = p_cash_event_id;
  IF v_actor IS NULL OR v_original.id IS NULL
    OR v_original.event_type <> 'owner_contribution'
    OR NOT app_private.can_access_property(p_organization_id, v_original.property_id, 'finance.correct_records')
    OR NOT app_private.can_access_property(p_organization_id, v_original.property_id, 'finance.record_payments') THEN
    RAISE EXCEPTION 'owner_contribution_correction_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.current_privileged_email_step_up_satisfied(p_organization_id) THEN
    RAISE EXCEPTION 'privileged_email_step_up_required' USING ERRCODE='42501';
  END IF;
  IF p_event_date IS NULL OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 120
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 8 AND 500
    OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999.99
    OR p_amount <> round(p_amount,2) OR p_amount::text IN ('NaN','Infinity','-Infinity')
    OR length(v_reference) > 240 THEN
    RAISE EXCEPTION 'owner_contribution_correction_inputs_invalid' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('cashEventId', p_cash_event_id,
    'newDate', p_event_date, 'amount', p_amount, 'reference', v_reference, 'reason', v_reason);
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id, 'correct_owner_contribution', v_key, v_actor, v_payload);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_event_date = v_original.event_date AND p_amount = v_original.amount
    AND v_reference IS NOT DISTINCT FROM (CASE WHEN v_original.corrects_event_id IS NOT NULL THEN v_original.reference ELSE coalesce(v_original.reference,v_original.reason) END) THEN
    RAISE EXCEPTION 'owner_contribution_unchanged' USING ERRCODE = '22023';
  END IF;
  IF greatest(p_event_date, v_original.event_date) > app_private.rent_business_date(p_organization_id) THEN
    RAISE EXCEPTION 'owner_contribution_date_in_future' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.event_date,q.source_type,q.source_line_id),'[]')
    INTO v_queue FROM public.get_owner_event_allocation_queue(
      p_organization_id,v_original.property_id,v_original.currency,DATE '0001-01-01',DATE '9999-12-31') q;
  -- Follow the global financial-month -> owner-lifecycle -> source-row order.
  FOR v_month IN SELECT DISTINCT date_trunc('month', d)::date FROM (
    SELECT (q->>'event_date')::date d FROM jsonb_array_elements(v_queue) q
    UNION SELECT p_event_date UNION SELECT v_original.event_date
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
    RAISE EXCEPTION 'owner_contribution_sources_changed' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO STRICT v_claim FROM app_private.claim_financial_idempotency(
    p_organization_id,'correct_owner_contribution',v_key,v_actor,v_payload);
  IF v_claim.is_replay THEN RETURN v_claim.result_ids; END IF;
  SELECT * INTO STRICT v_original FROM public.owner_cash_events
    WHERE organization_id=p_organization_id AND id=p_cash_event_id FOR UPDATE;
  IF v_original.reversal_of_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.owner_cash_events WHERE organization_id=p_organization_id AND reversal_of_id=p_cash_event_id
  ) THEN RAISE EXCEPTION 'owner_contribution_already_reversed' USING ERRCODE='23514'; END IF;
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,v_original.property_id,v_original.currency,v_original.event_date);
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,v_original.property_id,v_original.currency,p_event_date);
  IF EXISTS (SELECT 1 FROM public.owner_balance_periods WHERE organization_id=p_organization_id
    AND property_id=v_original.property_id AND owner_person_id=v_original.owner_person_id
    AND currency=v_original.currency AND status='closed'
    AND month_start>=date_trunc('month',least(p_event_date,v_original.event_date))::date
  ) THEN RAISE EXCEPTION 'owner_contribution_owner_period_closed' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_private.validate_owner_roster_on_date(
    p_organization_id,v_original.property_id,p_event_date) WHERE owner_person_id=v_original.owner_person_id
  ) THEN RAISE EXCEPTION 'owner_contribution_owner_mismatch' USING ERRCODE='23514'; END IF;
  SELECT greatest(p_event_date,v_original.event_date,max((q->>'event_date')::date)) INTO v_end
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
  -- allocate_owner_event rejects any active consumer of the original source.
  -- Do not release, replace or reassign those consumers' reservations.
  PERFORM set_config('app.owner_balance_write_context','checked-owner-balance-v1',true);
  INSERT INTO public.owner_cash_events(organization_id,property_id,owner_person_id,currency,event_type,
    event_date,amount,reason,reference,idempotency_key,payload_hash,created_by,reversal_of_id)
  VALUES(p_organization_id,v_original.property_id,v_original.owner_person_id,v_original.currency,'owner_contribution',
    v_original.event_date,-v_original.amount,v_original.reason,v_original.reference,
    'contribution-reversal:'||v_claim.request_id::text,app_private.canonical_financial_payload_hash(v_payload),v_actor,p_cash_event_id)
  RETURNING jsonb_build_object('id',id) INTO v_reversal;
  PERFORM public.allocate_owner_event(p_organization_id,'reversal',(v_reversal->>'id')::uuid,
    'contribution-reversal:'||v_claim.request_id::text);
  v_replacement:=app_private.record_corrected_owner_contribution(p_organization_id,v_original.property_id,
    v_original.owner_person_id,v_original.currency,'owner_contribution',p_event_date,p_amount,
    'Owner contribution','contribution-replacement:'||v_claim.request_id::text,v_reference,p_cash_event_id);
  IF (SELECT coalesce(sum(signed_amount),0) FROM public.owner_component_movements
    WHERE organization_id=p_organization_id AND property_id=v_original.property_id
      AND owner_person_id=v_original.owner_person_id AND currency=v_original.currency AND component='ips_held_owner_cash'
  ) IS DISTINCT FROM (v_cash_before - v_original.amount + p_amount) THEN
    RAISE EXCEPTION 'owner_contribution_correction_cash_changed' USING ERRCODE='23514';
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
  ) SELECT 1 FROM running WHERE d>=least(p_event_date,v_original.event_date) AND balance<0) THEN
    RAISE EXCEPTION 'owner_contribution_date_would_underfund_owner_cash' USING ERRCODE='23514';
  END IF;
  v_result:=jsonb_build_object('originalId',p_cash_event_id,'replacementId',v_replacement->>'owner_cash_event_id',
    'reversalId',v_reversal->>'id','oldDate',v_original.event_date,'newDate',p_event_date,
    'oldAmount',v_original.amount,'newAmount',p_amount,
    'oldReference',CASE WHEN v_original.corrects_event_id IS NOT NULL THEN v_original.reference ELSE coalesce(v_original.reference,v_original.reason) END,
    'reference',v_reference);
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
  VALUES(p_organization_id,v_actor,'owner_contribution_correction',p_cash_event_id,'corrected',v_result||jsonb_build_object('reason',v_reason));
  PERFORM app_private.complete_financial_idempotency(v_claim.request_id,p_organization_id,v_actor,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.correct_owner_contribution(uuid,uuid,date,numeric,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.correct_owner_contribution(uuid,uuid,date,numeric,text,text,text) TO authenticated;

-- The shared allocation engine must honor the same property branch as its wrapper.
DO $migration$
DECLARE v_def text; v_anchor text := $anchor$  IF app_private.is_financial_month_locked(
    p_organization_id,
    v_source.event_date
  ) THEN
    RAISE EXCEPTION 'financial_month_locked' USING ERRCODE = '22023';
  END IF;$anchor$;
BEGIN
 v_def:=pg_get_functiondef('public.allocate_owner_event_branch106(uuid,text,uuid,text)'::regprocedure);
 IF strpos(v_def,v_anchor)=0 THEN RAISE EXCEPTION 'Unexpected owner allocation month-lock predecessor'; END IF;
 EXECUTE replace(v_def,v_anchor,$replacement$  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,v_source.property_id,v_source.currency,v_source.event_date
  );$replacement$);
END;
$migration$;
