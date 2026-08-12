-- Bind every general paid-cost submit and approval to evidence created by the
-- checked service registrar. Maintenance-task evidence keeps its independent
-- task-scoped authority.

CREATE FUNCTION app_private.assert_paid_cost_evidence_eligible(
  p_organization_id uuid,
  p_property_id uuid,
  p_document_id uuid,
  p_submitting_actor_id uuid,
  p_submission_idempotency_key text,
  p_submission_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_document public.documents%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_key text := pg_catalog.btrim(
    coalesce(p_submission_idempotency_key, '')
  );
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_document_id IS NULL
    OR p_submitting_actor_id IS NULL
    OR pg_catalog.length(v_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'paid_cost_evidence_use_v1',
        p_organization_id,
        p_document_id
      ),
      0
    )
  );

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.organization_id = p_organization_id
    AND document.id = p_document_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_document.property_id IS DISTINCT FROM p_property_id
    OR v_document.category IS DISTINCT FROM 'Paid cost evidence'
    OR v_document.archived_at IS NOT NULL
    OR v_document.uploaded_by IS DISTINCT FROM p_submitting_actor_id
    OR v_document.storage_path NOT LIKE
      p_organization_id::text || '/paid-cost-evidence/%'
    OR app_private.storage_object_org_id(v_document.storage_path)
      IS DISTINCT FROM p_organization_id
    OR v_document.mime_type NOT IN (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
    OR v_document.size_bytes NOT BETWEEN 1 AND 10485760
    OR v_document.content_sha256 IS NULL
    OR v_document.content_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT object.*
  INTO v_object
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_document.storage_path
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_object.metadata->>'mimetype' IS DISTINCT FROM v_document.mime_type
    OR (CASE
      WHEN coalesce(v_object.metadata->>'size', '') ~ '^[0-9]+$'
        THEN (v_object.metadata->>'size')::bigint
      ELSE NULL
    END) IS DISTINCT FROM v_document.size_bytes THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.activity_logs AS activity
    WHERE activity.organization_id = p_organization_id
      AND activity.actor_id = p_submitting_actor_id
      AND activity.entity_type = 'document'
      AND activity.entity_id = p_document_id
      AND activity.action = 'paid_cost_evidence_registered'
      AND activity.new_values->>'property_id' = p_property_id::text
      AND activity.new_values->>'storage_path' = v_document.storage_path
      AND activity.new_values->>'content_sha256' =
        v_document.content_sha256
      AND activity.new_values->>'size_bytes' =
        v_document.size_bytes::text
      AND activity.new_values->>'content_type' = v_document.mime_type
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = p_organization_id
      AND submission.source_type = 'general'
      AND submission.supporting_document_id = p_document_id
      AND (
        p_submission_id IS NULL
        AND (
          submission.submitted_by IS DISTINCT FROM p_submitting_actor_id
          OR submission.idempotency_key IS DISTINCT FROM v_key
        )
        OR p_submission_id IS NOT NULL
        AND submission.id IS DISTINCT FROM p_submission_id
      )
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_already_used'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_customer_category text,
  p_vendor_label text,
  p_expense_date date,
  p_internal_cost_amount numeric,
  p_internal_markup_amount numeric,
  p_currency public.currency_code,
  p_responsibility text,
  p_tenant_invoice_id uuid,
  p_reconciliation_source_id uuid,
  p_supporting_document_id uuid,
  p_vendor_person_id uuid,
  p_reference text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_source_type text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_source_type, ''))
  );
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_submit_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_source_type = 'general' THEN
    IF p_supporting_document_id IS NULL THEN
      RAISE EXCEPTION 'Paid cost evidence document is required'
        USING ERRCODE = '23514';
    END IF;
    PERFORM app_private.assert_paid_cost_evidence_eligible(
      p_organization_id,
      p_property_id,
      p_supporting_document_id,
      v_actor_id,
      p_idempotency_key,
      NULL
    );
  END IF;

  RETURN app_private.submit_expense_baseline(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_source_type,
    p_source_id,
    p_customer_category,
    p_vendor_label,
    p_expense_date,
    p_internal_cost_amount,
    p_internal_markup_amount,
    p_currency,
    p_responsibility,
    p_tenant_invoice_id,
    p_reconciliation_source_id,
    p_supporting_document_id,
    p_vendor_person_id,
    p_reference,
    p_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.review_expense(uuid, uuid, text, text, text, uuid)
  RENAME TO review_expense_baseline_track6_evidence;
ALTER FUNCTION public.review_expense_baseline_track6_evidence(
  uuid, uuid, text, text, text, uuid
) SET SCHEMA app_private;

CREATE FUNCTION public.review_expense(
  p_organization_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key text,
  p_reconciliation_source_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_decision text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_decision, ''))
  );
  v_submission public.expense_submissions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT app_private.can_review_expense(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_decision = 'approve' THEN
    SELECT submission.*
    INTO v_submission
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = p_organization_id
      AND submission.id = p_submission_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Expense submission not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_submission.source_type = 'general' THEN
      PERFORM app_private.assert_paid_cost_evidence_eligible(
        p_organization_id,
        v_submission.property_id,
        v_submission.supporting_document_id,
        v_submission.submitted_by,
        v_submission.idempotency_key,
        v_submission.id
      );
    END IF;
  END IF;

  RETURN app_private.review_expense_baseline_track6_evidence(
    p_organization_id,
    p_submission_id,
    p_decision,
    p_reason,
    p_idempotency_key,
    p_reconciliation_source_id
  );
END;
$$;

ALTER FUNCTION app_private.assert_paid_cost_evidence_eligible(
  uuid, uuid, uuid, uuid, text, uuid
) OWNER TO postgres;
ALTER FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION app_private.review_expense_baseline_track6_evidence(
  uuid, uuid, text, text, text, uuid
) OWNER TO postgres;
ALTER FUNCTION public.review_expense(uuid, uuid, text, text, text, uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.assert_paid_cost_evidence_eligible(
  uuid, uuid, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.review_expense_baseline_track6_evidence(
  uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_expense(
  uuid, uuid, uuid, text, uuid, text, text, date, numeric, numeric,
  public.currency_code, text, uuid, uuid, uuid, uuid, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION app_private.assert_paid_cost_evidence_eligible(
  uuid, uuid, uuid, uuid, text, uuid
) IS 'Private immutable-evidence assertion shared by general paid-cost submission and approval.';
