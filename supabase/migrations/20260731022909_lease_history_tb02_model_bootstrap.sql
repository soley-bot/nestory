-- Track B / TB-02: relationship evidence model, legacy bootstrap, and the
-- checked brand-new Lease composition. Existing-Lease transitions remain
-- fail-closed for TB-03.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE public.import_rows
  ADD COLUMN result_lease_id uuid,
  ADD COLUMN result_lease_party_id uuid,
  ADD COLUMN result_lease_occupancy_id uuid,
  ADD CONSTRAINT import_rows_organization_id_id_unique
    UNIQUE (organization_id, id);

ALTER TABLE public.lease_parties
  ADD COLUMN evidence_state text NOT NULL DEFAULT 'legacy_unresolved',
  ADD COLUMN business_lifecycle text NOT NULL DEFAULT 'planned',
  ADD COLUMN record_source text NOT NULL DEFAULT 'legacy_inferred',
  ADD COLUMN started_on_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN started_on_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN ended_on_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN ended_on_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN source_import_row_id uuid,
  ADD COLUMN correction_request_id uuid,
  ADD COLUMN supersedes_lease_party_id uuid,
  ADD COLUMN superseded_by_lease_party_id uuid,
  ADD COLUMN correction_reason text,
  ADD COLUMN evidence_recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN evidence_recorded_by uuid REFERENCES auth.users(id)
    ON DELETE SET NULL,
  ADD COLUMN evidence_reason text NOT NULL DEFAULT 'tb02_legacy_bootstrap';

ALTER TABLE public.lease_occupancies
  ADD COLUMN evidence_state text NOT NULL DEFAULT 'legacy_unresolved',
  ADD COLUMN business_lifecycle text NOT NULL DEFAULT 'reserved',
  ADD COLUMN record_source text NOT NULL DEFAULT 'legacy_inferred',
  ADD COLUMN scheduled_move_in_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN scheduled_move_in_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN scheduled_move_out_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN scheduled_move_out_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN actual_move_in_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN actual_move_in_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN actual_move_out_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN actual_move_out_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN notice_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN notice_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN source_import_row_id uuid,
  ADD COLUMN correction_request_id uuid,
  ADD COLUMN supersedes_lease_occupancy_id uuid,
  ADD COLUMN superseded_by_lease_occupancy_id uuid,
  ADD COLUMN correction_reason text,
  ADD COLUMN evidence_recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN evidence_recorded_by uuid REFERENCES auth.users(id)
    ON DELETE SET NULL,
  ADD COLUMN evidence_reason text NOT NULL DEFAULT 'tb02_legacy_bootstrap';

ALTER TABLE public.lease_parties
  ADD CONSTRAINT lease_parties_org_id_unique
    UNIQUE (organization_id, id),
  ADD CONSTRAINT lease_parties_evidence_state_check CHECK (
    evidence_state IN (
      'accepted',
      'superseded',
      'voided',
      'legacy_unresolved'
    )
  ),
  ADD CONSTRAINT lease_parties_business_lifecycle_check CHECK (
    business_lifecycle IN (
      'planned',
      'effective',
      'ended',
      'cancelled_before_effective'
    )
  ),
  ADD CONSTRAINT lease_parties_record_source_check CHECK (
    record_source IN (
      'operator_confirmed',
      'imported_explicit',
      'system_transition',
      'legacy_inferred'
    )
  ),
  ADD CONSTRAINT lease_parties_started_kind_check CHECK (
    started_on_kind IN ('known', 'unknown')
  ),
  ADD CONSTRAINT lease_parties_ended_kind_check CHECK (
    ended_on_kind IN ('known', 'open_current', 'unknown')
  ),
  ADD CONSTRAINT lease_parties_started_confidence_check CHECK (
    started_on_confidence IN ('confirmed', 'inferred', 'unknown')
  ),
  ADD CONSTRAINT lease_parties_ended_confidence_check CHECK (
    ended_on_confidence IN ('confirmed', 'inferred', 'unknown')
  ),
  ADD CONSTRAINT lease_parties_started_boundary_check CHECK (
    evidence_state = 'legacy_unresolved'
    OR (
      (started_on_kind = 'known' AND started_on IS NOT NULL)
      OR (started_on_kind = 'unknown' AND started_on IS NULL)
    )
  ),
  ADD CONSTRAINT lease_parties_ended_boundary_check CHECK (
    evidence_state = 'legacy_unresolved'
    OR (
      (ended_on_kind = 'known' AND ended_on IS NOT NULL)
      OR (
        ended_on_kind IN ('open_current', 'unknown')
        AND ended_on IS NULL
      )
    )
  ),
  ADD CONSTRAINT lease_parties_reason_not_blank_check CHECK (
    length(trim(evidence_reason)) > 0
    AND (
      correction_reason IS NULL
      OR length(trim(correction_reason)) > 0
    )
  ),
  ADD CONSTRAINT lease_parties_source_import_row_fk
    FOREIGN KEY (organization_id, source_import_row_id)
    REFERENCES public.import_rows(organization_id, id),
  ADD CONSTRAINT lease_parties_supersedes_fk
    FOREIGN KEY (organization_id, supersedes_lease_party_id)
    REFERENCES public.lease_parties(organization_id, id),
  ADD CONSTRAINT lease_parties_superseded_by_fk
    FOREIGN KEY (organization_id, superseded_by_lease_party_id)
    REFERENCES public.lease_parties(organization_id, id),
  ADD CONSTRAINT lease_parties_lineage_not_self_check CHECK (
    supersedes_lease_party_id IS DISTINCT FROM id
    AND superseded_by_lease_party_id IS DISTINCT FROM id
  );

ALTER TABLE public.lease_occupancies
  ADD CONSTRAINT lease_occupancies_org_id_unique
    UNIQUE (organization_id, id),
  ADD CONSTRAINT lease_occupancies_evidence_state_check CHECK (
    evidence_state IN (
      'accepted',
      'superseded',
      'voided',
      'legacy_unresolved'
    )
  ),
  ADD CONSTRAINT lease_occupancies_business_lifecycle_check CHECK (
    business_lifecycle IN (
      'reserved',
      'occupied',
      'notice_given',
      'vacated',
      'cancelled_before_effective'
    )
  ),
  ADD CONSTRAINT lease_occupancies_record_source_check CHECK (
    record_source IN (
      'operator_confirmed',
      'imported_explicit',
      'system_transition',
      'legacy_inferred'
    )
  ),
  ADD CONSTRAINT lease_occupancies_boundary_kind_check CHECK (
    scheduled_move_in_kind IN ('known', 'unknown')
    AND scheduled_move_out_kind IN (
      'known',
      'open_current',
      'unknown'
    )
    AND actual_move_in_kind IN ('known', 'unknown')
    AND actual_move_out_kind IN (
      'known',
      'open_current',
      'unknown'
    )
    AND notice_kind IN ('known', 'unknown')
  ),
  ADD CONSTRAINT lease_occupancies_confidence_check CHECK (
    scheduled_move_in_confidence IN (
      'confirmed',
      'inferred',
      'unknown'
    )
    AND scheduled_move_out_confidence IN (
      'confirmed',
      'inferred',
      'unknown'
    )
    AND actual_move_in_confidence IN (
      'confirmed',
      'inferred',
      'unknown'
    )
    AND actual_move_out_confidence IN (
      'confirmed',
      'inferred',
      'unknown'
    )
    AND notice_confidence IN ('confirmed', 'inferred', 'unknown')
  ),
  ADD CONSTRAINT lease_occupancies_scheduled_in_boundary_check CHECK (
    evidence_state = 'legacy_unresolved'
    OR (
      (
        scheduled_move_in_kind = 'known'
        AND scheduled_move_in_date IS NOT NULL
      )
      OR (
        scheduled_move_in_kind = 'unknown'
        AND scheduled_move_in_date IS NULL
      )
    )
  ),
  ADD CONSTRAINT lease_occupancies_scheduled_out_boundary_check CHECK (
    evidence_state = 'legacy_unresolved'
    OR (
      (
        scheduled_move_out_kind = 'known'
        AND scheduled_move_out_date IS NOT NULL
      )
      OR (
        scheduled_move_out_kind IN ('open_current', 'unknown')
        AND scheduled_move_out_date IS NULL
      )
    )
  ),
  ADD CONSTRAINT lease_occupancies_actual_in_boundary_check CHECK (
    evidence_state = 'legacy_unresolved'
    OR (
      (actual_move_in_kind = 'known' AND actual_move_in_date IS NOT NULL)
      OR (
        actual_move_in_kind = 'unknown'
        AND actual_move_in_date IS NULL
      )
    )
  ),
  ADD CONSTRAINT lease_occupancies_actual_out_boundary_check CHECK (
    evidence_state = 'legacy_unresolved'
    OR (
      (
        actual_move_out_kind = 'known'
        AND actual_move_out_date IS NOT NULL
      )
      OR (
        actual_move_out_kind IN ('open_current', 'unknown')
        AND actual_move_out_date IS NULL
      )
    )
  ),
  ADD CONSTRAINT lease_occupancies_notice_boundary_check CHECK (
    evidence_state = 'legacy_unresolved'
    OR (
      (notice_kind = 'known' AND notice_date IS NOT NULL)
      OR (notice_kind = 'unknown' AND notice_date IS NULL)
    )
  ),
  ADD CONSTRAINT lease_occupancies_cancelled_actual_check CHECK (
    business_lifecycle <> 'cancelled_before_effective'
    OR (
      actual_move_in_date IS NULL
      AND actual_move_out_date IS NULL
      AND actual_move_in_kind = 'unknown'
      AND actual_move_out_kind = 'unknown'
    )
  ),
  ADD CONSTRAINT lease_occupancies_reason_not_blank_check CHECK (
    length(trim(evidence_reason)) > 0
    AND (
      correction_reason IS NULL
      OR length(trim(correction_reason)) > 0
    )
  ),
  ADD CONSTRAINT lease_occupancies_source_import_row_fk
    FOREIGN KEY (organization_id, source_import_row_id)
    REFERENCES public.import_rows(organization_id, id),
  ADD CONSTRAINT lease_occupancies_supersedes_fk
    FOREIGN KEY (organization_id, supersedes_lease_occupancy_id)
    REFERENCES public.lease_occupancies(organization_id, id),
  ADD CONSTRAINT lease_occupancies_superseded_by_fk
    FOREIGN KEY (organization_id, superseded_by_lease_occupancy_id)
    REFERENCES public.lease_occupancies(organization_id, id),
  ADD CONSTRAINT lease_occupancies_lineage_not_self_check CHECK (
    supersedes_lease_occupancy_id IS DISTINCT FROM id
    AND superseded_by_lease_occupancy_id IS DISTINCT FROM id
  );

