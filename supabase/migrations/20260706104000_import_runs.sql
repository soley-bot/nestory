CREATE TABLE public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_type text NOT NULL CHECK (import_type IN ('units')),
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'committing', 'committed', 'committed_with_errors', 'failed')),
  source_file_name text NOT NULL,
  source_file_size bigint NOT NULL DEFAULT 0 CHECK (source_file_size >= 0),
  source_mime_type text,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  ready_rows integer NOT NULL DEFAULT 0 CHECK (ready_rows >= 0),
  warning_rows integer NOT NULL DEFAULT 0 CHECK (warning_rows >= 0),
  error_rows integer NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  error_message text,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES public.import_runs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  row_status text NOT NULL CHECK (row_status IN ('ready', 'warning', 'error', 'committed', 'failed')),
  action_label text NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_action text CHECK (result_action IS NULL OR result_action IN ('created', 'updated')),
  result_unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_run_id, source_row_number)
);

CREATE TRIGGER set_import_runs_updated_at
BEFORE UPDATE ON public.import_runs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_import_rows_updated_at
BEFORE UPDATE ON public.import_rows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX import_runs_org_created_idx
  ON public.import_runs (organization_id, created_at DESC);

CREATE INDEX import_runs_org_status_idx
  ON public.import_runs (organization_id, status, created_at DESC);

CREATE INDEX import_rows_run_status_idx
  ON public.import_rows (import_run_id, row_status, source_row_number);

CREATE INDEX import_rows_org_run_idx
  ON public.import_rows (organization_id, import_run_id);

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rows TO authenticated;
GRANT ALL PRIVILEGES ON public.import_runs TO service_role;
GRANT ALL PRIVILEGES ON public.import_rows TO service_role;

