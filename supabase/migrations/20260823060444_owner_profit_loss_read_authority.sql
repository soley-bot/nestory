CREATE OR REPLACE FUNCTION app_private.get_owner_profit_loss_events_page(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date,
  p_after_recognized_on date,
  p_after_source_type text,
  p_after_source_id uuid,
  p_page_size integer
) RETURNS TABLE (
  contract_version text,
  event_key text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  recognized_on date,
  period_start date,
  currency public.currency_code,
  signed_amount numeric,
  economic_class text,
  category_code text,
  description text,
  recognition_basis text,
  source_type text,
  source_id uuid,
  source_parent_type text,
  source_parent_id uuid,
  reversal_source_type text,
  reversal_of_id uuid,
  is_reversal boolean,
  cursor_recognized_on date,
  cursor_source_type text,
  cursor_source_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH recognized_events AS (
    SELECT
      'owner_profit_loss_events.v1'::text AS contract_version,
      'tenant_invoice_line:' || line.id::text AS event_key,
      line.organization_id,
      line.property_id,
      line.unit_id,
      invoice.lease_id,
      line.recognized_on,
      date_trunc('month', line.recognized_on)::date AS period_start,
      line.currency,
      line.amount AS signed_amount,
      'owner_income'::text AS economic_class,
      line.line_type AS category_code,
      coalesce(line.description, line.customer_label) AS description,
      'tenant_invoice_issued'::text AS recognition_basis,
      'tenant_invoice_line'::text AS source_type,
      line.id AS source_id,
      'tenant_invoice'::text AS source_parent_type,
      line.invoice_id AS source_parent_id,
      CASE
        WHEN line.reversal_of_id IS NULL THEN NULL::text
        ELSE 'tenant_invoice_line'::text
      END AS reversal_source_type,
      line.reversal_of_id,
      line.reversal_of_id IS NOT NULL AS is_reversal
    FROM public.tenant_invoice_lines AS line
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE line.organization_id = p_organization_id
      AND line.property_id = p_property_id
      AND line.currency = p_currency
      AND line.recognized_on BETWEEN p_period_start AND p_period_end
      AND NOT EXISTS (
        SELECT 1
        FROM public.ips_expense_responsibilities AS responsibility
        WHERE responsibility.organization_id = line.organization_id
          AND responsibility.responsibility = 'tenant'
          AND responsibility.tenant_invoice_line_id = coalesce(
            line.reversal_of_id,
            line.id
          )
      )

    UNION ALL

    SELECT
      'owner_profit_loss_events.v1'::text,
      'management_fee_occurrence:' || fee.id::text,
      fee.organization_id,
      fee.property_id,
      invoice.unit_id,
      fee.lease_id,
      fee.fee_date,
      date_trunc('month', fee.fee_date)::date,
      fee.currency,
      fee.amount,
      'owner_expense'::text,
      'management_fee'::text,
      'Management fee'::text,
      'management_fee_earned_at_invoice_issuance'::text,
      'management_fee_occurrence'::text,
      fee.id,
      'tenant_invoice'::text,
      fee.tenant_invoice_id,
      CASE
        WHEN fee.reversal_of_id IS NULL THEN NULL::text
        ELSE 'management_fee_occurrence'::text
      END,
      fee.reversal_of_id,
      fee.reversal_of_id IS NOT NULL
    FROM public.management_fee_occurrences AS fee
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = fee.organization_id
     AND invoice.id = fee.tenant_invoice_id
    WHERE fee.organization_id = p_organization_id
      AND fee.property_id = p_property_id
      AND fee.currency = p_currency
      AND fee.fee_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'owner_profit_loss_events.v1'::text,
      'owner_invoice_line:' || line.id::text,
      line.organization_id,
      line.property_id,
      expense.unit_id,
      NULL::uuid,
      line.recognized_on,
      date_trunc('month', line.recognized_on)::date,
      invoice.currency,
      line.amount,
      'owner_expense'::text,
      responsibility.customer_category,
      coalesce(line.description, line.customer_label),
      'owner_responsibility_obligation'::text,
      'owner_invoice_line'::text,
      line.id,
      'owner_invoice'::text,
      line.invoice_id,
      CASE
        WHEN line.reversal_of_id IS NULL THEN NULL::text
        ELSE 'owner_invoice_line'::text
      END,
      line.reversal_of_id,
      line.reversal_of_id IS NOT NULL
    FROM public.owner_invoice_lines AS line
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    JOIN public.ips_expense_responsibilities AS responsibility
      ON responsibility.organization_id = line.organization_id
     AND responsibility.responsibility = 'owner'
     AND responsibility.owner_invoice_line_id = coalesce(
       line.reversal_of_id,
       line.id
     )
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = responsibility.organization_id
     AND expense.id = responsibility.finance_expense_item_id
    WHERE line.organization_id = p_organization_id
      AND line.property_id = p_property_id
      AND invoice.currency = p_currency
      AND line.source_type = 'owner_expense'
      AND line.recognized_on BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'owner_profit_loss_events.v1'::text,
      'expense_customer_adjustment:' || adjustment.id::text,
      adjustment.organization_id,
      adjustment.property_id,
      expense.unit_id,
      NULL::uuid,
      adjustment.adjustment_date,
      date_trunc('month', adjustment.adjustment_date)::date,
      adjustment.currency,
      adjustment.amount,
      'owner_expense'::text,
      responsibility.customer_category,
      adjustment.reason,
      'owner_expense_adjustment'::text,
      'expense_customer_adjustment'::text,
      adjustment.id,
      'expense_submission'::text,
      adjustment.submission_id,
      'owner_invoice_line'::text,
      responsibility.owner_invoice_line_id,
      true
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.ips_expense_responsibilities AS responsibility
      ON responsibility.organization_id = adjustment.organization_id
     AND responsibility.id = adjustment.responsibility_id
     AND responsibility.responsibility = 'owner'
    JOIN public.finance_expense_items AS expense
      ON expense.organization_id = responsibility.organization_id
     AND expense.id = responsibility.finance_expense_item_id
    WHERE adjustment.organization_id = p_organization_id
      AND adjustment.property_id = p_property_id
      AND adjustment.currency = p_currency
      AND adjustment.responsibility = 'owner'
      AND adjustment.adjustment_date BETWEEN p_period_start AND p_period_end
  )
  SELECT
    event.contract_version,
    event.event_key,
    event.organization_id,
    event.property_id,
    event.unit_id,
    event.lease_id,
    event.recognized_on,
    event.period_start,
    event.currency,
    event.signed_amount,
    event.economic_class,
    event.category_code,
    event.description,
    event.recognition_basis,
    event.source_type,
    event.source_id,
    event.source_parent_type,
    event.source_parent_id,
    event.reversal_source_type,
    event.reversal_of_id,
    event.is_reversal,
    event.recognized_on AS cursor_recognized_on,
    event.source_type AS cursor_source_type,
    event.source_id AS cursor_source_id
  FROM recognized_events AS event
  WHERE p_after_recognized_on IS NULL
     OR (event.recognized_on, event.source_type, event.source_id) >
        (p_after_recognized_on, p_after_source_type, p_after_source_id)
  ORDER BY event.recognized_on, event.source_type, event.source_id
  LIMIT p_page_size;
$$;

ALTER FUNCTION app_private.get_owner_profit_loss_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.get_owner_profit_loss_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_owner_profit_loss_events_page(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date,
  p_after_recognized_on date,
  p_after_source_type text,
  p_after_source_id uuid,
  p_page_size integer
) RETURNS TABLE (
  contract_version text,
  event_key text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  recognized_on date,
  period_start date,
  currency public.currency_code,
  signed_amount numeric,
  economic_class text,
  category_code text,
  description text,
  recognition_basis text,
  source_type text,
  source_id uuid,
  source_parent_type text,
  source_parent_id uuid,
  reversal_source_type text,
  reversal_of_id uuid,
  is_reversal boolean,
  cursor_recognized_on date,
  cursor_source_type text,
  cursor_source_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
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
      (p_after_recognized_on IS NULL)::integer
      + (p_after_source_type IS NULL)::integer
      + (p_after_source_id IS NULL)::integer
    ) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'Complete bounded recognized-event scope is required'
      USING ERRCODE = '22023';
  END IF;

  IF app_private.can_read_finance_property(
    p_organization_id,
    p_property_id
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
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
  FROM app_private.get_owner_profit_loss_events_page(
    p_organization_id,
    p_property_id,
    p_currency,
    p_period_start,
    p_period_end,
    p_after_recognized_on,
    p_after_source_type,
    p_after_source_id,
    p_page_size
  );
END;
$$;

ALTER FUNCTION public.get_owner_profit_loss_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) OWNER TO postgres;

COMMENT ON FUNCTION public.get_owner_profit_loss_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) IS
  'Returns owner-recognized income and expense obligations only. Tenant receipts, payment allocations, owner balance settlements, Ledger rows, and tenant-recharge company costs are excluded.';

REVOKE ALL ON FUNCTION public.get_owner_profit_loss_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_owner_profit_loss_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) TO authenticated;