ALTER TABLE public.import_rows
  ADD CONSTRAINT import_rows_result_lease_org_fk
    FOREIGN KEY (organization_id, result_lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE NO ACTION,
  ADD CONSTRAINT import_rows_result_lease_party_org_fk
    FOREIGN KEY (organization_id, result_lease_party_id)
    REFERENCES public.lease_parties(organization_id, id)
    ON DELETE NO ACTION,
  ADD CONSTRAINT import_rows_result_lease_occupancy_org_fk
    FOREIGN KEY (organization_id, result_lease_occupancy_id)
    REFERENCES public.lease_occupancies(organization_id, id)
    ON DELETE NO ACTION;

CREATE OR REPLACE FUNCTION
  app_private.enforce_import_row_lease_result_coherence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Leave missing or cross-organization references to the named foreign keys.
  -- This trigger owns only all-or-none and same-organization tuple coherence.
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

  IF NEW.result_lease_id IS NULL
    AND NEW.result_lease_party_id IS NULL
    AND NEW.result_lease_occupancy_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.result_lease_id IS NULL
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
    ) THEN
    RAISE EXCEPTION 'Import row Lease result is not a coherent tuple'
      USING
        ERRCODE = '23514',
        DETAIL = 'import_row_lease_result_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.enforce_import_row_lease_result_coherence()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_import_row_lease_result_coherence
BEFORE INSERT OR UPDATE OF
  organization_id,
  result_lease_id,
  result_lease_party_id,
  result_lease_occupancy_id
ON public.import_rows
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_import_row_lease_result_coherence();

CREATE OR REPLACE FUNCTION
  app_private.guard_referenced_lease_import_row_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_checked_result_write boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting(
        'app.lease_import_result_write_context',
        true
      ),
      ''
    ) = 'checked-v1';
  v_checked_result_fields_only boolean :=
    NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.import_run_id IS NOT DISTINCT FROM OLD.import_run_id
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.source_row_number
      IS NOT DISTINCT FROM OLD.source_row_number
    AND NEW.action_label IS NOT DISTINCT FROM OLD.action_label
    AND NEW.raw_data IS NOT DISTINCT FROM OLD.raw_data
    AND NEW.normalized_data IS NOT DISTINCT FROM OLD.normalized_data
    AND NEW.issues IS NOT DISTINCT FROM OLD.issues
    AND NEW.result_unit_id IS NOT DISTINCT FROM OLD.result_unit_id
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at;
BEGIN
  IF NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.import_run_id IS NOT DISTINCT FROM OLD.import_run_id
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.source_row_number
      IS NOT DISTINCT FROM OLD.source_row_number
    AND NEW.row_status IS NOT DISTINCT FROM OLD.row_status
    AND NEW.action_label IS NOT DISTINCT FROM OLD.action_label
    AND NEW.raw_data IS NOT DISTINCT FROM OLD.raw_data
    AND NEW.normalized_data IS NOT DISTINCT FROM OLD.normalized_data
    AND NEW.issues IS NOT DISTINCT FROM OLD.issues
    AND NEW.result_action IS NOT DISTINCT FROM OLD.result_action
    AND NEW.result_unit_id IS NOT DISTINCT FROM OLD.result_unit_id
    AND NEW.error_message IS NOT DISTINCT FROM OLD.error_message
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    AND NEW.result_lease_id IS NOT DISTINCT FROM OLD.result_lease_id
    AND NEW.result_lease_party_id
      IS NOT DISTINCT FROM OLD.result_lease_party_id
    AND NEW.result_lease_occupancy_id
      IS NOT DISTINCT FROM OLD.result_lease_occupancy_id THEN
    RETURN NEW;
  END IF;

  IF (
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
    )
  )
    AND NOT (
      v_checked_result_write
      AND v_checked_result_fields_only
    ) THEN
    RAISE EXCEPTION
      'Lease import provenance is immutable once referenced'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_import_provenance_immutable';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.guard_referenced_lease_import_row_membership()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER assert_referenced_lease_import_row_provenance
BEFORE UPDATE OF
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
  error_message,
  created_at,
  result_lease_id,
  result_lease_party_id,
  result_lease_occupancy_id
ON public.import_rows
FOR EACH ROW
EXECUTE FUNCTION
  app_private.guard_referenced_lease_import_row_membership();

CREATE OR REPLACE FUNCTION
  app_private.guard_referenced_lease_import_run_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.import_type IS NOT DISTINCT FROM OLD.import_type
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.import_rows AS rows
    WHERE rows.organization_id = OLD.organization_id
      AND rows.import_run_id = OLD.id
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
      'Lease import provenance is immutable once referenced'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_import_provenance_immutable';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.guard_referenced_lease_import_run_type()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_referenced_lease_import_run_type
BEFORE UPDATE OF import_type, organization_id
ON public.import_runs
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_referenced_lease_import_run_type();

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
  error_message,
  created_at,
  updated_at
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
  error_message,
  created_at,
  updated_at
) ON public.import_rows TO authenticated;

CREATE INDEX import_rows_result_lease_org_idx
  ON public.import_rows(organization_id, result_lease_id)
  WHERE result_lease_id IS NOT NULL;
CREATE INDEX import_rows_result_lease_party_org_idx
  ON public.import_rows(organization_id, result_lease_party_id)
  WHERE result_lease_party_id IS NOT NULL;
CREATE INDEX import_rows_result_lease_occupancy_org_idx
  ON public.import_rows(organization_id, result_lease_occupancy_id)
  WHERE result_lease_occupancy_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_lease_primary_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_checked_header_write boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.lease_header_write_context', true),
      ''
    ) = 'checked-lease-update-v1';
  v_tenant_display_name text;
  v_tenant_person_id uuid;
  v_trusted_fixture boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('role', true), 'none')
      IN ('none', 'postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.people_leases_skip_sync', true),
      ''
    ) = 'on';
BEGIN
  IF v_trusted_fixture THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.tenant_name IS DISTINCT FROM OLD.tenant_name
    AND NOT v_checked_header_write THEN
    RAISE EXCEPTION
      'Changing the Lease tenant requires a checked relationship transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  IF NEW.primary_tenant_person_id IS NOT NULL THEN
    SELECT people.id, people.display_name
    INTO v_tenant_person_id, v_tenant_display_name
    FROM public.people AS people
    JOIN public.person_roles AS roles
      ON roles.organization_id = people.organization_id
      AND roles.person_id = people.id
    WHERE people.id = NEW.primary_tenant_person_id
      AND people.organization_id = NEW.organization_id
      AND people.archived_at IS NULL
      AND roles.role = 'tenant'
      AND roles.status = 'active'
      AND roles.archived_at IS NULL
    ORDER BY roles.created_at, roles.id
    LIMIT 1
    FOR SHARE OF people, roles;
  ELSE
    SELECT people.id, people.display_name
    INTO v_tenant_person_id, v_tenant_display_name
    FROM public.people AS people
    JOIN public.person_roles AS roles
      ON roles.organization_id = people.organization_id
      AND roles.person_id = people.id
    WHERE people.organization_id = NEW.organization_id
      AND people.display_name = trim(NEW.tenant_name)
      AND people.archived_at IS NULL
      AND roles.role = 'tenant'
      AND roles.status = 'active'
      AND roles.archived_at IS NULL
    ORDER BY people.created_at, people.id, roles.created_at, roles.id
    LIMIT 1
    FOR SHARE OF people, roles;
  END IF;

  IF v_tenant_person_id IS NULL THEN
    RAISE EXCEPTION
      'An active Tenant role is required for the exact primary Tenant'
      USING ERRCODE = '23503';
  END IF;

  NEW.primary_tenant_person_id := v_tenant_person_id;
  NEW.tenant_name := v_tenant_display_name;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_lease_primary_tenant()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.enforce_active_lease_tenant_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.primary_tenant_person_id
      IS NOT DISTINCT FROM OLD.primary_tenant_person_id THEN
    RETURN NEW;
  END IF;

  IF NEW.primary_tenant_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.people AS person
  JOIN public.person_roles AS person_role
    ON person_role.organization_id = person.organization_id
    AND person_role.person_id = person.id
  WHERE person.id = NEW.primary_tenant_person_id
    AND person.organization_id = NEW.organization_id
    AND person.archived_at IS NULL
    AND person_role.role = 'tenant'
    AND person_role.status = 'active'
    AND person_role.archived_at IS NULL
  FOR SHARE OF person, person_role;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'An active Tenant role is required for the primary tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_active_lease_tenant_role()
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.lease_parties
  ADD COLUMN effective_range daterange
  GENERATED ALWAYS AS (
    CASE
      WHEN evidence_state = 'accepted'
        AND business_lifecycle IN ('planned', 'effective', 'ended')
        AND started_on_kind = 'known'
        AND started_on IS NOT NULL
        AND ended_on_kind IN ('known', 'open_current')
        AND (
          (ended_on_kind = 'known' AND ended_on IS NOT NULL)
          OR (ended_on_kind = 'open_current' AND ended_on IS NULL)
        )
      THEN daterange(started_on, ended_on, '[]')
      ELSE NULL
    END
  ) STORED;

