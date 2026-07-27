CREATE OR REPLACE FUNCTION public.get_property_cash_events_v1_page(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date,
  p_after_event_date date DEFAULT NULL,
  p_after_source_type text DEFAULT NULL,
  p_after_source_id uuid DEFAULT NULL,
  p_page_size integer DEFAULT 500
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
  statement_section text,
  category_code text,
  classification_status text,
  source_type text,
  source_id uuid,
  source_parent_type text,
  source_parent_id uuid,
  obligation_type text,
  obligation_id uuid,
  reversal_source_type text,
  reversal_source_id uuid,
  is_reversal boolean,
  is_legacy boolean,
  requires_resolution boolean,
  resolution_codes text[],
  reconciliation_source_id uuid,
  reconciliation_state text,
  ledger_entry_id uuid,
  journal_entry_id uuid,
  projection_status text,
  created_at timestamptz,
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  archived_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_currency IS NULL
    OR p_period_start IS NULL
    OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'Organization, property, currency, and period are required'
      USING ERRCODE = '22004';
  END IF;

  IF (SELECT auth.uid()) IS NULL
    OR NOT (SELECT app_private.is_org_admin(p_organization_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.id = p_property_id
      AND property.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Property does not belong to organization'
      USING ERRCODE = '22023';
  END IF;

  IF p_period_end < p_period_start
    OR p_period_end - p_period_start > 365 THEN
    RAISE EXCEPTION 'Period must be between 1 and 366 days'
      USING ERRCODE = '22023';
  END IF;

  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 1000 THEN
    RAISE EXCEPTION 'Page size must be between 1 and 1000'
      USING ERRCODE = '22023';
  END IF;

  IF (p_after_source_type IS NULL) <> (p_after_source_id IS NULL)
    OR (
      p_after_event_date IS NOT NULL
      AND p_after_source_type IS NULL
    ) THEN
    RAISE EXCEPTION 'Cursor must include source type and source ID'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH receipt_facts AS (
    SELECT
      allocation.id,
      allocation.organization_id,
      receipt.property_id,
      income.unit_id,
      income.lease_id,
      payer.id AS payer_person_id,
      lease_tenant.id AS primary_tenant_person_id,
      receipt.received_date,
      receipt.currency,
      allocation.amount,
      income.income_type,
      receipt.id AS receipt_id,
      income.id AS income_id,
      receipt.reversal_of_id,
      original_allocation.id AS original_allocation_id,
      income.ledger_entry_id,
      ledger.accounting_journal_entry_id,
      allocation.created_at,
      allocation.created_by,
      income.updated_at,
      income.updated_by,
      income.archived_at,
      CASE
        WHEN receipt.reversal_of_id IS NULL THEN true
        ELSE
          NOT EXISTS (
            SELECT
              original_set.income_item_id,
              original_set.amount
            FROM public.finance_receipt_allocations AS original_set
            WHERE original_set.receipt_id = receipt.reversal_of_id
              AND original_set.organization_id = allocation.organization_id
            EXCEPT
            SELECT
              reversal_set.income_item_id,
              reversal_set.amount
            FROM public.finance_receipt_allocations AS reversal_set
            WHERE reversal_set.receipt_id = receipt.id
              AND reversal_set.organization_id = allocation.organization_id
          )
          AND NOT EXISTS (
            SELECT
              reversal_set.income_item_id,
              reversal_set.amount
            FROM public.finance_receipt_allocations AS reversal_set
            WHERE reversal_set.receipt_id = receipt.id
              AND reversal_set.organization_id = allocation.organization_id
            EXCEPT
            SELECT
              original_set.income_item_id,
              original_set.amount
            FROM public.finance_receipt_allocations AS original_set
            WHERE original_set.receipt_id = receipt.reversal_of_id
              AND original_set.organization_id = allocation.organization_id
          )
      END AS reversal_header_is_exact,
      coalesce((
        income.organization_id = allocation.organization_id
        AND income.property_id = receipt.property_id
        AND income.currency = receipt.currency
        AND (
          income.lease_id IS NULL
          OR (
            lease.property_id = receipt.property_id
            AND lease.unit_id IS NOT DISTINCT FROM income.unit_id
          )
        )
        AND (
          income.unit_id IS NULL
          OR unit.property_id = receipt.property_id
        )
        AND (
          income.payer_person_id IS NULL
          OR payer.id IS NOT NULL
        )
        AND (
          lease.primary_tenant_person_id IS NULL
          OR lease_tenant.id IS NOT NULL
        )
      ), false) AS scope_is_exact
    FROM public.finance_receipt_allocations AS allocation
    JOIN public.finance_receipts AS receipt
      ON receipt.id = allocation.receipt_id
     AND receipt.organization_id = allocation.organization_id
    JOIN public.finance_income_items AS income
      ON income.id = allocation.income_item_id
     AND income.organization_id = allocation.organization_id
    LEFT JOIN public.leases AS lease
      ON lease.id = income.lease_id
     AND lease.organization_id = income.organization_id
    LEFT JOIN public.units AS unit
      ON unit.id = income.unit_id
     AND unit.organization_id = income.organization_id
    LEFT JOIN public.people AS payer
      ON payer.id = income.payer_person_id
     AND payer.organization_id = income.organization_id
    LEFT JOIN public.people AS lease_tenant
      ON lease_tenant.id = lease.primary_tenant_person_id
     AND lease_tenant.organization_id = lease.organization_id
    LEFT JOIN public.finance_receipt_allocations AS original_allocation
      ON original_allocation.receipt_id = receipt.reversal_of_id
     AND original_allocation.income_item_id = allocation.income_item_id
     AND original_allocation.amount = allocation.amount
     AND original_allocation.organization_id = allocation.organization_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = income.ledger_entry_id
     AND ledger.organization_id = income.organization_id
    WHERE allocation.organization_id = p_organization_id
      AND receipt.property_id = p_property_id
      AND receipt.currency = p_currency
      AND receipt.received_date BETWEEN p_period_start AND p_period_end
  ),
  receipt_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'receipt_allocation:' || fact.id::text AS event_key,
      fact.organization_id,
      fact.property_id,
      fact.unit_id,
      fact.lease_id,
      NULL::uuid AS task_id,
      CASE WHEN fact.income_type = 'owner_contribution'
        THEN fact.payer_person_id ELSE NULL::uuid
      END AS owner_person_id,
      CASE
        WHEN fact.income_type = 'owner_contribution'
          OR fact.income_type IN (
            'management_fee', 'leasing_commission', 'service_fee',
            'maintenance_markup'
          )
          THEN NULL::uuid
        ELSE coalesce(
          fact.primary_tenant_person_id,
          fact.payer_person_id
        )
      END AS tenant_person_id,
      NULL::uuid AS vendor_person_id,
      fact.received_date AS event_date,
      pg_catalog.date_trunc('month', fact.received_date)::date AS period_start,
      fact.currency,
      fact.amount,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.income_type = 'security_deposit'
          THEN NULL::numeric
        WHEN fact.income_type IN (
          'management_fee', 'leasing_commission', 'service_fee',
          'maintenance_markup'
        )
          THEN NULL::numeric
        ELSE CASE WHEN fact.reversal_of_id IS NULL
          THEN fact.amount ELSE -fact.amount END
      END AS owner_cash_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.income_type = 'security_deposit'
          THEN NULL::numeric
        WHEN fact.income_type IN (
          'management_fee', 'leasing_commission', 'service_fee',
          'maintenance_markup', 'owner_contribution'
        )
          THEN 0::numeric
        ELSE CASE WHEN fact.reversal_of_id IS NULL
          THEN fact.amount ELSE -fact.amount END
      END AS operating_cash_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.income_type = 'security_deposit'
          THEN NULL::numeric
        ELSE 0::numeric
      END AS deposit_liability_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.income_type = 'security_deposit'
          THEN NULL::numeric
        WHEN fact.income_type IN (
          'management_fee', 'leasing_commission', 'service_fee',
          'maintenance_markup'
        )
          THEN CASE WHEN fact.reversal_of_id IS NULL
            THEN fact.amount ELSE -fact.amount END
        ELSE 0::numeric
      END AS management_fee_effect,
      CASE
        WHEN fact.income_type = 'security_deposit' THEN 'security_deposit'
        WHEN fact.income_type = 'owner_contribution' THEN 'owner_contribution'
        WHEN fact.income_type IN (
          'management_fee', 'leasing_commission', 'service_fee',
          'maintenance_markup'
        ) THEN 'management_fee'
        ELSE 'operating_income'
      END::text AS economic_class,
      CASE
        WHEN fact.income_type = 'security_deposit' THEN 'deposits'
        WHEN fact.income_type = 'owner_contribution' THEN 'owner_funding'
        WHEN fact.income_type IN (
          'management_fee', 'leasing_commission', 'service_fee',
          'maintenance_markup'
        ) THEN 'management_fees'
        ELSE 'income'
      END::text AS statement_section,
      CASE fact.income_type
        WHEN 'security_deposit' THEN 'security_deposit_compatibility'
        WHEN 'owner_contribution' THEN 'owner_contribution'
        WHEN 'management_fee' THEN 'management_fee'
        WHEN 'leasing_commission' THEN 'leasing_commission'
        WHEN 'service_fee' THEN 'service_fee'
        WHEN 'maintenance_markup' THEN 'maintenance_markup'
        WHEN 'utility_reimbursement' THEN 'utility_reimbursement'
        WHEN 'parking' THEN 'parking'
        WHEN 'late_fee' THEN 'late_fee'
        WHEN 'rent' THEN 'rent'
        ELSE 'other_operating_income'
      END::text AS category_code,
      CASE
        WHEN NOT fact.scope_is_exact THEN 'unresolved_source_scope'
        WHEN NOT fact.reversal_header_is_exact
          THEN 'unresolved_reversal_header'
        ELSE 'provisional_current_obligation'
      END::text AS classification_status,
      'receipt_allocation'::text AS source_type,
      fact.id AS source_id,
      'finance_receipt'::text AS source_parent_type,
      fact.receipt_id AS source_parent_id,
      'finance_income_item'::text AS obligation_type,
      fact.income_id AS obligation_id,
      CASE WHEN fact.reversal_of_id IS NOT NULL
        THEN 'receipt_allocation'::text ELSE NULL::text END
        AS reversal_source_type,
      fact.original_allocation_id AS reversal_source_id,
      fact.reversal_of_id IS NOT NULL AS is_reversal,
      (
        fact.income_type = 'security_deposit'
        OR NOT fact.scope_is_exact
      ) AS is_legacy,
      true AS requires_resolution,
      pg_catalog.array_remove(
        ARRAY[
          CASE WHEN fact.income_type = 'security_deposit'
            THEN 'deposit_cash_identity_missing' END,
          CASE WHEN fact.income_type IN (
            'management_fee', 'leasing_commission', 'service_fee',
            'maintenance_markup'
          ) THEN 'management_fee_owner_recognition_unresolved' END,
          'missing_reconciliation_source',
          'mutable_obligation_classification',
          CASE WHEN NOT fact.reversal_header_is_exact
            THEN 'reversal_header_not_exact' END,
          CASE WHEN NOT fact.scope_is_exact
            THEN 'source_scope_invalid' END
        ]::text[],
        NULL::text
      ) AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      fact.ledger_entry_id,
      fact.accounting_journal_entry_id AS journal_entry_id,
      CASE
        WHEN fact.ledger_entry_id IS NULL THEN 'no_exact_projection'
        WHEN fact.accounting_journal_entry_id IS NULL
          THEN 'obligation_level_ledger'
        ELSE 'obligation_level_ledger_and_journal'
      END::text AS projection_status,
      fact.created_at,
      fact.created_by,
      fact.updated_at,
      fact.updated_by,
      fact.archived_at
    FROM receipt_facts AS fact
  ),
  receipt_header_facts AS (
    SELECT
      receipt.id,
      receipt.organization_id,
      receipt.property_id,
      receipt.received_date,
      receipt.currency,
      receipt.amount AS header_amount,
      coalesce(pg_catalog.sum(allocation.amount), 0::numeric)
        AS allocated_amount,
      receipt.reversal_of_id,
      receipt.created_at,
      receipt.created_by
    FROM public.finance_receipts AS receipt
    LEFT JOIN public.finance_receipt_allocations AS allocation
      ON allocation.receipt_id = receipt.id
     AND allocation.organization_id = receipt.organization_id
    WHERE receipt.organization_id = p_organization_id
      AND receipt.property_id = p_property_id
      AND receipt.currency = p_currency
      AND receipt.received_date BETWEEN p_period_start AND p_period_end
    GROUP BY
      receipt.id,
      receipt.organization_id,
      receipt.property_id,
      receipt.received_date,
      receipt.currency,
      receipt.amount,
      receipt.reversal_of_id,
      receipt.created_at,
      receipt.created_by
    HAVING receipt.amount
      <> coalesce(pg_catalog.sum(allocation.amount), 0::numeric)
  ),
  receipt_header_residual_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'receipt_header_residual:' || fact.id::text AS event_key,
      fact.organization_id,
      fact.property_id,
      NULL::uuid AS unit_id,
      NULL::uuid AS lease_id,
      NULL::uuid AS task_id,
      NULL::uuid AS owner_person_id,
      NULL::uuid AS tenant_person_id,
      NULL::uuid AS vendor_person_id,
      fact.received_date AS event_date,
      pg_catalog.date_trunc('month', fact.received_date)::date AS period_start,
      fact.currency,
      pg_catalog.abs(fact.header_amount - fact.allocated_amount) AS amount,
      NULL::numeric AS owner_cash_effect,
      NULL::numeric AS operating_cash_effect,
      NULL::numeric AS deposit_liability_effect,
      NULL::numeric AS management_fee_effect,
      'legacy_unclassified'::text AS economic_class,
      'unresolved'::text AS statement_section,
      CASE
        WHEN fact.header_amount > fact.allocated_amount
          THEN 'unapplied_receipt'
        ELSE 'overallocated_receipt'
      END::text AS category_code,
      'unresolved_evidence'::text AS classification_status,
      'receipt_header_residual'::text AS source_type,
      fact.id AS source_id,
      NULL::text AS source_parent_type,
      NULL::uuid AS source_parent_id,
      NULL::text AS obligation_type,
      NULL::uuid AS obligation_id,
      CASE WHEN fact.reversal_of_id IS NOT NULL
        THEN 'receipt_header_residual'::text ELSE NULL::text END
        AS reversal_source_type,
      fact.reversal_of_id AS reversal_source_id,
      fact.reversal_of_id IS NOT NULL AS is_reversal,
      true AS is_legacy,
      true AS requires_resolution,
      ARRAY[
        'missing_reconciliation_source',
        CASE
          WHEN fact.header_amount > fact.allocated_amount
            THEN 'receipt_header_unapplied'
          ELSE 'receipt_header_overallocated'
        END
      ]::text[] AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      NULL::uuid AS ledger_entry_id,
      NULL::uuid AS journal_entry_id,
      'no_exact_projection'::text AS projection_status,
      fact.created_at,
      fact.created_by,
      NULL::timestamptz AS updated_at,
      NULL::uuid AS updated_by,
      NULL::timestamptz AS archived_at
    FROM receipt_header_facts AS fact
  ),
  payment_facts AS (
    SELECT
      allocation.id,
      allocation.organization_id,
      payment.property_id,
      expense.unit_id,
      expense.task_id,
      vendor.id AS vendor_person_id,
      payment.paid_date,
      payment.currency,
      allocation.amount,
      expense.expense_type,
      expense.economic_scope,
      payment.id AS payment_id,
      expense.id AS expense_id,
      payment.reversal_of_id,
      original_allocation.id AS original_allocation_id,
      expense.ledger_entry_id,
      ledger.accounting_journal_entry_id,
      allocation.created_at,
      allocation.created_by,
      expense.updated_at,
      expense.updated_by,
      expense.archived_at,
      CASE
        WHEN payment.reversal_of_id IS NULL THEN true
        ELSE
          NOT EXISTS (
            SELECT
              original_set.expense_item_id,
              original_set.amount
            FROM public.finance_payment_allocations AS original_set
            WHERE original_set.payment_id = payment.reversal_of_id
              AND original_set.organization_id = allocation.organization_id
            EXCEPT
            SELECT
              reversal_set.expense_item_id,
              reversal_set.amount
            FROM public.finance_payment_allocations AS reversal_set
            WHERE reversal_set.payment_id = payment.id
              AND reversal_set.organization_id = allocation.organization_id
          )
          AND NOT EXISTS (
            SELECT
              reversal_set.expense_item_id,
              reversal_set.amount
            FROM public.finance_payment_allocations AS reversal_set
            WHERE reversal_set.payment_id = payment.id
              AND reversal_set.organization_id = allocation.organization_id
            EXCEPT
            SELECT
              original_set.expense_item_id,
              original_set.amount
            FROM public.finance_payment_allocations AS original_set
            WHERE original_set.payment_id = payment.reversal_of_id
              AND original_set.organization_id = allocation.organization_id
          )
      END AS reversal_header_is_exact,
      coalesce((
        expense.organization_id = allocation.organization_id
        AND expense.property_id = payment.property_id
        AND expense.currency = payment.currency
        AND (
          expense.unit_id IS NULL
          OR unit.property_id = payment.property_id
        )
        AND (
          expense.task_id IS NULL
          OR (
            task.property_id = payment.property_id
            AND task.unit_id IS NOT DISTINCT FROM expense.unit_id
          )
        )
        AND (
          expense.vendor_person_id IS NULL
          OR vendor.id IS NOT NULL
        )
      ), false) AS scope_is_exact
    FROM public.finance_payment_allocations AS allocation
    JOIN public.finance_payments AS payment
      ON payment.id = allocation.payment_id
     AND payment.organization_id = allocation.organization_id
    JOIN public.finance_expense_items AS expense
      ON expense.id = allocation.expense_item_id
     AND expense.organization_id = allocation.organization_id
    LEFT JOIN public.units AS unit
      ON unit.id = expense.unit_id
     AND unit.organization_id = expense.organization_id
    LEFT JOIN public.tasks AS task
      ON task.id = expense.task_id
     AND task.organization_id = expense.organization_id
    LEFT JOIN public.people AS vendor
      ON vendor.id = expense.vendor_person_id
     AND vendor.organization_id = expense.organization_id
    LEFT JOIN public.finance_payment_allocations AS original_allocation
      ON original_allocation.payment_id = payment.reversal_of_id
     AND original_allocation.expense_item_id = allocation.expense_item_id
     AND original_allocation.amount = allocation.amount
     AND original_allocation.organization_id = allocation.organization_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = expense.ledger_entry_id
     AND ledger.organization_id = expense.organization_id
    WHERE allocation.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.paid_date BETWEEN p_period_start AND p_period_end
  ),
  payment_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'payment_allocation:' || fact.id::text AS event_key,
      fact.organization_id,
      fact.property_id,
      fact.unit_id,
      NULL::uuid AS lease_id,
      fact.task_id,
      NULL::uuid AS owner_person_id,
      NULL::uuid AS tenant_person_id,
      fact.vendor_person_id,
      fact.paid_date AS event_date,
      pg_catalog.date_trunc('month', fact.paid_date)::date AS period_start,
      fact.currency,
      fact.amount,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.economic_scope <> 'property_expense'
          OR fact.expense_type = 'refund'
          THEN NULL::numeric
        ELSE CASE WHEN fact.reversal_of_id IS NULL
          THEN -fact.amount ELSE fact.amount END
      END AS owner_cash_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.economic_scope <> 'property_expense'
          OR fact.expense_type = 'refund'
          THEN NULL::numeric
        WHEN fact.expense_type = 'owner_payout' THEN 0::numeric
        ELSE CASE WHEN fact.reversal_of_id IS NULL
          THEN -fact.amount ELSE fact.amount END
      END AS operating_cash_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.economic_scope <> 'property_expense'
          OR fact.expense_type = 'refund'
          THEN NULL::numeric
        ELSE 0::numeric
      END AS deposit_liability_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR NOT fact.reversal_header_is_exact
          OR fact.economic_scope <> 'property_expense'
          OR fact.expense_type = 'refund'
          THEN NULL::numeric
        ELSE 0::numeric
      END AS management_fee_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR fact.economic_scope <> 'property_expense'
          OR fact.expense_type = 'refund'
          THEN 'legacy_unclassified'
        WHEN fact.expense_type = 'owner_payout' THEN 'owner_distribution'
        ELSE 'operating_expense'
      END::text AS economic_class,
      CASE
        WHEN NOT fact.scope_is_exact
          OR fact.economic_scope <> 'property_expense'
          OR fact.expense_type = 'refund'
          THEN 'unresolved'
        WHEN fact.expense_type = 'owner_payout' THEN 'owner_distributions'
        ELSE 'expenses'
      END::text AS statement_section,
      CASE
        WHEN NOT fact.scope_is_exact
          OR fact.economic_scope <> 'property_expense'
          OR fact.expense_type = 'refund'
          THEN 'company_scope_payment'
        WHEN fact.expense_type = 'owner_payout' THEN 'owner_distribution'
        ELSE 'expense_' || fact.expense_type
      END::text AS category_code,
      CASE
        WHEN NOT fact.scope_is_exact THEN 'unresolved_source_scope'
        WHEN NOT fact.reversal_header_is_exact
          THEN 'unresolved_reversal_header'
        ELSE 'provisional_current_obligation'
      END::text AS classification_status,
      'payment_allocation'::text AS source_type,
      fact.id AS source_id,
      'finance_payment'::text AS source_parent_type,
      fact.payment_id AS source_parent_id,
      'finance_expense_item'::text AS obligation_type,
      fact.expense_id AS obligation_id,
      CASE WHEN fact.reversal_of_id IS NOT NULL
        THEN 'payment_allocation'::text ELSE NULL::text END
        AS reversal_source_type,
      fact.original_allocation_id AS reversal_source_id,
      fact.reversal_of_id IS NOT NULL AS is_reversal,
      (
        NOT fact.scope_is_exact
        OR fact.economic_scope <> 'property_expense'
        OR fact.expense_type = 'refund'
      ) AS is_legacy,
      true AS requires_resolution,
      pg_catalog.array_remove(
        ARRAY[
          'missing_reconciliation_source',
          'mutable_obligation_classification',
          CASE WHEN NOT fact.reversal_header_is_exact
            THEN 'reversal_header_not_exact' END,
          CASE WHEN NOT fact.scope_is_exact
            OR fact.economic_scope <> 'property_expense'
            OR fact.expense_type = 'refund'
            THEN 'source_scope_invalid' END
        ]::text[],
        NULL::text
      ) AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      fact.ledger_entry_id,
      fact.accounting_journal_entry_id AS journal_entry_id,
      CASE
        WHEN fact.ledger_entry_id IS NULL THEN 'no_exact_projection'
        WHEN fact.accounting_journal_entry_id IS NULL
          THEN 'obligation_level_ledger'
        ELSE 'obligation_level_ledger_and_journal'
      END::text AS projection_status,
      fact.created_at,
      fact.created_by,
      fact.updated_at,
      fact.updated_by,
      fact.archived_at
    FROM payment_facts AS fact
  ),
  payment_header_facts AS (
    SELECT
      payment.id,
      payment.organization_id,
      payment.property_id,
      payment.paid_date,
      payment.currency,
      payment.amount AS header_amount,
      coalesce(pg_catalog.sum(allocation.amount), 0::numeric)
        AS allocated_amount,
      payment.reversal_of_id,
      payment.created_at,
      payment.created_by
    FROM public.finance_payments AS payment
    LEFT JOIN public.finance_payment_allocations AS allocation
      ON allocation.payment_id = payment.id
     AND allocation.organization_id = payment.organization_id
    WHERE payment.organization_id = p_organization_id
      AND payment.property_id = p_property_id
      AND payment.currency = p_currency
      AND payment.paid_date BETWEEN p_period_start AND p_period_end
    GROUP BY
      payment.id,
      payment.organization_id,
      payment.property_id,
      payment.paid_date,
      payment.currency,
      payment.amount,
      payment.reversal_of_id,
      payment.created_at,
      payment.created_by
    HAVING payment.amount
      <> coalesce(pg_catalog.sum(allocation.amount), 0::numeric)
  ),
  payment_header_residual_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'payment_header_residual:' || fact.id::text AS event_key,
      fact.organization_id,
      fact.property_id,
      NULL::uuid AS unit_id,
      NULL::uuid AS lease_id,
      NULL::uuid AS task_id,
      NULL::uuid AS owner_person_id,
      NULL::uuid AS tenant_person_id,
      NULL::uuid AS vendor_person_id,
      fact.paid_date AS event_date,
      pg_catalog.date_trunc('month', fact.paid_date)::date AS period_start,
      fact.currency,
      pg_catalog.abs(fact.header_amount - fact.allocated_amount) AS amount,
      NULL::numeric AS owner_cash_effect,
      NULL::numeric AS operating_cash_effect,
      NULL::numeric AS deposit_liability_effect,
      NULL::numeric AS management_fee_effect,
      'legacy_unclassified'::text AS economic_class,
      'unresolved'::text AS statement_section,
      CASE
        WHEN fact.header_amount > fact.allocated_amount
          THEN 'unallocated_payment'
        ELSE 'overallocated_payment'
      END::text AS category_code,
      'unresolved_evidence'::text AS classification_status,
      'payment_header_residual'::text AS source_type,
      fact.id AS source_id,
      NULL::text AS source_parent_type,
      NULL::uuid AS source_parent_id,
      NULL::text AS obligation_type,
      NULL::uuid AS obligation_id,
      CASE WHEN fact.reversal_of_id IS NOT NULL
        THEN 'payment_header_residual'::text ELSE NULL::text END
        AS reversal_source_type,
      fact.reversal_of_id AS reversal_source_id,
      fact.reversal_of_id IS NOT NULL AS is_reversal,
      true AS is_legacy,
      true AS requires_resolution,
      ARRAY[
        'missing_reconciliation_source',
        CASE
          WHEN fact.header_amount > fact.allocated_amount
            THEN 'payment_header_unallocated'
          ELSE 'payment_header_overallocated'
        END
      ]::text[] AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      NULL::uuid AS ledger_entry_id,
      NULL::uuid AS journal_entry_id,
      'no_exact_projection'::text AS projection_status,
      fact.created_at,
      fact.created_by,
      NULL::timestamptz AS updated_at,
      NULL::uuid AS updated_by,
      NULL::timestamptz AS archived_at
    FROM payment_header_facts AS fact
  ),
  deposit_facts AS (
    SELECT
      deposit.id,
      deposit.organization_id,
      deposit.property_id,
      lease.unit_id,
      lease.id AS lease_id,
      lease.primary_tenant_person_id,
      deposit.event_date,
      deposit.currency,
      deposit.amount,
      deposit.event_type,
      lease_deposit.deposit_type,
      deposit.lease_deposit_id,
      deposit.reversal_of_id,
      original.event_type AS original_event_type,
      deposit.created_at,
      deposit.created_by,
      lease_deposit.updated_at,
      lease_deposit.updated_by,
      lease_deposit.archived_at,
      coalesce((
        lease_deposit.organization_id = deposit.organization_id
        AND lease.organization_id = deposit.organization_id
        AND lease.property_id = deposit.property_id
        AND (
          deposit.reversal_of_id IS NULL
          OR (
            original.id IS NOT NULL
            AND original.lease_deposit_id = deposit.lease_deposit_id
            AND original.property_id = deposit.property_id
            AND original.currency = deposit.currency
          )
        )
      ), false) AS scope_is_exact
    FROM public.lease_deposit_events AS deposit
    JOIN public.lease_deposits AS lease_deposit
      ON lease_deposit.id = deposit.lease_deposit_id
     AND lease_deposit.organization_id = deposit.organization_id
    JOIN public.leases AS lease
      ON lease.id = lease_deposit.lease_id
     AND lease.organization_id = lease_deposit.organization_id
    LEFT JOIN public.lease_deposit_events AS original
      ON original.id = deposit.reversal_of_id
     AND original.organization_id = deposit.organization_id
    WHERE deposit.organization_id = p_organization_id
      AND deposit.property_id = p_property_id
      AND deposit.currency = p_currency
      AND deposit.event_date BETWEEN p_period_start AND p_period_end
  ),
  deposit_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'deposit_event:' || fact.id::text AS event_key,
      fact.organization_id,
      fact.property_id,
      fact.unit_id,
      fact.lease_id,
      NULL::uuid AS task_id,
      NULL::uuid AS owner_person_id,
      fact.primary_tenant_person_id AS tenant_person_id,
      NULL::uuid AS vendor_person_id,
      fact.event_date,
      pg_catalog.date_trunc('month', fact.event_date)::date AS period_start,
      fact.currency,
      fact.amount,
      CASE
        WHEN NOT fact.scope_is_exact
          OR (
            fact.reversal_of_id IS NOT NULL
            AND fact.original_event_type IS NULL
          )
          THEN NULL::numeric
        ELSE 0::numeric
      END AS owner_cash_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR (
            fact.reversal_of_id IS NOT NULL
            AND fact.original_event_type IS NULL
          )
          THEN NULL::numeric
        ELSE 0::numeric
      END AS operating_cash_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR (
            fact.reversal_of_id IS NOT NULL
            AND fact.original_event_type IS NULL
          )
          THEN NULL::numeric
        WHEN fact.reversal_of_id IS NOT NULL THEN
          CASE fact.original_event_type
            WHEN 'received' THEN -fact.amount
            ELSE fact.amount
          END
        WHEN fact.event_type = 'received' THEN fact.amount
        ELSE -fact.amount
      END AS deposit_liability_effect,
      CASE
        WHEN NOT fact.scope_is_exact
          OR (
            fact.reversal_of_id IS NOT NULL
            AND fact.original_event_type IS NULL
          )
          THEN NULL::numeric
        ELSE 0::numeric
      END AS management_fee_effect,
      'security_deposit'::text AS economic_class,
      'deposits'::text AS statement_section,
      (
        'deposit_'
        || pg_catalog.regexp_replace(
          pg_catalog.lower(fact.deposit_type),
          '[^a-z0-9]+',
          '_',
          'g'
        )
        || '_'
        || fact.event_type
      )::text AS category_code,
      CASE
        WHEN NOT fact.scope_is_exact THEN 'unresolved_source_scope'
        ELSE 'source_stable'
      END::text AS classification_status,
      'deposit_event'::text AS source_type,
      fact.id AS source_id,
      'lease_deposit'::text AS source_parent_type,
      fact.lease_deposit_id AS source_parent_id,
      NULL::text AS obligation_type,
      NULL::uuid AS obligation_id,
      CASE WHEN fact.reversal_of_id IS NOT NULL
        THEN 'deposit_event'::text ELSE NULL::text END
        AS reversal_source_type,
      fact.reversal_of_id AS reversal_source_id,
      fact.reversal_of_id IS NOT NULL AS is_reversal,
      NOT fact.scope_is_exact AS is_legacy,
      true AS requires_resolution,
      pg_catalog.array_remove(
        ARRAY[
          'missing_reconciliation_source',
          CASE
            WHEN NOT fact.scope_is_exact
              OR (
                fact.reversal_of_id IS NOT NULL
                AND fact.original_event_type IS NULL
              )
              THEN 'source_scope_invalid'
          END
        ]::text[],
        NULL::text
      ) AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      NULL::uuid AS ledger_entry_id,
      NULL::uuid AS journal_entry_id,
      'no_exact_projection'::text AS projection_status,
      fact.created_at,
      fact.created_by,
      fact.updated_at,
      fact.updated_by,
      fact.archived_at
    FROM deposit_facts AS fact
  ),
  petty_cash_facts AS (
    SELECT
      entry.id,
      entry.organization_id,
      entry.property_id,
      entry.unit_id,
      entry.clear_date,
      entry.invoice_date,
      entry.currency,
      CASE
        WHEN entry.entry_kind = 'expense' THEN entry.out_amount
        ELSE entry.in_amount
      END AS amount,
      entry.entry_kind,
      entry.status,
      entry.economic_scope,
      entry.ledger_entry_id,
      ledger.accounting_journal_entry_id,
      entry.created_at,
      entry.created_by,
      entry.updated_at,
      entry.updated_by,
      entry.archived_at,
      coalesce((
        entry.property_id = p_property_id
        AND (
          entry.unit_id IS NULL
          OR unit.property_id = entry.property_id
        )
        AND (
          entry.ledger_entry_id IS NULL
          OR (
            ledger.organization_id = entry.organization_id
            AND ledger.property_id = entry.property_id
          )
        )
      ), false) AS scope_is_exact
    FROM public.petty_cash_entries AS entry
    LEFT JOIN public.units AS unit
      ON unit.id = entry.unit_id
     AND unit.organization_id = entry.organization_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = entry.ledger_entry_id
     AND ledger.organization_id = entry.organization_id
    WHERE entry.organization_id = p_organization_id
      AND entry.property_id = p_property_id
      AND entry.currency = p_currency
      AND entry.status IN ('cleared', 'posted')
      AND (
        entry.clear_date BETWEEN p_period_start AND p_period_end
        OR (
          entry.clear_date IS NULL
          AND entry.invoice_date BETWEEN p_period_start AND p_period_end
        )
      )
  ),
  petty_cash_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'petty_cash_entry:' || fact.id::text AS event_key,
      fact.organization_id,
      fact.property_id,
      fact.unit_id,
      NULL::uuid AS lease_id,
      NULL::uuid AS task_id,
      NULL::uuid AS owner_person_id,
      NULL::uuid AS tenant_person_id,
      NULL::uuid AS vendor_person_id,
      fact.clear_date AS event_date,
      CASE WHEN fact.clear_date IS NULL THEN NULL::date
        ELSE pg_catalog.date_trunc('month', fact.clear_date)::date
      END AS period_start,
      fact.currency,
      fact.amount,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN -fact.amount
        ELSE NULL::numeric
      END AS owner_cash_effect,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN -fact.amount
        ELSE NULL::numeric
      END AS operating_cash_effect,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN 0::numeric
        ELSE NULL::numeric
      END AS deposit_liability_effect,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN 0::numeric
        ELSE NULL::numeric
      END AS management_fee_effect,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN 'operating_expense'
        ELSE 'legacy_unclassified'
      END::text AS economic_class,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN 'expenses'
        ELSE 'unresolved'
      END::text AS statement_section,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN 'petty_cash_expense'
        WHEN fact.clear_date IS NULL THEN 'petty_cash_uncleared'
        ELSE 'petty_cash_company_scope'
      END::text AS category_code,
      CASE
        WHEN fact.scope_is_exact
          AND fact.entry_kind = 'expense'
          AND fact.economic_scope = 'property_expense'
          AND fact.clear_date IS NOT NULL
          THEN 'source_stable'
        ELSE 'unresolved_evidence'
      END::text AS classification_status,
      'petty_cash_entry'::text AS source_type,
      fact.id AS source_id,
      NULL::text AS source_parent_type,
      NULL::uuid AS source_parent_id,
      NULL::text AS obligation_type,
      NULL::uuid AS obligation_id,
      NULL::text AS reversal_source_type,
      NULL::uuid AS reversal_source_id,
      false AS is_reversal,
      NOT (
        fact.scope_is_exact
        AND fact.entry_kind = 'expense'
        AND fact.economic_scope = 'property_expense'
        AND fact.clear_date IS NOT NULL
      ) AS is_legacy,
      true AS requires_resolution,
      pg_catalog.array_remove(
        ARRAY[
          'missing_reconciliation_source',
          CASE WHEN fact.clear_date IS NULL
            THEN 'petty_cash_date_unproven' END,
          CASE
            WHEN NOT fact.scope_is_exact
              OR fact.entry_kind <> 'expense'
              OR fact.economic_scope <> 'property_expense'
              THEN 'source_scope_invalid'
          END
        ]::text[],
        NULL::text
      ) AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      fact.ledger_entry_id,
      fact.accounting_journal_entry_id AS journal_entry_id,
      CASE
        WHEN fact.ledger_entry_id IS NULL THEN 'no_exact_projection'
        WHEN fact.accounting_journal_entry_id IS NULL THEN 'linked_ledger'
        ELSE 'linked_ledger_and_journal'
      END::text AS projection_status,
      fact.created_at,
      fact.created_by,
      fact.updated_at,
      fact.updated_by,
      fact.archived_at
    FROM petty_cash_facts AS fact
  ),
  maintenance_facts AS (
    SELECT
      task.id,
      task.organization_id,
      task.property_id,
      unit.id AS unit_id,
      vendor.id AS vendor_person_id,
      task.ledger_entry_id,
      ledger.transaction_date,
      coalesce(
        ledger.currency,
        task.actual_cost_currency,
        p_currency
      ) AS currency,
      coalesce(ledger.amount, task.actual_cost_amount) AS amount,
      ledger.accounting_journal_entry_id,
      task.created_at,
      task.created_by,
      task.updated_at,
      task.updated_by,
      task.archived_at,
      coalesce((
        task.ledger_entry_id IS NOT NULL
        AND ledger.id IS NOT NULL
        AND ledger.organization_id = task.organization_id
        AND ledger.property_id = task.property_id
        AND ledger.unit_id IS NOT DISTINCT FROM task.unit_id
        AND ledger.direction = 'expense'
        AND ledger.amount > 0
        AND ledger.currency = p_currency
        AND ledger.archived_at IS NULL
        AND (
          task.unit_id IS NULL
          OR (
            unit.id IS NOT NULL
            AND unit.property_id = task.property_id
          )
        )
        AND (
          task.vendor_person_id IS NULL
          OR vendor.id IS NOT NULL
        )
      ), false) AS scope_is_exact
    FROM public.tasks AS task
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = task.ledger_entry_id
    LEFT JOIN public.units AS unit
      ON unit.id = task.unit_id
     AND unit.organization_id = task.organization_id
    LEFT JOIN public.people AS vendor
      ON vendor.id = task.vendor_person_id
     AND vendor.organization_id = task.organization_id
    WHERE task.organization_id = p_organization_id
      AND task.property_id = p_property_id
      AND coalesce(
        ledger.transaction_date,
        task.completed_at::date,
        task.updated_at::date,
        task.created_at::date
      ) BETWEEN p_period_start AND p_period_end
      AND coalesce(ledger.amount, task.actual_cost_amount, 0::numeric) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.finance_expense_items AS represented_expense
        JOIN public.finance_payment_allocations AS represented_allocation
          ON represented_allocation.expense_item_id = represented_expense.id
         AND represented_allocation.organization_id =
           represented_expense.organization_id
        JOIN public.finance_payments AS represented_payment
          ON represented_payment.id = represented_allocation.payment_id
         AND represented_payment.organization_id =
           represented_allocation.organization_id
        WHERE represented_expense.organization_id = task.organization_id
          AND represented_expense.property_id = task.property_id
          AND represented_expense.task_id = task.id
          AND represented_payment.property_id = task.property_id
          AND represented_payment.currency = p_currency
      )
  ),
  maintenance_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'maintenance_task:' || fact.id::text AS event_key,
      fact.organization_id,
      fact.property_id,
      fact.unit_id,
      NULL::uuid AS lease_id,
      fact.id AS task_id,
      NULL::uuid AS owner_person_id,
      NULL::uuid AS tenant_person_id,
      fact.vendor_person_id,
      fact.transaction_date AS event_date,
      CASE WHEN fact.transaction_date IS NULL THEN NULL::date
        ELSE pg_catalog.date_trunc('month', fact.transaction_date)::date
      END AS period_start,
      fact.currency,
      fact.amount,
      NULL::numeric AS owner_cash_effect,
      NULL::numeric AS operating_cash_effect,
      NULL::numeric AS deposit_liability_effect,
      NULL::numeric AS management_fee_effect,
      'legacy_unclassified'::text AS economic_class,
      'unresolved'::text AS statement_section,
      'maintenance'::text AS category_code,
      'unresolved_evidence'::text AS classification_status,
      'maintenance_task'::text AS source_type,
      fact.id AS source_id,
      NULL::text AS source_parent_type,
      NULL::uuid AS source_parent_id,
      NULL::text AS obligation_type,
      NULL::uuid AS obligation_id,
      NULL::text AS reversal_source_type,
      NULL::uuid AS reversal_source_id,
      false AS is_reversal,
      true AS is_legacy,
      true AS requires_resolution,
      pg_catalog.array_remove(
        ARRAY[
          'maintenance_cash_settlement_unproven',
          CASE WHEN NOT fact.scope_is_exact
            THEN 'source_scope_invalid' END
        ]::text[],
        NULL::text
      ) AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      fact.ledger_entry_id,
      fact.accounting_journal_entry_id AS journal_entry_id,
      CASE
        WHEN NOT fact.scope_is_exact THEN 'invalid_linked_ledger_scope'
        WHEN fact.accounting_journal_entry_id IS NULL THEN 'linked_ledger'
        ELSE 'linked_ledger_and_journal'
      END::text AS projection_status,
      fact.created_at,
      fact.created_by,
      fact.updated_at,
      fact.updated_by,
      fact.archived_at
    FROM maintenance_facts AS fact
  ),
  unmatched_ledger_events AS (
    SELECT
      'property_cash_events_v1'::text AS contract_version,
      'ledger_entry:' || ledger.id::text AS event_key,
      ledger.organization_id,
      ledger.property_id,
      ledger.unit_id,
      NULL::uuid AS lease_id,
      NULL::uuid AS task_id,
      NULL::uuid AS owner_person_id,
      NULL::uuid AS tenant_person_id,
      NULL::uuid AS vendor_person_id,
      ledger.transaction_date AS event_date,
      pg_catalog.date_trunc('month', ledger.transaction_date)::date
        AS period_start,
      ledger.currency,
      ledger.amount,
      NULL::numeric AS owner_cash_effect,
      NULL::numeric AS operating_cash_effect,
      NULL::numeric AS deposit_liability_effect,
      NULL::numeric AS management_fee_effect,
      'legacy_unclassified'::text AS economic_class,
      'unresolved'::text AS statement_section,
      'ledger_unclassified'::text AS category_code,
      'unresolved_evidence'::text AS classification_status,
      'ledger_entry'::text AS source_type,
      ledger.id AS source_id,
      CASE WHEN ledger.source_id IS NULL THEN NULL::text
        ELSE ledger.source_type
      END AS source_parent_type,
      ledger.source_id AS source_parent_id,
      NULL::text AS obligation_type,
      NULL::uuid AS obligation_id,
      NULL::text AS reversal_source_type,
      NULL::uuid AS reversal_source_id,
      false AS is_reversal,
      true AS is_legacy,
      true AS requires_resolution,
      ARRAY['legacy_ledger_unclassified']::text[] AS resolution_codes,
      NULL::uuid AS reconciliation_source_id,
      'missing_stable_identity'::text AS reconciliation_state,
      ledger.id AS ledger_entry_id,
      ledger.accounting_journal_entry_id AS journal_entry_id,
      'unmatched_legacy'::text AS projection_status,
      ledger.created_at,
      ledger.created_by,
      ledger.updated_at,
      ledger.updated_by,
      ledger.archived_at
    FROM public.ledger_entries AS ledger
    LEFT JOIN public.units AS unit
      ON unit.id = ledger.unit_id
     AND unit.organization_id = ledger.organization_id
    WHERE ledger.organization_id = p_organization_id
      AND ledger.property_id = p_property_id
      AND ledger.currency = p_currency
      AND ledger.transaction_date BETWEEN p_period_start AND p_period_end
      AND ledger.amount > 0
      AND ledger.archived_at IS NULL
      AND (
        ledger.unit_id IS NULL
        OR unit.property_id = ledger.property_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.finance_income_items AS income
        JOIN public.finance_receipt_allocations AS allocation
          ON allocation.income_item_id = income.id
         AND allocation.organization_id = income.organization_id
        WHERE income.organization_id = ledger.organization_id
          AND (
            income.ledger_entry_id = ledger.id
            OR (
              ledger.source_type = 'finance_income'
              AND ledger.source_id = income.id
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.finance_expense_items AS expense
        JOIN public.finance_payment_allocations AS allocation
          ON allocation.expense_item_id = expense.id
         AND allocation.organization_id = expense.organization_id
        WHERE expense.organization_id = ledger.organization_id
          AND (
            expense.ledger_entry_id = ledger.id
            OR (
              ledger.source_type = 'finance_expense'
              AND ledger.source_id = expense.id
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.petty_cash_entries AS petty
        WHERE petty.organization_id = ledger.organization_id
          AND (
            petty.ledger_entry_id = ledger.id
            OR (
              ledger.source_type = 'petty_cash'
              AND ledger.source_id = petty.id
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tasks AS task
        WHERE task.organization_id = ledger.organization_id
          AND (
            task.ledger_entry_id = ledger.id
            OR (
              ledger.source_type = 'maintenance_task'
              AND ledger.source_id = task.id
            )
          )
      )
  ),
  all_events AS (
    SELECT * FROM receipt_events
    UNION ALL
    SELECT * FROM receipt_header_residual_events
    UNION ALL
    SELECT * FROM payment_events
    UNION ALL
    SELECT * FROM payment_header_residual_events
    UNION ALL
    SELECT * FROM deposit_events
    UNION ALL
    SELECT * FROM petty_cash_events
    UNION ALL
    SELECT * FROM maintenance_events
    UNION ALL
    SELECT * FROM unmatched_ledger_events
  )
  SELECT event.*
  FROM all_events AS event
  WHERE p_after_source_type IS NULL
    OR (
      p_after_event_date IS NULL
      AND event.event_date IS NULL
      AND (event.source_type, event.source_id)
        > (p_after_source_type, p_after_source_id)
    )
    OR (
      p_after_event_date IS NOT NULL
      AND (
        event.event_date > p_after_event_date
        OR event.event_date IS NULL
        OR (
          event.event_date = p_after_event_date
          AND (event.source_type, event.source_id)
            > (p_after_source_type, p_after_source_id)
        )
      )
    )
  ORDER BY
    event.event_date ASC NULLS LAST,
    event.source_type ASC,
    event.source_id ASC
  LIMIT p_page_size;
END;
$$;

REVOKE ALL ON FUNCTION public.get_property_cash_events_v1_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_property_cash_events_v1_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) TO authenticated;
