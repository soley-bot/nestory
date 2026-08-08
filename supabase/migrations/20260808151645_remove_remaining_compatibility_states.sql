CREATE OR REPLACE FUNCTION public.create_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_status text,
  p_supersedes_term_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.create_authoritative_lease_term_internal(
    p_organization_id,
    p_lease_id,
    p_start_date,
    p_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_status,
    p_supersedes_term_id,
    p_idempotency_key
  );
END;
$$;

DROP FUNCTION public.generate_monthly_rent_income_items(uuid, date);

CREATE OR REPLACE FUNCTION app_private.person_has_open_lease_relationship(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.leases AS lease
      WHERE lease.organization_id = p_organization_id
        AND lease.primary_tenant_person_id = p_person_id
        AND lease.archived_at IS NULL
        AND lease.status IN ('active', 'draft', 'notice_given')
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_parties AS party
      JOIN public.leases AS lease
        ON lease.organization_id = party.organization_id
        AND lease.id = party.lease_id
      WHERE party.organization_id = p_organization_id
        AND party.person_id = p_person_id
        AND party.archived_at IS NULL
        AND party.evidence_state = 'accepted'
        AND party.business_lifecycle IN ('planned', 'effective')
        AND lease.archived_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancy_participants AS participant
      JOIN public.lease_parties AS party
        ON party.organization_id = participant.organization_id
        AND party.id = participant.lease_party_id
      WHERE participant.organization_id = p_organization_id
        AND party.person_id = p_person_id
        AND participant.evidence_state = 'accepted'
        AND participant.business_lifecycle IN ('planned', 'present')
    );
$$;

CREATE OR REPLACE FUNCTION app_private.guard_person_lease_archive()
RETURNS trigger
LANGUAGE plpgsql
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

  IF app_private.person_has_open_lease_relationship(
    OLD.organization_id,
    OLD.id
  ) THEN
    RAISE EXCEPTION
      'End or cancel the open Lease relationship before archiving this Person'
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