ALTER TABLE public.lease_occupancies
  ADD COLUMN scheduled_effective_range daterange
  GENERATED ALWAYS AS (
    CASE
      WHEN evidence_state = 'accepted'
        AND business_lifecycle <> 'cancelled_before_effective'
        AND scheduled_move_in_kind = 'known'
        AND scheduled_move_in_date IS NOT NULL
        AND scheduled_move_out_kind IN ('known', 'open_current')
        AND (
          (
            scheduled_move_out_kind = 'known'
            AND scheduled_move_out_date IS NOT NULL
          )
          OR (
            scheduled_move_out_kind = 'open_current'
            AND scheduled_move_out_date IS NULL
          )
        )
      THEN daterange(
        scheduled_move_in_date,
        scheduled_move_out_date,
        '[]'
      )
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN actual_effective_range daterange
  GENERATED ALWAYS AS (
    CASE
      WHEN evidence_state = 'accepted'
        AND business_lifecycle IN ('occupied', 'notice_given', 'vacated')
        AND actual_move_in_kind = 'known'
        AND actual_move_in_date IS NOT NULL
        AND actual_move_out_kind IN ('known', 'open_current')
        AND (
          (
            actual_move_out_kind = 'known'
            AND actual_move_out_date IS NOT NULL
          )
          OR (
            actual_move_out_kind = 'open_current'
            AND actual_move_out_date IS NULL
          )
        )
      THEN daterange(actual_move_in_date, actual_move_out_date, '[]')
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN protected_occupancy_range daterange
  GENERATED ALWAYS AS (
    CASE
      WHEN evidence_state = 'accepted'
        AND business_lifecycle IN ('occupied', 'notice_given', 'vacated')
        AND actual_move_in_kind = 'known'
        AND actual_move_in_date IS NOT NULL
        AND actual_move_out_kind IN ('known', 'open_current')
        AND (
          (
            actual_move_out_kind = 'known'
            AND actual_move_out_date IS NOT NULL
          )
          OR (
            actual_move_out_kind = 'open_current'
            AND actual_move_out_date IS NULL
          )
        )
      THEN daterange(actual_move_in_date, actual_move_out_date, '[]')
      WHEN evidence_state = 'accepted'
        AND business_lifecycle <> 'cancelled_before_effective'
        AND scheduled_move_in_kind = 'known'
        AND scheduled_move_in_date IS NOT NULL
        AND scheduled_move_out_kind IN ('known', 'open_current')
        AND (
          (
            scheduled_move_out_kind = 'known'
            AND scheduled_move_out_date IS NOT NULL
          )
          OR (
            scheduled_move_out_kind = 'open_current'
            AND scheduled_move_out_date IS NULL
          )
        )
      THEN daterange(
        scheduled_move_in_date,
        scheduled_move_out_date,
        '[]'
      )
      ELSE NULL
    END
  ) STORED;

CREATE TABLE public.lease_occupancy_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id)
    ON DELETE CASCADE,
  lease_occupancy_id uuid NOT NULL,
  lease_party_id uuid NOT NULL,
  started_on date,
  ended_on date,
  evidence_state text NOT NULL DEFAULT 'accepted',
  business_lifecycle text NOT NULL DEFAULT 'planned',
  record_source text NOT NULL,
  started_on_kind text NOT NULL DEFAULT 'unknown',
  started_on_confidence text NOT NULL DEFAULT 'unknown',
  ended_on_kind text NOT NULL DEFAULT 'unknown',
  ended_on_confidence text NOT NULL DEFAULT 'unknown',
  source_import_row_id uuid,
  correction_request_id uuid,
  supersedes_participant_id uuid,
  superseded_by_participant_id uuid,
  correction_reason text,
  evidence_recorded_at timestamptz NOT NULL DEFAULT now(),
  evidence_recorded_by uuid REFERENCES auth.users(id)
    ON DELETE SET NULL,
  evidence_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_participants_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT lease_participants_occupancy_fk
    FOREIGN KEY (organization_id, lease_occupancy_id)
    REFERENCES public.lease_occupancies(organization_id, id),
  CONSTRAINT lease_participants_party_fk
    FOREIGN KEY (organization_id, lease_party_id)
    REFERENCES public.lease_parties(organization_id, id),
  CONSTRAINT lease_participants_source_import_row_fk
    FOREIGN KEY (organization_id, source_import_row_id)
    REFERENCES public.import_rows(organization_id, id),
  CONSTRAINT lease_participants_supersedes_fk
    FOREIGN KEY (organization_id, supersedes_participant_id)
    REFERENCES public.lease_occupancy_participants(organization_id, id),
  CONSTRAINT lease_participants_superseded_by_fk
    FOREIGN KEY (organization_id, superseded_by_participant_id)
    REFERENCES public.lease_occupancy_participants(organization_id, id),
  CONSTRAINT lease_participants_evidence_state_check CHECK (
    evidence_state IN (
      'accepted',
      'superseded',
      'voided',
      'legacy_unresolved'
    )
  ),
  CONSTRAINT lease_participants_business_lifecycle_check CHECK (
    business_lifecycle IN (
      'planned',
      'present',
      'ended',
      'cancelled_before_effective'
    )
  ),
  CONSTRAINT lease_participants_record_source_check CHECK (
    record_source IN (
      'operator_confirmed',
      'imported_explicit',
      'system_transition',
      'legacy_inferred'
    )
  ),
  CONSTRAINT lease_participants_started_kind_check CHECK (
    started_on_kind IN ('known', 'unknown')
  ),
  CONSTRAINT lease_participants_ended_kind_check CHECK (
    ended_on_kind IN ('known', 'open_current', 'unknown')
  ),
  CONSTRAINT lease_participants_confidence_check CHECK (
    started_on_confidence IN ('confirmed', 'inferred', 'unknown')
    AND ended_on_confidence IN ('confirmed', 'inferred', 'unknown')
  ),
  CONSTRAINT lease_participants_started_boundary_check CHECK (
    (started_on_kind = 'known' AND started_on IS NOT NULL)
    OR (started_on_kind = 'unknown' AND started_on IS NULL)
  ),
  CONSTRAINT lease_participants_ended_boundary_check CHECK (
    (ended_on_kind = 'known' AND ended_on IS NOT NULL)
    OR (
      ended_on_kind IN ('open_current', 'unknown')
      AND ended_on IS NULL
    )
  ),
  CONSTRAINT lease_participants_accepted_lifecycle_boundary_check CHECK (
    evidence_state <> 'accepted'
    OR business_lifecycle IN ('planned', 'cancelled_before_effective')
    OR (
      business_lifecycle = 'present'
      AND started_on_kind = 'known'
      AND ended_on_kind IN ('known', 'open_current')
    )
    OR (
      business_lifecycle = 'ended'
      AND started_on_kind = 'known'
      AND ended_on_kind = 'known'
    )
  ),
  CONSTRAINT lease_participants_reason_not_blank_check CHECK (
    length(trim(evidence_reason)) > 0
    AND (
      correction_reason IS NULL
      OR length(trim(correction_reason)) > 0
    )
  ),
  CONSTRAINT lease_participants_lineage_not_self_check CHECK (
    supersedes_participant_id IS DISTINCT FROM id
    AND superseded_by_participant_id IS DISTINCT FROM id
  ),
  CONSTRAINT lease_participants_date_range_check CHECK (
    ended_on IS NULL
    OR started_on IS NULL
    OR ended_on >= started_on
  ),
  effective_range daterange
  GENERATED ALWAYS AS (
    CASE
      WHEN evidence_state = 'accepted'
        AND business_lifecycle IN ('planned', 'present', 'ended')
        AND started_on_kind = 'known'
        AND started_on IS NOT NULL
        AND ended_on_kind IN ('known', 'open_current')
        AND (
          (ended_on_kind = 'known' AND ended_on IS NOT NULL)
          OR (ended_on_kind = 'open_current' AND ended_on IS NULL)
        )
      THEN daterange(started_on, ended_on, '[]')
      ELSE NULL
    END
  ) STORED
);

