CREATE OR REPLACE FUNCTION app_private.cancel_exact_lease_update_noop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.cancel_exact_lease_update_noop()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS aa_cancel_exact_lease_update_noop
ON public.leases;
CREATE TRIGGER aa_cancel_exact_lease_update_noop
BEFORE UPDATE
ON public.leases
FOR EACH ROW
EXECUTE FUNCTION app_private.cancel_exact_lease_update_noop();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.import_rows AS rows
    JOIN public.import_runs AS runs
      ON runs.id = rows.import_run_id
    WHERE rows.organization_id IS DISTINCT FROM runs.organization_id
  ) THEN
    RAISE EXCEPTION
      'Import rows must belong to the exact organization-scoped parent run'
      USING
        ERRCODE = '23514',
        DETAIL = 'import_row_parent_organization_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.import_rows AS rows
    JOIN public.import_runs AS runs
      ON runs.id = rows.import_run_id
    WHERE runs.import_type <> 'leases'
      AND (
        rows.result_lease_id IS NOT NULL
        OR rows.result_lease_party_id IS NOT NULL
        OR rows.result_lease_occupancy_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.lease_parties AS parties
          WHERE parties.organization_id = rows.organization_id
            AND parties.source_import_row_id = rows.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.lease_occupancies AS occupancies
          WHERE occupancies.organization_id = rows.organization_id
            AND occupancies.source_import_row_id = rows.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.lease_occupancy_participants AS participants
          WHERE participants.organization_id = rows.organization_id
            AND participants.source_import_row_id = rows.id
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Non-Lease import rows cannot carry Lease result or source provenance'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_import_type_mismatch';
  END IF;
END;
$$;

ALTER TABLE public.import_runs
  ADD CONSTRAINT import_runs_organization_id_id_unique
  UNIQUE (organization_id, id);

ALTER TABLE public.import_rows
  ADD CONSTRAINT import_rows_organization_id_import_run_id_fkey
  FOREIGN KEY (organization_id, import_run_id)
  REFERENCES public.import_runs(organization_id, id)
  ON DELETE NO ACTION;

CREATE OR REPLACE FUNCTION app_private.guard_person_lease_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_checked_archive boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.person_archive_context', true),
      ''
    ) = 'checked-person-archive-v1';
  v_checked_restore boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.person_restore_context', true),
      ''
    ) = 'checked-person-restore-v1';
  v_trusted_fixture boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('role', true), 'none')
      IN ('none', 'postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.people_leases_skip_sync', true),
      ''
    ) = 'on';
  v_has_open_relationship boolean;
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;

  IF v_trusted_fixture THEN
    RETURN NEW;
  END IF;

  IF OLD.archived_at IS NOT NULL THEN
    IF NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at
      AND NEW.archived_by IS NOT DISTINCT FROM OLD.archived_by THEN
      RETURN NEW;
    END IF;

    IF NEW.archived_at IS NULL AND NEW.archived_by IS NULL THEN
      IF NOT v_checked_restore THEN
        RAISE EXCEPTION
          'Person restore requires the checked restore operation'
          USING
            ERRCODE = '42501',
            DETAIL = 'person_restore_checked_operation_required';
      END IF;

      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Person archive metadata is immutable after the first archive'
      USING
        ERRCODE = '55000',
        DETAIL = 'person_archive_metadata_immutable';
  END IF;

  IF NEW.archived_at IS NULL THEN
    IF NEW.archived_by IS NOT NULL THEN
      RAISE EXCEPTION
        'Person archive metadata must change as one checked tuple'
        USING
          ERRCODE = '55000',
          DETAIL = 'person_archive_metadata_immutable';
    END IF;

    RETURN NEW;
  END IF;

  v_has_open_relationship :=
    EXISTS (
      SELECT 1
      FROM public.leases AS leases
      WHERE leases.organization_id = OLD.organization_id
        AND leases.primary_tenant_person_id = OLD.id
        AND leases.archived_at IS NULL
        AND leases.status IN ('active', 'draft', 'notice_given')
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      JOIN public.leases AS leases
        ON leases.organization_id = parties.organization_id
        AND leases.id = parties.lease_id
      WHERE parties.organization_id = OLD.organization_id
        AND parties.person_id = OLD.id
        AND parties.archived_at IS NULL
        AND leases.archived_at IS NULL
        AND (
          (
            parties.evidence_state = 'legacy_unresolved'
            AND parties.ended_on IS NULL
          )
          OR (
            parties.evidence_state = 'accepted'
            AND parties.business_lifecycle IN ('planned', 'effective')
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancy_participants AS participants
      JOIN public.lease_parties AS parties
        ON parties.organization_id = participants.organization_id
        AND parties.id = participants.lease_party_id
      WHERE participants.organization_id = OLD.organization_id
        AND parties.person_id = OLD.id
        AND participants.evidence_state = 'accepted'
        AND participants.business_lifecycle IN ('planned', 'present')
    );

  IF v_has_open_relationship THEN
    RAISE EXCEPTION
      'End or cancel the open Lease relationship through a checked transition before archiving this Person'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  IF NEW.archived_by IS NULL THEN
    RAISE EXCEPTION
      'Person archive metadata must change as one checked tuple'
      USING
        ERRCODE = '55000',
        DETAIL = 'person_archive_metadata_immutable';
  END IF;

  IF NOT v_checked_archive THEN
    RAISE EXCEPTION
      'Person archive requires the checked archive operation'
      USING
        ERRCODE = '42501',
        DETAIL = 'person_archive_checked_operation_required';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_person_lease_archive()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_person_lease_archive
ON public.people;
CREATE TRIGGER guard_person_lease_archive
BEFORE UPDATE OF archived_at, archived_by
ON public.people
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_person_lease_archive();

CREATE OR REPLACE FUNCTION public.archive_person(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_archive_context text :=
    current_setting('app.person_archive_context', true);
  v_new_person public.people%ROWTYPE;
  v_old_person public.people%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT people.*
  INTO v_old_person
  FROM public.people AS people
  WHERE people.id = p_person_id
    AND people.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  IF v_old_person.archived_at IS NOT NULL THEN
    RETURN p_person_id;
  END IF;

  IF app_private.person_has_open_lease_relationship(
    p_organization_id,
    p_person_id
  ) THEN
    RAISE EXCEPTION
      'End or cancel the open Lease relationship through a checked transition before archiving this Person'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  PERFORM set_config(
    'app.person_archive_context',
    'checked-person-archive-v1',
    true
  );

  BEGIN
    UPDATE public.people
    SET
      archived_at = now(),
      archived_by = (SELECT auth.uid()),
      updated_by = (SELECT auth.uid())
    WHERE id = p_person_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
    RETURNING * INTO v_new_person;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checked Person archive was rejected'
        USING
          ERRCODE = '55000',
          DETAIL = 'person_archive_checked_operation_required';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.person_archive_context',
      coalesce(v_archive_context, ''),
      true
    );
    RAISE;
  END;

  PERFORM set_config(
    'app.person_archive_context',
    coalesce(v_archive_context, ''),
    true
  );

  INSERT INTO public.activity_logs(
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
    'person',
    p_person_id,
    'archived',
    jsonb_build_object(
      'archived_at', v_old_person.archived_at,
      'display_name', v_old_person.display_name
    ),
    jsonb_build_object(
      'archived_at', v_new_person.archived_at,
      'display_name', v_new_person.display_name
    )
  );

  RETURN p_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_person(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_person public.people%ROWTYPE;
  v_old_person public.people%ROWTYPE;
  v_restore_context text :=
    current_setting('app.person_restore_context', true);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT people.*
  INTO v_old_person
  FROM public.people AS people
  WHERE people.id = p_person_id
    AND people.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  IF v_old_person.archived_at IS NULL THEN
    RETURN p_person_id;
  END IF;

  PERFORM set_config(
    'app.person_restore_context',
    'checked-person-restore-v1',
    true
  );

  BEGIN
    UPDATE public.people
    SET
      archived_at = NULL,
      archived_by = NULL,
      updated_by = (SELECT auth.uid())
    WHERE id = p_person_id
      AND organization_id = p_organization_id
      AND archived_at IS NOT NULL
    RETURNING * INTO v_new_person;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checked Person restore was rejected'
        USING
          ERRCODE = '55000',
          DETAIL = 'person_restore_checked_operation_required';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.person_restore_context',
      coalesce(v_restore_context, ''),
      true
    );
    RAISE;
  END;

  PERFORM set_config(
    'app.person_restore_context',
    coalesce(v_restore_context, ''),
    true
  );

  INSERT INTO public.activity_logs(
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
    'person',
    p_person_id,
    'restored',
    jsonb_build_object(
      'archived_at', v_old_person.archived_at,
      'display_name', v_old_person.display_name
    ),
    jsonb_build_object(
      'archived_at', v_new_person.archived_at,
      'display_name', v_new_person.display_name
    )
  );

  RETURN p_person_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.archive_person(uuid, uuid),
  public.restore_person(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.archive_person(uuid, uuid),
  public.restore_person(uuid, uuid)
TO authenticated;

REVOKE INSERT, UPDATE ON public.import_rows FROM authenticated;

GRANT INSERT (
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  raw_data,
  normalized_data,
  issues,
  result_action,
  result_unit_id,
  error_message
) ON public.import_rows TO authenticated;

GRANT UPDATE (
  id,
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  raw_data,
  normalized_data,
  issues,
  result_action,
  result_unit_id,
  error_message
) ON public.import_rows TO authenticated;

REVOKE INSERT, UPDATE ON public.import_runs FROM authenticated;

GRANT INSERT (
  id,
  organization_id,
  import_type,
  status,
  source_file_name,
  source_file_size,
  source_mime_type,
  headers,
  mapping,
  total_rows,
  ready_rows,
  warning_rows,
  error_rows,
  created_count,
  updated_count,
  failed_count,
  skipped_count,
  error_message,
  committed_at,
  created_by,
  updated_by
) ON public.import_runs TO authenticated;

GRANT UPDATE (
  id,
  organization_id,
  import_type,
  status,
  source_file_name,
  source_file_size,
  source_mime_type,
  headers,
  mapping,
  total_rows,
  ready_rows,
  warning_rows,
  error_rows,
  created_count,
  updated_count,
  failed_count,
  skipped_count,
  error_message,
  committed_at,
  created_by,
  updated_by
) ON public.import_runs TO authenticated;

CREATE OR REPLACE FUNCTION
  app_private.cancel_exact_lease_import_row_update_noop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.cancel_exact_lease_import_row_update_noop()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION
  app_private.guard_referenced_lease_import_row_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_checked_context boolean;
  v_checked_failure boolean;
  v_checked_success boolean;
  v_has_lease_provenance boolean;
  v_parent public.import_runs%ROWTYPE;
  v_referenced boolean;
  v_source_fields_same boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT runs.*
    INTO v_parent
    FROM public.import_runs AS runs
    WHERE runs.id = NEW.import_run_id
    FOR UPDATE;

    IF NOT FOUND
      OR NEW.organization_id IS DISTINCT FROM v_parent.organization_id THEN
      RAISE EXCEPTION
        'Import row requires the exact organization-scoped parent run'
        USING
          ERRCODE = '23503',
          DETAIL = 'lease_import_parent_mismatch';
    END IF;

    IF v_parent.import_type <> 'leases' THEN
      IF NEW.result_lease_id IS NOT NULL
        OR NEW.result_lease_party_id IS NOT NULL
        OR NEW.result_lease_occupancy_id IS NOT NULL THEN
        RAISE EXCEPTION
          'Non-Lease import rows cannot carry Lease result provenance'
          USING
            ERRCODE = '23514',
            DETAIL = 'lease_import_type_mismatch';
      END IF;

      RETURN NEW;
    END IF;

    IF v_parent.status <> 'staged'
      OR NEW.row_status NOT IN ('ready', 'warning', 'error')
      OR NEW.result_action IS NOT NULL
      OR NEW.result_unit_id IS NOT NULL
      OR NEW.result_lease_id IS NOT NULL
      OR NEW.result_lease_party_id IS NOT NULL
      OR NEW.result_lease_occupancy_id IS NOT NULL
      OR jsonb_typeof(NEW.issues) IS DISTINCT FROM 'array'
      OR (
        NEW.row_status IN ('ready', 'warning')
        AND NEW.error_message IS NOT NULL
      ) THEN
      RAISE EXCEPTION
        'Lease import rows can only be staged in a staged Lease run'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_staging_required';
    END IF;

    NEW.created_at := statement_timestamp();
    NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;

  SELECT runs.*
  INTO v_parent
  FROM public.import_runs AS runs
  WHERE runs.id = OLD.import_run_id;

  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION
      'Import row requires the exact organization-scoped parent run'
      USING
        ERRCODE = '23503',
        DETAIL = 'lease_import_parent_mismatch';
  END IF;

  IF OLD.organization_id IS DISTINCT FROM v_parent.organization_id THEN
    RAISE EXCEPTION
      'Import row requires the exact organization-scoped parent run'
      USING
        ERRCODE = '23503',
        DETAIL = 'lease_import_parent_mismatch';
  END IF;

  v_has_lease_provenance :=
    OLD.result_lease_id IS NOT NULL
    OR OLD.result_lease_party_id IS NOT NULL
    OR OLD.result_lease_occupancy_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      WHERE parties.organization_id = OLD.organization_id
        AND parties.source_import_row_id = OLD.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancies
      WHERE occupancies.organization_id = OLD.organization_id
        AND occupancies.source_import_row_id = OLD.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancy_participants AS participants
      WHERE participants.organization_id = OLD.organization_id
        AND participants.source_import_row_id = OLD.id
    );

  v_referenced :=
    OLD.result_unit_id IS NOT NULL
    OR v_has_lease_provenance;

  IF v_parent.import_type <> 'leases' THEN
    IF OLD.result_lease_id IS NOT NULL
      OR OLD.result_lease_party_id IS NOT NULL
      OR OLD.result_lease_occupancy_id IS NOT NULL
      OR (
        TG_OP = 'UPDATE'
        AND (
          NEW.result_lease_id IS NOT NULL
          OR NEW.result_lease_party_id IS NOT NULL
          OR NEW.result_lease_occupancy_id IS NOT NULL
        )
      )
      OR v_has_lease_provenance THEN
      RAISE EXCEPTION
        'Non-Lease import rows cannot carry Lease result or source provenance'
        USING
          ERRCODE = '23514',
          DETAIL = 'lease_import_type_mismatch';
    END IF;

    IF TG_OP = 'UPDATE'
      AND (
        NEW.import_run_id IS DISTINCT FROM OLD.import_run_id
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.import_runs AS target_runs
        WHERE target_runs.id = NEW.import_run_id
          AND target_runs.import_type = 'leases'
      ) THEN
      RAISE EXCEPTION
        'Lease import row identity is immutable'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_provenance_immutable';
    END IF;

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_parent.status = 'staged'
      AND NOT v_referenced
      AND pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION
      'Lease import row deletion requires a checked owner operation'
      USING
        ERRCODE = '42501',
        DETAIL = 'lease_import_row_checked_operation_required';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.import_run_id IS DISTINCT FROM OLD.import_run_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION
      'Lease import row identity and server timestamps are immutable'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_import_provenance_immutable';
  END IF;

  -- Keep the named organization-scoped foreign keys and coherent-tuple
  -- contract as the first diagnostics for structurally invalid result IDs.
  IF (
    NEW.result_lease_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.leases AS leases
      WHERE leases.organization_id = NEW.organization_id
        AND leases.id = NEW.result_lease_id
    )
  ) OR (
    NEW.result_lease_party_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      WHERE parties.organization_id = NEW.organization_id
        AND parties.id = NEW.result_lease_party_id
    )
  ) OR (
    NEW.result_lease_occupancy_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancies
      WHERE occupancies.organization_id = NEW.organization_id
        AND occupancies.id = NEW.result_lease_occupancy_id
    )
  ) THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.result_lease_id IS NOT NULL
    OR NEW.result_lease_party_id IS NOT NULL
    OR NEW.result_lease_occupancy_id IS NOT NULL
  ) AND (
    NEW.result_lease_id IS NULL
    OR NEW.result_lease_party_id IS NULL
    OR NEW.result_lease_occupancy_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      JOIN public.lease_occupancies AS occupancies
        ON occupancies.organization_id = parties.organization_id
        AND occupancies.lease_id = parties.lease_id
      WHERE parties.organization_id = NEW.organization_id
        AND parties.id = NEW.result_lease_party_id
        AND parties.lease_id = NEW.result_lease_id
        AND occupancies.id = NEW.result_lease_occupancy_id
        AND occupancies.lease_id = NEW.result_lease_id
    )
  ) THEN
    RAISE EXCEPTION 'Import row Lease result is not a coherent tuple'
      USING
        ERRCODE = '23514',
        DETAIL = 'import_row_lease_result_mismatch';
  END IF;

  v_checked_context :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting(
        'app.lease_import_result_write_context',
        true
      ),
      ''
    ) = 'checked-v1'
    AND coalesce(
      current_setting('app.lease_import_checked_run_id', true),
      ''
    ) = OLD.import_run_id::text;

  IF NOT v_checked_context THEN
    RAISE EXCEPTION
      'Lease import row mutation requires the checked owner operation'
      USING
        ERRCODE = '42501',
        DETAIL = 'lease_import_row_checked_operation_required';
  END IF;

  SELECT runs.*
  INTO v_parent
  FROM public.import_runs AS runs
  WHERE runs.id = OLD.import_run_id
    AND runs.organization_id = OLD.organization_id
    AND runs.import_type = 'leases'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Checked Lease import row requires its exact parent run'
      USING
        ERRCODE = '23503',
        DETAIL = 'lease_import_parent_mismatch';
  END IF;

  v_source_fields_same :=
    NEW.source_row_number
      IS NOT DISTINCT FROM OLD.source_row_number
    AND NEW.action_label IS NOT DISTINCT FROM OLD.action_label
    AND NEW.raw_data IS NOT DISTINCT FROM OLD.raw_data
    AND NEW.normalized_data IS NOT DISTINCT FROM OLD.normalized_data
    AND NEW.result_unit_id IS NOT DISTINCT FROM OLD.result_unit_id;

  v_checked_success :=
    v_checked_context
    AND v_parent.status = 'committing'
    AND v_source_fields_same
    AND OLD.row_status IN ('ready', 'warning')
    AND NEW.row_status = 'committed'
    AND OLD.result_action IS NULL
    AND NEW.result_action = 'created'
    AND OLD.result_unit_id IS NULL
    AND NEW.result_unit_id IS NULL
    AND OLD.result_lease_id IS NULL
    AND OLD.result_lease_party_id IS NULL
    AND OLD.result_lease_occupancy_id IS NULL
    AND NEW.result_lease_id IS NOT NULL
    AND NEW.result_lease_party_id IS NOT NULL
    AND NEW.result_lease_occupancy_id IS NOT NULL
    AND NEW.error_message IS NULL
    AND NEW.issues IS NOT DISTINCT FROM OLD.issues;

  v_checked_failure :=
    v_checked_context
    AND v_parent.status = 'committing'
    AND v_source_fields_same
    AND NOT v_referenced
    AND OLD.row_status IN ('ready', 'warning')
    AND NEW.row_status = 'failed'
    AND OLD.result_action IS NULL
    AND NEW.result_action IS NULL
    AND OLD.result_unit_id IS NULL
    AND NEW.result_unit_id IS NULL
    AND OLD.result_lease_id IS NULL
    AND NEW.result_lease_id IS NULL
    AND OLD.result_lease_party_id IS NULL
    AND NEW.result_lease_party_id IS NULL
    AND OLD.result_lease_occupancy_id IS NULL
    AND NEW.result_lease_occupancy_id IS NULL
    AND NULLIF(trim(NEW.error_message), '') IS NOT NULL
    AND jsonb_typeof(OLD.issues) = 'array'
    AND jsonb_typeof(NEW.issues) = 'array'
    AND jsonb_array_length(NEW.issues)
      = jsonb_array_length(OLD.issues) + 1
    AND NEW.issues -> -1 ->> 'level' = 'error'
    AND NEW.issues -> -1 ->> 'message' = NEW.error_message
    AND (
      NEW.issues - (jsonb_array_length(NEW.issues) - 1)
    ) IS NOT DISTINCT FROM OLD.issues;

  IF v_parent.status = 'committing'
    AND v_source_fields_same
    AND NOT v_referenced
    AND OLD.row_status IN ('ready', 'warning')
    AND NEW.row_status = 'failed'
    AND OLD.result_action IS NULL
    AND NEW.result_action IS NULL
    AND OLD.result_unit_id IS NULL
    AND NEW.result_unit_id IS NULL
    AND OLD.result_lease_id IS NULL
    AND NEW.result_lease_id IS NULL
    AND OLD.result_lease_party_id IS NULL
    AND NEW.result_lease_party_id IS NULL
    AND OLD.result_lease_occupancy_id IS NULL
    AND NEW.result_lease_occupancy_id IS NULL
    AND NULLIF(trim(NEW.error_message), '') IS NOT NULL
    AND jsonb_typeof(OLD.issues) = 'array'
    AND jsonb_typeof(NEW.issues) = 'array'
    AND jsonb_array_length(NEW.issues)
      = jsonb_array_length(OLD.issues) + 1
    AND NEW.issues -> -1 ->> 'level' = 'error'
    AND NEW.issues -> -1 ->> 'message' = NEW.error_message
    AND (
      NEW.issues - (jsonb_array_length(NEW.issues) - 1)
    ) IS DISTINCT FROM OLD.issues THEN
    RAISE EXCEPTION
      'Checked Lease import failure must preserve prior issues'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_import_failure_issue_prefix_immutable';
  END IF;

  IF v_checked_success OR v_checked_failure THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Lease import row mutation requires an exact checked commit transition'
    USING
      ERRCODE = '55000',
      DETAIL = 'lease_import_provenance_immutable';
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.guard_referenced_lease_import_row_provenance()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS assert_referenced_lease_import_row_provenance
ON public.import_rows;
DROP TRIGGER IF EXISTS aa_cancel_exact_lease_import_row_update_noop
ON public.import_rows;
DROP TRIGGER IF EXISTS ab_guard_referenced_lease_import_row_provenance
ON public.import_rows;
DROP FUNCTION IF EXISTS
  app_private.guard_referenced_lease_import_row_membership();

