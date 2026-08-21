CREATE TABLE public.person_travel_documents (
  person_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  passport_number text,
  passport_expiry_date date,
  visa_expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT person_travel_documents_person_fk
    FOREIGN KEY (organization_id, person_id)
    REFERENCES public.people (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT person_travel_documents_passport_number_length_check
    CHECK (passport_number IS NULL OR length(passport_number) <= 80),
  CONSTRAINT person_travel_documents_passport_fields_pair_check
    CHECK ((passport_number IS NULL) = (passport_expiry_date IS NULL))
);

ALTER TABLE public.person_travel_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage person travel documents"
ON public.person_travel_documents
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.person_travel_documents
TO authenticated;

INSERT INTO public.person_travel_documents (
  person_id,
  organization_id,
  passport_number,
  passport_expiry_date,
  visa_expiry_date,
  created_by,
  updated_by
)
SELECT
  id,
  organization_id,
  passport_number,
  passport_expiry_date,
  visa_expiry_date,
  updated_by,
  updated_by
FROM public.people
WHERE passport_number IS NOT NULL
   OR passport_expiry_date IS NOT NULL
   OR visa_expiry_date IS NOT NULL;

ALTER TABLE public.people
  DROP CONSTRAINT people_passport_number_length_check,
  DROP CONSTRAINT people_passport_fields_pair_check,
  DROP COLUMN passport_number,
  DROP COLUMN passport_expiry_date,
  DROP COLUMN visa_expiry_date;

CREATE OR REPLACE FUNCTION public.create_person(
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
  v_person_id uuid;
  v_passport_number text := NULLIF(trim(coalesce(p_passport_number, '')), '');
BEGIN
  IF v_passport_number IS NOT NULL AND length(v_passport_number) > 80 THEN
    RAISE EXCEPTION 'Passport number is too long' USING ERRCODE = '22023';
  END IF;

  IF (v_passport_number IS NULL) <> (p_passport_expiry_date IS NULL) THEN
    RAISE EXCEPTION 'Passport number and expiry date must be entered together'
      USING ERRCODE = '22023';
  END IF;

  v_person_id := public.create_person(
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

  IF v_passport_number IS NOT NULL OR p_visa_expiry_date IS NOT NULL THEN
    INSERT INTO public.person_travel_documents (
      person_id,
      organization_id,
      passport_number,
      passport_expiry_date,
      visa_expiry_date,
      created_by,
      updated_by
    ) VALUES (
      v_person_id,
      p_organization_id,
      v_passport_number,
      p_passport_expiry_date,
      p_visa_expiry_date,
      auth.uid(),
      auth.uid()
    );

    INSERT INTO public.activity_logs (
      organization_id, actor_id, entity_type, entity_id, action, new_values
    ) VALUES (
      p_organization_id,
      auth.uid(),
      'person',
      v_person_id,
      'travel_documents_recorded',
      jsonb_build_object(
        'passportRecorded', v_passport_number IS NOT NULL,
        'visaExpiryRecorded', p_visa_expiry_date IS NOT NULL
      )
    );
  END IF;

  RETURN v_person_id;
END;
$$;

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
        'visaExpiryRecorded', v_old.visa_expiry_date IS NOT NULL
      ),
      jsonb_build_object(
        'passportRecorded', v_passport_number IS NOT NULL,
        'visaExpiryRecorded', p_visa_expiry_date IS NOT NULL
      )
    );
  END IF;

  RETURN p_person_id;
END;
$$;

COMMENT ON TABLE public.person_travel_documents IS
  'Admin-restricted passport and visa follow-up data for people.';
