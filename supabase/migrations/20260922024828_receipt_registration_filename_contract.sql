-- The branch-scoped API names its argument p_filename, and the application
-- supplies the canonical PDF filename. The private registration kernel still
-- expects the authoritative document number. Translate only an exact canonical
-- filename, retaining legacy document-number calls and every kernel check.
CREATE OR REPLACE FUNCTION public.register_tenant_commercial_document_artifact(
  p_organization_id uuid,p_source_kind text,p_source_id uuid,p_storage_path text,
  p_sha256 text,p_size_bytes bigint,p_renderer_version text,p_filename text,
  p_presentation_snapshot jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_property_id uuid;
  v_result uuid;
  v_kind text := pg_catalog.lower(pg_catalog.btrim(p_source_kind));
  v_document_number text;
  v_registration_number text := p_filename;
BEGIN
  IF v_kind NOT IN ('invoice','receipt') THEN
    IF (SELECT auth.uid()) IS NULL
      OR NOT app_private.has_org_permission(p_organization_id,'finance.record_payments') THEN
      RAISE EXCEPTION 'tenant_commercial_document_registration_forbidden' USING ERRCODE='42501';
    END IF;
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid' USING ERRCODE='22023';
  END IF;
  v_property_id:=app_private.tenant_commercial_document_property_id(
    p_organization_id,p_source_kind,p_source_id
  );
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'tenant_commercial_document_registration_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.record_payments');
  BEGIN
    IF v_kind = 'invoice' THEN
      SELECT invoice.invoice_number INTO v_document_number
      FROM public.tenant_invoices invoice
      WHERE invoice.organization_id=p_organization_id AND invoice.id=p_source_id;
    ELSE
      SELECT payment.receipt_number INTO v_document_number
      FROM public.tenant_invoice_payments payment
      WHERE payment.organization_id=p_organization_id AND payment.id=p_source_id;
    END IF;
    IF p_filename = app_private.tenant_commercial_document_filename(v_kind,v_document_number) THEN
      v_registration_number := v_document_number;
    END IF;
    v_result:=app_private.register_tenant_commercial_document_artifact_baseline_branch106(
      p_organization_id,p_source_kind,p_source_id,p_storage_path,p_sha256,p_size_bytes,
      p_renderer_version,v_registration_number,p_presentation_snapshot
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false);
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false);
  RETURN v_result;
END;
$$;
