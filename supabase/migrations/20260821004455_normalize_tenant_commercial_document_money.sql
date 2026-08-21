CREATE OR REPLACE FUNCTION public.get_tenant_commercial_document_publication_source(
  p_organization_id uuid,
  p_source_kind text,
  p_source_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_kind NOT IN ('invoice', 'receipt') THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'invoice' THEN
    SELECT pg_catalog.jsonb_build_object(
      'source_kind', 'invoice',
      'source_id', invoice.id::text,
      'document_number', invoice.invoice_number,
      'source_state', CASE
        WHEN invoice.lifecycle = 'void' THEN 'voided'
        ELSE 'current'
      END,
      'issuer', pg_catalog.jsonb_build_object(
        'organization_id', organization.id::text,
        'name', organization.name
      ),
      'recipient', pg_catalog.jsonb_build_object(
        'person_id', recipient.id::text,
        'label', invoice.recipient_label,
        'kind', invoice.recipient_kind,
        'email', recipient.primary_email,
        'phone', recipient.primary_phone
      ),
      'property', pg_catalog.jsonb_build_object(
        'id', property.id::text,
        'code', property.code,
        'name', property.name,
        'unit_id', unit.id::text,
        'unit_number', unit.unit_number
      ),
      'invoice', pg_catalog.jsonb_build_object(
        'billing_period_start', invoice.billing_period_start::text,
        'billing_period_end', invoice.billing_period_end::text,
        'issue_date', invoice.issue_date::text,
        'due_date', invoice.due_date::text,
        'currency', invoice.currency::text,
        'total_amount', invoice.total_amount::text,
        'collection_route', invoice.collection_route,
        'lifecycle', invoice.lifecycle
      ),
      'lines', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', line.id::text,
            'line_type', line.line_type,
            'label', line.customer_label,
            'description', line.description,
            'amount', line.amount::text,
            'sort_order', line.sort_order
          ) ORDER BY line.sort_order, line.id
        )
        FROM public.tenant_invoice_lines AS line
        WHERE line.organization_id = invoice.organization_id
          AND line.invoice_id = invoice.id
      ), '[]'::jsonb),
      'artifact', (
        SELECT pg_catalog.to_jsonb(existing_artifact)
          - 'organization_id' - 'presentation_snapshot'
        FROM public.tenant_commercial_document_artifacts AS existing_artifact
        WHERE existing_artifact.organization_id = invoice.organization_id
          AND existing_artifact.source_kind = 'invoice'
          AND existing_artifact.source_id = invoice.id
      )
    )
    INTO v_result
    FROM public.tenant_invoices AS invoice
    JOIN public.organizations AS organization
      ON organization.id = invoice.organization_id
    JOIN public.people AS recipient
      ON recipient.organization_id = invoice.organization_id
     AND recipient.id = invoice.recipient_person_id
    JOIN public.properties AS property
      ON property.organization_id = invoice.organization_id
     AND property.id = invoice.property_id
    LEFT JOIN public.units AS unit
      ON unit.organization_id = invoice.organization_id
     AND unit.id = invoice.unit_id
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_source_id;
  ELSE
    WITH source_payment AS (
      SELECT payment.*
      FROM public.tenant_invoice_payments AS payment
      JOIN public.tenant_invoices AS invoice
        ON invoice.organization_id = payment.organization_id
       AND invoice.id = payment.invoice_id
      JOIN public.financial_reconciliation_sources AS source
        ON source.organization_id = payment.organization_id
       AND source.id = payment.reconciliation_source_id
      WHERE payment.organization_id = p_organization_id
        AND payment.id = p_source_id
        AND payment.reversal_of_id IS NULL
        AND invoice.collection_route = 'through_ips'
        AND source.code = 'IPS_COLLECTIONS'
    ), settlement_events AS (
      SELECT
        payment.received_date AS event_date,
        payment.created_at,
        payment.id,
        CASE WHEN payment.reversal_of_id IS NULL
          THEN payment.amount ELSE -payment.amount END AS signed_amount
      FROM public.tenant_invoice_payments AS payment
      JOIN source_payment AS source
        ON source.organization_id = payment.organization_id
       AND source.invoice_id = payment.invoice_id
      UNION ALL
      SELECT
        confirmation.confirmed_date,
        confirmation.created_at,
        confirmation.id,
        CASE WHEN confirmation.reversal_of_id IS NULL
          THEN confirmation.amount ELSE -confirmation.amount END
      FROM public.owner_collection_confirmations AS confirmation
      JOIN source_payment AS source
        ON source.organization_id = confirmation.organization_id
       AND source.invoice_id = confirmation.invoice_id
    ), previous_settlement AS (
      SELECT COALESCE(pg_catalog.sum(event.signed_amount), 0) AS amount
      FROM settlement_events AS event
      CROSS JOIN source_payment AS source
      WHERE (event.event_date, event.created_at, event.id)
        < (source.received_date, source.created_at, source.id)
    )
    SELECT pg_catalog.jsonb_build_object(
      'source_kind', 'receipt',
      'source_id', payment.id::text,
      'document_number', payment.receipt_number,
      'source_state', CASE
        WHEN payment.reversal_of_id IS NOT NULL THEN 'reversal'
        WHEN EXISTS (
          SELECT 1
          FROM public.tenant_invoice_payments AS reversal
          WHERE reversal.organization_id = payment.organization_id
            AND reversal.reversal_of_id = payment.id
        ) THEN 'reversed'
        ELSE 'current'
      END,
      'issuer', pg_catalog.jsonb_build_object(
        'organization_id', organization.id::text,
        'name', organization.name
      ),
      'recipient', pg_catalog.jsonb_build_object(
        'person_id', recipient.id::text,
        'label', invoice.recipient_label,
        'kind', invoice.recipient_kind
      ),
      'property', pg_catalog.jsonb_build_object(
        'id', property.id::text,
        'code', property.code,
        'name', property.name,
        'unit_id', unit.id::text,
        'unit_number', unit.unit_number
      ),
      'invoice', pg_catalog.jsonb_build_object(
        'id', invoice.id::text,
        'invoice_number', invoice.invoice_number,
        'currency', invoice.currency::text,
        'total_amount', invoice.total_amount::text,
        'lifecycle', invoice.lifecycle
      ),
      'payment', pg_catalog.jsonb_build_object(
        'received_date', payment.received_date::text,
        'amount', payment.amount::text,
        'reference', payment.reference,
        'reversal_of_id', payment.reversal_of_id::text,
        'amount_previously_paid', previous.amount::numeric(20, 2)::text,
        'remaining_balance',
          (invoice.total_amount - previous.amount - payment.amount)::text
      ),
      'allocations', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'invoice_line_id', allocation.invoice_line_id::text,
            'label', line.customer_label,
            'description', line.description,
            'amount', allocation.amount::text,
            'allocation_order', allocation.allocation_order
          ) ORDER BY allocation.allocation_order, allocation.id
        )
        FROM public.tenant_invoice_payment_allocations AS allocation
        JOIN public.tenant_invoice_lines AS line
          ON line.organization_id = allocation.organization_id
         AND line.id = allocation.invoice_line_id
        WHERE allocation.organization_id = payment.organization_id
          AND allocation.payment_id = payment.id
      ), '[]'::jsonb),
      'artifact', (
        SELECT pg_catalog.to_jsonb(existing_artifact)
          - 'organization_id' - 'presentation_snapshot'
        FROM public.tenant_commercial_document_artifacts AS existing_artifact
        WHERE existing_artifact.organization_id = payment.organization_id
          AND existing_artifact.source_kind = 'receipt'
          AND existing_artifact.source_id = payment.id
      )
    )
    INTO v_result
    FROM source_payment AS payment
    JOIN public.tenant_invoices AS invoice
      ON invoice.organization_id = payment.organization_id
     AND invoice.id = payment.invoice_id
    JOIN public.organizations AS organization
      ON organization.id = payment.organization_id
    JOIN public.people AS recipient
      ON recipient.organization_id = invoice.organization_id
     AND recipient.id = invoice.recipient_person_id
    JOIN public.properties AS property
      ON property.organization_id = invoice.organization_id
     AND property.id = invoice.property_id
    LEFT JOIN public.units AS unit
      ON unit.organization_id = invoice.organization_id
     AND unit.id = invoice.unit_id
    CROSS JOIN previous_settlement AS previous;
  END IF;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'tenant_commercial_document_source_not_found'
      USING ERRCODE = '23503';
  END IF;

  RETURN v_result;
END;
$$;
