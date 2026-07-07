ALTER TABLE public.leases
  DROP CONSTRAINT IF EXISTS leases_date_range_check;

ALTER TABLE public.leases
  ADD CONSTRAINT leases_date_range_check CHECK (lease_end_date > lease_start_date) NOT VALID;

CREATE OR REPLACE FUNCTION public.create_lease(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_monthly_rent_amount numeric,
  p_monthly_rent_currency public.currency_code,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_lease_id uuid;
  normalized_status text := lower(trim(coalesce(p_status, '')));
  tenant_display_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_status NOT IN ('active', 'cancelled', 'draft', 'ended', 'notice_given', 'terminated') THEN
    RAISE EXCEPTION 'Lease status is not supported' USING ERRCODE = '22023';
  END IF;

  IF p_lease_end_date <= p_lease_start_date THEN
    RAISE EXCEPTION 'End date must be after the start date' USING ERRCODE = '22023';
  END IF;

  IF p_monthly_rent_amount < 0 THEN
    RAISE EXCEPTION 'Monthly rent cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_amount < 0 THEN
    RAISE EXCEPTION 'Deposit cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_deposit_amount IS NULL) <> (p_deposit_currency IS NULL) THEN
    RAISE EXCEPTION 'Deposit amount and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  SELECT display_name
  INTO tenant_display_name
  FROM public.people
  WHERE id = p_primary_tenant_person_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL;

  IF tenant_display_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = p_unit_id
      AND organization_id = p_organization_id
      AND property_id = p_property_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found under selected property' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL
    AND normalized_status IN ('active', 'draft', 'notice_given')
    AND EXISTS (
      SELECT 1
      FROM public.lease_occupancies
      WHERE organization_id = p_organization_id
        AND unit_id = p_unit_id
        AND archived_at IS NULL
        AND actual_move_out_date IS NULL
        AND status IN ('reserved', 'occupied', 'notice_given')
    )
  THEN
    RAISE EXCEPTION 'Unit already has an open lease' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.leases (
    organization_id,
    property_id,
    unit_id,
    tenant_name,
    primary_tenant_person_id,
    lease_start_date,
    lease_end_date,
    monthly_rent_amount,
    monthly_rent_currency,
    deposit_amount,
    deposit_currency,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    tenant_display_name,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_monthly_rent_amount,
    p_monthly_rent_currency,
    p_deposit_amount,
    p_deposit_currency,
    normalized_status,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_lease_id;

  PERFORM app_private.mark_unit_occupied_for_lease(
    p_organization_id,
    p_property_id,
    p_unit_id,
    normalized_status
  );

  RETURN new_lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_lease(
  p_lease_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_monthly_rent_amount numeric,
  p_monthly_rent_currency public.currency_code,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  normalized_status text := lower(trim(coalesce(p_status, '')));
  tenant_display_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.leases
  WHERE id = p_lease_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_status NOT IN ('active', 'cancelled', 'draft', 'ended', 'notice_given', 'terminated') THEN
    RAISE EXCEPTION 'Lease status is not supported' USING ERRCODE = '22023';
  END IF;

  IF p_lease_end_date <= p_lease_start_date THEN
    RAISE EXCEPTION 'End date must be after the start date' USING ERRCODE = '22023';
  END IF;

  IF p_monthly_rent_amount < 0 THEN
    RAISE EXCEPTION 'Monthly rent cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_deposit_amount IS NOT NULL AND p_deposit_amount < 0 THEN
    RAISE EXCEPTION 'Deposit cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_deposit_amount IS NULL) <> (p_deposit_currency IS NULL) THEN
    RAISE EXCEPTION 'Deposit amount and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  SELECT display_name
  INTO tenant_display_name
  FROM public.people
  WHERE id = p_primary_tenant_person_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL;

  IF tenant_display_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = p_unit_id
      AND organization_id = p_organization_id
      AND property_id = p_property_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found under selected property' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL
    AND normalized_status IN ('active', 'draft', 'notice_given')
    AND EXISTS (
      SELECT 1
      FROM public.lease_occupancies
      WHERE organization_id = p_organization_id
        AND unit_id = p_unit_id
        AND lease_id <> p_lease_id
        AND archived_at IS NULL
        AND actual_move_out_date IS NULL
        AND status IN ('reserved', 'occupied', 'notice_given')
    )
  THEN
    RAISE EXCEPTION 'Unit already has an open lease' USING ERRCODE = '23505';
  END IF;

  UPDATE public.leases
  SET
    property_id = p_property_id,
    unit_id = p_unit_id,
    tenant_name = tenant_display_name,
    primary_tenant_person_id = p_primary_tenant_person_id,
    lease_start_date = p_lease_start_date,
    lease_end_date = p_lease_end_date,
    monthly_rent_amount = p_monthly_rent_amount,
    monthly_rent_currency = p_monthly_rent_currency,
    deposit_amount = p_deposit_amount,
    deposit_currency = p_deposit_currency,
    status = normalized_status,
    updated_by = (SELECT auth.uid())
  WHERE id = p_lease_id
    AND organization_id = p_organization_id;

  PERFORM app_private.mark_unit_occupied_for_lease(
    p_organization_id,
    p_property_id,
    p_unit_id,
    normalized_status
  );

  RETURN p_lease_id;
END;
$$;

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
  v_row_error text;
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
      v_row_error := SQLERRM;

      IF v_import_type = 'leases'
        AND (
          v_row_error ILIKE '%Unit already has an open lease%'
          OR v_row_error ILIKE '%lease_occupancies_one_active_unit_idx%'
        )
      THEN
        v_row_error := 'Unit already has an open lease. End or cancel the existing lease before importing another open lease.';
      END IF;

      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = v_row_error,
        issues = coalesce(issues, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'level', 'error',
            'message', v_row_error
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

GRANT EXECUTE ON FUNCTION public.create_lease(uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, numeric, public.currency_code, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_lease(uuid, uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, numeric, public.currency_code, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_generic_import_run(uuid, uuid) TO authenticated;
