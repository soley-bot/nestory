CREATE OR REPLACE FUNCTION public.update_person(
  p_person_id uuid,
  p_organization_id uuid,
  p_display_name text,
  p_legal_name text,
  p_party_type text,
  p_primary_email text,
  p_primary_phone text,
  p_tax_identifier text,
  p_notes text,
  p_roles text[],
  p_passport_number text,
  p_passport_expiry_date date,
  p_visa_expiry_date date
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'app_private'
AS $$
DECLARE
  v_old public.person_travel_documents%ROWTYPE;
  v_passport_number text := NULLIF(trim(coalesce(p_passport_number, '')), '');
  v_old_fingerprint text;
  v_new_fingerprint text;
BEGIN
  IF v_passport_number IS NOT NULL AND length(v_passport_number) > 80 THEN
    RAISE EXCEPTION 'Passport number is too long' USING ERRCODE = '22023';
  END IF;

  IF (v_passport_number IS NULL) <> (p_passport_expiry_date IS NULL) THEN
    RAISE EXCEPTION 'Passport number and expiry date must be entered together'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_old
  FROM public.person_travel_documents
  WHERE person_id = p_person_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_old.person_id IS NOT NULL THEN
    v_old_fingerprint := encode(
      extensions.digest(
        concat_ws(
          '|',
          p_organization_id::text,
          p_person_id::text,
          coalesce(v_old.passport_number, ''),
          coalesce(v_old.passport_expiry_date::text, ''),
          coalesce(v_old.visa_expiry_date::text, '')
        ),
        'sha256'
      ),
      'hex'
    );
  END IF;

  IF v_passport_number IS NOT NULL OR p_visa_expiry_date IS NOT NULL THEN
    v_new_fingerprint := encode(
      extensions.digest(
        concat_ws(
          '|',
          p_organization_id::text,
          p_person_id::text,
          coalesce(v_passport_number, ''),
          coalesce(p_passport_expiry_date::text, ''),
          coalesce(p_visa_expiry_date::text, '')
        ),
        'sha256'
      ),
      'hex'
    );
  END IF;

  PERFORM public.update_person(
    p_person_id,
    p_organization_id,
    p_display_name,
    p_legal_name,
    p_party_type,
    p_primary_email,
    p_primary_phone,
    p_tax_identifier,
    p_notes,
    p_roles
  );

  IF v_passport_number IS NULL AND p_visa_expiry_date IS NULL THEN
    DELETE FROM public.person_travel_documents
    WHERE person_id = p_person_id
      AND organization_id = p_organization_id;
  ELSE
    INSERT INTO public.person_travel_documents (
      person_id,
      organization_id,
      passport_number,
      passport_expiry_date,
      visa_expiry_date,
      created_by,
      updated_by
    ) VALUES (
      p_person_id,
      p_organization_id,
      v_passport_number,
      p_passport_expiry_date,
      p_visa_expiry_date,
      auth.uid(),
      auth.uid()
    )
    ON CONFLICT (person_id) DO UPDATE
    SET
      passport_number = EXCLUDED.passport_number,
      passport_expiry_date = EXCLUDED.passport_expiry_date,
      visa_expiry_date = EXCLUDED.visa_expiry_date,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE person_travel_documents.organization_id = EXCLUDED.organization_id;
  END IF;

  IF (v_old.passport_number, v_old.passport_expiry_date, v_old.visa_expiry_date)
    IS DISTINCT FROM
    (v_passport_number, p_passport_expiry_date, p_visa_expiry_date) THEN
    INSERT INTO public.activity_logs (
      organization_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      previous_values,
      new_values
    ) VALUES (
      p_organization_id,
      auth.uid(),
      'person',
      p_person_id,
      'travel_documents_updated',
      jsonb_build_object(
        'passportRecorded', v_old.passport_number IS NOT NULL,
        'visaExpiryRecorded', v_old.visa_expiry_date IS NOT NULL,
        'revisionFingerprint', v_old_fingerprint,
        'passportNumberChanged',
          v_old.passport_number IS DISTINCT FROM v_passport_number,
        'passportExpiryChanged',
          v_old.passport_expiry_date IS DISTINCT FROM p_passport_expiry_date,
        'visaExpiryChanged',
          v_old.visa_expiry_date IS DISTINCT FROM p_visa_expiry_date
      ),
      jsonb_build_object(
        'passportRecorded', v_passport_number IS NOT NULL,
        'visaExpiryRecorded', p_visa_expiry_date IS NOT NULL,
        'revisionFingerprint', v_new_fingerprint,
        'passportNumberChanged',
          v_old.passport_number IS DISTINCT FROM v_passport_number,
        'passportExpiryChanged',
          v_old.passport_expiry_date IS DISTINCT FROM p_passport_expiry_date,
        'visaExpiryChanged',
          v_old.visa_expiry_date IS DISTINCT FROM p_visa_expiry_date
      )
    );
  END IF;

  RETURN p_person_id;
END;
$$;

COMMENT ON FUNCTION public.update_person(
  uuid, uuid, text, text, text, text, text, text, text, text[], text, date, date
) IS 'Updates a person and records privacy-safe travel-document revision evidence.';