CREATE TRIGGER aa_cancel_exact_lease_import_row_update_noop
BEFORE UPDATE
ON public.import_rows
FOR EACH ROW
EXECUTE FUNCTION
  app_private.cancel_exact_lease_import_row_update_noop();

CREATE TRIGGER ab_guard_referenced_lease_import_row_provenance
BEFORE INSERT OR UPDATE OR DELETE
ON public.import_rows
FOR EACH ROW
EXECUTE FUNCTION
  app_private.guard_referenced_lease_import_row_provenance();

CREATE OR REPLACE FUNCTION
  app_private.cancel_exact_lease_import_run_update_noop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.cancel_exact_lease_import_run_update_noop()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION
  app_private.guard_referenced_lease_import_run_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actual_created integer;
  v_actual_failed integer;
  v_actual_skipped integer;
  v_actual_updated integer;
  v_checked_context boolean;
  v_has_children boolean;
  v_has_provenance boolean;
  v_source_fields_same boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.import_type <> 'leases' THEN
      RETURN NEW;
    END IF;

    IF NEW.status <> 'staged'
      OR NEW.created_count <> 0
      OR NEW.updated_count <> 0
      OR NEW.failed_count <> 0
      OR NEW.skipped_count <> 0
      OR NEW.error_message IS NOT NULL
      OR NEW.committed_at IS NOT NULL THEN
      RAISE EXCEPTION
        'Lease import runs must begin in a clean staged state'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_staging_required';
    END IF;

    NEW.created_at := statement_timestamp();
    NEW.updated_at := NEW.created_at;
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      NEW.created_by := (SELECT auth.uid());
      NEW.updated_by := NEW.created_by;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.import_type <> 'leases' THEN
    IF TG_OP = 'UPDATE' AND NEW.import_type = 'leases' THEN
      RAISE EXCEPTION
        'Lease import run identity is immutable'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_provenance_immutable';
    END IF;

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  v_has_children := EXISTS (
    SELECT 1
    FROM public.import_rows AS rows
    WHERE rows.import_run_id = OLD.id
  );

  v_has_provenance := EXISTS (
    SELECT 1
    FROM public.import_rows AS rows
    WHERE rows.import_run_id = OLD.id
      AND (
        rows.result_unit_id IS NOT NULL
        OR rows.result_lease_id IS NOT NULL
        OR rows.result_lease_party_id IS NOT NULL
        OR rows.result_lease_occupancy_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.lease_parties AS parties
          WHERE parties.organization_id = rows.organization_id
            AND parties.source_import_row_id = rows.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.lease_occupancies AS occupancies
          WHERE occupancies.organization_id = rows.organization_id
            AND occupancies.source_import_row_id = rows.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.lease_occupancy_participants AS participants
          WHERE participants.organization_id = rows.organization_id
            AND participants.source_import_row_id = rows.id
        )
      )
  );

  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organizations AS organizations
      WHERE organizations.id = OLD.organization_id
    ) THEN
      RETURN OLD;
    END IF;

    IF OLD.status <> 'staged' OR v_has_provenance THEN
      RAISE EXCEPTION
        'Only a clean staged Lease import run can be deleted'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_provenance_immutable';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.import_type IS DISTINCT FROM OLD.import_type
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION
      'Lease import run identity and server timestamps are immutable'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_import_provenance_immutable';
  END IF;

  v_source_fields_same :=
    NEW.source_file_name IS NOT DISTINCT FROM OLD.source_file_name
    AND NEW.source_file_size IS NOT DISTINCT FROM OLD.source_file_size
    AND NEW.source_mime_type IS NOT DISTINCT FROM OLD.source_mime_type
    AND NEW.headers IS NOT DISTINCT FROM OLD.headers
    AND NEW.mapping IS NOT DISTINCT FROM OLD.mapping
    AND NEW.total_rows IS NOT DISTINCT FROM OLD.total_rows
    AND NEW.ready_rows IS NOT DISTINCT FROM OLD.ready_rows
    AND NEW.warning_rows IS NOT DISTINCT FROM OLD.warning_rows
    AND NEW.error_rows IS NOT DISTINCT FROM OLD.error_rows;

  v_checked_context :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting(
        'app.lease_import_result_write_context',
        true
      ),
      ''
    ) = 'checked-v1'
    AND coalesce(
      current_setting('app.lease_import_checked_run_id', true),
      ''
    ) = OLD.id::text;

  IF NOT v_checked_context
    AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'Lease import run transition requires the checked owner operation'
      USING
        ERRCODE = '42501',
        DETAIL = 'lease_import_run_checked_operation_required';
  END IF;

  IF v_checked_context
    AND v_source_fields_same
    AND OLD.status = 'staged'
    AND NEW.status = 'committing'
    AND NEW.created_count = 0
    AND NEW.updated_count = 0
    AND NEW.failed_count = 0
    AND NEW.skipped_count = 0
    AND NEW.error_message IS NULL
    AND NEW.committed_at IS NULL
    AND NEW.updated_by IS NOT DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF v_checked_context
    AND v_source_fields_same
    AND OLD.status = 'committing'
    AND NEW.status IN ('committed', 'committed_with_errors', 'failed')
    AND NEW.committed_at IS NOT NULL
    AND NEW.updated_by IS NOT DISTINCT FROM (SELECT auth.uid()) THEN
    SELECT
      count(*) FILTER (
        WHERE rows.row_status = 'committed'
          AND rows.result_action = 'created'
      )::integer,
      count(*) FILTER (
        WHERE rows.row_status = 'committed'
          AND rows.result_action = 'updated'
      )::integer,
      count(*) FILTER (
        WHERE rows.row_status = 'failed'
      )::integer,
      count(*) FILTER (
        WHERE rows.row_status = 'error'
      )::integer
    INTO
      v_actual_created,
      v_actual_updated,
      v_actual_failed,
      v_actual_skipped
    FROM public.import_rows AS rows
    WHERE rows.import_run_id = OLD.id
      AND rows.organization_id = OLD.organization_id;

    IF EXISTS (
      SELECT 1
      FROM public.import_rows AS rows
      WHERE rows.import_run_id = OLD.id
        AND rows.organization_id = OLD.organization_id
        AND rows.row_status IN ('ready', 'warning')
    ) OR NEW.created_count <> v_actual_created
      OR NEW.updated_count <> v_actual_updated
      OR NEW.failed_count <> v_actual_failed
      OR NEW.skipped_count <> v_actual_skipped
      OR NEW.total_rows
        <> (
          v_actual_created
          + v_actual_updated
          + v_actual_failed
          + v_actual_skipped
        )
      OR NEW.status <> (
        CASE
          WHEN v_actual_failed > 0
            AND v_actual_created + v_actual_updated > 0
            THEN 'committed_with_errors'
          WHEN v_actual_failed > 0 THEN 'failed'
          ELSE 'committed'
        END
      )
      OR NEW.error_message IS DISTINCT FROM (
        CASE
          WHEN v_actual_failed > 0
            THEN 'Some rows could not be committed.'
          ELSE NULL
        END
      ) THEN
      RAISE EXCEPTION
        'Lease import terminal summary does not match finalized rows'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_summary_mismatch';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status = 'staged'
    AND NEW.status = 'staged'
    AND NEW.created_count = 0
    AND NEW.updated_count = 0
    AND NEW.failed_count = 0
    AND NEW.skipped_count = 0
    AND NEW.error_message IS NULL
    AND NEW.committed_at IS NULL
    AND NOT v_source_fields_same
    AND NOT v_has_children THEN
    NEW.updated_by := (SELECT auth.uid());
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Lease import run mutation requires empty staged state or checked commit'
    USING
      ERRCODE = '55000',
      DETAIL = 'lease_import_provenance_immutable';
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.guard_referenced_lease_import_run_provenance()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_referenced_lease_import_run_type
ON public.import_runs;
DROP TRIGGER IF EXISTS aa_cancel_exact_lease_import_run_update_noop
ON public.import_runs;
DROP TRIGGER IF EXISTS ab_guard_referenced_lease_import_run_provenance
ON public.import_runs;
DROP FUNCTION IF EXISTS
  app_private.guard_referenced_lease_import_run_type();