CREATE INDEX lease_participants_org_occupancy_idx
  ON public.lease_occupancy_participants(
    organization_id,
    lease_occupancy_id
  );
CREATE INDEX lease_participants_org_party_idx
  ON public.lease_occupancy_participants(
    organization_id,
    lease_party_id
  );
CREATE INDEX lease_participants_source_import_row_idx
  ON public.lease_occupancy_participants(
    organization_id,
    source_import_row_id
  )
  WHERE source_import_row_id IS NOT NULL;

-- These transactional partial UNIQUE indexes preserve the legacy active-row
-- uniqueness contract for accepted or unresolved facts whose time boundary
-- cannot be fully serialized by the GiST exclusions below. They are created
-- before the legacy indexes are dropped so the migration never exposes an
-- unguarded active-row window. CONCURRENTLY is invalid inside this migration
-- transaction, and PostgreSQL does not support NOT VALID for UNIQUE indexes.
CREATE UNIQUE INDEX lease_parties_one_unbounded_primary_tenant_idx
  ON public.lease_parties(organization_id, lease_id)
  WHERE evidence_state IN ('accepted', 'legacy_unresolved')
    AND business_lifecycle IN ('planned', 'effective')
    AND party_role = 'primary_tenant'
    AND is_primary
    AND archived_at IS NULL
    AND ended_on IS NULL;

CREATE UNIQUE INDEX lease_parties_one_unbounded_person_role_idx
  ON public.lease_parties(
    organization_id,
    lease_id,
    person_id,
    party_role
  )
  WHERE evidence_state IN ('accepted', 'legacy_unresolved')
    AND business_lifecycle IN ('planned', 'effective')
    AND archived_at IS NULL
    AND ended_on IS NULL;

CREATE UNIQUE INDEX lease_occupancies_one_unbounded_active_unit_idx
  ON public.lease_occupancies(organization_id, unit_id)
  WHERE unit_id IS NOT NULL
    AND archived_at IS NULL
    AND (
      (
        evidence_state = 'legacy_unresolved'
        AND status IN ('reserved', 'occupied', 'notice_given')
        AND actual_move_out_date IS NULL
      )
      OR (
        evidence_state = 'accepted'
        AND business_lifecycle IN (
          'reserved',
          'occupied',
          'notice_given'
        )
        AND (
          protected_occupancy_range IS NULL
          OR upper_inf(protected_occupancy_range)
        )
      )
    );

DROP INDEX public.lease_parties_one_active_primary_tenant_idx;
DROP INDEX public.lease_parties_one_active_person_role_idx;
DROP INDEX public.lease_occupancies_one_active_unit_idx;

ALTER TABLE public.lease_parties
  ADD CONSTRAINT lease_parties_primary_effective_range_excl
  EXCLUDE USING gist (
    organization_id WITH =,
    lease_id WITH =,
    effective_range WITH &&
  )
  WHERE (
    evidence_state = 'accepted'
    AND is_primary
    AND party_role = 'primary_tenant'
    AND effective_range IS NOT NULL
  ),
  ADD CONSTRAINT lease_parties_person_role_effective_range_excl
  EXCLUDE USING gist (
    organization_id WITH =,
    lease_id WITH =,
    person_id WITH =,
    party_role WITH =,
    effective_range WITH &&
  )
  WHERE (
    evidence_state = 'accepted'
    AND effective_range IS NOT NULL
  );

ALTER TABLE public.lease_occupancies
  ADD CONSTRAINT lease_occupancies_unit_protected_range_excl
  EXCLUDE USING gist (
    organization_id WITH =,
    unit_id WITH =,
    protected_occupancy_range WITH &&
  )
  WHERE (
    evidence_state = 'accepted'
    AND unit_id IS NOT NULL
    AND protected_occupancy_range IS NOT NULL
  );

ALTER TABLE public.lease_occupancy_participants
  ADD CONSTRAINT lease_participants_party_effective_range_excl
  EXCLUDE USING gist (
    organization_id WITH =,
    lease_party_id WITH =,
    effective_range WITH &&
  )
  WHERE (
    evidence_state = 'accepted'
    AND effective_range IS NOT NULL
  );

CREATE OR REPLACE FUNCTION app_private.guard_lease_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_context text :=
    current_setting('app.lease_history_write_context', true);
  v_trusted_fixture boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('role', true), 'none')
      IN ('none', 'postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.people_leases_skip_sync', true),
      ''
    ) = 'on';
BEGIN
  IF v_trusted_fixture THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF current_user IN ('postgres', 'supabase_admin')
    AND (
      (
        TG_OP = 'INSERT'
        AND v_context = 'checked-lease-create-v1'
      )
      OR (
        TG_OP IN ('INSERT', 'UPDATE')
        AND v_context = 'checked-lease-create-v2'
      )
      OR (
        TG_OP = 'UPDATE'
        AND v_context = 'checked-lease-bootstrap-v1'
      )
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Lease relationship history can only be changed by a checked internal workflow'
    USING
      ERRCODE = '42501',
      DETAIL = 'lease_history_mutation_forbidden';
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_lease_history_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.classify_legacy_lease_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.evidence_state = 'legacy_unresolved' THEN
    NEW.business_lifecycle := coalesce(NEW.business_lifecycle, 'planned');
    NEW.record_source := 'legacy_inferred';
    NEW.started_on_kind := CASE
      WHEN NEW.started_on IS NULL THEN 'unknown'
      ELSE 'known'
    END;
    NEW.ended_on_kind := CASE
      WHEN NEW.ended_on IS NULL THEN 'unknown'
      ELSE 'known'
    END;
    NEW.started_on_confidence := 'unknown';
    NEW.ended_on_confidence := 'unknown';
    NEW.evidence_reason := coalesce(
      NULLIF(trim(NEW.evidence_reason), ''),
      'tb02_legacy_bootstrap'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.classify_legacy_lease_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.evidence_state = 'legacy_unresolved' THEN
    NEW.business_lifecycle := coalesce(
      NEW.business_lifecycle,
      'reserved'
    );
    NEW.record_source := 'legacy_inferred';
    NEW.scheduled_move_in_kind := CASE
      WHEN NEW.scheduled_move_in_date IS NULL THEN 'unknown'
      ELSE 'known'
    END;
    NEW.scheduled_move_out_kind := CASE
      WHEN NEW.scheduled_move_out_date IS NULL THEN 'unknown'
      ELSE 'known'
    END;
    NEW.actual_move_in_kind := CASE
      WHEN NEW.actual_move_in_date IS NULL THEN 'unknown'
      ELSE 'known'
    END;
    NEW.actual_move_out_kind := CASE
      WHEN NEW.actual_move_out_date IS NULL THEN 'unknown'
      ELSE 'known'
    END;
    NEW.notice_kind := CASE
      WHEN NEW.notice_date IS NULL THEN 'unknown'
      ELSE 'known'
    END;
    NEW.scheduled_move_in_confidence := 'unknown';
    NEW.scheduled_move_out_confidence := 'unknown';
    NEW.actual_move_in_confidence := 'unknown';
    NEW.actual_move_out_confidence := 'unknown';
    NEW.notice_confidence := 'unknown';
    NEW.evidence_reason := coalesce(
      NULLIF(trim(NEW.evidence_reason), ''),
      'tb02_legacy_bootstrap'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.classify_legacy_lease_party(),
  app_private.classify_legacy_lease_occupancy()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER classify_legacy_lease_party
BEFORE INSERT ON public.lease_parties
FOR EACH ROW
EXECUTE FUNCTION app_private.classify_legacy_lease_party();

CREATE TRIGGER classify_legacy_lease_occupancy
BEFORE INSERT ON public.lease_occupancies
FOR EACH ROW
EXECUTE FUNCTION app_private.classify_legacy_lease_occupancy();

CREATE TRIGGER guard_lease_occupancy_participant_history_mutation
BEFORE INSERT OR UPDATE OR DELETE
ON public.lease_occupancy_participants
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_lease_history_mutation();

CREATE OR REPLACE FUNCTION app_private.validate_lease_participant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occupancy public.lease_occupancies%ROWTYPE;
  v_party public.lease_parties%ROWTYPE;
  v_party_type text;
  v_participant_range daterange;
BEGIN
  SELECT occupancies.*
  INTO v_occupancy
  FROM public.lease_occupancies AS occupancies
  WHERE occupancies.organization_id = NEW.organization_id
    AND occupancies.id = NEW.lease_occupancy_id;

  SELECT parties.*
  INTO v_party
  FROM public.lease_parties AS parties
  WHERE parties.organization_id = NEW.organization_id
    AND parties.id = NEW.lease_party_id;

  SELECT people.party_type
  INTO v_party_type
  FROM public.people AS people
  WHERE people.organization_id = NEW.organization_id
    AND people.id = v_party.person_id;

  IF v_occupancy.id IS NULL
    OR v_party.id IS NULL
    OR v_occupancy.lease_id <> v_party.lease_id THEN
    RAISE EXCEPTION
      'Occupancy participant must link one exact Lease occupancy and party'
      USING
        ERRCODE = '23503',
        DETAIL = 'occupancy_participant_scope_mismatch';
  END IF;

  IF v_party_type <> 'individual' THEN
    RAISE EXCEPTION
      'A company cannot be an occupancy participant'
      USING
        ERRCODE = '23514',
        DETAIL = 'occupancy_participant_individual_required';
  END IF;

  IF v_party.party_role NOT IN (
    'primary_tenant',
    'co_tenant',
    'authorized_occupant'
  ) THEN
    RAISE EXCEPTION
      'The linked Lease-party role cannot establish physical participation'
      USING
        ERRCODE = '23514',
        DETAIL = 'occupancy_participant_role_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.organization_id::text || ':' || v_party.person_id::text,
      0
    )
  );

  v_participant_range := CASE
    WHEN NEW.evidence_state = 'accepted'
      AND NEW.business_lifecycle IN ('planned', 'present', 'ended')
      AND NEW.started_on_kind = 'known'
      AND NEW.started_on IS NOT NULL
      AND NEW.ended_on_kind IN ('known', 'open_current')
      AND (
        (NEW.ended_on_kind = 'known' AND NEW.ended_on IS NOT NULL)
        OR (
          NEW.ended_on_kind = 'open_current'
          AND NEW.ended_on IS NULL
        )
      )
    THEN daterange(NEW.started_on, NEW.ended_on, '[]')
    ELSE NULL
  END;

  IF NEW.evidence_state = 'accepted'
    AND NEW.business_lifecycle IN ('present', 'ended') THEN
    IF v_occupancy.evidence_state <> 'accepted'
      OR v_occupancy.business_lifecycle NOT IN (
        'occupied',
        'notice_given',
        'vacated'
      )
      OR v_occupancy.actual_effective_range IS NULL
      OR v_participant_range IS NULL
      OR NOT (
        v_participant_range <@ v_occupancy.actual_effective_range
      ) THEN
      RAISE EXCEPTION
        'Confirmed Person residence must be contained by accepted actual occupancy'
        USING
          ERRCODE = '23514',
          DETAIL = 'occupancy_participant_actual_containment_required';
    END IF;
  END IF;

  IF NEW.evidence_state = 'accepted'
    AND v_participant_range IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.lease_occupancy_participants AS existing
      JOIN public.lease_parties AS existing_party
        ON existing_party.organization_id = existing.organization_id
        AND existing_party.id = existing.lease_party_id
      WHERE existing.organization_id = NEW.organization_id
        AND existing.id <> NEW.id
        AND existing.evidence_state = 'accepted'
        AND existing.effective_range IS NOT NULL
        AND existing.effective_range && v_participant_range
        AND existing_party.person_id = v_party.person_id
    ) THEN
    RAISE EXCEPTION
      'A Person cannot have overlapping accepted participant intervals'
      USING
        ERRCODE = '23P01',
        DETAIL = 'occupancy_participant_person_overlap';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.validate_lease_participant_scope()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER validate_lease_participant_scope
