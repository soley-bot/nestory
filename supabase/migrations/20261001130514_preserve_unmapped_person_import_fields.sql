CREATE FUNCTION app_private.trim_import_cell(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.btrim(p_value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

ALTER FUNCTION app_private.trim_import_cell(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.trim_import_cell(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.update_person_preserving_unmapped_fields_for_import(
  p_person_id uuid,
  p_organization_id uuid,
  p_normalized_data jsonb,
  p_mapping jsonb,
  p_raw_data jsonb,
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
      WHEN NULLIF(p_mapping ->> 'legalName', '') IS NOT NULL THEN app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'legalName'))
      ELSE v_person.legal_name
    END,
    CASE
      WHEN NULLIF(app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'partyType')), '') IS NOT NULL
        THEN p_normalized_data ->> 'partyType'
      ELSE v_person.party_type
    END,
    CASE
      WHEN NULLIF(p_mapping ->> 'primaryEmail', '') IS NOT NULL THEN app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'primaryEmail'))
      ELSE v_person.primary_email
    END,
    CASE
      WHEN NULLIF(p_mapping ->> 'primaryPhone', '') IS NOT NULL THEN app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'primaryPhone'))
      ELSE v_person.primary_phone
    END,
    CASE
      WHEN NULLIF(p_mapping ->> 'taxIdentifier', '') IS NOT NULL THEN app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'taxIdentifier'))
      ELSE v_person.tax_identifier
    END,
    CASE
      WHEN NULLIF(p_mapping ->> 'notes', '') IS NOT NULL THEN app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'notes'))
      ELSE v_person.notes
    END,
    p_roles
  );
END;
$$;

ALTER FUNCTION app_private.update_person_preserving_unmapped_fields_for_import(uuid, uuid, jsonb, jsonb, jsonb, text[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.update_person_preserving_unmapped_fields_for_import(uuid, uuid, jsonb, jsonb, jsonb, text[])
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
            run_row.mapping,
            staged_row.raw_data,
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

CREATE FUNCTION app_private.assert_import_person_identity(
  p_organization_id uuid,
  p_import_type text,
  p_mapping jsonb,
  p_raw_data jsonb,
  p_normalized_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_person_id_text text;
  v_person_id uuid;
  v_staged_id uuid;
  v_email text;
  v_name text;
  v_matches uuid[];
  v_matched_id uuid;
  v_matched_email text;
  v_problem text;
BEGIN
  IF p_import_type = 'people' THEN
    v_person_id_text := NULLIF(app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'personId')), '');
    v_email := NULLIF(pg_catalog.lower(app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'primaryEmail'))), '');
    v_name := NULLIF(pg_catalog.lower(app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'displayName'))), '');
  ELSIF p_import_type = 'leases' THEN
    v_person_id_text := NULLIF(app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'tenantPersonId')), '');
    v_email := NULLIF(pg_catalog.lower(app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'tenantEmail'))), '');
    v_name := NULLIF(pg_catalog.lower(app_private.trim_import_cell(p_raw_data ->> (p_mapping ->> 'tenantName'))), '');
  ELSE
    RAISE EXCEPTION 'Unsupported person identity import type' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_staged_id := NULLIF(p_normalized_data ->> CASE WHEN p_import_type = 'people' THEN 'existingPersonId' ELSE 'tenantPersonId' END, '')::uuid;
    v_person_id := v_person_id_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Re-upload this import: person identity contains an invalid ID.'
      USING ERRCODE = '23514', DETAIL = 'import_person_identity_needs_review';
  END;

  IF v_person_id IS NOT NULL THEN
    SELECT person.id, pg_catalog.lower(app_private.trim_import_cell(coalesce(person.primary_email, '')))
    INTO v_matched_id, v_matched_email
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = v_person_id
      AND person.archived_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      v_problem := 'the mapped person ID is unavailable in this organization';
    ELSIF p_import_type = 'leases' AND v_email IS NOT NULL AND v_matched_email <> v_email THEN
      v_problem := 'the mapped tenant person ID and email identify different people';
    END IF;
  ELSIF v_email IS NOT NULL OR v_name IS NOT NULL THEN
    SELECT coalesce(pg_catalog.array_agg(candidate.id), ARRAY[]::uuid[])
    INTO v_matches
    FROM (
      SELECT person.id
      FROM public.people AS person
      WHERE person.organization_id = p_organization_id
        AND person.archived_at IS NULL
        AND CASE WHEN v_email IS NOT NULL
          THEN pg_catalog.lower(app_private.trim_import_cell(person.primary_email)) = v_email
          ELSE pg_catalog.lower(app_private.trim_import_cell(person.display_name)) = v_name
        END
      ORDER BY person.id
      FOR UPDATE
    ) AS candidate;

    IF pg_catalog.cardinality(v_matches) > 1 THEN
      v_problem := 'person identity is ambiguous; map an explicit person ID';
    ELSIF pg_catalog.cardinality(v_matches) = 1 THEN
      v_matched_id := v_matches[1];
    ELSIF p_import_type = 'leases' THEN
      v_problem := 'no person matches the mapped tenant identity';
    END IF;
  ELSE
    v_problem := 'map a person ID, email, or name to confirm person identity';
  END IF;

  IF v_problem IS NULL AND v_matched_id IS DISTINCT FROM v_staged_id THEN
    v_problem := 'person identity no longer matches the staged selection';
  END IF;

  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'Re-upload this import: %.', v_problem
      USING ERRCODE = '23514', DETAIL = 'import_person_identity_needs_review';
  END IF;
END;
$$;

ALTER FUNCTION app_private.assert_import_person_identity(uuid, text, jsonb, jsonb, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_import_person_identity(uuid, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_function constant regprocedure := 'public.commit_generic_import_run(uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.replace(pg_catalog.pg_get_functiondef(v_function), E'\r\n', E'\n');
  v_declaration constant text := '  v_run public.import_runs%ROWTYPE;';
  v_anchor constant text := E'\n  PERFORM set_config(\n    ''app.atomic_import_write_context'',\n    jsonb_build_object(\n';
  v_preflight text := $preflight$
  IF v_run.import_type IN ('people', 'leases') THEN
    FOR v_identity_row IN
      SELECT rows.*
      FROM public.import_rows AS rows
      WHERE rows.import_run_id = v_run.id
        AND rows.organization_id = p_organization_id
        AND rows.row_status IN ('ready', 'warning')
      ORDER BY rows.source_row_number
      FOR UPDATE
    LOOP
      PERFORM app_private.assert_import_person_identity(
        p_organization_id,
        v_run.import_type,
        v_run.mapping,
        v_identity_row.raw_data,
        v_identity_row.normalized_data
      );
    END LOOP;
  END IF;
$preflight$;
BEGIN
  v_preflight := pg_catalog.replace(v_preflight, E'\r\n', E'\n');

  IF (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_declaration, '')))
    / pg_catalog.length(v_declaration) <> 1
    OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_anchor, '')))
    / pg_catalog.length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Expected checked import identity preflight anchors in %', v_function
      USING ERRCODE = '55000';
  END IF;

  v_definition := pg_catalog.replace(v_definition, v_declaration,
    v_declaration || E'\n  v_identity_row public.import_rows%ROWTYPE;');
  EXECUTE pg_catalog.replace(v_definition, v_anchor, v_preflight || v_anchor);
END;
$$;