CREATE TRIGGER aa_cancel_exact_lease_import_run_update_noop
BEFORE UPDATE
ON public.import_runs
FOR EACH ROW
EXECUTE FUNCTION
  app_private.cancel_exact_lease_import_run_update_noop();

CREATE TRIGGER ab_guard_referenced_lease_import_run_provenance
BEFORE INSERT OR UPDATE OR DELETE
ON public.import_runs
FOR EACH ROW
EXECUTE FUNCTION
  app_private.guard_referenced_lease_import_run_provenance();

CREATE OR REPLACE FUNCTION
  app_private.apply_checked_lease_import_row_result(
    p_import_row_id uuid,
    p_organization_id uuid,
    p_outcome text,
    p_relationship_result jsonb DEFAULT NULL,
    p_error_message text DEFAULT NULL
  )
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_import_run_id uuid;
  v_previous_context text :=
    current_setting(
      'app.lease_import_result_write_context',
      true
    );
  v_previous_run_id text :=
    current_setting('app.lease_import_checked_run_id', true);
BEGIN
  SELECT runs.id
  INTO v_import_run_id
  FROM public.import_runs AS runs
  JOIN public.import_rows AS rows
    ON rows.import_run_id = runs.id
    AND rows.organization_id = runs.organization_id
  WHERE rows.id = p_import_row_id
    AND rows.organization_id = p_organization_id
    AND runs.import_type = 'leases'
    AND runs.status = 'committing'
  FOR UPDATE OF runs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checked Lease import parent run was rejected'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_import_provenance_immutable';
  END IF;

  IF p_outcome = 'committed'
    AND (
      p_relationship_result IS NULL
      OR NULLIF(p_relationship_result ->> 'leaseId', '') IS NULL
      OR NULLIF(p_relationship_result ->> 'partyId', '') IS NULL
      OR NULLIF(p_relationship_result ->> 'occupancyId', '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Checked Lease import result is incomplete'
      USING
        ERRCODE = '23514',
        DETAIL = 'import_row_lease_result_mismatch';
  ELSIF p_outcome = 'failed'
    AND NULLIF(trim(p_error_message), '') IS NULL THEN
    RAISE EXCEPTION 'Checked Lease import failure requires an error'
      USING ERRCODE = '23514';
  ELSIF p_outcome NOT IN ('committed', 'failed') THEN
    RAISE EXCEPTION 'Unsupported checked Lease import row outcome'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config(
    'app.lease_import_result_write_context',
    'checked-v1',
    true
  );
  PERFORM set_config(
    'app.lease_import_checked_run_id',
    v_import_run_id::text,
    true
  );

  BEGIN
    IF p_outcome = 'committed' THEN
      UPDATE public.import_rows
      SET
        row_status = 'committed',
        result_action = 'created',
        result_lease_id =
          (p_relationship_result ->> 'leaseId')::uuid,
        result_lease_party_id =
          (p_relationship_result ->> 'partyId')::uuid,
        result_lease_occupancy_id =
          (p_relationship_result ->> 'occupancyId')::uuid,
        error_message = NULL
      WHERE id = p_import_row_id
        AND import_run_id = v_import_run_id
        AND organization_id = p_organization_id
        AND row_status IN ('ready', 'warning');
    ELSE
      UPDATE public.import_rows
      SET
        row_status = 'failed',
        error_message = p_error_message,
        issues = coalesce(issues, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'level', 'error',
            'message', p_error_message
          )
        )
      WHERE id = p_import_row_id
        AND import_run_id = v_import_run_id
        AND organization_id = p_organization_id
        AND row_status IN ('ready', 'warning')
        AND result_unit_id IS NULL
        AND result_lease_id IS NULL
        AND result_lease_party_id IS NULL
        AND result_lease_occupancy_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.lease_parties AS parties
          WHERE parties.organization_id = p_organization_id
            AND parties.source_import_row_id = p_import_row_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.lease_occupancies AS occupancies
          WHERE occupancies.organization_id = p_organization_id
            AND occupancies.source_import_row_id = p_import_row_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.lease_occupancy_participants AS participants
          WHERE participants.organization_id = p_organization_id
            AND participants.source_import_row_id = p_import_row_id
        );
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checked Lease import row transition was rejected'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_provenance_immutable';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.lease_import_result_write_context',
      coalesce(v_previous_context, ''),
      true
    );
    PERFORM set_config(
      'app.lease_import_checked_run_id',
      coalesce(v_previous_run_id, ''),
      true
    );
    RAISE;
  END;

  PERFORM set_config(
    'app.lease_import_result_write_context',
    coalesce(v_previous_context, ''),
    true
  );
  PERFORM set_config(
    'app.lease_import_checked_run_id',
    coalesce(v_previous_run_id, ''),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.apply_checked_lease_import_row_result(
    uuid,
    uuid,
    text,
    jsonb,
    text
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION
  app_private.apply_checked_lease_import_run_transition(
    p_import_run_id uuid,
    p_organization_id uuid,
    p_transition text,
    p_summary jsonb DEFAULT '{}'::jsonb
  )
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created integer;
  v_failed integer;
  v_previous_context text :=
    current_setting(
      'app.lease_import_result_write_context',
      true
    );
  v_previous_run_id text :=
    current_setting('app.lease_import_checked_run_id', true);
  v_run public.import_runs%ROWTYPE;
  v_skipped integer;
  v_status text;
BEGIN
  SELECT runs.*
  INTO v_run
  FROM public.import_runs AS runs
  WHERE runs.id = p_import_run_id
    AND runs.organization_id = p_organization_id
    AND runs.import_type = 'leases'
  FOR UPDATE;

  IF NOT FOUND
    OR (
      p_transition = 'start'
      AND v_run.status <> 'staged'
    )
    OR (
      p_transition = 'finish'
      AND v_run.status <> 'committing'
    ) THEN
    RAISE EXCEPTION 'Checked Lease import run transition was rejected'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_import_provenance_immutable';
  END IF;

  IF p_transition = 'finish' THEN
    v_created := (p_summary ->> 'created')::integer;
    v_failed := (p_summary ->> 'failed')::integer;
    v_skipped := (p_summary ->> 'skipped')::integer;
    v_status := p_summary ->> 'status';

    IF v_created IS NULL
      OR v_failed IS NULL
      OR v_skipped IS NULL
      OR v_status IS NULL
      OR v_status NOT IN (
        'committed',
        'committed_with_errors',
        'failed'
      ) THEN
      RAISE EXCEPTION 'Checked Lease import run summary is incomplete'
        USING ERRCODE = '23514';
    END IF;
  ELSIF p_transition <> 'start' THEN
    RAISE EXCEPTION 'Unsupported checked Lease import run transition'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config(
    'app.lease_import_result_write_context',
    'checked-v1',
    true
  );
  PERFORM set_config(
    'app.lease_import_checked_run_id',
    p_import_run_id::text,
    true
  );

  BEGIN
    IF p_transition = 'start' THEN
      UPDATE public.import_runs
      SET
        status = 'committing',
        created_count = 0,
        updated_count = 0,
        failed_count = 0,
        skipped_count = 0,
        error_message = NULL,
        committed_at = NULL,
        updated_by = (SELECT auth.uid())
      WHERE id = p_import_run_id
        AND organization_id = p_organization_id
        AND status = 'staged';
    ELSE
      UPDATE public.import_runs
      SET
        status = v_status,
        created_count = v_created,
        updated_count = 0,
        failed_count = v_failed,
        skipped_count = v_skipped,
        committed_at = now(),
        error_message = CASE
          WHEN v_failed > 0
            THEN 'Some rows could not be committed.'
          ELSE NULL
        END,
        updated_by = (SELECT auth.uid())
      WHERE id = p_import_run_id
        AND organization_id = p_organization_id
        AND status = 'committing';
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checked Lease import run transition was rejected'
        USING
          ERRCODE = '55000',
          DETAIL = 'lease_import_provenance_immutable';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.lease_import_result_write_context',
      coalesce(v_previous_context, ''),
      true
    );
    PERFORM set_config(
      'app.lease_import_checked_run_id',
      coalesce(v_previous_run_id, ''),
      true
    );
    RAISE;
  END;

  PERFORM set_config(
    'app.lease_import_result_write_context',
    coalesce(v_previous_context, ''),
    true
  );
  PERFORM set_config(
    'app.lease_import_checked_run_id',
    coalesce(v_previous_run_id, ''),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.apply_checked_lease_import_run_transition(
    uuid,
    uuid,
    text,
    jsonb
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_generic_import_run(
  p_import_run_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actual_error_rows integer;
  v_actual_ready_rows integer;
  v_actual_total_rows integer;
  v_actual_warning_rows integer;
  v_relationship_result jsonb;
  v_run public.import_runs%ROWTYPE;
  v_row public.import_rows%ROWTYPE;
  v_row_error text;
  v_candidate_total integer := 0;
  v_created_total integer := 0;
  v_failed_total integer := 0;
  v_skipped_total integer := 0;
  v_terminal_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT runs.*
  INTO v_run
  FROM public.import_runs AS runs
  WHERE runs.id = p_import_run_id
    AND runs.organization_id = p_organization_id
    AND runs.import_type IN ('properties', 'people', 'leases')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run not found' USING ERRCODE = '23503';
  END IF;

  IF v_run.import_type <> 'leases' THEN
    RETURN public.commit_generic_import_run_legacy_unchecked(
      p_import_run_id,
      p_organization_id
    );
  END IF;

  IF v_run.status <> 'staged' THEN
    RAISE EXCEPTION 'Lease import run must be staged before commit'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE rows.row_status IN ('ready', 'warning')
    )::integer,
    count(*) FILTER (
      WHERE rows.row_status = 'warning'
    )::integer,
    count(*) FILTER (
      WHERE rows.row_status = 'error'
    )::integer
  INTO
    v_actual_total_rows,
    v_actual_ready_rows,
    v_actual_warning_rows,
    v_actual_error_rows
  FROM public.import_rows AS rows
  WHERE rows.import_run_id = v_run.id
    AND rows.organization_id = p_organization_id;

  IF v_run.total_rows <> v_actual_total_rows
    OR v_run.ready_rows <> v_actual_ready_rows
    OR v_run.warning_rows <> v_actual_warning_rows
    OR v_run.error_rows <> v_actual_error_rows THEN
    RAISE EXCEPTION
      'Lease import staging summary does not match its complete row set'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_import_staging_summary_mismatch';
  END IF;

  v_candidate_total := v_actual_ready_rows;

  IF v_candidate_total > 250 THEN
    RAISE EXCEPTION
      'Lease import runs are limited to 250 commit-ready rows'
      USING ERRCODE = '54000';
  END IF;

  PERFORM app_private.apply_checked_lease_import_run_transition(
    v_run.id,
    p_organization_id,
    'start',
    '{}'::jsonb
  );

  SELECT count(*)
  INTO v_skipped_total
  FROM public.import_rows AS rows
  WHERE rows.import_run_id = v_run.id
    AND rows.organization_id = p_organization_id
    AND rows.row_status = 'error';

  FOR v_row IN
    SELECT rows.*
    FROM public.import_rows AS rows
    WHERE rows.import_run_id = v_run.id
      AND rows.organization_id = p_organization_id
      AND rows.row_status IN ('ready', 'warning')
    ORDER BY rows.source_row_number
    FOR UPDATE
  LOOP
    BEGIN
      IF NULLIF(v_row.normalized_data ->> 'rentDueDay', '') IS NULL
        OR NULLIF(
          v_row.normalized_data ->> 'paymentFrequency',
          ''
        ) IS NULL
        OR NULLIF(v_row.normalized_data ->> 'termStatus', '') IS NULL THEN
        RAISE EXCEPTION
          'Lease import requires explicit due day, payment frequency, and term status'
          USING ERRCODE = '23514';
      END IF;

      v_relationship_result :=
        app_private.create_lease_with_relationships_internal(
          p_organization_id,
          (v_row.normalized_data ->> 'propertyId')::uuid,
          (v_row.normalized_data ->> 'unitId')::uuid,
          (v_row.normalized_data ->> 'tenantPersonId')::uuid,
          (v_row.normalized_data ->> 'leaseStartDate')::date,
          (v_row.normalized_data ->> 'leaseEndDate')::date,
          (v_row.normalized_data ->> 'monthlyRentAmount')::numeric,
          'USD'::public.currency_code,
          (v_row.normalized_data ->> 'rentDueDay')::integer,
          v_row.normalized_data ->> 'paymentFrequency',
          v_row.normalized_data ->> 'termStatus',
          NULLIF(
            v_row.normalized_data ->> 'depositAmount',
            ''
          )::numeric,
          CASE
            WHEN NULLIF(
              v_row.normalized_data ->> 'depositAmount',
              ''
            ) IS NULL THEN NULL
            ELSE 'USD'::public.currency_code
          END,
          v_row.normalized_data ->> 'status',
          app_private.build_checked_lease_import_relationship_payload(
            v_row.id,
            v_row.normalized_data
          ),
          concat('import:', v_run.id, ':', v_row.id)
        );

      PERFORM app_private.apply_checked_lease_import_row_result(
        v_row.id,
        p_organization_id,
        'committed',
        v_relationship_result,
        NULL
      );

      v_created_total := v_created_total + 1;
    EXCEPTION WHEN OTHERS THEN
      v_row_error := SQLERRM;

      IF v_row_error ILIKE '%conflicting key value violates exclusion%'
        OR v_row_error ILIKE
          '%lease_occupancies_unit_protected_range_excl%' THEN
        v_row_error :=
          'Unit already has an overlapping accepted Lease occupancy.';
      END IF;

      PERFORM app_private.apply_checked_lease_import_row_result(
        v_row.id,
        p_organization_id,
        'failed',
        NULL,
        v_row_error
      );

      v_failed_total := v_failed_total + 1;
    END;
  END LOOP;

  v_terminal_status := CASE
    WHEN v_failed_total > 0 AND v_created_total > 0
      THEN 'committed_with_errors'
    WHEN v_failed_total > 0 THEN 'failed'
    ELSE 'committed'
  END;

  PERFORM app_private.apply_checked_lease_import_run_transition(
    v_run.id,
    p_organization_id,
    'finish',
    jsonb_build_object(
      'created', v_created_total,
      'failed', v_failed_total,
      'skipped', v_skipped_total,
      'status', v_terminal_status
    )
  );

  INSERT INTO public.activity_logs(
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
    v_run.id,
    'generic_import_committed',
    jsonb_build_object(
      'import_run_id', v_run.id,
      'import_type', 'leases',
      'created_count', v_created_total,
      'updated_count', 0,
      'failed_count', v_failed_total,
      'skipped_count', v_skipped_total,
      'source_file_name', v_run.source_file_name,
      'relationship_workflow', 'checked-tb02-v1'
    )
  );

  RETURN jsonb_build_object(
    'created', v_created_total,
    'updated', 0,
    'failed', v_failed_total,
    'skipped', v_skipped_total,
    'status', v_terminal_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_generic_import_run(uuid, uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_generic_import_run(uuid, uuid)
TO authenticated;