BEFORE INSERT OR UPDATE OF
  organization_id,
  lease_occupancy_id,
  lease_party_id,
  started_on,
  ended_on,
  evidence_state,
  business_lifecycle,
  started_on_kind,
  ended_on_kind
ON public.lease_occupancy_participants
FOR EACH ROW
EXECUTE FUNCTION app_private.validate_lease_participant_scope();

CREATE TRIGGER set_lease_occupancy_participants_updated_at
BEFORE UPDATE ON public.lease_occupancy_participants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lease_occupancy_participants
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view lease occupancy participants"
ON public.lease_occupancy_participants
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

REVOKE ALL ON TABLE public.lease_occupancy_participants
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.lease_occupancy_participants
TO authenticated, service_role;

SELECT set_config(
  'app.lease_history_write_context',
  'checked-lease-bootstrap-v1',
  true
);

UPDATE public.lease_parties
SET
  evidence_state = 'legacy_unresolved',
  business_lifecycle = 'planned',
  record_source = 'legacy_inferred',
  started_on_kind = CASE
    WHEN started_on IS NULL THEN 'unknown'
    ELSE 'known'
  END,
  started_on_confidence = 'unknown',
  ended_on_kind = CASE
    WHEN ended_on IS NULL THEN 'unknown'
    ELSE 'known'
  END,
  ended_on_confidence = 'unknown',
  evidence_recorded_at = now(),
  evidence_recorded_by = NULL,
  evidence_reason = 'tb02_legacy_bootstrap';

UPDATE public.lease_occupancies
SET
  evidence_state = 'legacy_unresolved',
  business_lifecycle = 'reserved',
  record_source = 'legacy_inferred',
  scheduled_move_in_kind = CASE
    WHEN scheduled_move_in_date IS NULL THEN 'unknown'
    ELSE 'known'
  END,
  scheduled_move_in_confidence = 'unknown',
  scheduled_move_out_kind = CASE
    WHEN scheduled_move_out_date IS NULL THEN 'unknown'
    ELSE 'known'
  END,
  scheduled_move_out_confidence = 'unknown',
  actual_move_in_kind = CASE
    WHEN actual_move_in_date IS NULL THEN 'unknown'
    ELSE 'known'
  END,
  actual_move_in_confidence = 'unknown',
  actual_move_out_kind = CASE
    WHEN actual_move_out_date IS NULL THEN 'unknown'
    ELSE 'known'
  END,
  actual_move_out_confidence = 'unknown',
  notice_kind = CASE
    WHEN notice_date IS NULL THEN 'unknown'
    ELSE 'known'
  END,
  notice_confidence = 'unknown',
  evidence_recorded_at = now(),
  evidence_recorded_by = NULL,
  evidence_reason = 'tb02_legacy_bootstrap';

SELECT set_config('app.lease_history_write_context', 'off', true);

INSERT INTO public.activity_logs(
  organization_id,
  actor_id,
  entity_type,
  entity_id,
  action,
  new_values
)
SELECT
  parties.organization_id,
  NULL,
  'lease_party',
  parties.id,
  'lease_party_bootstrapped_legacy_unresolved',
  jsonb_build_object(
    'leaseId', parties.lease_id,
    'personId', parties.person_id,
    'partyRole', parties.party_role,
    'startedOn', parties.started_on,
    'endedOn', parties.ended_on,
    'evidenceState', parties.evidence_state,
    'recordSource', parties.record_source
  )
FROM public.lease_parties AS parties;

INSERT INTO public.activity_logs(
  organization_id,
  actor_id,
  entity_type,
  entity_id,
  action,
  new_values
)
SELECT
  occupancies.organization_id,
  NULL,
  'lease_occupancy',
  occupancies.id,
  'lease_occupancy_bootstrapped_legacy_unresolved',
  jsonb_build_object(
    'leaseId', occupancies.lease_id,
    'propertyId', occupancies.property_id,
    'unitId', occupancies.unit_id,
    'scheduledMoveInDate', occupancies.scheduled_move_in_date,
    'scheduledMoveOutDate', occupancies.scheduled_move_out_date,
    'actualMoveInDate', occupancies.actual_move_in_date,
    'actualMoveOutDate', occupancies.actual_move_out_date,
    'evidenceState', occupancies.evidence_state,
    'recordSource', occupancies.record_source
  )
FROM public.lease_occupancies AS occupancies;