CREATE POLICY "Admins can manage import runs"
ON public.import_runs
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage import rows"
ON public.import_rows
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION public.commit_unit_import_run(
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
  old_unit public.units%ROWTYPE;
  new_unit public.units%ROWTYPE;
  v_property_id uuid;
  v_unit_number text;
  v_floor text;
  v_size_sqm numeric;
  v_status text;
  v_rent_amount numeric;
  v_mapped_floor boolean;
  v_mapped_size boolean;
  v_mapped_status boolean;
  v_mapped_rent boolean;
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
    AND import_type = 'units'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run not found' USING ERRCODE = '23503';
  END IF;

  IF run_row.status IN ('committed', 'committed_with_errors') THEN
    RAISE EXCEPTION 'Import run has already been committed' USING ERRCODE = '22023';
  END IF;

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
      v_property_id := (staged_row.normalized_data ->> 'propertyId')::uuid;
      v_unit_number := trim(staged_row.normalized_data ->> 'unitNumber');
      v_floor := NULLIF(trim(coalesce(staged_row.normalized_data ->> 'floor', '')), '');
      v_size_sqm := (staged_row.normalized_data ->> 'sizeSqm')::numeric;
      v_status := lower(trim(coalesce(staged_row.normalized_data ->> 'status', 'vacant')));
      v_rent_amount := (staged_row.normalized_data ->> 'currentRentAmount')::numeric;
      v_mapped_floor := coalesce(staged_row.normalized_data #>> '{mappedFields,floor}', 'false')::boolean;
      v_mapped_size := coalesce(staged_row.normalized_data #>> '{mappedFields,sizeSqm}', 'false')::boolean;
      v_mapped_status := coalesce(staged_row.normalized_data #>> '{mappedFields,status}', 'false')::boolean;
      v_mapped_rent := coalesce(staged_row.normalized_data #>> '{mappedFields,currentRentAmount}', 'false')::boolean;

      IF NOT EXISTS (
        SELECT 1
        FROM public.properties
        WHERE id = v_property_id
          AND organization_id = p_organization_id
          AND archived_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Property no longer exists or is archived' USING ERRCODE = '23503';
      END IF;

      SELECT *
      INTO old_unit
      FROM public.units
      WHERE organization_id = p_organization_id
        AND property_id = v_property_id
        AND lower(unit_number) = lower(v_unit_number)
        AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.units
        SET
          unit_number = v_unit_number,
          floor = CASE WHEN v_mapped_floor THEN v_floor ELSE old_unit.floor END,
          size_sqm = CASE WHEN v_mapped_size THEN v_size_sqm ELSE old_unit.size_sqm END,
          status = CASE WHEN v_mapped_status THEN v_status ELSE old_unit.status END,
          current_rent_amount = CASE WHEN v_mapped_rent THEN v_rent_amount ELSE old_unit.current_rent_amount END,
          current_rent_currency = CASE
            WHEN v_mapped_rent AND v_rent_amount IS NULL THEN NULL
            WHEN v_mapped_rent THEN 'USD'::public.currency_code
            ELSE old_unit.current_rent_currency
          END,
          updated_by = (SELECT auth.uid())
        WHERE id = old_unit.id
        RETURNING * INTO new_unit;

        INSERT INTO public.activity_logs (
          organization_id,
          actor_id,
          entity_type,
          entity_id,
          action,
          previous_values,
          new_values
        )
        VALUES (
          p_organization_id,
          (SELECT auth.uid()),
          'unit',
          new_unit.id,
          'unit_updated',
          jsonb_build_object(
            'property_id', old_unit.property_id,
            'unit_number', old_unit.unit_number,
            'floor', old_unit.floor,
            'size_sqm', old_unit.size_sqm,
            'status', old_unit.status,
            'current_rent_amount', old_unit.current_rent_amount,
            'current_rent_currency', old_unit.current_rent_currency,
            'archived_at', old_unit.archived_at,
            'archived_by', old_unit.archived_by
          ),
          jsonb_build_object(
            'property_id', new_unit.property_id,
            'unit_number', new_unit.unit_number,
            'floor', new_unit.floor,
            'size_sqm', new_unit.size_sqm,
            'status', new_unit.status,
            'current_rent_amount', new_unit.current_rent_amount,
            'current_rent_currency', new_unit.current_rent_currency,
            'archived_at', new_unit.archived_at,
            'archived_by', new_unit.archived_by
          )
        );

        UPDATE public.import_rows
        SET
          row_status = 'committed',
          result_action = 'updated',
          result_unit_id = new_unit.id,
          error_message = NULL
        WHERE id = staged_row.id;

        updated_total := updated_total + 1;
      ELSE
        IF EXISTS (
          SELECT 1
          FROM public.units
          WHERE organization_id = p_organization_id
            AND property_id = v_property_id
            AND lower(unit_number) = lower(v_unit_number)
            AND archived_at IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'An archived unit with this property and unit number already exists'
            USING ERRCODE = '23505';
        END IF;

        INSERT INTO public.units (
          organization_id,
          property_id,
          unit_number,
          floor,
          size_sqm,
          status,
          current_rent_amount,
          current_rent_currency,
          created_by,
          updated_by
        )
        VALUES (
          p_organization_id,
          v_property_id,
          v_unit_number,
          v_floor,
          v_size_sqm,
          v_status,
          v_rent_amount,
          CASE WHEN v_rent_amount IS NULL THEN NULL ELSE 'USD'::public.currency_code END,
          (SELECT auth.uid()),
          (SELECT auth.uid())
        )
        RETURNING * INTO new_unit;

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
          'unit',
          new_unit.id,
          'unit_created',
          jsonb_build_object(
            'property_id', new_unit.property_id,
            'unit_number', new_unit.unit_number,
            'floor', new_unit.floor,
            'size_sqm', new_unit.size_sqm,
            'status', new_unit.status,
            'current_rent_amount', new_unit.current_rent_amount,
            'current_rent_currency', new_unit.current_rent_currency,
            'archived_at', new_unit.archived_at,
            'archived_by', new_unit.archived_by
          )
        );

        UPDATE public.import_rows
        SET
          row_status = 'committed',
          result_action = 'created',
          result_unit_id = new_unit.id,
          error_message = NULL
        WHERE id = staged_row.id;

        created_total := created_total + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      failed_total := failed_total + 1;

      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = SQLERRM,
        issues = issues || jsonb_build_array(
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
    'unit_import_committed',
    jsonb_build_object(
      'import_run_id', run_row.id,
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

GRANT EXECUTE ON FUNCTION public.commit_unit_import_run(uuid, uuid) TO authenticated;
