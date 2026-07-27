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
        'sourceReference', 'public.finance_receipt_allocations',
        'eventDate', receipt.received_date,
        'currency', receipt.currency,
        'amount', to_char(allocation.amount, 'FM999999999999990.00'),
        'settlementAmount', to_char(allocation.amount, 'FM999999999999990.00'),
        'reconciliationSourceState', 'allocation_has_no_stable_projection_identity',
        'economicArea', 'operating_cash',
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash')
      )
    FROM public.finance_receipt_allocations allocation
    JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
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
        'sourceReference', 'public.finance_payment_allocations',
        'eventDate', payment.paid_date,
        'currency', payment.currency,
        'amount', to_char(allocation.amount, 'FM999999999999990.00'),
        'settlementAmount', to_char(allocation.amount, 'FM999999999999990.00'),
        'direction', 'expense',
        'reconciliationSourceState', 'allocation_has_no_stable_projection_identity',
        'economicArea', 'operating_expense',
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash')
      )
    FROM public.finance_payment_allocations allocation
    JOIN public.finance_payments payment ON payment.id = allocation.payment_id
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
        'organizationId', deposit.organization_id,
        'propertyId', deposit.property_id,
        'sourceReference', 'public.lease_deposit_events',
        'eventDate', deposit.event_date,
        'currency', deposit.currency,
        'amount', to_char(deposit.amount, 'FM999999999999990.00'),
        'eventType', deposit.event_type,
        'economicArea', 'security_deposit',
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash')
      )
    FROM public.lease_deposit_events deposit
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date BETWEEN p_period_start AND p_period_end

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
  diagnostic_rows AS (
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
      'BACKFILL_INFERRED_DATE:' || income.id::text,
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
      'BACKFILL_INFERRED_DATE:' || expense.id::text,
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
      'OWNERSHIP_INVALID_OR_AMBIGUOUS:' || p_property_id::text,
      jsonb_build_object(
        'issueCode', 'OWNERSHIP_INVALID_OR_AMBIGUOUS',
        'severity', 'Critical',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'property_ownership',
        'sourceId', p_property_id,
        'sourceReference', 'public.property_owners',
        'eventDate', p_period_end,
        'affectedSurfaces', jsonb_build_array('owner_statement'),
        'affectedEconomicArea', 'ownership',
        'explanation', 'Ownership on the reporting date is missing, overlapping, or does not total 100 percent.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    WHERE (
      SELECT count(*) <> 1
        OR coalesce(sum(owner.ownership_percent), 0) <> 100
      FROM public.property_owners owner
      WHERE owner.organization_id = p_organization_id
        AND owner.property_id = p_property_id
        AND owner.archived_at IS NULL
        AND coalesce(owner.started_on, '-infinity'::date) <= p_period_end
        AND coalesce(owner.ended_on, 'infinity'::date) >= p_period_end
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
          SELECT sum(allocation.amount)
          FROM public.finance_receipt_allocations allocation
          JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
          WHERE allocation.organization_id = p_organization_id
            AND receipt.property_id = p_property_id
            AND receipt.currency = p_currency
            AND receipt.received_date BETWEEN p_period_start AND p_period_end
        ), 0) - coalesce((
          SELECT sum(allocation.amount)
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
      SELECT sum(allocation.amount)
      FROM public.finance_receipt_allocations allocation
      JOIN public.finance_receipts receipt ON receipt.id = allocation.receipt_id
      WHERE allocation.organization_id = p_organization_id
        AND receipt.property_id = p_property_id
        AND receipt.currency = p_currency
        AND receipt.received_date BETWEEN p_period_start AND p_period_end
    ), 0) - coalesce((
      SELECT sum(allocation.amount)
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
      issue_code || ':' || income.id::text,
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
          SELECT sum(allocation.amount)
          FROM public.finance_receipt_allocations allocation
          WHERE allocation.income_item_id = income.id
        ), 0)
        OR (income.status IN ('received', 'posted') AND income.amount_received < income.amount_due)
      )

    UNION ALL

    SELECT
      'OBLIGATION_LEVEL_POSTING_MULTI_SETTLEMENT:' || income.id::text,
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
        WHERE allocation.income_item_id = income.id
      )

    UNION ALL

    SELECT
      issue_code || ':' || income.id::text,
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
      'DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE:' || deposit.id::text,
      jsonb_build_object(
        'issueCode', 'DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE',
        'severity', 'High',
        'organizationId', deposit.organization_id,
        'propertyId', deposit.property_id,
        'sourceType', 'deposit_event',
        'sourceId', deposit.id,
        'parentTransactionId', deposit.lease_deposit_id,
        'sourceReference', 'public.lease_deposit_events',
        'eventDate', deposit.event_date,
        'currency', deposit.currency,
        'settlementAmount', to_char(deposit.amount, 'FM999999999999990.00'),
        'affectedSurfaces', jsonb_build_array('owner_statement', 'property_cash'),
        'affectedEconomicArea', 'security_deposit',
        'explanation', 'Deposit event has no supported receipt or payment cash evidence with the same property, date, currency, and amount.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM public.lease_deposit_events deposit
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date BETWEEN p_period_start AND p_period_end
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_receipts receipt
        WHERE receipt.organization_id = deposit.organization_id
          AND receipt.property_id = deposit.property_id
          AND receipt.currency = deposit.currency
          AND receipt.received_date = deposit.event_date
          AND receipt.amount = deposit.amount
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_payments payment
        WHERE payment.organization_id = deposit.organization_id
          AND payment.property_id = deposit.property_id
          AND payment.currency = deposit.currency
          AND payment.paid_date = deposit.event_date
          AND payment.amount = deposit.amount
      )

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
    FROM unnest(ARRAY['ledger_entries', 'accounting_journal_entries', 'finance_income_items', 'finance_expense_items']) table_name
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
      ('public.post_accounting_journal(uuid,uuid,text,uuid,text,date,public.currency_code,text,text,jsonb)', 'generic_journal_post')
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
        'diagnosticRpcExpected', CASE WHEN role_name = 'admin' THEN 'allowed' ELSE 'denied' END,
        'crossOrganizationExpected', 'denied',
        'wrongLinkedRecordExpected', 'denied',
        'currentStateOnly', true
      )
    FROM unnest(ARRAY['anonymous', 'member', 'manager', 'admin']) role_name
  ),
  watermark_row AS (
    SELECT
      'watermark:' || p_organization_id::text || ':' || p_property_id::text || ':' || p_period_start::text || ':' || p_period_end::text AS stable_key,
      jsonb_build_object(
        'hash', md5(coalesce(string_agg(source.stable_key || ':' || source.payload::text, '|' ORDER BY source.stable_key), '')),
        'rowCount', count(*)::bigint,
        'scope', jsonb_build_object(
          'organizationId', p_organization_id,
          'propertyId', p_property_id,
          'currency', p_currency,
          'periodStart', p_period_start,
          'periodEnd', p_period_end
        )
      ) AS payload
    FROM source_rows source
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
    'finance_inventory_v1'::text,
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