CREATE OR REPLACE FUNCTION app_private.validate_lease_boundary(
  p_boundary jsonb,
  p_allow_open_current boolean,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_confidence text := p_boundary ->> 'confidence';
  v_date text := p_boundary ->> 'date';
  v_kind text := p_boundary ->> 'kind';
BEGIN
  IF jsonb_typeof(p_boundary) <> 'object'
    OR v_kind IS NULL
    OR v_confidence IS NULL THEN
    RAISE EXCEPTION '% boundary evidence is required', p_label
      USING ERRCODE = '23514';
  END IF;

  IF v_kind NOT IN ('known', 'unknown')
    AND NOT (p_allow_open_current AND v_kind = 'open_current') THEN
    RAISE EXCEPTION '% boundary kind is invalid', p_label
      USING ERRCODE = '23514';
  END IF;

  IF v_confidence NOT IN ('confirmed', 'inferred', 'unknown') THEN
    RAISE EXCEPTION '% boundary confidence is invalid', p_label
      USING ERRCODE = '23514';
  END IF;

  IF (v_kind = 'known' AND NULLIF(v_date, '') IS NULL)
    OR (
      v_kind IN ('unknown', 'open_current')
      AND NULLIF(v_date, '') IS NOT NULL
    ) THEN
    RAISE EXCEPTION '% boundary date does not match its kind', p_label
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(v_date, '') IS NOT NULL THEN
    PERFORM v_date::date;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.validate_new_lease_relationship_payload(
  p_primary_tenant_person_id uuid,
  p_relationship_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occupancy jsonb := p_relationship_payload -> 'occupancy';
  v_participant jsonb;
  v_participants jsonb := coalesce(
    p_relationship_payload -> 'participants',
    '[]'::jsonb
  );
  v_primary_party jsonb := p_relationship_payload -> 'primaryParty';
BEGIN
  IF jsonb_typeof(p_relationship_payload) <> 'object'
    OR jsonb_typeof(v_primary_party) <> 'object'
    OR jsonb_typeof(v_occupancy) <> 'object'
    OR jsonb_typeof(v_participants) <> 'array' THEN
    RAISE EXCEPTION
      'A normalized primary party, occupancy, and participant array are required'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_relationship_payload_required';
  END IF;

  IF (v_primary_party ->> 'personId')::uuid
    IS DISTINCT FROM p_primary_tenant_person_id THEN
    RAISE EXCEPTION
      'The normalized primary party must match the exact primary Tenant'
      USING
        ERRCODE = '23503',
        DETAIL = 'lease_relationship_primary_person_mismatch';
  END IF;

  IF v_primary_party ->> 'lifecycle' NOT IN (
    'planned',
    'effective',
    'ended',
    'cancelled_before_effective'
  )
  OR v_occupancy ->> 'lifecycle' NOT IN (
    'reserved',
    'occupied',
    'notice_given',
    'vacated',
    'cancelled_before_effective'
  ) THEN
    RAISE EXCEPTION 'New Lease relationship lifecycle is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF v_primary_party ->> 'recordSource' NOT IN (
    'operator_confirmed',
    'imported_explicit',
    'system_transition'
  )
  OR v_occupancy ->> 'recordSource' NOT IN (
    'operator_confirmed',
    'imported_explicit',
    'system_transition'
  ) THEN
    RAISE EXCEPTION 'New Lease relationship source is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NULLIF(trim(v_primary_party ->> 'reason'), '') IS NULL
    OR NULLIF(trim(v_occupancy ->> 'reason'), '') IS NULL THEN
    RAISE EXCEPTION 'New Lease relationship evidence reason is required'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app_private.validate_lease_boundary(
    v_primary_party -> 'startedOn',
    false,
    'party start'
  );
  PERFORM app_private.validate_lease_boundary(
    v_primary_party -> 'endedOn',
    true,
    'party end'
  );
  PERFORM app_private.validate_lease_boundary(
    v_occupancy -> 'scheduledMoveIn',
    false,
    'scheduled move-in'
  );
  PERFORM app_private.validate_lease_boundary(
    v_occupancy -> 'scheduledMoveOut',
    true,
    'scheduled move-out'
  );
  PERFORM app_private.validate_lease_boundary(
    v_occupancy -> 'actualMoveIn',
    false,
    'actual move-in'
  );
  PERFORM app_private.validate_lease_boundary(
    v_occupancy -> 'actualMoveOut',
    true,
    'actual move-out'
  );

  IF v_primary_party -> 'startedOn' ->> 'kind' = 'known'
    AND v_primary_party -> 'endedOn' ->> 'kind' = 'known'
    AND (v_primary_party -> 'endedOn' ->> 'date')::date
      < (v_primary_party -> 'startedOn' ->> 'date')::date THEN
    RAISE EXCEPTION
      'Party end date must be on or after party start date'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_relationship_party_date_order_invalid';
  END IF;

  IF v_occupancy -> 'scheduledMoveIn' ->> 'kind' = 'known'
    AND v_occupancy -> 'scheduledMoveOut' ->> 'kind' = 'known'
    AND (v_occupancy -> 'scheduledMoveOut' ->> 'date')::date
      < (v_occupancy -> 'scheduledMoveIn' ->> 'date')::date THEN
    RAISE EXCEPTION
      'Scheduled move-out date must be on or after scheduled move-in date'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_relationship_scheduled_date_order_invalid';
  END IF;

  IF v_occupancy -> 'actualMoveIn' ->> 'kind' = 'known'
    AND v_occupancy -> 'actualMoveOut' ->> 'kind' = 'known'
    AND (v_occupancy -> 'actualMoveOut' ->> 'date')::date
      < (v_occupancy -> 'actualMoveIn' ->> 'date')::date THEN
    RAISE EXCEPTION
      'Actual move-out date must be on or after actual move-in date'
      USING
        ERRCODE = '23514',
        DETAIL = 'lease_relationship_actual_date_order_invalid';
  END IF;

  IF jsonb_array_length(v_participants) > 20 THEN
    RAISE EXCEPTION 'A new Lease supports at most 20 explicit participants'
      USING ERRCODE = '54000';
  END IF;

  FOR v_participant IN
    SELECT value
    FROM jsonb_array_elements(v_participants)
  LOOP
    IF jsonb_typeof(v_participant) <> 'object'
      OR (v_participant ->> 'personId')::uuid
        IS DISTINCT FROM p_primary_tenant_person_id THEN
      RAISE EXCEPTION
        'TB-02 participants must link the exact normalized primary Lease party'
        USING
          ERRCODE = '23503',
          DETAIL = 'occupancy_participant_party_required';
    END IF;

    IF v_participant ->> 'lifecycle' NOT IN (
      'planned',
      'present',
      'ended',
      'cancelled_before_effective'
    )
    OR v_participant ->> 'recordSource' NOT IN (
      'operator_confirmed',
      'imported_explicit',
      'system_transition'
    )
    OR NULLIF(trim(v_participant ->> 'reason'), '') IS NULL THEN
      RAISE EXCEPTION 'Occupancy participant evidence is invalid'
        USING ERRCODE = '23514';
    END IF;

    PERFORM app_private.validate_lease_boundary(
      v_participant -> 'startedOn',
      false,
      'participant start'
    );
    PERFORM app_private.validate_lease_boundary(
      v_participant -> 'endedOn',
      true,
      'participant end'
    );

    IF v_participant -> 'startedOn' ->> 'kind' = 'known'
      AND v_participant -> 'endedOn' ->> 'kind' = 'known'
      AND (v_participant -> 'endedOn' ->> 'date')::date
        < (v_participant -> 'startedOn' ->> 'date')::date THEN
      RAISE EXCEPTION
        'Participant end date must be on or after participant start date'
        USING
          ERRCODE = '23514',
          DETAIL = 'lease_relationship_participant_date_order_invalid';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.validate_lease_boundary(jsonb, boolean, text),
  app_private.validate_new_lease_relationship_payload(uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.create_lease_with_authoritative_term(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  text
)
SET SCHEMA app_private;

ALTER FUNCTION app_private.create_lease_with_authoritative_term(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  text
)
RENAME TO create_lease_with_authoritative_term_plan04;

REVOKE ALL ON FUNCTION app_private.create_lease_with_authoritative_term_plan04(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_lease_with_relationships(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_term_status text,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_lease_status text,
  p_relationship_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_context text :=
    current_setting('app.lease_history_write_context', true);
  v_idempotency_request
    app_private.financial_idempotency_requests%ROWTYPE;
  v_lease_id uuid;
  v_occupancy_id uuid;
  v_occupancy_payload jsonb := p_relationship_payload -> 'occupancy';
  v_participant jsonb;
  v_participant_id uuid;
  v_participant_ids jsonb := '[]'::jsonb;
  v_party_id uuid;
  v_party_payload jsonb := p_relationship_payload -> 'primaryParty';
  v_relationship_payload_hash text :=
    app_private.canonical_financial_payload_hash(
      p_relationship_payload
    );
  v_result jsonb;
  v_source_import_row_id uuid :=
    NULLIF(p_relationship_payload ->> 'sourceImportRowId', '')::uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.validate_new_lease_relationship_payload(
    p_primary_tenant_person_id,
    p_relationship_payload
  );

  PERFORM 1
  FROM public.people AS people
  JOIN public.person_roles AS roles
    ON roles.organization_id = people.organization_id
    AND roles.person_id = people.id
  WHERE people.organization_id = p_organization_id
    AND people.id = p_primary_tenant_person_id
    AND people.archived_at IS NULL
    AND roles.role = 'tenant'
    AND roles.status = 'active'
    AND roles.archived_at IS NULL
  FOR SHARE OF people, roles;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'An active Tenant role is required for the exact primary Tenant'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1
  FROM public.units AS units
  WHERE units.organization_id = p_organization_id
    AND units.property_id = p_property_id
    AND units.id = p_unit_id
    AND units.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found under selected property'
      USING ERRCODE = '23503';
  END IF;

  IF v_source_import_row_id IS NOT NULL THEN
    PERFORM 1
    FROM public.import_rows AS rows
    JOIN public.import_runs AS runs
      ON runs.organization_id = rows.organization_id
      AND runs.id = rows.import_run_id
    WHERE rows.organization_id = p_organization_id
      AND rows.id = v_source_import_row_id
      AND runs.import_type = 'leases'
    FOR SHARE OF rows, runs;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lease source import row not found'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  v_lease_id := app_private.create_lease_with_authoritative_term_plan04(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_term_status,
    p_deposit_amount,
    p_deposit_currency,
    p_lease_status,
    p_idempotency_key
  );

  SELECT requests.*
  INTO STRICT v_idempotency_request
  FROM app_private.financial_idempotency_requests AS requests
  WHERE requests.organization_id = p_organization_id
    AND requests.operation = 'create_lease_with_authoritative_term'
    AND requests.idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;

  IF v_idempotency_request.actor_id IS DISTINCT FROM v_actor_id
    OR v_idempotency_request.status <> 'completed'
    OR (v_idempotency_request.result_ids ->> 'leaseId')::uuid
      IS DISTINCT FROM v_lease_id THEN
    RAISE EXCEPTION 'Conflicting Lease creation idempotency result'
      USING
        ERRCODE = '22023',
        DETAIL = 'lease_relationship_idempotency_conflict';
  END IF;

  IF v_idempotency_request.result_ids
    ? 'relationshipPayloadHash' THEN
    IF v_idempotency_request.result_ids
      ->> 'relationshipPayloadHash'
      IS DISTINCT FROM v_relationship_payload_hash THEN
      RAISE EXCEPTION 'Conflicting Lease relationship idempotency request'
        USING
          ERRCODE = '22023',
          DETAIL = 'lease_relationship_idempotency_conflict';
    END IF;

    RETURN v_idempotency_request.result_ids
      - 'relationshipPayloadHash';
  END IF;

  IF v_idempotency_request.result_ids
    <> jsonb_build_object('leaseId', v_lease_id) THEN
    RAISE EXCEPTION 'Unexpected legacy Lease creation idempotency result'
      USING
        ERRCODE = '22023',
        DETAIL = 'lease_relationship_idempotency_conflict';
  END IF;

  SELECT parties.id
  INTO STRICT v_party_id
  FROM public.lease_parties AS parties
  WHERE parties.organization_id = p_organization_id
    AND parties.lease_id = v_lease_id
    AND parties.party_role = 'primary_tenant'
    AND parties.person_id = p_primary_tenant_person_id;

  SELECT occupancies.id
  INTO STRICT v_occupancy_id
  FROM public.lease_occupancies AS occupancies
  WHERE occupancies.organization_id = p_organization_id
    AND occupancies.lease_id = v_lease_id
    AND occupancies.property_id = p_property_id
    AND occupancies.unit_id = p_unit_id;

  PERFORM set_config(
    'app.lease_history_write_context',
    'checked-lease-create-v2',
    true
  );

  UPDATE public.lease_parties
  SET
    evidence_state = 'accepted',
    business_lifecycle = v_party_payload ->> 'lifecycle',
    record_source = v_party_payload ->> 'recordSource',
    started_on =
      NULLIF(v_party_payload #>> '{startedOn,date}', '')::date,
    started_on_kind = v_party_payload #>> '{startedOn,kind}',
    started_on_confidence =
      v_party_payload #>> '{startedOn,confidence}',
    ended_on = NULLIF(v_party_payload #>> '{endedOn,date}', '')::date,
    ended_on_kind = v_party_payload #>> '{endedOn,kind}',
    ended_on_confidence =
      v_party_payload #>> '{endedOn,confidence}',
    source_import_row_id = v_source_import_row_id,
    evidence_recorded_at = now(),
    evidence_recorded_by = v_actor_id,
    evidence_reason = v_party_payload ->> 'reason',
    updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = v_party_id;

  UPDATE public.lease_occupancies
  SET
    status = CASE v_occupancy_payload ->> 'lifecycle'
      WHEN 'cancelled_before_effective' THEN 'cancelled'
      ELSE v_occupancy_payload ->> 'lifecycle'
    END,
    evidence_state = 'accepted',
    business_lifecycle = v_occupancy_payload ->> 'lifecycle',
    record_source = v_occupancy_payload ->> 'recordSource',
    scheduled_move_in_date =
      NULLIF(
        v_occupancy_payload #>> '{scheduledMoveIn,date}',
        ''
      )::date,
    scheduled_move_in_kind =
      v_occupancy_payload #>> '{scheduledMoveIn,kind}',
    scheduled_move_in_confidence =
      v_occupancy_payload #>> '{scheduledMoveIn,confidence}',
    scheduled_move_out_date =
      NULLIF(
        v_occupancy_payload #>> '{scheduledMoveOut,date}',
        ''
      )::date,
    scheduled_move_out_kind =
      v_occupancy_payload #>> '{scheduledMoveOut,kind}',
    scheduled_move_out_confidence =
      v_occupancy_payload #>> '{scheduledMoveOut,confidence}',
    actual_move_in_date =
      NULLIF(v_occupancy_payload #>> '{actualMoveIn,date}', '')::date,
    actual_move_in_kind =
      v_occupancy_payload #>> '{actualMoveIn,kind}',
    actual_move_in_confidence =
      v_occupancy_payload #>> '{actualMoveIn,confidence}',
    actual_move_out_date =
      NULLIF(v_occupancy_payload #>> '{actualMoveOut,date}', '')::date,
    actual_move_out_kind =
      v_occupancy_payload #>> '{actualMoveOut,kind}',
    actual_move_out_confidence =
      v_occupancy_payload #>> '{actualMoveOut,confidence}',
    notice_kind = CASE
      WHEN notice_date IS NULL THEN 'unknown'
      ELSE 'known'
    END,
    notice_confidence = 'unknown',
    source_import_row_id = v_source_import_row_id,
    evidence_recorded_at = now(),
    evidence_recorded_by = v_actor_id,
    evidence_reason = v_occupancy_payload ->> 'reason',
    updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = v_occupancy_id;

  FOR v_participant IN
    SELECT value
    FROM jsonb_array_elements(
      coalesce(p_relationship_payload -> 'participants', '[]'::jsonb)
    )
  LOOP
    INSERT INTO public.lease_occupancy_participants(
      organization_id,
      lease_occupancy_id,
      lease_party_id,
      started_on,
      ended_on,
      evidence_state,
      business_lifecycle,
      record_source,
      started_on_kind,
      started_on_confidence,
      ended_on_kind,
      ended_on_confidence,
      source_import_row_id,
      evidence_recorded_at,
      evidence_recorded_by,
      evidence_reason,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      v_occupancy_id,
      v_party_id,
      NULLIF(v_participant #>> '{startedOn,date}', '')::date,
      NULLIF(v_participant #>> '{endedOn,date}', '')::date,
      'accepted',
      v_participant ->> 'lifecycle',
      v_participant ->> 'recordSource',
      v_participant #>> '{startedOn,kind}',
      v_participant #>> '{startedOn,confidence}',
      v_participant #>> '{endedOn,kind}',
      v_participant #>> '{endedOn,confidence}',
      v_source_import_row_id,
      now(),
      v_actor_id,
      v_participant ->> 'reason',
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_participant_id;

    v_participant_ids :=
      v_participant_ids || jsonb_build_array(v_participant_id);

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
      v_actor_id,
      'lease_occupancy_participant',
      v_participant_id,
      'lease_occupancy_participant_created',
      jsonb_build_object(
        'leaseId', v_lease_id,
        'leaseOccupancyId', v_occupancy_id,
        'leasePartyId', v_party_id,
        'personId', p_primary_tenant_person_id,
        'businessLifecycle', v_participant ->> 'lifecycle',
        'startedOn', v_participant #>> '{startedOn,date}',
        'endedOn', v_participant #>> '{endedOn,date}',
        'recordSource', v_participant ->> 'recordSource'
      )
    );
  END LOOP;

  PERFORM set_config(
    'app.lease_history_write_context',
    coalesce(v_context, 'off'),
    true
  );

  INSERT INTO public.activity_logs(
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES
  (
    p_organization_id,
    v_actor_id,
    'lease_party',
    v_party_id,
    'lease_party_created',
    jsonb_build_object(
      'leaseId', v_lease_id,
      'personId', p_primary_tenant_person_id,
      'partyRole', 'primary_tenant',
      'businessLifecycle', v_party_payload ->> 'lifecycle',
      'startedOn', v_party_payload #>> '{startedOn,date}',
      'endedOn', v_party_payload #>> '{endedOn,date}',
      'recordSource', v_party_payload ->> 'recordSource'
    )
  ),
  (
    p_organization_id,
    v_actor_id,
    'lease_occupancy',
    v_occupancy_id,
    'lease_occupancy_created',
    jsonb_build_object(
      'leaseId', v_lease_id,
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'businessLifecycle', v_occupancy_payload ->> 'lifecycle',
      'scheduledMoveIn',
        v_occupancy_payload #>> '{scheduledMoveIn,date}',
      'scheduledMoveOut',
        v_occupancy_payload #>> '{scheduledMoveOut,date}',
      'actualMoveIn', v_occupancy_payload #>> '{actualMoveIn,date}',
      'actualMoveOut', v_occupancy_payload #>> '{actualMoveOut,date}',
      'recordSource', v_occupancy_payload ->> 'recordSource'
    )
  );

  v_result := jsonb_build_object(
    'leaseId', v_lease_id,
    'partyId', v_party_id,
    'occupancyId', v_occupancy_id,
    'participantIds', v_participant_ids
  );

  UPDATE app_private.financial_idempotency_requests
  SET result_ids = v_result || jsonb_build_object(
    'relationshipPayloadHash',
    v_relationship_payload_hash
  )
  WHERE id = v_idempotency_request.id
    AND organization_id = p_organization_id
    AND result_ids = jsonb_build_object('leaseId', v_lease_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease relationship idempotency changed during create'
      USING
        ERRCODE = '40001',
        DETAIL = 'lease_relationship_idempotency_changed';
  END IF;

  RETURN v_result;
EXCEPTION WHEN TOO_MANY_ROWS THEN
  RAISE EXCEPTION
    'Checked Lease creation must adopt exactly one party and occupancy'
    USING
      ERRCODE = '23514',
      DETAIL = 'lease_relationship_exact_one_required';
END;
$$;

REVOKE ALL ON FUNCTION public.create_lease_with_relationships(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  jsonb,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_lease_with_relationships(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  jsonb,
  text
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.create_lease_with_authoritative_term(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_term_status text,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_lease_status text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_normalized_lease_status text := lower(trim(p_lease_status));
  v_result jsonb;
BEGIN
  v_result := public.create_lease_with_relationships(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_term_status,
    p_deposit_amount,
    p_deposit_currency,
    p_lease_status,
    jsonb_build_object(
      'primaryParty', jsonb_build_object(
        'personId', p_primary_tenant_person_id,
        'lifecycle', CASE
          WHEN v_normalized_lease_status = 'cancelled'
            THEN 'cancelled_before_effective'
          WHEN v_normalized_lease_status IN ('ended', 'terminated')
            THEN 'ended'
          WHEN v_normalized_lease_status IN ('active', 'notice_given')
            THEN 'effective'
          ELSE 'planned'
        END,
        'recordSource', 'system_transition',
        'reason', 'compatibility_create',
        'startedOn', jsonb_build_object(
          'date', NULL,
          'kind', 'unknown',
          'confidence', 'unknown'
        ),
        'endedOn', jsonb_build_object(
          'date', NULL,
          'kind', 'unknown',
          'confidence', 'unknown'
        )
      ),
      'occupancy', jsonb_build_object(
        'lifecycle', CASE
          WHEN v_normalized_lease_status = 'cancelled'
            THEN 'cancelled_before_effective'
          WHEN v_normalized_lease_status IN ('ended', 'terminated')
            THEN 'vacated'
          WHEN v_normalized_lease_status = 'notice_given'
            THEN 'notice_given'
          WHEN v_normalized_lease_status = 'active' THEN 'occupied'
          ELSE 'reserved'
        END,
        'recordSource', 'system_transition',
        'reason', 'compatibility_create',
        'scheduledMoveIn', jsonb_build_object(
          'date', NULL,
          'kind', 'unknown',
          'confidence', 'unknown'
        ),
        'scheduledMoveOut', jsonb_build_object(
          'date', NULL,
          'kind', 'unknown',
          'confidence', 'unknown'
        ),
        'actualMoveIn', jsonb_build_object(
          'date', NULL,
          'kind', 'unknown',
          'confidence', 'unknown'
        ),
        'actualMoveOut', jsonb_build_object(
          'date', NULL,
          'kind', 'unknown',
          'confidence', 'unknown'
        )
      ),
      'participants', '[]'::jsonb
    ),
    p_idempotency_key
  );

  RETURN (v_result ->> 'leaseId')::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lease_with_authoritative_term(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_lease_with_authoritative_term(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  numeric,
  public.currency_code,
  text,
  text
)
TO authenticated;

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
  v_import_result_write_context text :=
    current_setting(
      'app.lease_import_result_write_context',
      true
    );
  v_relationship_result jsonb;
  v_run public.import_runs%ROWTYPE;
  v_row public.import_rows%ROWTYPE;
  v_row_error text;
  v_candidate_total integer := 0;
  v_created_total integer := 0;
  v_failed_total integer := 0;
  v_skipped_total integer := 0;
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

  IF v_run.status IN ('committed', 'committed_with_errors') THEN
    RAISE EXCEPTION 'Import run has already been committed'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_candidate_total
  FROM public.import_rows AS rows
  WHERE rows.import_run_id = v_run.id
    AND rows.organization_id = p_organization_id
    AND rows.row_status IN ('ready', 'warning');

  IF v_candidate_total > 250 THEN
    RAISE EXCEPTION
      'Lease import runs are limited to 250 commit-ready rows'
      USING ERRCODE = '54000';
  END IF;

  UPDATE public.import_runs
  SET
    status = 'committing',
    error_message = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = v_run.id;

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
        public.create_lease_with_relationships(
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
          jsonb_build_object(
            'sourceImportRowId', v_row.id,
            'primaryParty', jsonb_build_object(
              'personId',
                (v_row.normalized_data ->> 'tenantPersonId')::uuid,
              'lifecycle',
                CASE
                  WHEN v_row.normalized_data ->> 'status' = 'cancelled'
                    THEN 'cancelled_before_effective'
                  ELSE 'planned'
                END,
              'recordSource', 'imported_explicit',
              'reason', 'lease_import_explicit_identity',
              'startedOn', jsonb_build_object(
                'date', NULL,
                'kind', 'unknown',
                'confidence', 'unknown'
              ),
              'endedOn', jsonb_build_object(
                'date', NULL,
                'kind', 'unknown',
                'confidence', 'unknown'
              )
            ),
            'occupancy', jsonb_build_object(
              'lifecycle',
                CASE
                  WHEN v_row.normalized_data ->> 'status' = 'cancelled'
                    THEN 'cancelled_before_effective'
                  ELSE 'reserved'
                END,
              'recordSource', 'imported_explicit',
              'reason', 'lease_import_explicit_scope',
              'scheduledMoveIn', jsonb_build_object(
                'date', NULL,
                'kind', 'unknown',
                'confidence', 'unknown'
              ),
              'scheduledMoveOut', jsonb_build_object(
                'date', NULL,
                'kind', 'unknown',
                'confidence', 'unknown'
              ),
              'actualMoveIn', jsonb_build_object(
                'date', NULL,
                'kind', 'unknown',
                'confidence', 'unknown'
              ),
              'actualMoveOut', jsonb_build_object(
                'date', NULL,
                'kind', 'unknown',
                'confidence', 'unknown'
              )
            ),
            'participants', '[]'::jsonb
          ),
          concat('import:', v_run.id, ':', v_row.id)
        );

      v_created_total := v_created_total + 1;

      PERFORM set_config(
        'app.lease_import_result_write_context',
        'checked-v1',
        true
      );

      UPDATE public.import_rows
      SET
        row_status = 'committed',
        result_action = 'created',
        result_lease_id =
          (v_relationship_result ->> 'leaseId')::uuid,
        result_lease_party_id =
          (v_relationship_result ->> 'partyId')::uuid,
        result_lease_occupancy_id =
          (v_relationship_result ->> 'occupancyId')::uuid,
        error_message = NULL
      WHERE id = v_row.id;

      PERFORM set_config(
        'app.lease_import_result_write_context',
        coalesce(v_import_result_write_context, ''),
        true
      );
    EXCEPTION WHEN OTHERS THEN
      v_failed_total := v_failed_total + 1;
      v_row_error := SQLERRM;

      IF v_row_error ILIKE '%conflicting key value violates exclusion%'
        OR v_row_error ILIKE
          '%lease_occupancies_unit_protected_range_excl%' THEN
        v_row_error :=
          'Unit already has an overlapping accepted Lease occupancy.';
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
      WHERE id = v_row.id;
    END;
  END LOOP;

  UPDATE public.import_runs
  SET
    status = CASE
      WHEN v_failed_total > 0 AND v_created_total > 0
        THEN 'committed_with_errors'
      WHEN v_failed_total > 0 THEN 'failed'
      ELSE 'committed'
    END,
    created_count = v_created_total,
    updated_count = 0,
    failed_count = v_failed_total,
    skipped_count = v_skipped_total,
    committed_at = now(),
    error_message = CASE
      WHEN v_failed_total > 0 THEN 'Some rows could not be committed.'
      ELSE NULL
    END,
    updated_by = (SELECT auth.uid())
  WHERE id = v_run.id;

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
    'status', CASE
      WHEN v_failed_total > 0 AND v_created_total > 0
        THEN 'committed_with_errors'
      WHEN v_failed_total > 0 THEN 'failed'
      ELSE 'committed'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_generic_import_run(uuid, uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_generic_import_run(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.person_has_open_lease_relationship(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.leases AS leases
      WHERE leases.organization_id = p_organization_id
        AND leases.primary_tenant_person_id = p_person_id
        AND leases.archived_at IS NULL
        AND leases.status IN ('active', 'draft', 'notice_given')
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      JOIN public.leases AS leases
        ON leases.organization_id = parties.organization_id
        AND leases.id = parties.lease_id
      WHERE parties.organization_id = p_organization_id
        AND parties.person_id = p_person_id
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
      WHERE participants.organization_id = p_organization_id
        AND parties.person_id = p_person_id
        AND participants.evidence_state = 'accepted'
        AND participants.business_lifecycle IN ('planned', 'present')
    );
$$;

REVOKE ALL ON FUNCTION
  app_private.person_has_open_lease_relationship(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_person_lease_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_checked_archive boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.person_archive_context', true),
      ''
    ) = 'checked-person-archive-v1';
  v_trusted_fixture boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(current_setting('role', true), 'none')
      IN ('none', 'postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.people_leases_skip_sync', true),
      ''
    ) = 'on';
BEGIN
  IF v_trusted_fixture
    OR OLD.archived_at IS NOT NULL
    OR NEW.archived_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF app_private.person_has_open_lease_relationship(
    OLD.organization_id,
    OLD.id
  ) THEN
    RAISE EXCEPTION
      'End or cancel the open Lease relationship through a checked transition before archiving this Person'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
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

  UPDATE public.people
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_person_id
    AND organization_id = p_organization_id
  RETURNING * INTO v_new_person;

  PERFORM set_config(
    'app.person_archive_context',
    coalesce(v_archive_context, 'off'),
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

REVOKE ALL ON FUNCTION
  app_private.guard_person_lease_archive(),
  public.archive_person(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_person(uuid, uuid)
TO authenticated;
