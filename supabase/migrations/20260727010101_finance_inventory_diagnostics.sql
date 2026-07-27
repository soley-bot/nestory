CREATE OR REPLACE FUNCTION app_private.get_finance_inventory_page(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date,
  p_section text,
  p_after_key text DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_issue_codes text[] DEFAULT NULL,
  p_source_types text[] DEFAULT NULL
)
RETURNS TABLE (
  contract_version text,
  section text,
  stable_key text,
  payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH source_rows AS (
    SELECT
      'income_obligation:' || income.id::text AS stable_key,
      jsonb_build_object(
        'sourceType', 'income_obligation',
        'sourceId', income.id,
        'parentTransactionId', income.id,
        'organizationId', income.organization_id,
        'propertyId', income.property_id,
        'unitId', income.unit_id,
        'leaseId', income.lease_id,
        'ledgerEntryId', income.ledger_entry_id,
        'sourceReference', 'public.finance_income_items',
        'eventDate', income.received_date,
        'obligationDate', income.due_date,
        'dueOrInvoiceDate', income.due_date,
        'inferredDateState', CASE
          WHEN income.reference LIKE 'BACKFILL-INCOME-%' AND income.received_date = income.due_date
            THEN 'inferred_due_date_fallback'
          ELSE 'not_inferred'
        END,
        'currency', income.currency,
        'amount', to_char(income.amount_due, 'FM999999999999990.00'),
        'obligationAmount', to_char(income.amount_due, 'FM999999999999990.00'),
        'settlementAmount', to_char(income.amount_received, 'FM999999999999990.00'),
        'outstandingAmount', to_char(greatest(income.amount_due - income.amount_received, 0), 'FM999999999999990.00'),
        'status', income.status,
        'incomeType', income.income_type,
        'economicClass', CASE
          WHEN income.income_type = 'owner_contribution' THEN 'owner_contribution'
          WHEN income.income_type = 'security_deposit' THEN 'deposit_custody'
          WHEN income.income_type IN (
            'leasing_commission', 'maintenance_markup', 'management_fee', 'service_fee'
          ) THEN 'management_fee'
          ELSE 'operating_income'
        END,
        'economicArea', CASE income.income_type
          WHEN 'security_deposit' THEN 'security_deposit'
          WHEN 'owner_contribution' THEN 'owner_contribution'
          ELSE 'operating_income'
        END,
        'archived', income.archived_at IS NOT NULL,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash', 'finance_close')
      ) AS payload
    FROM public.finance_income_items income
    WHERE income.organization_id = p_organization_id
      AND income.property_id = p_property_id
      AND income.currency = p_currency
      AND income.due_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'expense_obligation:' || expense.id::text,
      jsonb_build_object(
        'sourceType', 'expense_obligation',
        'sourceId', expense.id,
        'parentTransactionId', expense.id,
        'organizationId', expense.organization_id,
        'propertyId', expense.property_id,
        'unitId', expense.unit_id,
        'taskId', expense.task_id,
        'vendorPersonId', expense.vendor_person_id,
        'ledgerEntryId', expense.ledger_entry_id,
        'sourceReference', 'public.finance_expense_items',
        'eventDate', expense.paid_date,
        'obligationDate', expense.invoice_date,
        'dueOrInvoiceDate', coalesce(expense.due_date, expense.invoice_date),
        'inferredDateState', CASE
          WHEN expense.reference LIKE 'BACKFILL-EXPENSE-%' AND expense.paid_date = expense.invoice_date
            THEN 'inferred_invoice_date_fallback'
          ELSE 'not_inferred'
        END,
        'currency', expense.currency,
        'amount', to_char(expense.amount, 'FM999999999999990.00'),
        'obligationAmount', to_char(expense.amount, 'FM999999999999990.00'),
        'status', expense.status,
        'expenseType', expense.expense_type,
        'economicScope', expense.economic_scope,
        'economicClass', CASE
          WHEN expense.expense_type = 'owner_payout' THEN 'owner_distribution'
          WHEN expense.expense_type = 'refund' THEN 'refund'
          WHEN expense.economic_scope = 'property_expense' THEN 'property_expense'
          WHEN expense.economic_scope = 'company_advance' THEN 'company_advance'
          WHEN expense.economic_scope = 'company_cost' THEN 'company_cost'
          ELSE 'unclassified_expense'
        END,
        'economicArea', CASE expense.expense_type
          WHEN 'owner_payout' THEN 'owner_payout'
          ELSE 'operating_expense'
        END,
        'archived', expense.archived_at IS NOT NULL,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash', 'finance_close')
      )
    FROM public.finance_expense_items expense
    WHERE expense.organization_id = p_organization_id
      AND expense.property_id = p_property_id
      AND expense.currency = p_currency
      AND expense.invoice_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'receipt_allocation:' || allocation.id::text,
      jsonb_build_object(
        'sourceType', 'receipt_allocation',
        'sourceId', allocation.id,
        'parentTransactionId', receipt.id,
        'obligationId', allocation.income_item_id,
        'organizationId', allocation.organization_id,
        'propertyId', receipt.property_id,
        'unitId', income.unit_id,
        'leaseId', income.lease_id,
        'sourceReference', 'public.finance_receipt_allocations',
        'eventDate', receipt.received_date,
        'obligationDate', income.due_date,
        'dueOrInvoiceDate', income.due_date,
        'currency', receipt.currency,
        'amount', to_char(allocation.amount, 'FM999999999999990.00'),
        'settlementAmount', to_char(allocation.amount, 'FM999999999999990.00'),
        'signedAmount', to_char(
          CASE WHEN receipt.reversal_of_id IS NULL
            THEN allocation.amount ELSE -allocation.amount END,
          'FM999999999999990.00'
        ),
        'isReversal', receipt.reversal_of_id IS NOT NULL,
        'reversalOfId', receipt.reversal_of_id,
        'originalTransactionId', coalesce(receipt.reversal_of_id, receipt.id),
        'incomeType', income.income_type,
        'economicClass', CASE
          WHEN income.income_type = 'owner_contribution' THEN 'owner_contribution'
          WHEN income.income_type = 'security_deposit' THEN 'deposit_custody'
          WHEN income.income_type IN (
            'leasing_commission', 'maintenance_markup', 'management_fee', 'service_fee'
          ) THEN 'management_fee'
          ELSE 'operating_income'
        END,
        'reconciliationSourceState', 'allocation_has_no_stable_projection_identity',
        'economicArea', CASE
          WHEN income.income_type = 'owner_contribution' THEN 'owner_contribution'
          WHEN income.income_type = 'security_deposit' THEN 'security_deposit'
          WHEN income.income_type IN (
            'leasing_commission', 'maintenance_markup', 'management_fee', 'service_fee'
          ) THEN 'management_fee'
          ELSE 'operating_income'
        END,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash')
      )
    FROM public.finance_receipt_allocations allocation
    JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
    JOIN public.finance_income_items income ON income.id = allocation.income_item_id
    WHERE allocation.organization_id = p_organization_id
      AND receipt.property_id = p_property_id
      AND receipt.currency = p_currency
      AND receipt.received_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'payment_allocation:' || allocation.id::text,
      jsonb_build_object(
        'sourceType', 'payment_allocation',
        'sourceId', allocation.id,
        'parentTransactionId', payment.id,
        'obligationId', allocation.expense_item_id,
        'organizationId', allocation.organization_id,
        'propertyId', payment.property_id,
        'unitId', expense.unit_id,
        'taskId', expense.task_id,
        'vendorPersonId', expense.vendor_person_id,
        'sourceReference', 'public.finance_payment_allocations',
        'eventDate', payment.paid_date,
        'obligationDate', expense.invoice_date,
        'dueOrInvoiceDate', coalesce(expense.due_date, expense.invoice_date),
        'currency', payment.currency,
        'amount', to_char(allocation.amount, 'FM999999999999990.00'),
        'settlementAmount', to_char(allocation.amount, 'FM999999999999990.00'),
        'signedAmount', to_char(
          CASE WHEN payment.reversal_of_id IS NULL
            THEN allocation.amount ELSE -allocation.amount END,
          'FM999999999999990.00'
        ),
        'isReversal', payment.reversal_of_id IS NOT NULL,
        'reversalOfId', payment.reversal_of_id,
        'originalTransactionId', coalesce(payment.reversal_of_id, payment.id),
        'expenseType', expense.expense_type,
        'economicScope', expense.economic_scope,
        'economicClass', CASE
          WHEN expense.expense_type = 'owner_payout' THEN 'owner_distribution'
          WHEN expense.expense_type = 'refund' THEN 'refund'
          WHEN expense.economic_scope = 'property_expense' THEN 'property_expense'
          WHEN expense.economic_scope = 'company_advance' THEN 'company_advance'
          WHEN expense.economic_scope = 'company_cost' THEN 'company_cost'
          ELSE 'unclassified_expense'
        END,
        'direction', 'expense',
        'reconciliationSourceState', 'allocation_has_no_stable_projection_identity',
        'economicArea', CASE
          WHEN expense.expense_type = 'owner_payout' THEN 'owner_payout'
          ELSE expense.economic_scope
        END,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash')
      )
    FROM public.finance_payment_allocations allocation
    JOIN public.finance_payments payment ON payment.id = allocation.payment_id
    JOIN public.finance_expense_items expense ON expense.id = allocation.expense_item_id
    WHERE allocation.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.paid_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'deposit_event:' || deposit.id::text,
      jsonb_build_object(
        'sourceType', 'deposit_event',
        'sourceId', deposit.id,
        'parentTransactionId', deposit.lease_deposit_id,
        'leaseId', lease_deposit.lease_id,
        'unitId', lease.unit_id,
        'organizationId', deposit.organization_id,
        'propertyId', deposit.property_id,
        'sourceReference', 'public.lease_deposit_events',
        'eventDate', deposit.event_date,
        'inSelectedPeriod', deposit.event_date BETWEEN p_period_start AND p_period_end,
        'currency', deposit.currency,
        'amount', to_char(deposit.amount, 'FM999999999999990.00'),
        'eventType', deposit.event_type,
        'depositType', lease_deposit.deposit_type,
        'isReversal', deposit.reversal_of_id IS NOT NULL,
        'reversalOfId', deposit.reversal_of_id,
        'originalTransactionId', coalesce(deposit.reversal_of_id, deposit.id),
        'originalEventType', original_deposit.event_type,
        'signedAmount', to_char(
          CASE
            WHEN deposit.event_type = 'reversed' THEN
              -CASE original_deposit.event_type
                WHEN 'received' THEN deposit.amount
                ELSE -deposit.amount
              END
            WHEN deposit.event_type = 'received' THEN deposit.amount
            ELSE -deposit.amount
          END,
          'FM999999999999990.00'
        ),
        'economicClass', 'deposit_custody',
        'economicArea', 'security_deposit',
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash')
      )
    FROM public.lease_deposit_events deposit
    JOIN public.lease_deposits lease_deposit
      ON lease_deposit.id = deposit.lease_deposit_id
    JOIN public.leases lease
      ON lease.id = lease_deposit.lease_id
    LEFT JOIN public.lease_deposit_events original_deposit
      ON original_deposit.id = deposit.reversal_of_id
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date <= p_period_end

    UNION ALL

    SELECT
      'ledger_entry:' || ledger.id::text,
      jsonb_build_object(
        'sourceType', 'ledger_entry',
        'sourceId', ledger.id,
        'parentTransactionId', ledger.source_id,
        'typedProjectionSource', ledger.source_type,
        'organizationId', ledger.organization_id,
        'propertyId', ledger.property_id,
        'unitId', ledger.unit_id,
        'sourceReference', 'public.ledger_entries',
        'eventDate', ledger.transaction_date,
        'currency', ledger.currency,
        'amount', to_char(ledger.amount, 'FM999999999999990.00'),
        'ledgerAmount', to_char(ledger.amount, 'FM999999999999990.00'),
        'direction', ledger.direction,
        'archived', ledger.archived_at IS NOT NULL,
        'reconciliationSourceState', CASE
          WHEN ledger.source_type = 'manual' OR ledger.source_id IS NULL THEN 'missing'
          ELSE 'domain_link_present'
        END,
        'economicArea', CASE
          WHEN ledger.source_type = 'petty_cash' THEN 'petty_cash'
          WHEN ledger.source_type = 'maintenance_task' THEN 'maintenance'
          ELSE 'operational_ledger'
        END,
        'affectedSurfaces', jsonb_build_array(
          'ledger', 'property_performance', 'unit_performance',
          'income_and_expense', 'property_records'
        )
      )
    FROM public.ledger_entries ledger
    WHERE ledger.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND ledger.currency = p_currency
      AND ledger.transaction_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'petty_cash_entry:' || petty.id::text,
      jsonb_build_object(
        'sourceType', 'petty_cash_entry',
        'sourceId', petty.id,
        'parentTransactionId', petty.id,
        'ledgerEntryId', petty.ledger_entry_id,
        'organizationId', petty.organization_id,
        'propertyId', petty.property_id,
        'unitId', petty.unit_id,
        'sourceReference', 'public.petty_cash_entries',
        'eventDate', coalesce(petty.clear_date, petty.invoice_date),
        'dueOrInvoiceDate', petty.invoice_date,
        'inferredDateState', CASE
          WHEN petty.clear_date IS NULL THEN 'invoice_date_without_disbursement_evidence'
          ELSE 'not_inferred'
        END,
        'currency', petty.currency,
        'amount', to_char(CASE WHEN petty.entry_kind = 'expense' THEN petty.out_amount ELSE petty.in_amount END, 'FM999999999999990.00'),
        'direction', CASE WHEN petty.entry_kind = 'expense' THEN 'expense' ELSE 'income' END,
        'status', petty.status,
        'economicArea', 'petty_cash',
        'affectedSurfaces', jsonb_build_array('ledger', 'finance_close')
      )
    FROM public.petty_cash_entries petty
    WHERE petty.organization_id = p_organization_id
      AND petty.property_id = p_property_id
      AND petty.currency = p_currency
      AND petty.invoice_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'maintenance_task:' || task.id::text,
      jsonb_build_object(
        'sourceType', 'maintenance_task',
        'sourceId', task.id,
        'parentTransactionId', task.id,
        'ledgerEntryId', task.ledger_entry_id,
        'organizationId', task.organization_id,
        'propertyId', task.property_id,
        'unitId', task.unit_id,
        'vendorPersonId', task.vendor_person_id,
        'sourceReference', 'public.tasks',
        'eventDate', coalesce(task.completed_at::date, task.updated_at::date),
        'currency', task.actual_cost_currency,
        'amount', to_char(task.actual_cost_amount, 'FM999999999999990.00'),
        'direction', 'expense',
        'economicArea', 'maintenance',
        'affectedSurfaces', jsonb_build_array('ledger', 'maintenance')
      )
    FROM public.tasks task
    WHERE task.organization_id = p_organization_id
      AND task.property_id = p_property_id
      AND task.actual_cost_currency = p_currency
      AND coalesce(task.completed_at::date, task.updated_at::date)
        BETWEEN p_period_start AND p_period_end
      AND task.actual_cost_amount IS NOT NULL

    UNION ALL

    SELECT
      'journal_line:' || line.id::text,
      jsonb_build_object(
        'sourceType', 'journal_line',
        'sourceId', line.id,
        'parentTransactionId', journal.id,
        'typedProjectionSource', journal.source_type,
        'organizationId', line.organization_id,
        'propertyId', line.property_id,
        'unitId', line.unit_id,
        'leaseId', line.lease_id,
        'ownerPersonId', line.owner_person_id,
        'tenantPersonId', line.tenant_person_id,
        'vendorPersonId', line.vendor_person_id,
        'ledgerEntryId', journal.legacy_ledger_entry_id,
        'sourceReference', 'public.accounting_journal_entries/public.accounting_journal_lines',
        'eventDate', journal.entry_date,
        'currency', journal.currency,
        'amount', to_char(greatest(line.debit_amount, line.credit_amount), 'FM999999999999990.00'),
        'debitAmount', to_char(line.debit_amount, 'FM999999999999990.00'),
        'creditAmount', to_char(line.credit_amount, 'FM999999999999990.00'),
        'journalAmount', to_char(greatest(line.debit_amount, line.credit_amount), 'FM999999999999990.00'),
        'status', journal.status,
        'economicArea', 'accounting_control',
        'affectedSurfaces', jsonb_build_array('accounting_health')
      )
    FROM public.accounting_journal_lines line
    JOIN public.accounting_journal_entries journal ON journal.id = line.journal_entry_id
    WHERE line.organization_id = p_organization_id
      AND line.property_id = p_property_id
      AND journal.currency = p_currency
      AND journal.entry_date BETWEEN p_period_start AND p_period_end
  ),
  relevant_dates AS (
    SELECT DISTINCT candidate.relevant_date
    FROM (
      SELECT p_period_end AS relevant_date
      UNION ALL
      SELECT (source.payload ->> 'eventDate')::date
      FROM source_rows source
      WHERE source.payload ->> 'eventDate' IS NOT NULL
      UNION ALL
      SELECT (source.payload ->> 'obligationDate')::date
      FROM source_rows source
      WHERE source.payload ->> 'obligationDate' IS NOT NULL
    ) candidate
    WHERE candidate.relevant_date BETWEEN p_period_start AND p_period_end
  ),
  scope_violation_rows AS (
    SELECT
      'WRONG_LINKED_RECORD_SCOPE:receipt_allocation:' || allocation.id::text AS stable_key,
      jsonb_build_object(
        'issueCode', 'WRONG_LINKED_RECORD_SCOPE',
        'severity', 'Critical',
        'organizationId', allocation.organization_id,
        'propertyId', receipt.property_id,
        'unitId', income.unit_id,
        'leaseId', income.lease_id,
        'obligationId', income.id,
        'sourceType', 'receipt_allocation',
        'sourceId', allocation.id,
        'parentTransactionId', receipt.id,
        'sourceReference', 'public.finance_receipt_allocations->finance_income_items',
        'eventDate', receipt.received_date,
        'currency', receipt.currency,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'link_scope',
        'explanation', 'Receipt allocation links to an obligation, unit, or lease outside the receipt property scope.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      ) AS payload
    FROM public.finance_receipt_allocations allocation
    JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
    JOIN public.finance_income_items income ON income.id = allocation.income_item_id
    LEFT JOIN public.units unit ON unit.id = income.unit_id
    LEFT JOIN public.leases lease ON lease.id = income.lease_id
    WHERE allocation.organization_id = p_organization_id
      AND receipt.property_id = p_property_id
      AND receipt.currency = p_currency
      AND receipt.received_date BETWEEN p_period_start AND p_period_end
      AND (
        income.property_id IS DISTINCT FROM receipt.property_id
        OR (income.unit_id IS NOT NULL
          AND unit.property_id IS DISTINCT FROM receipt.property_id)
        OR (income.lease_id IS NOT NULL
          AND lease.property_id IS DISTINCT FROM receipt.property_id)
      )

    UNION ALL

    SELECT
      'WRONG_LINKED_RECORD_SCOPE:payment_allocation:' || allocation.id::text,
      jsonb_build_object(
        'issueCode', 'WRONG_LINKED_RECORD_SCOPE',
        'severity', 'Critical',
        'organizationId', allocation.organization_id,
        'propertyId', payment.property_id,
        'unitId', expense.unit_id,
        'taskId', expense.task_id,
        'vendorPersonId', expense.vendor_person_id,
        'obligationId', expense.id,
        'sourceType', 'payment_allocation',
        'sourceId', allocation.id,
        'parentTransactionId', payment.id,
        'sourceReference', 'public.finance_payment_allocations->finance_expense_items',
        'eventDate', payment.paid_date,
        'currency', payment.currency,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'link_scope',
        'explanation', 'Payment allocation links to an obligation, unit, task, or vendor outside the payment property or organization scope.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.finance_payment_allocations allocation
    JOIN public.finance_payments payment ON payment.id = allocation.payment_id
    JOIN public.finance_expense_items expense ON expense.id = allocation.expense_item_id
    LEFT JOIN public.units unit ON unit.id = expense.unit_id
    LEFT JOIN public.tasks task ON task.id = expense.task_id
    LEFT JOIN public.people vendor ON vendor.id = expense.vendor_person_id
    WHERE allocation.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.paid_date BETWEEN p_period_start AND p_period_end
      AND (
        expense.property_id IS DISTINCT FROM payment.property_id
        OR (expense.unit_id IS NOT NULL
          AND unit.property_id IS DISTINCT FROM payment.property_id)
        OR (expense.task_id IS NOT NULL
          AND task.property_id IS DISTINCT FROM payment.property_id)
        OR (expense.vendor_person_id IS NOT NULL
          AND vendor.organization_id IS DISTINCT FROM payment.organization_id)
      )

    UNION ALL

    SELECT
      'WRONG_LINKED_RECORD_SCOPE:ledger_entry:' || ledger.id::text,
      jsonb_build_object(
        'issueCode', 'WRONG_LINKED_RECORD_SCOPE',
        'severity', 'Critical',
        'organizationId', ledger.organization_id,
        'propertyId', ledger.property_id,
        'unitId', ledger.unit_id,
        'sourceType', 'ledger_entry',
        'sourceId', ledger.id,
        'parentTransactionId', ledger.source_id,
        'typedProjectionSource', ledger.source_type,
        'ledgerEntryId', ledger.id,
        'sourceReference', 'public.ledger_entries unit/source identity',
        'eventDate', ledger.transaction_date,
        'currency', ledger.currency,
        'affectedSurfaces', jsonb_build_array('ledger', 'property_performance', 'unit_performance'),
        'affectedEconomicArea', 'link_scope',
        'explanation', 'Ledger unit or typed domain source resolves outside the Ledger property scope.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.ledger_entries ledger
    LEFT JOIN public.units unit ON unit.id = ledger.unit_id
    LEFT JOIN public.finance_income_items income
      ON ledger.source_type = 'finance_income' AND income.id = ledger.source_id
    LEFT JOIN public.finance_expense_items expense
      ON ledger.source_type = 'finance_expense' AND expense.id = ledger.source_id
    LEFT JOIN public.petty_cash_entries petty
      ON ledger.source_type = 'petty_cash' AND petty.id = ledger.source_id
    LEFT JOIN public.tasks task
      ON ledger.source_type = 'maintenance_task' AND task.id = ledger.source_id
    WHERE ledger.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND ledger.currency = p_currency
      AND ledger.transaction_date BETWEEN p_period_start AND p_period_end
      AND (
        (ledger.unit_id IS NOT NULL
          AND unit.property_id IS DISTINCT FROM ledger.property_id)
        OR (ledger.source_type = 'finance_income'
          AND income.property_id IS DISTINCT FROM ledger.property_id)
        OR (ledger.source_type = 'finance_expense'
          AND expense.property_id IS DISTINCT FROM ledger.property_id)
        OR (ledger.source_type = 'petty_cash'
          AND petty.property_id IS DISTINCT FROM ledger.property_id)
        OR (ledger.source_type = 'maintenance_task'
          AND task.property_id IS DISTINCT FROM ledger.property_id)
      )

    UNION ALL

    SELECT
      'WRONG_LINKED_RECORD_SCOPE:deposit_event:' || deposit.id::text,
      jsonb_build_object(
        'issueCode', 'WRONG_LINKED_RECORD_SCOPE',
        'severity', 'Critical',
        'organizationId', deposit.organization_id,
        'propertyId', deposit.property_id,
        'unitId', lease.unit_id,
        'leaseId', lease.id,
        'sourceType', 'deposit_event',
        'sourceId', deposit.id,
        'parentTransactionId', deposit.lease_deposit_id,
        'sourceReference', 'public.lease_deposit_events->lease_deposits->leases',
        'eventDate', deposit.event_date,
        'currency', deposit.currency,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'link_scope',
        'explanation', 'Deposit event property differs from its exact lease property.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.lease_deposit_events deposit
    JOIN public.lease_deposits lease_deposit
      ON lease_deposit.id = deposit.lease_deposit_id
    JOIN public.leases lease ON lease.id = lease_deposit.lease_id
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date BETWEEN p_period_start AND p_period_end
      AND lease.property_id IS DISTINCT FROM deposit.property_id
  ),
  diagnostic_rows AS (
    SELECT violation.stable_key, violation.payload
    FROM scope_violation_rows violation

    UNION ALL

    SELECT
      'MANUAL_LEDGER_ROW:' || ledger.id::text AS stable_key,
      jsonb_build_object(
        'issueCode', 'MANUAL_LEDGER_ROW',
        'severity', 'Critical',
        'organizationId', ledger.organization_id,
        'propertyId', ledger.property_id,
        'unitId', ledger.unit_id,
        'sourceType', 'ledger_entry',
        'sourceId', ledger.id,
        'ledgerEntryId', ledger.id,
        'sourceReference', 'public.ledger_entries',
        'eventDate', ledger.transaction_date,
        'currency', ledger.currency,
        'ledgerAmount', to_char(ledger.amount, 'FM999999999999990.00'),
        'reconciliationSourceState', 'missing',
        'affectedSurfaces', jsonb_build_array('ledger', 'property_performance', 'unit_performance', 'income_and_expense', 'property_records'),
        'affectedEconomicArea', 'operational_ledger',
        'explanation', 'Ledger row has no domain-owned source identity.',
        'proposedResolutionClass', 'unsupported_current_source'
      ) AS payload
    FROM public.ledger_entries ledger
    WHERE ledger.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND ledger.currency = p_currency
      AND ledger.transaction_date BETWEEN p_period_start AND p_period_end
      AND (ledger.source_type = 'manual' OR ledger.source_id IS NULL)

    UNION ALL

    SELECT
      issue_code || ':' || allocation.id::text,
      jsonb_build_object(
        'issueCode', issue_code,
        'severity', 'High',
        'organizationId', allocation.organization_id,
        'propertyId', receipt.property_id,
        'obligationId', allocation.income_item_id,
        'sourceType', 'receipt_allocation',
        'sourceId', allocation.id,
        'parentTransactionId', receipt.id,
        'sourceReference', 'public.finance_receipt_allocations',
        'eventDate', receipt.received_date,
        'currency', receipt.currency,
        'settlementAmount', to_char(allocation.amount, 'FM999999999999990.00'),
        'reconciliationSourceState', 'missing_exact_projection',
        'affectedSurfaces', jsonb_build_array('owner_statement', 'ledger', 'accounting_health'),
        'affectedEconomicArea', 'operating_cash',
        'explanation', CASE issue_code
          WHEN 'RECEIPT_ALLOCATION_MISSING_LEDGER' THEN 'Receipt allocation has no exact settlement-identity Ledger projection.'
          ELSE 'Receipt allocation has no exact settlement-identity journal projection.'
        END,
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.finance_receipt_allocations allocation
    JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
    CROSS JOIN (VALUES
      ('RECEIPT_ALLOCATION_MISSING_LEDGER'),
      ('RECEIPT_ALLOCATION_MISSING_JOURNAL')
    ) issue(issue_code)
    WHERE allocation.organization_id = p_organization_id
      AND receipt.property_id = p_property_id
      AND receipt.currency = p_currency
      AND receipt.received_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      issue_code || ':' || allocation.id::text,
      jsonb_build_object(
        'issueCode', issue_code,
        'severity', 'High',
        'organizationId', allocation.organization_id,
        'propertyId', payment.property_id,
        'obligationId', allocation.expense_item_id,
        'sourceType', 'payment_allocation',
        'sourceId', allocation.id,
        'parentTransactionId', payment.id,
        'sourceReference', 'public.finance_payment_allocations',
        'eventDate', payment.paid_date,
        'currency', payment.currency,
        'settlementAmount', to_char(allocation.amount, 'FM999999999999990.00'),
        'reconciliationSourceState', 'missing_exact_projection',
        'affectedSurfaces', jsonb_build_array('owner_statement', 'ledger', 'accounting_health'),
        'affectedEconomicArea', 'operating_expense',
        'explanation', CASE issue_code
          WHEN 'PAYMENT_ALLOCATION_MISSING_LEDGER' THEN 'Payment allocation has no exact settlement-identity Ledger projection.'
          ELSE 'Payment allocation has no exact settlement-identity journal projection.'
        END,
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.finance_payment_allocations allocation
    JOIN public.finance_payments payment ON payment.id = allocation.payment_id
    CROSS JOIN (VALUES
      ('PAYMENT_ALLOCATION_MISSING_LEDGER'),
      ('PAYMENT_ALLOCATION_MISSING_JOURNAL')
    ) issue(issue_code)
    WHERE allocation.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.paid_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'BACKFILL_INFERRED_DATE:income_obligation:' || income.id::text,
      jsonb_build_object(
        'issueCode', 'BACKFILL_INFERRED_DATE',
        'severity', 'High',
        'organizationId', income.organization_id,
        'propertyId', income.property_id,
        'unitId', income.unit_id,
        'leaseId', income.lease_id,
        'obligationId', income.id,
        'sourceType', 'income_obligation',
        'sourceId', income.id,
        'sourceReference', 'public.finance_income_items/reference=BACKFILL-INCOME-*',
        'eventDate', income.received_date,
        'obligationDate', income.due_date,
        'dueOrInvoiceDate', income.due_date,
        'inferredDateState', 'inferred_due_date_fallback',
        'currency', income.currency,
        'obligationAmount', to_char(income.amount_due, 'FM999999999999990.00'),
        'settlementAmount', to_char(income.amount_received, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'operating_income',
        'explanation', 'BACKFILL income uses a due-date fallback where an evidenced cash date is unavailable.',
        'proposedResolutionClass', 'inferred_date_requires_evidence'
      )
    FROM public.finance_income_items income
    WHERE income.organization_id = p_organization_id
      AND income.property_id = p_property_id
      AND income.currency = p_currency
      AND income.due_date BETWEEN p_period_start AND p_period_end
      AND income.reference LIKE 'BACKFILL-INCOME-%'
      AND income.received_date = income.due_date

    UNION ALL

    SELECT
      'BACKFILL_INFERRED_DATE:expense_obligation:' || expense.id::text,
      jsonb_build_object(
        'issueCode', 'BACKFILL_INFERRED_DATE',
        'severity', 'High',
        'organizationId', expense.organization_id,
        'propertyId', expense.property_id,
        'unitId', expense.unit_id,
        'taskId', expense.task_id,
        'vendorPersonId', expense.vendor_person_id,
        'obligationId', expense.id,
        'sourceType', 'expense_obligation',
        'sourceId', expense.id,
        'sourceReference', 'public.finance_expense_items/reference=BACKFILL-EXPENSE-*',
        'eventDate', expense.paid_date,
        'obligationDate', expense.invoice_date,
        'dueOrInvoiceDate', expense.invoice_date,
        'inferredDateState', 'inferred_invoice_date_fallback',
        'currency', expense.currency,
        'obligationAmount', to_char(expense.amount, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'operating_expense',
        'explanation', 'BACKFILL expense uses an invoice-date fallback where an evidenced cash date is unavailable.',
        'proposedResolutionClass', 'inferred_date_requires_evidence'
      )
    FROM public.finance_expense_items expense
    WHERE expense.organization_id = p_organization_id
      AND expense.property_id = p_property_id
      AND expense.currency = p_currency
      AND expense.invoice_date BETWEEN p_period_start AND p_period_end
      AND expense.reference LIKE 'BACKFILL-EXPENSE-%'
      AND expense.paid_date = expense.invoice_date

    UNION ALL

    SELECT
      'MAINTENANCE_TASK_LEDGER_LINK_ONLY:' || task.id::text,
      jsonb_build_object(
        'issueCode', 'MAINTENANCE_TASK_LEDGER_LINK_ONLY',
        'severity', 'High',
        'organizationId', task.organization_id,
        'propertyId', task.property_id,
        'unitId', task.unit_id,
        'taskId', task.id,
        'sourceType', 'maintenance_task',
        'sourceId', task.id,
        'ledgerEntryId', task.ledger_entry_id,
        'sourceReference', 'public.tasks.ledger_entry_id',
        'eventDate', coalesce(task.completed_at::date, task.updated_at::date),
        'currency', task.actual_cost_currency,
        'ledgerAmount', to_char(task.actual_cost_amount, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('maintenance', 'ledger', 'property_performance'),
        'affectedEconomicArea', 'maintenance',
        'explanation', 'Maintenance financial effect is linked only through tasks.ledger_entry_id.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.tasks task
    WHERE task.organization_id = p_organization_id
      AND task.property_id = p_property_id
      AND task.actual_cost_currency = p_currency
      AND task.ledger_entry_id IS NOT NULL
      AND coalesce(task.completed_at::date, task.updated_at::date)
        BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      CASE WHEN petty.ledger_entry_id IS NULL
        THEN 'PETTY_CASH_PROJECTION_MISSING:'
        ELSE 'PETTY_CASH_INFERRED_DISBURSEMENT_DATE:'
      END || petty.id::text,
      jsonb_build_object(
        'issueCode', CASE WHEN petty.ledger_entry_id IS NULL
          THEN 'PETTY_CASH_PROJECTION_MISSING'
          ELSE 'PETTY_CASH_INFERRED_DISBURSEMENT_DATE'
        END,
        'severity', 'High',
        'organizationId', petty.organization_id,
        'propertyId', petty.property_id,
        'unitId', petty.unit_id,
        'sourceType', 'petty_cash_entry',
        'sourceId', petty.id,
        'ledgerEntryId', petty.ledger_entry_id,
        'sourceReference', 'public.petty_cash_entries',
        'eventDate', coalesce(petty.clear_date, petty.invoice_date),
        'dueOrInvoiceDate', petty.invoice_date,
        'inferredDateState', CASE WHEN petty.clear_date IS NULL
          THEN 'invoice_date_without_disbursement_evidence'
          ELSE 'not_inferred'
        END,
        'currency', petty.currency,
        'obligationAmount', to_char(petty.out_amount, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('petty_cash', 'ledger', 'finance_close'),
        'affectedEconomicArea', 'petty_cash',
        'explanation', CASE WHEN petty.ledger_entry_id IS NULL
          THEN 'Cleared petty-cash expense has no Ledger projection.'
          ELSE 'Petty-cash posting uses invoice date because a disbursement date is unproven.'
        END,
        'proposedResolutionClass', CASE WHEN petty.clear_date IS NULL
          THEN 'inferred_date_requires_evidence'
          ELSE 'ambiguous_requires_resolution'
        END
      )
    FROM public.petty_cash_entries petty
    WHERE petty.organization_id = p_organization_id
      AND petty.property_id = p_property_id
      AND petty.currency = p_currency
      AND petty.invoice_date BETWEEN p_period_start AND p_period_end
      AND petty.status IN ('cleared', 'posted')
      AND (petty.ledger_entry_id IS NULL OR petty.clear_date IS NULL)

    UNION ALL

    SELECT
      'JOURNAL_WITHOUT_OPERATIONAL_SOURCE:' || journal.id::text,
      jsonb_build_object(
        'issueCode', 'JOURNAL_WITHOUT_OPERATIONAL_SOURCE',
        'severity', 'High',
        'organizationId', journal.organization_id,
        'propertyId', p_property_id,
        'journalId', journal.id,
        'sourceType', 'journal_entry',
        'sourceId', journal.id,
        'parentTransactionId', journal.source_id,
        'sourceReference', 'public.accounting_journal_entries',
        'eventDate', journal.entry_date,
        'currency', journal.currency,
        'affectedSurfaces', jsonb_build_array('accounting_health'),
        'affectedEconomicArea', 'accounting_control',
        'explanation', 'Journal source does not resolve to a current domain obligation or Ledger source.',
        'proposedResolutionClass', 'unsupported_current_source'
      )
    FROM public.accounting_journal_entries journal
    WHERE journal.organization_id = p_organization_id
      AND journal.currency = p_currency
      AND journal.entry_date BETWEEN p_period_start AND p_period_end
      AND EXISTS (
        SELECT 1 FROM public.accounting_journal_lines line
        WHERE line.journal_entry_id = journal.id AND line.property_id = p_property_id
      )
      AND journal.legacy_ledger_entry_id IS NULL
      AND journal.source_type NOT IN ('finance_income', 'finance_expense', 'petty_cash')

    UNION ALL

    SELECT
      'OWNERSHIP_INVALID_ON_RELEVANT_DATE:' || p_property_id::text || ':' || relevant.relevant_date::text,
      jsonb_build_object(
        'issueCode', 'OWNERSHIP_INVALID_ON_RELEVANT_DATE',
        'severity', 'Critical',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'property_ownership',
        'sourceId', p_property_id,
        'sourceReference', 'public.property_owners',
        'eventDate', relevant.relevant_date,
        'affectedSurfaces', jsonb_build_array('owner_statement'),
        'affectedEconomicArea', 'ownership',
        'explanation', 'IPS requires exactly one property owner at 100 percent on every financially relevant date and at period end.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM relevant_dates relevant
    WHERE (
      SELECT count(*) <> 1
        OR coalesce(sum(owner.ownership_percent), 0) <> 100
      FROM public.property_owners owner
      WHERE owner.organization_id = p_organization_id
        AND owner.property_id = p_property_id
        AND coalesce(owner.started_on, '-infinity'::date) <= relevant.relevant_date
        AND coalesce(owner.ended_on, 'infinity'::date) >= relevant.relevant_date
    )

    UNION ALL

    SELECT
      'REPORT_TOTAL_CONTRADICTION:' || p_property_id::text || ':' || p_period_start::text,
      jsonb_build_object(
        'issueCode', 'REPORT_TOTAL_CONTRADICTION',
        'severity', 'Critical',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'cross_report_total',
        'sourceId', p_property_id,
        'sourceReference', 'receipt/payment allocations versus public.ledger_entries',
        'eventDate', p_period_end,
        'currency', p_currency,
        'settlementAmount', to_char(coalesce((
          SELECT sum(
            CASE WHEN receipt.reversal_of_id IS NULL
              THEN allocation.amount ELSE -allocation.amount END
          )
          FROM public.finance_receipt_allocations allocation
          JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
          WHERE allocation.organization_id = p_organization_id
            AND receipt.property_id = p_property_id
            AND receipt.currency = p_currency
            AND receipt.received_date BETWEEN p_period_start AND p_period_end
        ), 0) - coalesce((
          SELECT sum(
            CASE WHEN payment.reversal_of_id IS NULL
              THEN allocation.amount ELSE -allocation.amount END
          )
          FROM public.finance_payment_allocations allocation
          JOIN public.finance_payments payment ON payment.id = allocation.payment_id
          WHERE allocation.organization_id = p_organization_id
            AND payment.property_id = p_property_id
            AND payment.currency = p_currency
            AND payment.paid_date BETWEEN p_period_start AND p_period_end
        ), 0), 'FM999999999999990.00'),
        'ledgerAmount', to_char(coalesce((
          SELECT sum(CASE ledger.direction WHEN 'income' THEN ledger.amount ELSE -ledger.amount END)
          FROM public.ledger_entries ledger
          WHERE ledger.organization_id = p_organization_id
            AND ledger.property_id = p_property_id
            AND ledger.currency = p_currency
            AND ledger.archived_at IS NULL
            AND ledger.transaction_date BETWEEN p_period_start AND p_period_end
        ), 0), 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'ledger', 'property_performance', 'unit_performance', 'income_and_expense', 'property_records'),
        'affectedEconomicArea', 'cross_report_parity',
        'explanation', 'Current settlement cash total and operational Ledger total disagree for the selected property and period.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    WHERE coalesce((
      SELECT sum(
        CASE WHEN receipt.reversal_of_id IS NULL
          THEN allocation.amount ELSE -allocation.amount END
      )
      FROM public.finance_receipt_allocations allocation
      JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
      WHERE allocation.organization_id = p_organization_id
        AND receipt.property_id = p_property_id
        AND receipt.currency = p_currency
        AND receipt.received_date BETWEEN p_period_start AND p_period_end
    ), 0) - coalesce((
      SELECT sum(
        CASE WHEN payment.reversal_of_id IS NULL
          THEN allocation.amount ELSE -allocation.amount END
      )
      FROM public.finance_payment_allocations allocation
      JOIN public.finance_payments payment ON payment.id = allocation.payment_id
      WHERE allocation.organization_id = p_organization_id
        AND payment.property_id = p_property_id
        AND payment.currency = p_currency
        AND payment.paid_date BETWEEN p_period_start AND p_period_end
    ), 0) <> coalesce((
      SELECT sum(CASE ledger.direction WHEN 'income' THEN ledger.amount ELSE -ledger.amount END)
      FROM public.ledger_entries ledger
      WHERE ledger.organization_id = p_organization_id
        AND ledger.property_id = p_property_id
        AND ledger.currency = p_currency
        AND ledger.archived_at IS NULL
        AND ledger.transaction_date BETWEEN p_period_start AND p_period_end
    ), 0)

    UNION ALL

    SELECT
      issue_code || ':income_obligation:' || income.id::text,
      jsonb_build_object(
        'issueCode', issue_code,
        'severity', severity,
        'organizationId', income.organization_id,
        'propertyId', income.property_id,
        'unitId', income.unit_id,
        'leaseId', income.lease_id,
        'obligationId', income.id,
        'sourceType', 'income_obligation',
        'sourceId', income.id,
        'ledgerEntryId', income.ledger_entry_id,
        'sourceReference', 'public.finance_income_items',
        'eventDate', income.received_date,
        'obligationDate', income.due_date,
        'currency', income.currency,
        'obligationAmount', to_char(income.amount_due, 'FM999999999999990.00'),
        'settlementAmount', to_char(income.amount_received, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash', 'ledger', 'accounting_health'),
        'affectedEconomicArea', economic_area,
        'explanation', explanation,
        'proposedResolutionClass', proposal
      )
    FROM public.finance_income_items income
    CROSS JOIN LATERAL (
      VALUES
        (
          'OBLIGATION_COMPATIBILITY_MISMATCH',
          'High',
          'operating_income',
          'Compatibility amount or status does not equal current receipt-allocation evidence.',
          'ambiguous_requires_resolution'
        )
    ) issue(issue_code, severity, economic_area, explanation, proposal)
    WHERE income.organization_id = p_organization_id
      AND income.property_id = p_property_id
      AND income.currency = p_currency
      AND income.due_date BETWEEN p_period_start AND p_period_end
      AND (
        income.amount_received <> coalesce((
          SELECT sum(
            CASE WHEN receipt.reversal_of_id IS NULL
              THEN allocation.amount ELSE -allocation.amount END
          )
          FROM public.finance_receipt_allocations allocation
          JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
          WHERE allocation.income_item_id = income.id
        ), 0)
        OR (income.status IN ('received', 'posted') AND income.amount_received < income.amount_due)
      )

    UNION ALL

    SELECT
      'OBLIGATION_LEVEL_POSTING_MULTI_SETTLEMENT:income_obligation:' || income.id::text,
      jsonb_build_object(
        'issueCode', 'OBLIGATION_LEVEL_POSTING_MULTI_SETTLEMENT',
        'severity', 'High',
        'organizationId', income.organization_id,
        'propertyId', income.property_id,
        'unitId', income.unit_id,
        'leaseId', income.lease_id,
        'obligationId', income.id,
        'sourceType', 'income_obligation',
        'sourceId', income.id,
        'ledgerEntryId', income.ledger_entry_id,
        'sourceReference', 'public.finance_income_items.ledger_entry_id',
        'eventDate', income.received_date,
        'currency', income.currency,
        'obligationAmount', to_char(income.amount_due, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'ledger', 'accounting_health'),
        'affectedEconomicArea', 'operating_income',
        'explanation', 'One obligation-level posting link cannot represent multiple receipt settlement events.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.finance_income_items income
    WHERE income.organization_id = p_organization_id
      AND income.property_id = p_property_id
      AND income.currency = p_currency
      AND income.due_date BETWEEN p_period_start AND p_period_end
      AND 1 < (
        SELECT count(DISTINCT allocation.receipt_id)
        FROM public.finance_receipt_allocations allocation
        JOIN public.finance_receipts receipt
          ON receipt.id = allocation.receipt_id
        WHERE allocation.income_item_id = income.id
          AND receipt.reversal_of_id IS NULL
      )

    UNION ALL

    SELECT
      'OBLIGATION_COMPATIBILITY_MISMATCH:expense_obligation:' || expense.id::text,
      jsonb_build_object(
        'issueCode', 'OBLIGATION_COMPATIBILITY_MISMATCH',
        'severity', 'High',
        'organizationId', expense.organization_id,
        'propertyId', expense.property_id,
        'unitId', expense.unit_id,
        'taskId', expense.task_id,
        'vendorPersonId', expense.vendor_person_id,
        'obligationId', expense.id,
        'sourceType', 'expense_obligation',
        'sourceId', expense.id,
        'ledgerEntryId', expense.ledger_entry_id,
        'sourceReference', 'public.finance_expense_items versus signed finance_payment_allocations',
        'eventDate', expense.paid_date,
        'obligationDate', expense.invoice_date,
        'dueOrInvoiceDate', coalesce(expense.due_date, expense.invoice_date),
        'currency', expense.currency,
        'obligationAmount', to_char(expense.amount, 'FM999999999999990.00'),
        'settlementAmount', to_char(payment_evidence.net_paid, 'FM999999999999990.00'),
        'status', expense.status,
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash', 'ledger', 'accounting_health'),
        'affectedEconomicArea', CASE
          WHEN expense.expense_type = 'owner_payout' THEN 'owner_payout'
          ELSE expense.economic_scope
        END,
        'explanation', 'Expense compatibility status or paid date does not match exact signed payment-allocation evidence.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.finance_expense_items expense
    CROSS JOIN LATERAL (
      SELECT coalesce(sum(
        CASE WHEN payment.reversal_of_id IS NULL
          THEN allocation.amount ELSE -allocation.amount END
      ), 0) AS net_paid
      FROM public.finance_payment_allocations allocation
      JOIN public.finance_payments payment ON payment.id = allocation.payment_id
      WHERE allocation.expense_item_id = expense.id
    ) payment_evidence
    WHERE expense.organization_id = p_organization_id
      AND expense.property_id = p_property_id
      AND expense.currency = p_currency
      AND expense.invoice_date BETWEEN p_period_start AND p_period_end
      AND (
        (expense.status = 'paid') IS DISTINCT FROM
          (payment_evidence.net_paid >= expense.amount)
        OR (expense.paid_date IS NOT NULL) IS DISTINCT FROM
          (payment_evidence.net_paid > 0)
      )

    UNION ALL

    SELECT
      'OBLIGATION_LEVEL_POSTING_MULTI_SETTLEMENT:expense_obligation:' || expense.id::text,
      jsonb_build_object(
        'issueCode', 'OBLIGATION_LEVEL_POSTING_MULTI_SETTLEMENT',
        'severity', 'High',
        'organizationId', expense.organization_id,
        'propertyId', expense.property_id,
        'unitId', expense.unit_id,
        'taskId', expense.task_id,
        'vendorPersonId', expense.vendor_person_id,
        'obligationId', expense.id,
        'sourceType', 'expense_obligation',
        'sourceId', expense.id,
        'ledgerEntryId', expense.ledger_entry_id,
        'sourceReference', 'public.finance_expense_items.ledger_entry_id',
        'eventDate', expense.paid_date,
        'obligationDate', expense.invoice_date,
        'currency', expense.currency,
        'obligationAmount', to_char(expense.amount, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'ledger', 'accounting_health'),
        'affectedEconomicArea', CASE
          WHEN expense.expense_type = 'owner_payout' THEN 'owner_payout'
          ELSE expense.economic_scope
        END,
        'explanation', 'One obligation-level posting link cannot represent multiple payment settlement events.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.finance_expense_items expense
    WHERE expense.organization_id = p_organization_id
      AND expense.property_id = p_property_id
      AND expense.currency = p_currency
      AND expense.invoice_date BETWEEN p_period_start AND p_period_end
      AND 1 < (
        SELECT count(DISTINCT allocation.payment_id)
        FROM public.finance_payment_allocations allocation
        JOIN public.finance_payments payment
          ON payment.id = allocation.payment_id
        WHERE allocation.expense_item_id = expense.id
          AND payment.reversal_of_id IS NULL
      )

    UNION ALL

    SELECT
      issue_code || ':income_obligation:' || income.id::text,
      jsonb_build_object(
        'issueCode', issue_code,
        'severity', 'High',
        'organizationId', income.organization_id,
        'propertyId', income.property_id,
        'obligationId', income.id,
        'sourceType', 'income_obligation',
        'sourceId', income.id,
        'sourceReference', 'public.finance_income_items',
        'eventDate', income.received_date,
        'currency', income.currency,
        'obligationAmount', to_char(income.amount_due, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash', 'ledger'),
        'affectedEconomicArea', economic_area,
        'explanation', explanation,
        'proposedResolutionClass', 'unsupported_current_source'
      )
    FROM public.finance_income_items income
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN income.income_type = 'owner_contribution' THEN 'OWNER_CONTRIBUTION_DUAL_AUTHORITY'
          WHEN income.reference LIKE 'MANAGEMENT-FEE-%' THEN 'MANAGEMENT_FEE_WITHOUT_AGREEMENT'
        END AS issue_code,
        CASE
          WHEN income.income_type = 'owner_contribution' THEN 'owner_contribution'
          ELSE 'management_fee'
        END AS economic_area,
        CASE
          WHEN income.income_type = 'owner_contribution'
            THEN 'Owner contribution is available through a compatibility obligation and generic Ledger authority.'
          ELSE 'Management-fee compatibility obligation has no reproducible agreement or assessment evidence.'
        END AS explanation
    ) issue
    WHERE income.organization_id = p_organization_id
      AND income.property_id = p_property_id
      AND income.currency = p_currency
      AND income.due_date BETWEEN p_period_start AND p_period_end
      AND issue.issue_code IS NOT NULL

    UNION ALL

    SELECT
      'OWNER_PAYOUT_WITHOUT_DISTRIBUTION_AUTHORITY:' || expense.id::text,
      jsonb_build_object(
        'issueCode', 'OWNER_PAYOUT_WITHOUT_DISTRIBUTION_AUTHORITY',
        'severity', 'Critical',
        'organizationId', expense.organization_id,
        'propertyId', expense.property_id,
        'obligationId', expense.id,
        'sourceType', 'expense_obligation',
        'sourceId', expense.id,
        'sourceReference', 'public.finance_expense_items',
        'eventDate', expense.paid_date,
        'dueOrInvoiceDate', expense.invoice_date,
        'currency', expense.currency,
        'obligationAmount', to_char(expense.amount, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'owner_payout',
        'explanation', 'Owner payout compatibility state exists without controlled distribution authority.',
        'proposedResolutionClass', 'unsupported_current_source'
      )
    FROM public.finance_expense_items expense
    WHERE expense.organization_id = p_organization_id
      AND expense.property_id = p_property_id
      AND expense.currency = p_currency
      AND expense.invoice_date BETWEEN p_period_start AND p_period_end
      AND expense.expense_type = 'owner_payout'

    UNION ALL

    SELECT
      'SOURCE_LINKED_LEDGER_WITHOUT_SETTLEMENT_IDENTITY:ledger_entry:' || ledger.id::text,
      jsonb_build_object(
        'issueCode', 'SOURCE_LINKED_LEDGER_WITHOUT_SETTLEMENT_IDENTITY',
        'severity', 'High',
        'organizationId', ledger.organization_id,
        'propertyId', ledger.property_id,
        'unitId', ledger.unit_id,
        'sourceType', 'ledger_entry',
        'sourceId', ledger.id,
        'parentTransactionId', ledger.source_id,
        'typedProjectionSource', ledger.source_type,
        'ledgerEntryId', ledger.id,
        'sourceReference', 'public.ledger_entries.source_type/source_id',
        'eventDate', ledger.transaction_date,
        'currency', ledger.currency,
        'ledgerAmount', to_char(ledger.amount, 'FM999999999999990.00'),
        'reconciliationSourceState', 'obligation_identity_without_settlement_identity',
        'affectedSurfaces', jsonb_build_array('ledger', 'owner_statement', 'accounting_health'),
        'affectedEconomicArea', 'reconciliation',
        'explanation', 'Domain-linked Ledger row identifies an obligation or workflow row, but the current schema cannot identify the exact receipt or payment allocation settlement.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.ledger_entries ledger
    WHERE ledger.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND ledger.currency = p_currency
      AND ledger.transaction_date BETWEEN p_period_start AND p_period_end
      AND ledger.source_id IS NOT NULL
      AND ledger.source_type IN ('finance_income', 'finance_expense')

    UNION ALL

    SELECT
      'MAINTENANCE_BILL_DUPLICATE_EXACT_TASK:maintenance_task:' || task.id::text,
      jsonb_build_object(
        'issueCode', 'MAINTENANCE_BILL_DUPLICATE_EXACT_TASK',
        'severity', 'Critical',
        'organizationId', task.organization_id,
        'propertyId', task.property_id,
        'unitId', task.unit_id,
        'taskId', task.id,
        'obligationId', expense.id,
        'sourceType', 'maintenance_task',
        'sourceId', task.id,
        'ledgerEntryId', task.ledger_entry_id,
        'sourceReference', 'public.finance_expense_items.task_id=public.tasks.id',
        'eventDate', coalesce(task.completed_at::date, task.updated_at::date),
        'currency', task.actual_cost_currency,
        'obligationAmount', to_char(expense.amount, 'FM999999999999990.00'),
        'ledgerAmount', to_char(ledger.amount, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('maintenance', 'bills_and_expenses', 'ledger'),
        'affectedEconomicArea', 'maintenance',
        'explanation', 'The same exact task has a direct Ledger effect and a finance bill. This is duplicate-risk evidence; Plan 01 does not choose or repair either source.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.tasks task
    JOIN public.finance_expense_items expense
      ON expense.organization_id = task.organization_id
     AND expense.task_id = task.id
    JOIN public.ledger_entries ledger
      ON ledger.id = task.ledger_entry_id
    WHERE task.organization_id = p_organization_id
      AND task.property_id = p_property_id
      AND task.actual_cost_currency = p_currency
      AND coalesce(task.completed_at::date, task.updated_at::date)
        BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'PETTY_CASH_BILL_DUPLICATE_EXACT_LEDGER:petty_cash_entry:' || petty.id::text,
      jsonb_build_object(
        'issueCode', 'PETTY_CASH_BILL_DUPLICATE_EXACT_LEDGER',
        'severity', 'Critical',
        'organizationId', petty.organization_id,
        'propertyId', petty.property_id,
        'unitId', petty.unit_id,
        'obligationId', expense.id,
        'sourceType', 'petty_cash_entry',
        'sourceId', petty.id,
        'ledgerEntryId', petty.ledger_entry_id,
        'sourceReference', 'public.petty_cash_entries.ledger_entry_id=public.finance_expense_items.ledger_entry_id',
        'eventDate', coalesce(petty.clear_date, petty.invoice_date),
        'currency', petty.currency,
        'affectedSurfaces', jsonb_build_array('petty_cash', 'bills_and_expenses', 'ledger'),
        'affectedEconomicArea', 'petty_cash',
        'explanation', 'Petty cash and a finance bill point to the same exact Ledger row.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.petty_cash_entries petty
    JOIN public.finance_expense_items expense
      ON expense.organization_id = petty.organization_id
     AND expense.ledger_entry_id = petty.ledger_entry_id
    WHERE petty.organization_id = p_organization_id
      AND petty.property_id = p_property_id
      AND petty.currency = p_currency
      AND petty.ledger_entry_id IS NOT NULL
      AND petty.invoice_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'DEPOSIT_INCOME_WITHOUT_DEPOSIT_EVENT:income_obligation:' || income.id::text,
      jsonb_build_object(
        'issueCode', 'DEPOSIT_INCOME_WITHOUT_DEPOSIT_EVENT',
        'severity', 'High',
        'organizationId', income.organization_id,
        'propertyId', income.property_id,
        'unitId', income.unit_id,
        'leaseId', income.lease_id,
        'obligationId', income.id,
        'sourceType', 'income_obligation',
        'sourceId', income.id,
        'sourceReference', 'public.finance_income_items.income_type=security_deposit',
        'eventDate', income.received_date,
        'obligationDate', income.due_date,
        'currency', income.currency,
        'obligationAmount', to_char(income.amount_due, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'rent_and_income', 'property_cash'),
        'affectedEconomicArea', 'security_deposit',
        'explanation', 'Deposit-classified income has no deposit event reachable through its exact lease identity.',
        'proposedResolutionClass', 'unsupported_current_source'
      )
    FROM public.finance_income_items income
    WHERE income.organization_id = p_organization_id
      AND income.property_id = p_property_id
      AND income.currency = p_currency
      AND income.due_date BETWEEN p_period_start AND p_period_end
      AND income.income_type = 'security_deposit'
      AND NOT EXISTS (
        SELECT 1
        FROM public.lease_deposits lease_deposit
        JOIN public.lease_deposit_events deposit
          ON deposit.lease_deposit_id = lease_deposit.id
        WHERE lease_deposit.organization_id = income.organization_id
          AND lease_deposit.lease_id = income.lease_id
          AND deposit.property_id = income.property_id
      )

    UNION ALL

    SELECT
      issue.issue_code || ':journal_entry:' || journal.id::text,
      jsonb_build_object(
        'issueCode', issue.issue_code,
        'severity', 'High',
        'organizationId', journal.organization_id,
        'propertyId', ledger.property_id,
        'unitId', ledger.unit_id,
        'sourceType', 'journal_entry',
        'sourceId', journal.id,
        'parentTransactionId', journal.source_id,
        'typedProjectionSource', journal.source_type,
        'ledgerEntryId', ledger.id,
        'journalId', journal.id,
        'sourceReference', 'public.accounting_journal_entries.legacy_ledger_entry_id',
        'eventDate', journal.entry_date,
        'currency', journal.currency,
        'ledgerAmount', to_char(ledger.amount, 'FM999999999999990.00'),
        'journalAmount', to_char(greatest(control.debit_amount, control.credit_amount), 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('ledger', 'accounting_health'),
        'affectedEconomicArea', 'accounting_control',
        'explanation', issue.explanation,
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.accounting_journal_entries journal
    JOIN public.ledger_entries ledger
      ON ledger.id = journal.legacy_ledger_entry_id
    CROSS JOIN LATERAL (
      SELECT
        coalesce(sum(line.debit_amount), 0) AS debit_amount,
        coalesce(sum(line.credit_amount), 0) AS credit_amount,
        bool_or(line.property_id IS DISTINCT FROM ledger.property_id) AS property_mismatch,
        bool_or(
          line.unit_id IS NOT NULL
          AND line.unit_id IS DISTINCT FROM ledger.unit_id
        ) AS unit_mismatch
      FROM public.accounting_journal_lines line
      WHERE line.journal_entry_id = journal.id
    ) control
    CROSS JOIN LATERAL (
      SELECT candidate.issue_code, candidate.explanation
      FROM (VALUES
        (
          'LEDGER_JOURNAL_AMOUNT_MISMATCH',
          'Ledger amount differs from the linked journal debit or credit control.'
        ),
        (
          'LEDGER_JOURNAL_DATE_MISMATCH',
          'Ledger transaction date differs from the linked journal entry date.'
        ),
        (
          'LEDGER_JOURNAL_PROPERTY_UNIT_MISMATCH',
          'Ledger property or unit differs from at least one linked journal line.'
        ),
        (
          'LEDGER_JOURNAL_SOURCE_REVERSAL_MISMATCH',
          'Ledger and linked journal source or reversal identity differs.'
        )
      ) candidate(issue_code, explanation)
      WHERE
        (candidate.issue_code = 'LEDGER_JOURNAL_AMOUNT_MISMATCH'
          AND (
            control.debit_amount <> ledger.amount
            OR control.credit_amount <> ledger.amount
          ))
        OR (candidate.issue_code = 'LEDGER_JOURNAL_DATE_MISMATCH'
          AND journal.entry_date <> ledger.transaction_date)
        OR (candidate.issue_code = 'LEDGER_JOURNAL_PROPERTY_UNIT_MISMATCH'
          AND (control.property_mismatch OR control.unit_mismatch))
        OR (candidate.issue_code = 'LEDGER_JOURNAL_SOURCE_REVERSAL_MISMATCH'
          AND (
            journal.source_type IS DISTINCT FROM ledger.source_type
            OR journal.source_id IS DISTINCT FROM ledger.source_id
            OR (journal.reversal_of_id IS NULL) IS DISTINCT FROM
              (journal.status <> 'reversed')
          ))
    ) issue
    WHERE journal.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND journal.currency = p_currency
      AND journal.entry_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'ARCHIVED_SOURCE_REMAINS_EFFECTIVE:' ||
        (source.payload ->> 'sourceType') || ':' ||
        (source.payload ->> 'sourceId'),
      jsonb_build_object(
        'issueCode', 'ARCHIVED_SOURCE_REMAINS_EFFECTIVE',
        'severity', 'High',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', source.payload ->> 'sourceType',
        'sourceId', source.payload ->> 'sourceId',
        'sourceReference', source.payload ->> 'sourceReference',
        'eventDate', source.payload ->> 'eventDate',
        'currency', source.payload ->> 'currency',
        'affectedSurfaces', source.payload -> 'affectedSurfaces',
        'affectedEconomicArea', coalesce(source.payload ->> 'economicArea', 'financial_history'),
        'explanation', 'Archived source remains financially effective in at least one current read path.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM source_rows source
    WHERE source.payload ->> 'archived' = 'true'
      AND coalesce((source.payload ->> 'amount')::numeric, 0) <> 0

    UNION ALL

    SELECT
      'MISSING_STABLE_RECONCILIATION_IDENTITY:' ||
        (source.payload ->> 'sourceType') || ':' ||
        (source.payload ->> 'sourceId'),
      jsonb_build_object(
        'issueCode', 'MISSING_STABLE_RECONCILIATION_IDENTITY',
        'severity', 'High',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', source.payload ->> 'sourceType',
        'sourceId', source.payload ->> 'sourceId',
        'parentTransactionId', source.payload ->> 'parentTransactionId',
        'sourceReference', source.payload ->> 'sourceReference',
        'eventDate', source.payload ->> 'eventDate',
        'currency', source.payload ->> 'currency',
        'reconciliationSourceState', coalesce(
          source.payload ->> 'reconciliationSourceState',
          'missing_exact_cash_identity'
        ),
        'affectedSurfaces', source.payload -> 'affectedSurfaces',
        'affectedEconomicArea', coalesce(source.payload ->> 'economicArea', 'reconciliation'),
        'explanation', 'Current source has no stable exact settlement, cash-source, or reconciliation identity.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM source_rows source
    WHERE source.payload ->> 'sourceType' IN (
      'receipt_allocation', 'payment_allocation', 'deposit_event'
    )

    UNION ALL

    SELECT
      'DUPLICATE_EXACT_SOURCE_IDENTITY:ledger_entry:' || ledger.source_type || ':' || ledger.source_id::text,
      jsonb_build_object(
        'issueCode', 'DUPLICATE_EXACT_SOURCE_IDENTITY',
        'severity', 'Critical',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'ledger_entry',
        'sourceId', ledger.source_id,
        'typedProjectionSource', ledger.source_type,
        'sourceReference', 'public.ledger_entries(source_type,source_id)',
        'eventDate', min(ledger.transaction_date),
        'currency', p_currency,
        'duplicateCount', count(*),
        'affectedSurfaces', jsonb_build_array('ledger', 'property_performance', 'unit_performance', 'income_and_expense'),
        'affectedEconomicArea', 'duplicate_effect',
        'explanation', 'More than one Ledger row uses the same exact typed source identity.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.ledger_entries ledger
    WHERE ledger.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND ledger.currency = p_currency
      AND ledger.transaction_date BETWEEN p_period_start AND p_period_end
      AND ledger.source_id IS NOT NULL
    GROUP BY ledger.source_type, ledger.source_id
    HAVING count(*) > 1

    UNION ALL

    SELECT
      'DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE:' || deposit.id::text,
      jsonb_build_object(
        'issueCode', 'DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE',
        'severity', 'High',
        'organizationId', deposit.organization_id,
        'propertyId', deposit.property_id,
        'sourceType', 'deposit_event',
        'sourceId', deposit.id,
        'parentTransactionId', deposit.lease_deposit_id,
        'leaseId', lease_deposit.lease_id,
        'sourceReference', 'public.lease_deposit_events',
        'eventDate', deposit.event_date,
        'currency', deposit.currency,
        'settlementAmount', to_char(deposit.amount, 'FM999999999999990.00'),
        'depositType', lease_deposit.deposit_type,
        'reconciliationSourceState', 'missing_exact_cash_identity',
        'nonAuthoritativeCandidateCount', (
          SELECT count(*)
          FROM (
            SELECT receipt.id
            FROM public.finance_receipts receipt
            WHERE receipt.organization_id = deposit.organization_id
              AND receipt.property_id = deposit.property_id
              AND receipt.currency = deposit.currency
              AND receipt.received_date = deposit.event_date
              AND receipt.amount = deposit.amount
            UNION ALL
            SELECT payment.id
            FROM public.finance_payments payment
            WHERE payment.organization_id = deposit.organization_id
              AND payment.property_id = deposit.property_id
              AND payment.currency = deposit.currency
              AND payment.paid_date = deposit.event_date
              AND payment.amount = deposit.amount
          ) candidates
        ),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'security_deposit',
        'explanation', 'Deposit event has no exact receipt or payment identity. Any same-date and same-amount cash row is only a non-authoritative candidate and never suppresses this diagnostic.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.lease_deposit_events deposit
    JOIN public.lease_deposits lease_deposit
      ON lease_deposit.id = deposit.lease_deposit_id
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'ARCHIVED_HISTORICAL_PARTY_OMITTED:' || owner.id::text,
      jsonb_build_object(
        'issueCode', 'ARCHIVED_HISTORICAL_PARTY_OMITTED',
        'severity', 'High',
        'organizationId', owner.organization_id,
        'propertyId', owner.property_id,
        'ownerPersonId', owner.person_id,
        'sourceType', 'property_ownership',
        'sourceId', owner.id,
        'sourceReference', 'public.property_owners/public.people',
        'eventDate', p_period_end,
        'affectedSurfaces', jsonb_build_array('owner_statement'),
        'affectedEconomicArea', 'ownership',
        'explanation', 'Archived historical owner or contact is omitted by the live Owner Statement loader.',
        'proposedResolutionClass', 'candidate_explicit_exclusion'
      )
    FROM public.property_owners owner
    JOIN public.people person ON person.id = owner.person_id
    WHERE owner.organization_id = p_organization_id
      AND owner.property_id = p_property_id
      AND coalesce(owner.started_on, '-infinity'::date) <= p_period_end
      AND coalesce(owner.ended_on, 'infinity'::date) >= p_period_start
      AND (owner.archived_at IS NOT NULL OR person.archived_at IS NOT NULL)

    UNION ALL

    SELECT
      'ARCHIVED_HISTORICAL_PARTY_OMITTED:person_contact:' || contact.id::text,
      jsonb_build_object(
        'issueCode', 'ARCHIVED_HISTORICAL_PARTY_OMITTED',
        'severity', 'High',
        'organizationId', contact.organization_id,
        'propertyId', owner.property_id,
        'ownerPersonId', owner.person_id,
        'sourceType', 'person_contact',
        'sourceId', contact.id,
        'parentTransactionId', owner.id,
        'sourceReference', 'public.person_contacts linked to historical property owner',
        'eventDate', p_period_end,
        'affectedSurfaces', jsonb_build_array('owner_statement'),
        'affectedEconomicArea', 'ownership',
        'explanation', 'Archived historical owner contact is omitted by the live Owner Statement loader; no contact value is exposed by this diagnostic.',
        'proposedResolutionClass', 'candidate_explicit_exclusion'
      )
    FROM public.property_owners owner
    JOIN public.person_contacts contact
      ON contact.organization_id = owner.organization_id
     AND contact.person_id = owner.person_id
    WHERE owner.organization_id = p_organization_id
      AND owner.property_id = p_property_id
      AND coalesce(owner.started_on, '-infinity'::date) <= p_period_end
      AND coalesce(owner.ended_on, 'infinity'::date) >= p_period_start
      AND contact.archived_at IS NOT NULL

    UNION ALL

    SELECT
      'LOCK_STATE_DISAGREEMENT:' || p_property_id::text || ':' || p_period_start::text,
      jsonb_build_object(
        'issueCode', 'LOCK_STATE_DISAGREEMENT',
        'severity', 'High',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'period_lock_state',
        'sourceId', p_property_id,
        'sourceReference', 'public.ledger_period_locks/public.accounting_periods',
        'eventDate', p_period_end,
        'ledgerLockState', CASE WHEN lock_state.ledger_locked THEN 'locked' ELSE 'open' END,
        'accountingLockState', CASE
          WHEN lock_state.accounting_period_count < lock_state.book_count THEN 'missing_for_one_or_more_books'
          WHEN lock_state.accounting_locked THEN 'locked'
          ELSE 'open'
        END,
        'propertyLockState', 'not_represented_by_current_schema',
        'affectedSurfaces', jsonb_build_array('ledger', 'accounting_health', 'finance_close'),
        'affectedEconomicArea', 'period_locking',
        'explanation', 'Property close is not represented and organization Ledger lock state disagrees with or is not uniformly represented by accounting-book periods.',
        'proposedResolutionClass', 'unsupported_current_source'
      )
    FROM LATERAL (
      SELECT
        EXISTS (
          SELECT 1
          FROM public.ledger_period_locks ledger_lock
          WHERE ledger_lock.organization_id = p_organization_id
            AND ledger_lock.period_start = date_trunc('month', p_period_start)::date
            AND ledger_lock.locked_at IS NOT NULL
        ) AS ledger_locked,
        coalesce(bool_or(period.status = 'locked'), false) AS accounting_locked,
        count(period.id)::bigint AS accounting_period_count,
        count(book.id)::bigint AS book_count
      FROM public.accounting_books book
      LEFT JOIN public.accounting_periods period
        ON period.book_id = book.id
       AND period.period_start = date_trunc('month', p_period_start)::date
      WHERE book.organization_id = p_organization_id
        AND book.currency = p_currency
        AND book.archived_at IS NULL
    ) lock_state
    WHERE lock_state.ledger_locked IS DISTINCT FROM lock_state.accounting_locked
       OR lock_state.accounting_period_count < lock_state.book_count

    UNION ALL

    SELECT
      'GENERIC_NAMESPACE_IMPERSONATION_CAPABILITY:' || capability.bypass_class || ':' || capability.function_name,
      jsonb_build_object(
        'issueCode', 'GENERIC_NAMESPACE_IMPERSONATION_CAPABILITY',
        'severity', 'Critical',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'database_function',
        'sourceId', capability.bypass_class,
        'sourceReference', capability.function_name,
        'eventDate', p_period_end,
        'executeGrantPresent', true,
        'runtimeEvidenceReference', 'supabase/tests/finance_inventory_authorization_test.sql',
        'affectedSurfaces', jsonb_build_array('ledger', 'accounting_health'),
        'affectedEconomicArea', 'financial_authority',
        'explanation', 'The authenticated database role has EXECUTE on a generic financial RPC. Runtime pgTAP evidence separately records whether private-helper grants allow or deny the call; Plan 01 changes neither path.',
        'proposedResolutionClass', 'unsupported_current_source'
      )
    FROM (VALUES
      (
        'public.create_ledger_entry(uuid,uuid,uuid,date,text,text,numeric,public.currency_code,text)',
        'generic_ledger_create'
      ),
      (
        'public.update_ledger_entry(uuid,uuid,uuid,uuid,date,text,text,numeric,public.currency_code,text)',
        'generic_ledger_update'
      ),
      (
        'public.post_accounting_journal(uuid,uuid,text,uuid,text,date,public.currency_code,text,text,jsonb)',
        'generic_journal_post'
      )
    ) capability(function_name, bypass_class)
    WHERE has_function_privilege(
      'authenticated',
      capability.function_name,
      'EXECUTE'
    )

    UNION ALL

    SELECT
      'RESERVED_NAMESPACE_IMPERSONATION_CAPABILITY:ledger_entries:UPDATE',
      jsonb_build_object(
        'issueCode', 'RESERVED_NAMESPACE_IMPERSONATION_CAPABILITY',
        'severity', 'Critical',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'table_privilege',
        'sourceId', 'public.ledger_entries',
        'sourceReference', 'authenticated UPDATE on public.ledger_entries',
        'eventDate', p_period_end,
        'affectedSurfaces', jsonb_build_array('ledger', 'accounting_health'),
        'affectedEconomicArea', 'financial_authority',
        'explanation', 'Direct authenticated UPDATE can attempt to replace Ledger source_type/source_id with a reserved domain namespace; RLS and link guards are tested separately.',
        'proposedResolutionClass', 'unsupported_current_source'
      )
    WHERE has_table_privilege(
      'authenticated',
      'public.ledger_entries',
      'UPDATE'
    )

    UNION ALL

    SELECT
      'SOURCE_LOAD_LIMIT_EXCEEDED:' || source_type,
      jsonb_build_object(
        'issueCode', 'SOURCE_LOAD_LIMIT_EXCEEDED',
        'severity', CASE WHEN row_count > 5000 THEN 'High' ELSE 'Medium' END,
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', source_type,
        'sourceId', p_property_id,
        'sourceReference', source_reference,
        'eventDate', p_period_end,
        'currency', p_currency,
        'sourceRowCount', row_count,
        'affectedSurfaces', affected_surfaces,
        'affectedEconomicArea', 'report_loading',
        'explanation', 'Current source load exceeds an existing PostgREST or report-loader bound and requires pagination.',
        'proposedResolutionClass', 'candidate_controlled_adjustment'
      )
    FROM (
      SELECT 'ledger_entry'::text AS source_type,
        'public.ledger_entries'::text AS source_reference,
        jsonb_build_array('property_performance', 'unit_performance', 'income_and_expense', 'property_records') AS affected_surfaces,
        count(*)::bigint AS row_count
      FROM public.ledger_entries
      WHERE organization_id = p_organization_id AND property_id = p_property_id
        AND currency = p_currency AND transaction_date BETWEEN p_period_start AND p_period_end
      UNION ALL
      SELECT 'owner_statement_input', 'owner statement source loaders',
        jsonb_build_array('owner_statement'),
        count(*)::bigint
      FROM source_rows
      WHERE payload ->> 'sourceType' IN ('income_obligation', 'expense_obligation', 'receipt_allocation', 'payment_allocation', 'deposit_event')
    ) counts
    WHERE row_count > 1000
  ),
  access_rows AS (
    SELECT
      'table:' || table_name || ':' || role_name || ':' || privilege_name AS stable_key,
      jsonb_build_object(
        'evidenceType', 'table_privilege',
        'object', 'public.' || table_name,
        'role', role_name,
        'privilege', privilege_name,
        'allowed', has_table_privilege(role_name, 'public.' || table_name, privilege_name),
        'currentStateOnly', true
      ) AS payload
    FROM unnest(ARRAY[
      'finance_income_items',
      'finance_expense_items',
      'finance_receipts',
      'finance_receipt_allocations',
      'finance_payments',
      'finance_payment_allocations',
      'lease_deposits',
      'lease_deposit_events',
      'ledger_entries',
      'accounting_journal_entries',
      'accounting_journal_lines',
      'tasks',
      'petty_cash_entries',
      'property_owners',
      'people',
      'person_contacts',
      'ledger_period_locks',
      'accounting_periods'
    ]) table_name
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) role_name
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name

    UNION ALL

    SELECT
      'function:' || function_name || ':' || role_name || ':EXECUTE',
      jsonb_build_object(
        'evidenceType', 'function_privilege',
        'object', function_name,
        'role', role_name,
        'privilege', 'EXECUTE',
        'allowed', has_function_privilege(role_name, function_name, 'EXECUTE'),
        'bypassClass', bypass_class,
        'currentStateOnly', true
      )
    FROM (VALUES
      ('public.create_ledger_entry(uuid,uuid,uuid,date,text,text,numeric,public.currency_code,text)', 'generic_ledger_write'),
      ('public.update_ledger_entry(uuid,uuid,uuid,uuid,date,text,text,numeric,public.currency_code,text)', 'generic_ledger_write'),
      ('public.archive_ledger_entry(uuid,uuid)', 'generic_ledger_archive'),
      ('public.post_accounting_journal(uuid,uuid,text,uuid,text,date,public.currency_code,text,text,jsonb)', 'generic_journal_post'),
      ('public.reverse_accounting_journal(uuid,uuid,date,text)', 'generic_journal_reverse')
    ) functions(function_name, bypass_class)
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) role_name

    UNION ALL

    SELECT
      'role-matrix:' || role_name,
      jsonb_build_object(
        'evidenceType', 'role_matrix',
        'role', role_name,
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'checkedWrapperPolicy', 'authenticated organization admin only',
        'observedInPgTap', true,
        'evidenceReference', 'supabase/tests/finance_inventory_authorization_test.sql',
        'currentStateOnly', true
      )
    FROM unnest(ARRAY['anonymous', 'member', 'manager', 'admin']) role_name
  ),
  watermark_dependencies AS (
    SELECT
      'source:' || source.stable_key AS dependency_key,
      source.payload AS dependency_value
    FROM source_rows source

    UNION ALL

    SELECT
      'diagnostic:' || diagnostic.stable_key,
      diagnostic.payload
    FROM diagnostic_rows diagnostic

    UNION ALL

    SELECT
      'access:' || access.stable_key,
      access.payload
    FROM access_rows access

    UNION ALL

    SELECT
      'income_obligation:' || income.id::text,
      to_jsonb(income) - 'payer_label' - 'description'
    FROM public.finance_income_items income
    WHERE income.organization_id = p_organization_id
      AND income.property_id = p_property_id
      AND income.currency = p_currency
      AND (
        income.due_date BETWEEN p_period_start AND p_period_end
        OR income.received_date BETWEEN p_period_start AND p_period_end
      )

    UNION ALL

    SELECT
      'expense_obligation:' || expense.id::text,
      to_jsonb(expense) - 'vendor_label' - 'description'
    FROM public.finance_expense_items expense
    WHERE expense.organization_id = p_organization_id
      AND expense.property_id = p_property_id
      AND expense.currency = p_currency
      AND (
        expense.invoice_date BETWEEN p_period_start AND p_period_end
        OR expense.paid_date BETWEEN p_period_start AND p_period_end
      )

    UNION ALL

    SELECT
      'receipt:' || receipt.id::text,
      to_jsonb(receipt) - 'payer_label'
    FROM public.finance_receipts receipt
    WHERE receipt.organization_id = p_organization_id
      AND receipt.property_id = p_property_id
      AND receipt.currency = p_currency
      AND receipt.received_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'receipt_allocation_dependency:' || allocation.id::text,
      to_jsonb(allocation)
    FROM public.finance_receipt_allocations allocation
    JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
    WHERE allocation.organization_id = p_organization_id
      AND receipt.property_id = p_property_id
      AND receipt.currency = p_currency
      AND receipt.received_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'payment:' || payment.id::text,
      to_jsonb(payment) - 'payee_label'
    FROM public.finance_payments payment
    WHERE payment.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.paid_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'payment_allocation_dependency:' || allocation.id::text,
      to_jsonb(allocation)
    FROM public.finance_payment_allocations allocation
    JOIN public.finance_payments payment ON payment.id = allocation.payment_id
    WHERE allocation.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.paid_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'lease_deposit:' || lease_deposit.id::text,
      to_jsonb(lease_deposit) - 'notes'
    FROM public.lease_deposits lease_deposit
    JOIN public.leases lease ON lease.id = lease_deposit.lease_id
    WHERE lease_deposit.organization_id = p_organization_id
      AND lease.property_id = p_property_id
      AND lease_deposit.currency = p_currency

    UNION ALL

    SELECT
      'deposit_event_dependency:' || deposit.id::text,
      to_jsonb(deposit)
    FROM public.lease_deposit_events deposit
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date <= p_period_end

    UNION ALL

    SELECT
      'ledger_dependency:' || ledger.id::text,
      to_jsonb(ledger) - 'description'
    FROM public.ledger_entries ledger
    WHERE ledger.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND ledger.currency = p_currency
      AND ledger.transaction_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'journal_entry_dependency:' || journal.id::text,
      to_jsonb(journal) - 'description'
    FROM public.accounting_journal_entries journal
    WHERE journal.organization_id = p_organization_id
      AND journal.currency = p_currency
      AND journal.entry_date BETWEEN p_period_start AND p_period_end
      AND EXISTS (
        SELECT 1
        FROM public.accounting_journal_lines line
        WHERE line.journal_entry_id = journal.id
          AND line.property_id = p_property_id
      )

    UNION ALL

    SELECT
      'journal_line_dependency:' || line.id::text,
      to_jsonb(line) - 'description'
    FROM public.accounting_journal_lines line
    JOIN public.accounting_journal_entries journal
      ON journal.id = line.journal_entry_id
    WHERE line.organization_id = p_organization_id
      AND line.property_id = p_property_id
      AND journal.currency = p_currency
      AND journal.entry_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'maintenance_dependency:' || task.id::text,
      to_jsonb(task) - 'title' - 'description'
    FROM public.tasks task
    WHERE task.organization_id = p_organization_id
      AND task.property_id = p_property_id
      AND (
        task.completed_at::date BETWEEN p_period_start AND p_period_end
        OR task.updated_at::date BETWEEN p_period_start AND p_period_end
      )

    UNION ALL

    SELECT
      'petty_cash_dependency:' || petty.id::text,
      to_jsonb(petty) - 'description' - 'supplier' - 'remark'
    FROM public.petty_cash_entries petty
    WHERE petty.organization_id = p_organization_id
      AND petty.property_id = p_property_id
      AND petty.currency = p_currency
      AND petty.invoice_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'ownership_dependency:' || owner.id::text,
      to_jsonb(owner)
    FROM public.property_owners owner
    WHERE owner.organization_id = p_organization_id
      AND owner.property_id = p_property_id
      AND coalesce(owner.started_on, '-infinity'::date) <= p_period_end
      AND coalesce(owner.ended_on, 'infinity'::date) >= p_period_start

    UNION ALL

    SELECT
      'owner_person_dependency:' || person.id::text,
      jsonb_build_object(
        'id', person.id,
        'organizationId', person.organization_id,
        'archivedAt', person.archived_at,
        'updatedAt', person.updated_at
      )
    FROM public.people person
    WHERE person.organization_id = p_organization_id
      AND EXISTS (
        SELECT 1
        FROM public.property_owners owner
        WHERE owner.organization_id = person.organization_id
          AND owner.person_id = person.id
          AND owner.property_id = p_property_id
          AND coalesce(owner.started_on, '-infinity'::date) <= p_period_end
          AND coalesce(owner.ended_on, 'infinity'::date) >= p_period_start
      )

    UNION ALL

    SELECT
      'owner_contact_dependency:' || contact.id::text,
      jsonb_build_object(
        'id', contact.id,
        'organizationId', contact.organization_id,
        'personId', contact.person_id,
        'contactType', contact.contact_type,
        'isPrimary', contact.is_primary,
        'archivedAt', contact.archived_at,
        'updatedAt', contact.updated_at
      )
    FROM public.person_contacts contact
    WHERE contact.organization_id = p_organization_id
      AND EXISTS (
        SELECT 1
        FROM public.property_owners owner
        WHERE owner.organization_id = contact.organization_id
          AND owner.person_id = contact.person_id
          AND owner.property_id = p_property_id
          AND coalesce(owner.started_on, '-infinity'::date) <= p_period_end
          AND coalesce(owner.ended_on, 'infinity'::date) >= p_period_start
      )

    UNION ALL

    SELECT
      'ledger_lock_dependency:' || ledger_lock.id::text,
      to_jsonb(ledger_lock)
    FROM public.ledger_period_locks ledger_lock
    WHERE ledger_lock.organization_id = p_organization_id
      AND ledger_lock.period_start = date_trunc('month', p_period_start)::date

    UNION ALL

    SELECT
      'accounting_book_dependency:' || book.id::text,
      to_jsonb(book) - 'name'
    FROM public.accounting_books book
    WHERE book.organization_id = p_organization_id
      AND book.currency = p_currency

    UNION ALL

    SELECT
      'accounting_period_dependency:' || period.id::text,
      to_jsonb(period) - 'lock_reason'
    FROM public.accounting_periods period
    JOIN public.accounting_books book ON book.id = period.book_id
    WHERE period.organization_id = p_organization_id
      AND book.currency = p_currency
      AND period.period_start = date_trunc('month', p_period_start)::date

    UNION ALL

    SELECT
      'schema_migration:' || migration.version,
      jsonb_build_object('version', migration.version)
    FROM supabase_migrations.schema_migrations migration

    UNION ALL

    SELECT
      'rls_policy:' || policy.schemaname || ':' || policy.tablename || ':' ||
        policy.policyname,
      to_jsonb(policy)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = ANY(ARRAY[
        'finance_income_items',
        'finance_expense_items',
        'finance_receipts',
        'finance_receipt_allocations',
        'finance_payments',
        'finance_payment_allocations',
        'lease_deposits',
        'lease_deposit_events',
        'ledger_entries',
        'accounting_journal_entries',
        'accounting_journal_lines',
        'tasks',
        'petty_cash_entries',
        'property_owners',
        'people',
        'person_contacts',
        'ledger_period_locks',
        'accounting_periods'
      ])

    UNION ALL

    SELECT
      'rls_table_state:' || namespace.nspname || ':' || relation.relname,
      jsonb_build_object(
        'rowSecurity', relation.relrowsecurity,
        'forceRowSecurity', relation.relforcerowsecurity
      )
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(ARRAY[
        'finance_income_items',
        'finance_expense_items',
        'finance_receipts',
        'finance_receipt_allocations',
        'finance_payments',
        'finance_payment_allocations',
        'lease_deposits',
        'lease_deposit_events',
        'ledger_entries',
        'accounting_journal_entries',
        'accounting_journal_lines',
        'tasks',
        'petty_cash_entries',
        'property_owners',
        'people',
        'person_contacts',
        'ledger_period_locks',
        'accounting_periods'
      ])

    UNION ALL

    SELECT
      'function_acl:' || namespace.nspname || ':' || routine.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')',
      jsonb_build_object(
        'acl', routine.proacl,
        'securityDefiner', routine.prosecdef,
        'configuration', routine.proconfig
      )
    FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname IN ('public', 'app_private')
      AND routine.proname = ANY(ARRAY[
        'get_finance_inventory_page',
        'create_ledger_entry',
        'update_ledger_entry',
        'archive_ledger_entry',
        'post_accounting_journal',
        'reverse_accounting_journal'
      ])

    UNION ALL

    SELECT
      'organization_member_access:' || member.id::text,
      jsonb_build_object(
        'id', member.id,
        'organizationId', member.organization_id,
        'userId', member.user_id,
        'role', member.role,
        'branchId', member.branch_id,
        'personId', member.person_id,
        'createdAt', member.created_at
      )
    FROM public.organization_members member
    WHERE member.organization_id = p_organization_id
  ),
  watermark_row AS (
    SELECT
      'watermark:' || p_organization_id::text || ':' || p_property_id::text || ':' || p_period_start::text || ':' || p_period_end::text AS stable_key,
      jsonb_build_object(
        'hash', md5(coalesce(string_agg(
          dependency.dependency_key || ':' || dependency.dependency_value::text,
          '|' ORDER BY dependency.dependency_key
        ), '')),
        'rowCount', count(*)::bigint,
        'migrationIdentity', (
          SELECT max(migration.version)
          FROM supabase_migrations.schema_migrations migration
        ),
        'schemaIdentity', (
          SELECT md5(coalesce(string_agg(migration.version, '|' ORDER BY migration.version), ''))
          FROM supabase_migrations.schema_migrations migration
        ),
        'scope', jsonb_build_object(
          'organizationId', p_organization_id,
          'propertyId', p_property_id,
          'currency', p_currency,
          'periodStart', p_period_start,
          'periodEnd', p_period_end
        )
      ) AS payload
    FROM watermark_dependencies dependency
  ),
  selected AS (
    SELECT 'sources'::text AS section, source.stable_key, source.payload
    FROM source_rows source
    WHERE p_section = 'sources'
      AND (p_source_types IS NULL OR source.payload ->> 'sourceType' = ANY(p_source_types))
    UNION ALL
    SELECT 'diagnostics', diagnostic.stable_key, diagnostic.payload
    FROM diagnostic_rows diagnostic
    WHERE p_section = 'diagnostics'
      AND (p_issue_codes IS NULL OR diagnostic.payload ->> 'issueCode' = ANY(p_issue_codes))
      AND (p_source_types IS NULL OR diagnostic.payload ->> 'sourceType' = ANY(p_source_types))
    UNION ALL
    SELECT 'access', access.stable_key, access.payload
    FROM access_rows access
    WHERE p_section = 'access'
    UNION ALL
    SELECT 'watermark', watermark.stable_key, watermark.payload
    FROM watermark_row watermark
    WHERE p_section = 'watermark'
  )
  SELECT
    'finance_inventory_v2'::text,
    selected.section,
    selected.stable_key,
    selected.payload
  FROM selected
  WHERE p_after_key IS NULL OR selected.stable_key > p_after_key
  ORDER BY selected.stable_key
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION app_private.get_finance_inventory_page(
  uuid, uuid, public.currency_code, date, date, text, text, integer, text[], text[]
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_finance_inventory_page(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date,
  p_section text,
  p_after_key text DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_issue_codes text[] DEFAULT NULL,
  p_source_types text[] DEFAULT NULL
)
RETURNS TABLE (
  contract_version text,
  section text,
  stable_key text,
  payload jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_property_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.properties property
       WHERE property.id = p_property_id
         AND property.organization_id = p_organization_id
     ) THEN
    RAISE EXCEPTION 'Property is outside the requested organization'
      USING ERRCODE = '22023';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL
     OR p_period_end < p_period_start
     OR p_period_end - p_period_start > 366 THEN
    RAISE EXCEPTION 'Invalid or unbounded finance inventory period'
      USING ERRCODE = '22023';
  END IF;

  IF p_section NOT IN ('sources', 'diagnostics', 'access', 'watermark')
     OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'Invalid finance inventory page request'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT *
  FROM app_private.get_finance_inventory_page(
    p_organization_id,
    p_property_id,
    p_currency,
    p_period_start,
    p_period_end,
    p_section,
    p_after_key,
    p_limit,
    p_issue_codes,
    p_source_types
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_inventory_page(
  uuid, uuid, public.currency_code, date, date, text, text, integer, text[], text[]
) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_finance_inventory_page(
  uuid, uuid, public.currency_code, date, date, text, text, integer, text[], text[]
) TO authenticated;

COMMENT ON FUNCTION public.get_finance_inventory_page(
  uuid, uuid, public.currency_code, date, date, text, text, integer, text[], text[]
) IS 'Read-only administrator-scoped financial inventory. Proposed resolution labels are non-authoritative diagnostics.';
