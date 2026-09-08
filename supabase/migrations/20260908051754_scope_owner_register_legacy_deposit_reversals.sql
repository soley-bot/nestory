-- Forward-only read-discovery repair. Financial resolvers, writers, and public
-- authorization wrappers are intentionally unchanged.
CREATE OR REPLACE FUNCTION app_private.get_owner_event_allocation_queue_baseline(p_organization_id uuid, p_property_id uuid, p_currency public.currency_code, p_period_start date, p_period_end date)
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
    SELECT event.event_type, event.id
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
$function$;

ALTER FUNCTION app_private.get_owner_event_allocation_queue_baseline(
  uuid, uuid, public.currency_code, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.get_owner_event_allocation_queue_baseline(
  uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, authenticated, service_role;