CREATE OR REPLACE FUNCTION app_private.assert_lease_archive_relationships_ready(
  p_organization_id uuid,
  p_lease_id uuid,
  p_lease_status text,
  p_primary_tenant_person_id uuid,
  p_property_id uuid,
  p_unit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_occupancy_lifecycle text := CASE
    WHEN p_lease_status = 'cancelled' THEN 'cancelled_before_effective'
    WHEN p_lease_status IN ('ended', 'terminated') THEN 'vacated'
  END;
  v_expected_party_lifecycle text := CASE
    WHEN p_lease_status = 'cancelled' THEN 'cancelled_before_effective'
    WHEN p_lease_status IN ('ended', 'terminated') THEN 'ended'
  END;
BEGIN
  PERFORM party.id
  FROM public.lease_parties AS party
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
  ORDER BY party.id
  FOR UPDATE;

  PERFORM occupancy.id
  FROM public.lease_occupancies AS occupancy
  WHERE occupancy.organization_id = p_organization_id
    AND occupancy.lease_id = p_lease_id
    AND occupancy.archived_at IS NULL
  ORDER BY occupancy.id
  FOR UPDATE;

  PERFORM participant.id
  FROM public.lease_occupancy_participants AS participant
  JOIN public.lease_occupancies AS occupancy
    ON occupancy.organization_id = participant.organization_id
    AND occupancy.id = participant.lease_occupancy_id
  WHERE occupancy.organization_id = p_organization_id
    AND occupancy.lease_id = p_lease_id
    AND occupancy.archived_at IS NULL
  ORDER BY participant.id
  FOR UPDATE OF participant;

  IF v_expected_occupancy_lifecycle IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancy
      WHERE occupancy.organization_id = p_organization_id
        AND occupancy.lease_id = p_lease_id
        AND occupancy.archived_at IS NULL
        AND occupancy.evidence_state = 'accepted'
        AND occupancy.property_id = p_property_id
        AND occupancy.unit_id IS NOT DISTINCT FROM p_unit_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancy
      WHERE occupancy.organization_id = p_organization_id
        AND occupancy.lease_id = p_lease_id
        AND occupancy.archived_at IS NULL
        AND (
          occupancy.evidence_state <> 'accepted'
          OR occupancy.business_lifecycle
            <> v_expected_occupancy_lifecycle
        )
    ) THEN
    RAISE EXCEPTION
      'End or cancel every accepted occupancy before archiving this Lease'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lease_parties AS party
    WHERE party.organization_id = p_organization_id
      AND party.lease_id = p_lease_id
      AND party.archived_at IS NULL
      AND party.evidence_state = 'accepted'
      AND party.party_role = 'primary_tenant'
      AND party.is_primary
      AND party.person_id = p_primary_tenant_person_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.lease_parties AS party
    WHERE party.organization_id = p_organization_id
      AND party.lease_id = p_lease_id
      AND party.archived_at IS NULL
      AND (
        party.evidence_state <> 'accepted'
        OR party.business_lifecycle <> v_expected_party_lifecycle
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.lease_occupancy_participants AS participant
    JOIN public.lease_occupancies AS occupancy
      ON occupancy.organization_id = participant.organization_id
      AND occupancy.id = participant.lease_occupancy_id
    WHERE occupancy.organization_id = p_organization_id
      AND occupancy.lease_id = p_lease_id
      AND occupancy.archived_at IS NULL
      AND (
        participant.evidence_state <> 'accepted'
        OR participant.business_lifecycle <> v_expected_party_lifecycle
      )
  ) THEN
    RAISE EXCEPTION
      'End or cancel every accepted Lease relationship before archiving this Lease'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.guard_lease_history_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_checked_archive boolean :=
    current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.lease_archive_context', true),
      ''
    ) = 'checked-lease-archive-v1';
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

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lease history cannot be deleted'
      USING
        ERRCODE = '42501',
        DETAIL = 'lease_history_delete_forbidden';
  END IF;

  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION
      'Lease restore requires relationship, occupancy, and dependency review'
      USING
        ERRCODE = '0A000',
        DETAIL = 'lease_restore_transition_required';
  END IF;

  IF OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NOT NULL
    AND (
      NEW.archived_at IS DISTINCT FROM OLD.archived_at
      OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
    ) THEN
    RAISE EXCEPTION
      'Lease archive metadata is immutable after the first archive'
      USING
        ERRCODE = '55000',
        DETAIL = 'lease_archive_metadata_immutable';
  END IF;

  IF NEW.primary_tenant_person_id
    IS DISTINCT FROM OLD.primary_tenant_person_id THEN
    RAISE EXCEPTION
      'Changing the primary Tenant requires a relationship transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  IF NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN
    RAISE EXCEPTION
      'Changing Lease property or Unit requires an occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'Changing Lease lifecycle status requires an occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    IF NOT v_checked_archive THEN
      RAISE EXCEPTION 'Lease archive requires the checked archive operation'
        USING
          ERRCODE = '42501',
          DETAIL = 'lease_archive_checked_operation_required';
    END IF;

    PERFORM app_private.assert_lease_archive_relationships_ready(
      OLD.organization_id,
      OLD.id,
      OLD.status,
      OLD.primary_tenant_person_id,
      OLD.property_id,
      OLD.unit_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $migration$
DECLARE
  routine_oid regprocedure;
  definition text;
BEGIN
  routine_oid :=
    'app_private.settle_income_item_internal(uuid,uuid,numeric,date,uuid,text,text)'::regprocedure;
  definition := replace(pg_get_functiondef(routine_oid), E'\r\n', E'\n');
  definition := replace(
    definition,
    E'  v_settlement_basis := app_private.finance_income_settlement_basis(\n'
      || E'    p_organization_id,\n'
      || E'    v_target.id\n'
      || E'  );',
    E'  v_settlement_basis := ''issued_invoice'';'
  );
  definition := replace(
    definition,
    E'    ''settlement_basis'', v_settlement_basis,\n'
      || E'    ''publication_source_class'', ''legacy_cash_non_publishable''\n',
    E'    ''settlement_basis'', v_settlement_basis\n'
  );
  definition := replace(
    definition,
    E'    settlement_basis,\n    publication_source_class,\n',
    E'    settlement_basis,\n'
  );
  definition := replace(
    definition,
    E'    v_settlement_basis,\n    ''legacy_cash_non_publishable'',\n',
    E'    v_settlement_basis,\n'
  );

  IF definition ILIKE '%finance_income_settlement_basis%'
    OR definition ILIKE '%publication_source_class%'
    OR definition ILIKE '%legacy_cash_non_publishable%' THEN
    RAISE EXCEPTION 'Could not remove income settlement compatibility state';
  END IF;
  EXECUTE definition;

  FOREACH routine_oid IN ARRAY ARRAY[
    'app_private.refresh_finance_income_state(uuid,uuid)'::regprocedure,
    'app_private.refresh_finance_expense_state(uuid,uuid)'::regprocedure
  ]
  LOOP
    definition := pg_get_functiondef(routine_oid);
    definition := replace(definition, 'v_compatibility_', 'v_settled_');
    definition := replace(definition, 'compatibility_', 'settled_');
    EXECUTE definition;
  END LOOP;

  FOREACH routine_oid IN ARRAY ARRAY[
    'app_private.create_lease_with_relationships_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure,
    'public.commit_generic_import_run(uuid,uuid)'::regprocedure,
    'public.commit_unit_import_run(uuid,uuid)'::regprocedure
  ]
  LOOP
    definition := pg_get_functiondef(routine_oid);
    definition := replace(
      definition,
      'Unexpected legacy Lease creation idempotency result',
      'Unexpected Lease creation idempotency result'
    );
    definition := replace(
      definition,
      'Legacy staged import must be re-uploaded before commit',
      'Incomplete staged import must be re-uploaded before commit'
    );
    definition := replace(
      definition,
      'legacy_import_staging_not_atomic',
      'import_staging_not_atomic'
    );
    EXECUTE definition;
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION app_private.guard_finance_income_creation_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app_private.has_finance_settlement_context()
    AND (
      coalesce(NEW.amount_received, 0) <> 0
      OR NEW.received_date IS NOT NULL
      OR NEW.ledger_entry_id IS NOT NULL
      OR NEW.status IS DISTINCT FROM 'open'
      OR NEW.archived_at IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'Income obligations must start unsettled'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER guard_finance_income_provenance
  ON public.finance_income_items;
DROP FUNCTION app_private.guard_finance_income_provenance();
DROP FUNCTION app_private.finance_income_settlement_basis(uuid, uuid);
DROP TABLE app_private.finance_income_settlement_policies;

ALTER TABLE public.finance_income_items
  DROP COLUMN settlement_creation_provenance,
  DROP COLUMN settlement_creation_version,
  DROP COLUMN settlement_creation_hash,
  DROP COLUMN remaining_balance_disposition,
  DROP COLUMN remaining_balance_disposition_version,
  DROP COLUMN remaining_balance_disposition_hash;

ALTER TABLE public.finance_receipt_allocations
  DROP COLUMN publication_source_class;
