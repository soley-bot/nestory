CREATE FUNCTION app_private.update_person_preserving_unmapped_fields_for_import(
  p_person_id uuid,
  p_organization_id uuid,
  p_normalized_data jsonb,
  p_roles text[]
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_person public.people%ROWTYPE;
BEGIN
  SELECT person.*
  INTO v_person
  FROM public.people AS person
  WHERE person.id = p_person_id
    AND person.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  RETURN public.update_person(
    p_person_id,
    p_organization_id,
    p_normalized_data ->> 'displayName',
    CASE
      WHEN p_normalized_data ? 'legalName' THEN NULLIF(p_normalized_data ->> 'legalName', '')
      ELSE v_person.legal_name
    END,
    coalesce(NULLIF(pg_catalog.btrim(p_normalized_data ->> 'partyType'), ''), v_person.party_type),
    CASE
      WHEN p_normalized_data ? 'primaryEmail' THEN NULLIF(p_normalized_data ->> 'primaryEmail', '')
      ELSE v_person.primary_email
    END,
    CASE
      WHEN p_normalized_data ? 'primaryPhone' THEN NULLIF(p_normalized_data ->> 'primaryPhone', '')
      ELSE v_person.primary_phone
    END,
    CASE
      WHEN p_normalized_data ? 'taxIdentifier' THEN NULLIF(p_normalized_data ->> 'taxIdentifier', '')
      ELSE v_person.tax_identifier
    END,
    CASE
      WHEN p_normalized_data ? 'notes' THEN NULLIF(p_normalized_data ->> 'notes', '')
      ELSE v_person.notes
    END,
    p_roles
  );
END;
$$;

ALTER FUNCTION app_private.update_person_preserving_unmapped_fields_for_import(uuid, uuid, jsonb, text[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.update_person_preserving_unmapped_fields_for_import(uuid, uuid, jsonb, text[])
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_function constant regprocedure := 'public.commit_generic_import_run_internal(uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.replace(pg_catalog.pg_get_functiondef(v_function), E'\r\n', E'\n');
  v_old_call text := $old$          PERFORM public.update_person(
            (staged_row.normalized_data ->> 'existingPersonId')::uuid,
            p_organization_id,
            staged_row.normalized_data ->> 'displayName',
            NULLIF(staged_row.normalized_data ->> 'legalName', ''),
            staged_row.normalized_data ->> 'partyType',
            NULLIF(staged_row.normalized_data ->> 'primaryEmail', ''),
            NULLIF(staged_row.normalized_data ->> 'primaryPhone', ''),
            NULLIF(staged_row.normalized_data ->> 'taxIdentifier', ''),
            NULLIF(staged_row.normalized_data ->> 'notes', ''),
            coalesce(v_roles, ARRAY[]::text[])
          );$old$;
  v_new_call text := $new$          PERFORM app_private.update_person_preserving_unmapped_fields_for_import(
            (staged_row.normalized_data ->> 'existingPersonId')::uuid,
            p_organization_id,
            staged_row.normalized_data,
            coalesce(v_roles, ARRAY[]::text[])
          );$new$;
BEGIN
  v_old_call := pg_catalog.replace(v_old_call, E'\r\n', E'\n');
  v_new_call := pg_catalog.replace(v_new_call, E'\r\n', E'\n');

  IF (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old_call, '')))
    / pg_catalog.length(v_old_call) <> 1 THEN
    RAISE EXCEPTION 'Expected one existing-person import update call in %', v_function
      USING ERRCODE = '55000';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_old_call, v_new_call);
END;
$$;
