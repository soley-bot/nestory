CREATE INDEX lease_deposit_events_operational_scope_idx
  ON public.lease_deposit_events (
    organization_id,
    property_id,
    currency,
    event_date,
    id
  );

CREATE INDEX petty_cash_entries_operational_scope_idx
  ON public.petty_cash_entries (
    organization_id,
    property_id,
    currency,
    clear_date,
    id
  )
  WHERE status = 'posted' AND archived_at IS NULL;

CREATE INDEX owner_payments_operational_scope_idx
  ON public.owner_payments (
    organization_id,
    property_id,
    currency,
    received_date,
    id
  );

CREATE INDEX property_withdrawals_operational_scope_idx
  ON public.property_withdrawals (
    organization_id,
    property_id,
    currency,
    withdrawal_date,
    id
  );

CREATE OR REPLACE FUNCTION app_private.get_property_cash_events_page(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date,
  p_after_event_date date,
  p_after_source_type text,
  p_after_source_id uuid,
  p_page_size integer
)
RETURNS TABLE (
  contract_version text,
  event_key text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  task_id uuid,
  owner_person_id uuid,
  tenant_person_id uuid,
  vendor_person_id uuid,
  event_date date,
  period_start date,
  currency public.currency_code,
  amount numeric,
  owner_cash_effect numeric,
  operating_cash_effect numeric,
  deposit_liability_effect numeric,
  management_fee_effect numeric,
  economic_class text,
  category_code text,
  description text,
  reference text,
  source_type text,
  source_id uuid,
  source_parent_type text,
  source_parent_id uuid,
  obligation_type text,
  obligation_id uuid,
  reversal_source_type text,
  reversal_source_id uuid,
  is_reversal boolean,
  resolution_state text,
  resolution_reason text,
  reconciliation_source_id uuid,
  ledger_entry_id uuid,
  cursor_event_date date,
  cursor_source_type text,
  cursor_source_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH source_events AS (
    SELECT
      'receipt_allocation:' || allocation.id::text AS event_key,
      allocation.organization_id,
      allocation.property_id,
      allocation.unit_id,
      allocation.lease_id,
      NULL::uuid AS task_id,
      CASE
        WHEN allocation.income_type_snapshot = 'owner_contribution'
          THEN allocation.payer_person_id_snapshot
        ELSE NULL::uuid
      END AS owner_person_id,
      CASE
        WHEN allocation.income_type_snapshot IN (
          'owner_contribution',
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN NULL::uuid
        ELSE allocation.payer_person_id_snapshot
      END AS tenant_person_id,
      NULL::uuid AS vendor_person_id,
      allocation.received_date AS event_date,
      allocation.currency,
      allocation.signed_amount AS amount,
      CASE
        WHEN allocation.income_type_snapshot IN (
          'security_deposit',
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN 0::numeric
        ELSE allocation.signed_amount
      END AS raw_owner_cash_effect,
      CASE
        WHEN allocation.income_type_snapshot IN (
          'security_deposit',
          'owner_contribution',
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN 0::numeric
        ELSE allocation.signed_amount
      END AS raw_operating_cash_effect,
      CASE
        WHEN allocation.income_type_snapshot = 'security_deposit'
          THEN allocation.signed_amount
        ELSE 0::numeric
      END AS raw_deposit_liability_effect,
      CASE
        WHEN allocation.income_type_snapshot IN (
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN allocation.signed_amount
        ELSE 0::numeric
      END AS raw_management_fee_effect,
      CASE
        WHEN allocation.income_type_snapshot = 'security_deposit'
          THEN 'security_deposit'
        WHEN allocation.income_type_snapshot = 'owner_contribution'
          THEN 'owner_contribution'
        WHEN allocation.income_type_snapshot IN (
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN 'management_fee'
        ELSE 'operating_income'
      END::text AS economic_class,
      CASE allocation.income_type_snapshot
        WHEN 'rent' THEN 'rent'
        WHEN 'parking' THEN 'parking'
        WHEN 'late_fee' THEN 'late_fee'
        WHEN 'utility_reimbursement' THEN 'utility_reimbursement'
        WHEN 'owner_contribution' THEN 'owner_contribution'
        WHEN 'security_deposit' THEN 'security_deposit'
        WHEN 'management_fee' THEN 'management_fee'
        WHEN 'leasing_commission' THEN 'leasing_commission'
        WHEN 'service_fee' THEN 'service_fee'
        WHEN 'maintenance_markup' THEN 'maintenance_markup'
        ELSE 'other_operating_income'
      END::text AS category_code,
      concat_ws(
        ' - ',
        allocation.payer_label_snapshot,
        initcap(replace(allocation.income_type_snapshot, '_', ' '))
      )::text AS description,
      allocation.external_reference AS reference,
      'receipt_allocation'::text AS source_type,
      allocation.id AS source_id,
      'finance_receipt'::text AS source_parent_type,
      allocation.receipt_id AS source_parent_id,
      allocation.obligation_type,
      allocation.income_item_id AS obligation_id,
      CASE WHEN allocation.reversal_of_allocation_id IS NOT NULL
        THEN 'receipt_allocation'::text ELSE NULL::text END
        AS reversal_source_type,
      allocation.reversal_of_allocation_id AS reversal_source_id,
      allocation.reversal_of_allocation_id IS NOT NULL AS is_reversal,
      allocation.reconciliation_source_id,
      allocation.ledger_entry_id,
      (
        ledger.id IS NOT NULL
        AND ledger.organization_id = allocation.organization_id
        AND ledger.property_id = allocation.property_id
        AND ledger.unit_id IS NOT DISTINCT FROM allocation.unit_id
        AND ledger.transaction_date = allocation.received_date
        AND ledger.currency = allocation.currency
        AND ledger.direction = 'income'
        AND ledger.amount = allocation.signed_amount
        AND ledger.source_type = 'receipt_allocation'
        AND ledger.source_id = allocation.id
        AND ledger.archived_at IS NULL
        AND (
          (
            allocation.reversal_of_allocation_id IS NULL
            AND ledger.reversal_of_ledger_entry_id IS NULL
          )
          OR (
            allocation.reversal_of_allocation_id IS NOT NULL
            AND ledger.reversal_of_ledger_entry_id =
              original_allocation.ledger_entry_id
          )
        )
      ) AS is_resolved
    FROM public.finance_receipt_allocations AS allocation
    LEFT JOIN public.finance_receipt_allocations AS original_allocation
      ON original_allocation.organization_id = allocation.organization_id
     AND original_allocation.id = allocation.reversal_of_allocation_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = allocation.ledger_entry_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.property_id = p_property_id
      AND allocation.currency = p_currency
      AND allocation.received_date BETWEEN p_period_start AND p_period_end
      AND allocation.settlement_contract_version IS NOT NULL

    UNION ALL

    SELECT
      'owner_collection_allocation:' || allocation.id::text,
      allocation.organization_id,
      allocation.property_id,
      allocation.unit_id,
      allocation.lease_id,
      NULL::uuid,
      allocation.owner_person_id_snapshot,
      allocation.tenant_person_id_snapshot,
      NULL::uuid,
      allocation.confirmed_date,
      allocation.currency,
      allocation.signed_amount,
      CASE
        WHEN allocation.income_type_snapshot IN (
          'security_deposit',
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN 0::numeric
        ELSE allocation.signed_amount
      END,
      CASE
        WHEN allocation.income_type_snapshot IN (
          'security_deposit',
          'owner_contribution',
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN 0::numeric
        ELSE allocation.signed_amount
      END,
      CASE WHEN allocation.income_type_snapshot = 'security_deposit'
        THEN allocation.signed_amount ELSE 0::numeric END,
      CASE
        WHEN allocation.income_type_snapshot IN (
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN allocation.signed_amount
        ELSE 0::numeric
      END,
      CASE
        WHEN allocation.income_type_snapshot = 'security_deposit'
          THEN 'security_deposit'
        WHEN allocation.income_type_snapshot = 'owner_contribution'
          THEN 'owner_contribution'
        WHEN allocation.income_type_snapshot IN (
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        ) THEN 'management_fee'
        ELSE 'operating_income'
      END::text,
      CASE allocation.income_type_snapshot
        WHEN 'rent' THEN 'rent'
        WHEN 'parking' THEN 'parking'
        WHEN 'late_fee' THEN 'late_fee'
        WHEN 'utility_reimbursement' THEN 'utility_reimbursement'
        ELSE allocation.income_type_snapshot
      END::text,
      concat_ws(
        ' - ',
        'Owner confirmed collection',
        initcap(replace(allocation.income_type_snapshot, '_', ' '))
      )::text,
      confirmation.reference,
      'owner_collection_allocation'::text,
      allocation.id,
      'owner_collection_confirmation'::text,
      allocation.confirmation_id,
      'finance_income_item'::text,
      allocation.income_item_id,
      NULL::text,
      NULL::uuid,
      false,
      NULL::uuid,
      allocation.ledger_entry_id,
      (
        ledger.id IS NOT NULL
        AND ledger.organization_id = allocation.organization_id
        AND ledger.property_id = allocation.property_id
        AND ledger.unit_id IS NOT DISTINCT FROM allocation.unit_id
        AND ledger.transaction_date = allocation.confirmed_date
        AND ledger.currency = allocation.currency
        AND ledger.direction = 'income'
        AND ledger.amount = allocation.signed_amount
        AND ledger.source_type = 'owner_collection_allocation'
        AND ledger.source_id = allocation.id
        AND ledger.reversal_of_ledger_entry_id IS NULL
        AND ledger.archived_at IS NULL
      )
    FROM public.owner_collection_confirmation_allocations AS allocation
    JOIN public.owner_collection_confirmations AS confirmation
      ON confirmation.organization_id = allocation.organization_id
     AND confirmation.id = allocation.confirmation_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = allocation.ledger_entry_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.property_id = p_property_id
      AND allocation.currency = p_currency
      AND allocation.confirmed_date BETWEEN p_period_start AND p_period_end
      AND allocation.settlement_contract_version = 'owner_collection.v1'

    UNION ALL

    SELECT
      'payment_allocation:' || allocation.id::text,
      allocation.organization_id,
      allocation.property_id,
      allocation.unit_id,
      NULL::uuid,
      expense.task_id,
      NULL::uuid,
      NULL::uuid,
      allocation.vendor_person_id_snapshot,
      allocation.paid_date,
      allocation.currency,
      allocation.signed_amount,
      CASE WHEN allocation.economic_scope_snapshot = 'property_expense'
        THEN allocation.signed_amount ELSE 0::numeric END,
      CASE
        WHEN allocation.economic_scope_snapshot = 'property_expense'
          AND allocation.expense_type_snapshot NOT IN ('owner_payout', 'refund')
          THEN allocation.signed_amount
        ELSE 0::numeric
      END,
      0::numeric,
      0::numeric,
      CASE
        WHEN allocation.economic_scope_snapshot <> 'property_expense'
          OR allocation.expense_type_snapshot = 'refund'
          THEN 'adjustment'
        WHEN allocation.expense_type_snapshot = 'owner_payout'
          THEN 'owner_distribution'
        ELSE 'operating_expense'
      END::text,
      CASE
        WHEN allocation.economic_scope_snapshot <> 'property_expense'
          THEN 'company_cost'
        WHEN allocation.expense_type_snapshot = 'owner_payout'
          THEN 'owner_distribution'
        WHEN allocation.expense_type_snapshot = 'refund'
          THEN 'refund'
        ELSE 'expense_' || allocation.expense_type_snapshot
      END::text,
      concat_ws(
        ' - ',
        payment.payee_label,
        initcap(replace(allocation.expense_type_snapshot, '_', ' '))
      )::text,
      payment.reference,
      'payment_allocation'::text,
      allocation.id,
      'finance_payment'::text,
      allocation.payment_id,
      'finance_expense_item'::text,
      allocation.expense_item_id,
      CASE WHEN allocation.reversal_of_allocation_id IS NOT NULL
        THEN 'payment_allocation'::text ELSE NULL::text END,
      allocation.reversal_of_allocation_id,
      allocation.reversal_of_allocation_id IS NOT NULL,
      allocation.reconciliation_source_id,
      allocation.ledger_entry_id,
      (
        ledger.id IS NOT NULL
        AND ledger.organization_id = allocation.organization_id
        AND ledger.property_id = allocation.property_id
        AND ledger.unit_id IS NOT DISTINCT FROM allocation.unit_id
        AND ledger.transaction_date = allocation.paid_date
        AND ledger.currency = allocation.currency
        AND ledger.direction = CASE
          WHEN allocation.reversal_of_allocation_id IS NULL
            THEN 'expense'
          ELSE 'income'
        END
        AND ledger.amount = allocation.amount
        AND ledger.source_type = 'payment_allocation'
        AND ledger.source_id = allocation.id
        AND ledger.archived_at IS NULL
        AND (
          (
            allocation.reversal_of_allocation_id IS NULL
            AND ledger.reversal_of_ledger_entry_id IS NULL
          )
          OR (
            allocation.reversal_of_allocation_id IS NOT NULL
            AND ledger.reversal_of_ledger_entry_id =
              original_allocation.ledger_entry_id
          )
        )
      )
    FROM public.finance_payment_allocations AS allocation
    JOIN public.finance_payments AS payment
      ON payment.organization_id = allocation.organization_id
     AND payment.id = allocation.payment_id
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = allocation.organization_id
     AND expense.id = allocation.expense_item_id
    LEFT JOIN public.finance_payment_allocations AS original_allocation
      ON original_allocation.organization_id = allocation.organization_id
     AND original_allocation.id = allocation.reversal_of_allocation_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = allocation.ledger_entry_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.property_id = p_property_id
      AND allocation.currency = p_currency
      AND allocation.paid_date BETWEEN p_period_start AND p_period_end
      AND allocation.settlement_contract_version IS NOT NULL

    UNION ALL

    SELECT
      'deposit_event:' || deposit.id::text,
      deposit.organization_id,
      deposit.property_id,
      lease.unit_id,
      lease.id,
      NULL::uuid,
      NULL::uuid,
      lease.primary_tenant_person_id,
      NULL::uuid,
      deposit.event_date,
      deposit.currency,
      CASE
        WHEN deposit.reversal_of_id IS NOT NULL THEN
          CASE WHEN original.event_type = 'received'
            THEN -deposit.amount ELSE deposit.amount END
        WHEN deposit.event_type = 'received' THEN deposit.amount
        ELSE -deposit.amount
      END,
      0::numeric,
      0::numeric,
      CASE
        WHEN deposit.reversal_of_id IS NOT NULL THEN
          CASE WHEN original.event_type = 'received'
            THEN -deposit.amount ELSE deposit.amount END
        WHEN deposit.event_type = 'received' THEN deposit.amount
        ELSE -deposit.amount
      END,
      0::numeric,
      'security_deposit'::text,
      (
        'deposit_'
        || regexp_replace(lower(lease_deposit.deposit_type), '[^a-z0-9]+', '_', 'g')
        || '_'
        || deposit.event_type
      )::text,
      concat_ws(
        ' - ',
        initcap(replace(lease_deposit.deposit_type, '_', ' ')),
        initcap(replace(deposit.event_type, '_', ' '))
      )::text,
      deposit.reference,
      'deposit_event'::text,
      deposit.id,
      'lease_deposit'::text,
      deposit.lease_deposit_id,
      NULL::text,
      NULL::uuid,
      CASE WHEN deposit.reversal_of_id IS NOT NULL
        THEN 'deposit_event'::text ELSE NULL::text END,
      deposit.reversal_of_id,
      deposit.reversal_of_id IS NOT NULL,
      deposit.reconciliation_source_id,
      deposit.ledger_entry_id,
      (
        original.id IS NOT NULL OR deposit.reversal_of_id IS NULL
      )
      AND ledger.id IS NOT NULL
      AND ledger.organization_id = deposit.organization_id
      AND ledger.property_id = deposit.property_id
      AND ledger.unit_id IS NOT DISTINCT FROM lease.unit_id
      AND ledger.transaction_date = deposit.event_date
      AND ledger.currency = deposit.currency
      AND ledger.direction = CASE
        WHEN (
          CASE
            WHEN deposit.reversal_of_id IS NOT NULL THEN
              CASE WHEN original.event_type = 'received'
                THEN -deposit.amount ELSE deposit.amount END
            WHEN deposit.event_type = 'received' THEN deposit.amount
            ELSE -deposit.amount
          END
        ) > 0 THEN 'income'
        ELSE 'expense'
      END
      AND ledger.amount = deposit.amount
      AND ledger.source_type = 'deposit_event'
      AND ledger.source_id = deposit.id
      AND ledger.archived_at IS NULL
      AND (
        (
          deposit.reversal_of_id IS NULL
          AND ledger.reversal_of_ledger_entry_id IS NULL
        )
        OR (
          deposit.reversal_of_id IS NOT NULL
          AND ledger.reversal_of_ledger_entry_id = original.ledger_entry_id
        )
      )
    FROM public.lease_deposit_events AS deposit
    JOIN public.lease_deposits AS lease_deposit
      ON lease_deposit.organization_id = deposit.organization_id
     AND lease_deposit.id = deposit.lease_deposit_id
    JOIN public.leases AS lease
      ON lease.organization_id = lease_deposit.organization_id
     AND lease.id = lease_deposit.lease_id
    LEFT JOIN public.lease_deposit_events AS original
      ON original.organization_id = deposit.organization_id
     AND original.id = deposit.reversal_of_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = deposit.ledger_entry_id
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'petty_cash_entry:' || entry.id::text,
      entry.organization_id,
      entry.property_id,
      entry.unit_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      entry.counterparty_person_id,
      entry.clear_date,
      entry.currency,
      -entry.out_amount,
      CASE WHEN entry.economic_scope = 'property_expense'
        THEN -entry.out_amount ELSE 0::numeric END,
      CASE WHEN entry.economic_scope = 'property_expense'
        THEN -entry.out_amount ELSE 0::numeric END,
      0::numeric,
      0::numeric,
      CASE WHEN entry.economic_scope = 'property_expense'
        THEN 'operating_expense' ELSE 'adjustment' END::text,
      CASE WHEN entry.economic_scope = 'property_expense'
        THEN 'petty_cash_expense' ELSE 'company_cost' END::text,
      entry.description,
      entry.receipt_reference,
      'petty_cash_entry'::text,
      entry.id,
      'petty_cash_account'::text,
      entry.account_id,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      entry.reconciliation_source_id,
      entry.ledger_entry_id,
      (
        ledger.id IS NOT NULL
        AND ledger.organization_id = entry.organization_id
        AND ledger.property_id = entry.property_id
        AND ledger.unit_id IS NOT DISTINCT FROM entry.unit_id
        AND ledger.transaction_date = entry.clear_date
        AND ledger.currency = entry.currency
        AND ledger.direction = 'expense'
        AND ledger.amount = entry.out_amount
        AND ledger.source_type = 'petty_cash_entry'
        AND ledger.source_id = entry.id
        AND ledger.reversal_of_ledger_entry_id IS NULL
        AND ledger.archived_at IS NULL
      )
    FROM public.petty_cash_entries AS entry
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = entry.ledger_entry_id
    WHERE entry.organization_id = p_organization_id
      AND entry.property_id = p_property_id
      AND entry.currency = p_currency
      AND entry.clear_date BETWEEN p_period_start AND p_period_end
      AND entry.status = 'posted'
      AND entry.entry_kind = 'expense'
      AND entry.archived_at IS NULL

    UNION ALL

    SELECT
      'owner_payment:' || payment.id::text,
      payment.organization_id,
      payment.property_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      payment.owner_person_id,
      NULL::uuid,
      NULL::uuid,
      payment.received_date,
      payment.currency,
      payment.amount,
      payment.amount,
      0::numeric,
      0::numeric,
      0::numeric,
      'owner_contribution'::text,
      'owner_payment'::text,
      payment.payment_number,
      payment.reference,
      'owner_payment'::text,
      payment.id,
      'owner_invoice'::text,
      payment.owner_invoice_id,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      NULL::uuid,
      payment.ledger_entry_id,
      (
        ledger.id IS NOT NULL
        AND ledger.organization_id = payment.organization_id
        AND ledger.property_id = payment.property_id
        AND ledger.unit_id IS NULL
        AND ledger.transaction_date = payment.received_date
        AND ledger.currency = payment.currency
        AND ledger.direction = 'income'
        AND ledger.amount = payment.amount
        AND ledger.source_type = 'owner_cash_event'
        AND ledger.source_id = payment.id
        AND ledger.reversal_of_ledger_entry_id IS NULL
        AND ledger.archived_at IS NULL
      )
    FROM public.owner_payments AS payment
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = payment.ledger_entry_id
    WHERE payment.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.received_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'property_withdrawal:' || withdrawal.id::text,
      withdrawal.organization_id,
      withdrawal.property_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      withdrawal.owner_person_id,
      NULL::uuid,
      NULL::uuid,
      withdrawal.withdrawal_date,
      withdrawal.currency,
      -withdrawal.amount,
      -withdrawal.amount,
      0::numeric,
      0::numeric,
      0::numeric,
      'owner_distribution'::text,
      'owner_withdrawal'::text,
      'Owner withdrawal'::text,
      withdrawal.reference,
      'property_withdrawal'::text,
      withdrawal.id,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      NULL::uuid,
      withdrawal.ledger_entry_id,
      (
        ledger.id IS NOT NULL
        AND ledger.organization_id = withdrawal.organization_id
        AND ledger.property_id = withdrawal.property_id
        AND ledger.unit_id IS NULL
        AND ledger.transaction_date = withdrawal.withdrawal_date
        AND ledger.currency = withdrawal.currency
        AND ledger.direction = 'expense'
        AND ledger.amount = withdrawal.amount
        AND ledger.source_type = 'owner_cash_event'
        AND ledger.source_id = withdrawal.id
        AND ledger.reversal_of_ledger_entry_id IS NULL
        AND ledger.archived_at IS NULL
      )
    FROM public.property_withdrawals AS withdrawal
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = withdrawal.ledger_entry_id
    WHERE withdrawal.organization_id = p_organization_id
      AND withdrawal.property_id = p_property_id
      AND withdrawal.currency = p_currency
      AND withdrawal.withdrawal_date BETWEEN p_period_start AND p_period_end
  )
  SELECT
    'property_cash_events.v1'::text,
    source.event_key,
    source.organization_id,
    source.property_id,
    source.unit_id,
    source.lease_id,
    source.task_id,
    source.owner_person_id,
    source.tenant_person_id,
    source.vendor_person_id,
    source.event_date,
    date_trunc('month', source.event_date)::date,
    source.currency,
    source.amount,
    CASE WHEN source.is_resolved
      THEN source.raw_owner_cash_effect ELSE NULL::numeric END,
    CASE WHEN source.is_resolved
      THEN source.raw_operating_cash_effect ELSE NULL::numeric END,
    CASE WHEN source.is_resolved
      THEN source.raw_deposit_liability_effect ELSE NULL::numeric END,
    CASE WHEN source.is_resolved
      THEN source.raw_management_fee_effect ELSE NULL::numeric END,
    source.economic_class,
    source.category_code,
    source.description,
    source.reference,
    source.source_type,
    source.source_id,
    source.source_parent_type,
    source.source_parent_id,
    source.obligation_type,
    source.obligation_id,
    source.reversal_source_type,
    source.reversal_source_id,
    source.is_reversal,
    CASE WHEN source.is_resolved THEN 'resolved' ELSE 'unresolved' END::text,
    CASE WHEN source.is_resolved
      THEN NULL::text
      ELSE 'Exact operational Ledger event is missing or inconsistent'
    END::text,
    source.reconciliation_source_id,
    source.ledger_entry_id,
    source.event_date,
    source.source_type,
    source.source_id
  FROM source_events AS source
  WHERE p_after_event_date IS NULL
    OR (
      source.event_date,
      source.source_type,
      source.source_id
    ) > (
      p_after_event_date,
      p_after_source_type,
      p_after_source_id
    )
  ORDER BY source.event_date, source.source_type, source.source_id
  LIMIT p_page_size;
$$;

CREATE OR REPLACE FUNCTION public.get_property_cash_events_page(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date,
  p_after_event_date date,
  p_after_source_type text,
  p_after_source_id uuid,
  p_page_size integer
)
RETURNS TABLE (
  contract_version text,
  event_key text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  task_id uuid,
  owner_person_id uuid,
  tenant_person_id uuid,
  vendor_person_id uuid,
  event_date date,
  period_start date,
  currency public.currency_code,
  amount numeric,
  owner_cash_effect numeric,
  operating_cash_effect numeric,
  deposit_liability_effect numeric,
  management_fee_effect numeric,
  economic_class text,
  category_code text,
  description text,
  reference text,
  source_type text,
  source_id uuid,
  source_parent_type text,
  source_parent_id uuid,
  obligation_type text,
  obligation_id uuid,
  reversal_source_type text,
  reversal_source_id uuid,
  is_reversal boolean,
  resolution_state text,
  resolution_reason text,
  reconciliation_source_id uuid,
  ledger_entry_id uuid,
  cursor_event_date date,
  cursor_source_type text,
  cursor_source_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_currency IS NULL
    OR p_period_start IS NULL
    OR p_period_end IS NULL
    OR p_page_size IS NULL
    OR p_page_size < 1
    OR p_page_size > 1000
    OR p_period_end < p_period_start
    OR p_period_end - p_period_start > 365
    OR (
      (p_after_event_date IS NULL)::integer
      + (p_after_source_type IS NULL)::integer
      + (p_after_source_id IS NULL)::integer
    ) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'Complete bounded cash-event scope is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  RETURN QUERY
  SELECT *
  FROM app_private.get_property_cash_events_page(
    p_organization_id,
    p_property_id,
    p_currency,
    p_period_start,
    p_period_end,
    p_after_event_date,
    p_after_source_type,
    p_after_source_id,
    p_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.get_property_cash_events_page(
  uuid,
  uuid,
  public.currency_code,
  date,
  date,
  date,
  text,
  uuid,
  integer
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_property_cash_events_page(
  uuid,
  uuid,
  public.currency_code,
  date,
  date,
  date,
  text,
  uuid,
  integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_property_cash_events_page(
  uuid,
  uuid,
  public.currency_code,
  date,
  date,
  date,
  text,
  uuid,
  integer
) TO authenticated;
