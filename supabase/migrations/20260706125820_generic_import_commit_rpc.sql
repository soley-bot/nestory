CREATE OR REPLACE FUNCTION public.commit_generic_import_run(
  p_import_run_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  run_row public.import_runs%ROWTYPE;
  staged_row public.import_rows%ROWTYPE;
  v_import_type text;
  v_roles text[];
  created_total integer := 0;
  updated_total integer := 0;
  failed_total integer := 0;
  skipped_total integer := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO run_row
  FROM public.import_runs
  WHERE id = p_import_run_id
    AND organization_id = p_organization_id
    AND import_type IN ('properties', 'people', 'leases')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run not found' USING ERRCODE = '23503';
  END IF;

  IF run_row.status IN ('committed', 'committed_with_errors') THEN
    RAISE EXCEPTION 'Import run has already been committed' USING ERRCODE = '22023';
  END IF;

  v_import_type := run_row.import_type;

  UPDATE public.import_runs
  SET
    status = 'committing',
    error_message = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = run_row.id;

  SELECT count(*)
  INTO skipped_total
  FROM public.import_rows
  WHERE import_run_id = run_row.id
    AND organization_id = p_organization_id
    AND row_status = 'error';

  FOR staged_row IN
    SELECT *
    FROM public.import_rows
    WHERE import_run_id = run_row.id
      AND organization_id = p_organization_id
      AND row_status IN ('ready', 'warning')
    ORDER BY source_row_number
    FOR UPDATE
  LOOP
    BEGIN
      IF v_import_type = 'properties' THEN
        IF NULLIF(staged_row.normalized_data ->> 'existingPropertyId', '') IS NULL THEN
          PERFORM public.create_property(
            p_organization_id,
            staged_row.normalized_data ->> 'name',
            staged_row.normalized_data ->> 'code',
            staged_row.normalized_data ->> 'propertyType',
            NULLIF(staged_row.normalized_data ->> 'owner', ''),
            NULLIF(staged_row.normalized_data ->> 'address', ''),
            staged_row.normalized_data ->> 'status',
            NULLIF(staged_row.normalized_data ->> 'acquisitionDate', '')::date,
            NULLIF(staged_row.normalized_data ->> 'notes', ''),
            NULL
          );

          created_total := created_total + 1;
        ELSE
          PERFORM public.update_property(
            (staged_row.normalized_data ->> 'existingPropertyId')::uuid,
            p_organization_id,
            staged_row.normalized_data ->> 'name',
            staged_row.normalized_data ->> 'code',
            staged_row.normalized_data ->> 'propertyType',
            NULLIF(staged_row.normalized_data ->> 'owner', ''),
            NULLIF(staged_row.normalized_data ->> 'address', ''),
            staged_row.normalized_data ->> 'status',
            NULLIF(staged_row.normalized_data ->> 'acquisitionDate', '')::date,
            NULLIF(staged_row.normalized_data ->> 'notes', ''),
            NULL
          );

          updated_total := updated_total + 1;
        END IF;
      ELSIF v_import_type = 'people' THEN
        SELECT array_agg(role_value)
        INTO v_roles
        FROM jsonb_array_elements_text(
          coalesce(staged_row.normalized_data -> 'roles', '[]'::jsonb)
        ) AS role_value;

        IF NULLIF(staged_row.normalized_data ->> 'existingPersonId', '') IS NULL THEN
          PERFORM public.create_person(
            p_organization_id,
            staged_row.normalized_data ->> 'displayName',
            NULLIF(staged_row.normalized_data ->> 'legalName', ''),
            staged_row.normalized_data ->> 'partyType',
            NULLIF(staged_row.normalized_data ->> 'primaryEmail', ''),
            NULLIF(staged_row.normalized_data ->> 'primaryPhone', ''),
            NULLIF(staged_row.normalized_data ->> 'taxIdentifier', ''),
            NULLIF(staged_row.normalized_data ->> 'notes', ''),
            coalesce(v_roles, ARRAY[]::text[])
          );

          created_total := created_total + 1;
        ELSE
          PERFORM public.update_person(
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
          );

          updated_total := updated_total + 1;
        END IF;
      ELSIF v_import_type = 'leases' THEN
        PERFORM public.create_lease(
          p_organization_id,
          (staged_row.normalized_data ->> 'propertyId')::uuid,
          (staged_row.normalized_data ->> 'unitId')::uuid,
          (staged_row.normalized_data ->> 'tenantPersonId')::uuid,
          (staged_row.normalized_data ->> 'leaseStartDate')::date,
          (staged_row.normalized_data ->> 'leaseEndDate')::date,
          (staged_row.normalized_data ->> 'monthlyRentAmount')::numeric,
          'USD'::public.currency_code,
          NULLIF(staged_row.normalized_data ->> 'depositAmount', '')::numeric,
          CASE
            WHEN NULLIF(staged_row.normalized_data ->> 'depositAmount', '') IS NULL
              THEN NULL
            ELSE 'USD'::public.currency_code
          END,
          staged_row.normalized_data ->> 'status'
        );

        created_total := created_total + 1;
      ELSE
        RAISE EXCEPTION 'Import type is not supported' USING ERRCODE = '22023';
      END IF;

      UPDATE public.import_rows
      SET
        row_status = 'committed',
        result_action = CASE
          WHEN v_import_type = 'leases' THEN 'created'
          WHEN NULLIF(staged_row.normalized_data ->> 'existingPropertyId', '') IS NOT NULL THEN 'updated'
          WHEN NULLIF(staged_row.normalized_data ->> 'existingPersonId', '') IS NOT NULL THEN 'updated'
          ELSE 'created'
        END,
        error_message = NULL
      WHERE id = staged_row.id;
    EXCEPTION WHEN OTHERS THEN
      failed_total := failed_total + 1;

      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = SQLERRM,
        issues = coalesce(issues, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'level', 'error',
            'message', SQLERRM
          )
        )
      WHERE id = staged_row.id;
    END;
  END LOOP;

  UPDATE public.import_runs
  SET
    status = CASE
      WHEN failed_total > 0 AND created_total + updated_total > 0 THEN 'committed_with_errors'
      WHEN failed_total > 0 THEN 'failed'
      ELSE 'committed'
    END,
    created_count = created_total,
    updated_count = updated_total,
    failed_count = failed_total,
    skipped_count = skipped_total,
    committed_at = now(),
    error_message = CASE WHEN failed_total > 0 THEN 'Some rows could not be committed.' ELSE NULL END,
    updated_by = (SELECT auth.uid())
  WHERE id = run_row.id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'import',
    run_row.id,
    'generic_import_committed',
    jsonb_build_object(
      'import_run_id', run_row.id,
      'import_type', v_import_type,
      'created_count', created_total,
      'updated_count', updated_total,
      'failed_count', failed_total,
      'skipped_count', skipped_total,
      'source_file_name', run_row.source_file_name
    )
  );

  RETURN jsonb_build_object(
    'created', created_total,
    'updated', updated_total,
    'failed', failed_total,
    'skipped', skipped_total,
    'status', CASE
      WHEN failed_total > 0 AND created_total + updated_total > 0 THEN 'committed_with_errors'
      WHEN failed_total > 0 THEN 'failed'
      ELSE 'committed'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_generic_import_run(uuid, uuid) TO authenticated;
