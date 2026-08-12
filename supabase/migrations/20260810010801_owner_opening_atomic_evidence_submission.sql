CREATE OR REPLACE FUNCTION app_private.owner_opening_document_id(
  p_organization_id uuid,
  p_actor_id uuid,
  p_operation text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
BEGIN
  v_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          '|',
          'owner-opening-document-v1',
          p_organization_id::text,
          p_actor_id::text,
          p_operation,
          p_idempotency_key
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  RETURN (
    pg_catalog.substr(v_hash, 1, 8) || '-' ||
    pg_catalog.substr(v_hash, 9, 4) || '-' ||
    pg_catalog.substr(v_hash, 13, 4) || '-' ||
    pg_catalog.substr(v_hash, 17, 4) || '-' ||
    pg_catalog.substr(v_hash, 21, 12)
  )::uuid;
END;
$$;

ALTER FUNCTION app_private.owner_opening_document_id(uuid, uuid, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.owner_opening_document_id(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.register_owner_opening_document(
  p_organization_id uuid,
  p_property_id uuid,
  p_actor_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_content_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document_id uuid := app_private.owner_opening_document_id(
    p_organization_id,
    p_actor_id,
    p_operation,
    p_idempotency_key
  );
  v_expected_path text := p_organization_id::text ||
    '/owner-opening/' || v_document_id::text;
  v_file_name text := pg_catalog.btrim(coalesce(p_file_name, ''));
  v_mime_type text := pg_catalog.btrim(coalesce(p_mime_type, ''));
  v_storage_path text := pg_catalog.btrim(coalesce(p_storage_path, ''));
  v_existing public.documents%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_actor_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_operation NOT IN ('initial', 'correction') THEN
    RAISE EXCEPTION 'Opening evidence operation is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_file_name) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'Opening evidence file name is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_mime_type NOT IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
  ) THEN
    RAISE EXCEPTION 'Opening evidence MIME type is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 10485760 THEN
    RAISE EXCEPTION 'Opening evidence size is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_content_sha256 IS NULL
    OR p_content_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Opening evidence fingerprint is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_storage_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION 'Opening evidence path does not match its replay identity'
      USING ERRCODE = '22023';
  END IF;

  PERFORM object.id
  FROM storage.objects AS object
  WHERE object.bucket_id = 'nestory-documents'
    AND object.name = v_storage_path
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document Storage object does not exist'
      USING ERRCODE = '23503';
  END IF;

  SELECT document.*
  INTO v_existing
  FROM public.documents AS document
  WHERE document.id = v_document_id
     OR document.storage_path = v_storage_path
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.id IS DISTINCT FROM v_document_id
      OR v_existing.organization_id IS DISTINCT FROM p_organization_id
      OR v_existing.property_id IS DISTINCT FROM p_property_id
      OR v_existing.unit_id IS NOT NULL
      OR v_existing.lease_id IS NOT NULL
      OR v_existing.timeline_event_id IS NOT NULL
      OR v_existing.ledger_entry_id IS NOT NULL
      OR v_existing.task_id IS NOT NULL
      OR v_existing.tenant_request_id IS NOT NULL
      OR v_existing.category IS DISTINCT FROM 'owner_opening_balance_evidence'
      OR v_existing.file_name IS DISTINCT FROM v_file_name
      OR v_existing.storage_path IS DISTINCT FROM v_storage_path
      OR v_existing.mime_type IS DISTINCT FROM v_mime_type
      OR v_existing.size_bytes IS DISTINCT FROM p_size_bytes
      OR v_existing.content_sha256 IS DISTINCT FROM p_content_sha256
      OR v_existing.uploaded_by IS DISTINCT FROM p_actor_id
      OR v_existing.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Existing opening evidence metadata does not match replay'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_document_id;
  END IF;

  PERFORM app_private.validate_document_links(
    p_organization_id,
    p_property_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
  PERFORM pg_catalog.set_config(
    'app.document_content_write_context',
    'checked-v1',
    true
  );

  INSERT INTO public.documents (
    id,
    organization_id,
    property_id,
    category,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    content_sha256,
    uploaded_by
  ) VALUES (
    v_document_id,
    p_organization_id,
    p_property_id,
    'owner_opening_balance_evidence',
    v_file_name,
    v_storage_path,
    v_mime_type,
    p_size_bytes,
    p_content_sha256,
    p_actor_id
  );

  PERFORM pg_catalog.set_config(
    'app.document_content_write_context',
    'off',
    true
  );

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    p_actor_id,
    'document',
    v_document_id,
    'created',
    pg_catalog.jsonb_build_object(
      'document_id', v_document_id,
      'category', 'owner_opening_balance_evidence',
      'file_name', v_file_name,
      'property_id', p_property_id,
      'content_sha256', p_content_sha256,
      'opening_operation', p_operation
    )
  );

  RETURN v_document_id;
END;
$$;

ALTER FUNCTION app_private.register_owner_opening_document(
  uuid, uuid, uuid, text, text, text, text, text, bigint, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.register_owner_opening_document(
  uuid, uuid, uuid, text, text, text, text, text, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_owner_opening_balance_with_document(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_effective_date date,
  p_component public.owner_balance_component,
  p_amount numeric,
  p_reason text,
  p_source_reference text,
  p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,
  p_idempotency_key text,
  p_document_file_name text,
  p_document_storage_path text,
  p_document_mime_type text,
  p_document_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_source_reference text := nullif(
    pg_catalog.btrim(coalesce(p_source_reference, '')),
    ''
  );
  v_idempotency_key text := pg_catalog.btrim(
    coalesce(p_idempotency_key, '')
  );
  v_amount_text text;
  v_document_id uuid;
  v_payload jsonb;
  v_replay_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_organization_id IS NULL
    OR NOT app_private.can_submit_owner_opening_balance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to submit owner opening balances'
      USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only a Super Admin can register opening evidence'
      USING ERRCODE = '42501';
  END IF;
  IF p_property_id IS NULL
    OR p_owner_person_id IS NULL
    OR p_currency IS NULL
    OR p_effective_date IS NULL
    OR p_component IS NULL THEN
    RAISE EXCEPTION 'Complete opening authority scope is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_effective_date IS DISTINCT FROM
      pg_catalog.date_trunc('month', p_effective_date)::date THEN
    RAISE EXCEPTION 'Opening effective date must be the first day of a month'
      USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL
    OR p_amount < 0
    OR p_amount > 999999999999.99
    OR p_amount IS DISTINCT FROM pg_catalog.trunc(p_amount, 2) THEN
    RAISE EXCEPTION 'Opening amount must be nonnegative and use at most two decimal places'
      USING ERRCODE = '22023';
  END IF;
  v_amount_text := pg_catalog.to_char(p_amount, 'FM9999999999990.00');
  IF pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Opening reason must contain between 3 and 500 characters'
      USING ERRCODE = '22023';
  END IF;
  IF v_source_reference IS NOT NULL
    AND pg_catalog.char_length(v_source_reference) NOT BETWEEN 3 AND 240 THEN
    RAISE EXCEPTION 'Opening source reference must contain between 3 and 240 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_evidence_sha256 IS NULL
    OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Opening evidence fingerprint is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  v_document_id := app_private.owner_opening_document_id(
    p_organization_id,
    v_actor_id,
    'initial',
    v_idempotency_key
  );
  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'effective_date', p_effective_date::text,
    'component', p_component::text,
    'amount', v_amount_text,
    'reason', v_reason,
    'source_reference', v_source_reference,
    'supporting_document_id', v_document_id::text,
    'evidence_sha256', p_evidence_sha256,
    'resubmission_of_request_id', p_resubmission_of_request_id::text
  );
  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'submit_owner_opening_balance',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'owner_opening_document_v1:' || v_document_id::text,
      0
    )
  );
  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'submit_owner_opening_balance',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  PERFORM app_private.register_owner_opening_document(
    p_organization_id,
    p_property_id,
    v_actor_id,
    'initial',
    v_idempotency_key,
    p_document_file_name,
    p_document_storage_path,
    p_document_mime_type,
    p_document_size_bytes,
    p_evidence_sha256
  );

  RETURN public.submit_owner_opening_balance(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_effective_date,
    p_component,
    p_amount,
    v_reason,
    v_source_reference,
    v_document_id,
    p_evidence_sha256,
    p_resubmission_of_request_id,
    v_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.submit_owner_opening_balance_with_document(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, uuid, text,
  text, text, text, bigint
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance_with_document(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, uuid, text,
  text, text, text, bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance_with_document(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, uuid, text,
  text, text, text, bigint
) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_owner_opening_balance_correction_with_document(
  p_organization_id uuid,
  p_entry_id uuid,
  p_replacement_amount numeric,
  p_reason text,
  p_source_reference text,
  p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,
  p_idempotency_key text,
  p_document_file_name text,
  p_document_storage_path text,
  p_document_mime_type text,
  p_document_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_source_reference text := nullif(
    pg_catalog.btrim(coalesce(p_source_reference, '')),
    ''
  );
  v_idempotency_key text := pg_catalog.btrim(
    coalesce(p_idempotency_key, '')
  );
  v_amount_text text;
  v_document_id uuid;
  v_payload jsonb;
  v_replay_result jsonb;
  v_target public.owner_opening_balance_entries%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_organization_id IS NULL
    OR NOT app_private.can_request_owner_opening_balance_correction(
      p_organization_id
    ) THEN
    RAISE EXCEPTION 'Not authorized to request owner opening balance corrections'
      USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only a Super Admin can register opening evidence'
      USING ERRCODE = '42501';
  END IF;
  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'Owner opening correction target is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_replacement_amount IS NULL
    OR p_replacement_amount < 0
    OR p_replacement_amount > 999999999999.99
    OR p_replacement_amount IS DISTINCT FROM
      pg_catalog.trunc(p_replacement_amount, 2) THEN
    RAISE EXCEPTION 'Replacement amount must be nonnegative and use at most two decimal places'
      USING ERRCODE = '22023';
  END IF;
  v_amount_text := pg_catalog.to_char(
    p_replacement_amount,
    'FM9999999999990.00'
  );
  IF pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Opening reason must contain between 3 and 500 characters'
      USING ERRCODE = '22023';
  END IF;
  IF v_source_reference IS NOT NULL
    AND pg_catalog.char_length(v_source_reference) NOT BETWEEN 3 AND 240 THEN
    RAISE EXCEPTION 'Opening source reference must contain between 3 and 240 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_evidence_sha256 IS NULL
    OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Opening evidence fingerprint is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  v_document_id := app_private.owner_opening_document_id(
    p_organization_id,
    v_actor_id,
    'correction',
    v_idempotency_key
  );
  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'entry_id', p_entry_id::text,
    'replacement_amount', v_amount_text,
    'reason', v_reason,
    'source_reference', v_source_reference,
    'supporting_document_id', v_document_id::text,
    'evidence_sha256', p_evidence_sha256,
    'resubmission_of_request_id', p_resubmission_of_request_id::text
  );
  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'submit_owner_opening_balance_correction',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'owner_opening_document_v1:' || v_document_id::text,
      0
    )
  );
  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'submit_owner_opening_balance_correction',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  SELECT target.*
  INTO v_target
  FROM public.owner_opening_balance_entries AS target
  WHERE target.organization_id = p_organization_id
    AND target.id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner opening correction target not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.register_owner_opening_document(
    p_organization_id,
    v_target.property_id,
    v_actor_id,
    'correction',
    v_idempotency_key,
    p_document_file_name,
    p_document_storage_path,
    p_document_mime_type,
    p_document_size_bytes,
    p_evidence_sha256
  );

  RETURN public.submit_owner_opening_balance_correction(
    p_organization_id,
    p_entry_id,
    p_replacement_amount,
    v_reason,
    v_source_reference,
    v_document_id,
    p_evidence_sha256,
    p_resubmission_of_request_id,
    v_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.submit_owner_opening_balance_correction_with_document(
  uuid, uuid, numeric, text, text, text, uuid, text,
  text, text, text, bigint
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance_correction_with_document(
  uuid, uuid, numeric, text, text, text, uuid, text,
  text, text, text, bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance_correction_with_document(
  uuid, uuid, numeric, text, text, text, uuid, text,
  text, text, text, bigint
) TO authenticated;
