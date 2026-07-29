-- Track B / TB-01: stop compatibility paths from rewriting Lease history.
-- This migration intentionally adds guards only. It does not classify or
-- rewrite any existing party, occupancy, term, deposit, or financial fact.

REVOKE ALL ON TABLE public.lease_parties
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.lease_occupancies
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.lease_parties
TO authenticated, service_role;
GRANT SELECT ON TABLE public.lease_occupancies
TO authenticated, service_role;

REVOKE DELETE, TRUNCATE ON TABLE public.leases
FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins can manage lease parties"
ON public.lease_parties;
DROP POLICY IF EXISTS "Admins can manage lease occupancies"
ON public.lease_occupancies;

CREATE POLICY "Admins can view lease parties"
ON public.lease_parties
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can view lease occupancies"
ON public.lease_occupancies
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

REVOKE ALL ON FUNCTION public.create_lease(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  numeric,
  public.currency_code,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_lease(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  numeric,
  public.currency_code,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app_private.mark_unit_occupied_for_lease(
  uuid,
  uuid,
  uuid,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_lease_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
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

  IF TG_OP = 'INSERT'
    AND current_user IN ('postgres', 'supabase_admin')
    AND coalesce(
      current_setting('app.lease_history_write_context', true),
      ''
    ) = 'checked-lease-create-v1' THEN
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

DROP TRIGGER IF EXISTS guard_lease_party_history_mutation
ON public.lease_parties;
CREATE TRIGGER guard_lease_party_history_mutation
BEFORE INSERT OR UPDATE OR DELETE
ON public.lease_parties
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_lease_history_mutation();

DROP TRIGGER IF EXISTS guard_lease_occupancy_history_mutation
ON public.lease_occupancies;
CREATE TRIGGER guard_lease_occupancy_history_mutation
BEFORE INSERT OR UPDATE OR DELETE
ON public.lease_occupancies
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_lease_history_mutation();

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

  IF NEW.primary_tenant_person_id IS NULL THEN
    RAISE EXCEPTION 'An exact primary Tenant is required'
      USING ERRCODE = '23503';
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

  SELECT people.display_name
  INTO v_tenant_display_name
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
  LIMIT 1;

  IF v_tenant_display_name IS NULL THEN
    RAISE EXCEPTION
      'An active Tenant role is required for the exact primary Tenant'
      USING ERRCODE = '23503';
  END IF;

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
  FOR KEY SHARE OF person;

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

CREATE OR REPLACE FUNCTION app_private.guard_lease_history_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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
    RAISE EXCEPTION
      'Lease history cannot be deleted'
      USING
        ERRCODE = '42501',
        DETAIL = 'lease_history_delete_forbidden';
  END IF;

  IF OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION
      'Lease restore requires checked relationship, occupancy, and dependency review'
      USING
        ERRCODE = '0A000',
        DETAIL = 'lease_restore_transition_required';
  END IF;

  IF NEW.primary_tenant_person_id
    IS DISTINCT FROM OLD.primary_tenant_person_id THEN
    RAISE EXCEPTION
      'Changing the primary Tenant requires a checked relationship transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  IF NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN
    RAISE EXCEPTION
      'Changing Lease property or Unit requires a checked occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'Changing Lease lifecycle status requires a checked occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF OLD.archived_at IS NULL
    AND NEW.archived_at IS NOT NULL THEN
    IF OLD.status IN ('active', 'draft', 'notice_given')
      OR EXISTS (
        SELECT 1
        FROM public.lease_occupancies AS occupancies
        WHERE occupancies.organization_id = OLD.organization_id
          AND occupancies.lease_id = OLD.id
          AND occupancies.archived_at IS NULL
          AND occupancies.actual_move_out_date IS NULL
          AND occupancies.status IN (
            'reserved',
            'occupied',
            'notice_given'
          )
      ) THEN
      RAISE EXCEPTION
        'End or cancel the open occupancy through a checked transition before archiving this Lease'
        USING
          ERRCODE = '55000',
          DETAIL = 'occupancy_transition_required';
    END IF;

    IF OLD.status <> 'cancelled'
      AND EXISTS (
        SELECT 1
        FROM public.lease_parties AS parties
        WHERE parties.organization_id = OLD.organization_id
          AND parties.lease_id = OLD.id
          AND parties.archived_at IS NULL
          AND parties.ended_on IS NULL
      ) THEN
      RAISE EXCEPTION
        'End or cancel the open Lease roles through a checked transition before archiving this Lease'
        USING
          ERRCODE = '55000',
          DETAIL = 'relationship_transition_required';
    END IF;

    IF NOT v_checked_archive THEN
      RAISE EXCEPTION
        'Lease archive requires the checked archive operation'
        USING
          ERRCODE = '42501',
          DETAIL = 'lease_archive_checked_operation_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_lease_history_transition()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_lease_history_transition
ON public.leases;
CREATE TRIGGER guard_lease_history_transition
BEFORE UPDATE OR DELETE
ON public.leases
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_lease_history_transition();

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

  IF EXISTS (
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
      AND parties.ended_on IS NULL
      AND leases.archived_at IS NULL
      AND leases.status IN ('active', 'draft', 'notice_given')
  ) THEN
    RAISE EXCEPTION
      'End or cancel the open Lease role through a checked relationship transition before archiving this Person'
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

REVOKE ALL ON FUNCTION app_private.guard_person_lease_archive()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_person_lease_archive
ON public.people;
CREATE TRIGGER guard_person_lease_archive
BEFORE UPDATE OF archived_at
ON public.people
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_person_lease_archive();

CREATE OR REPLACE FUNCTION public.sync_lease_backbone_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_deposit_id uuid;
  v_history_context text :=
    current_setting('app.lease_history_write_context', true);
  v_occupancy public.lease_occupancies%ROWTYPE;
  v_occupancy_status text;
  v_party public.lease_parties%ROWTYPE;
  v_term_status text;
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

  v_term_status := CASE
    WHEN NEW.status IN ('active', 'notice_given') THEN 'active'
    WHEN NEW.status = 'draft' THEN 'draft'
    WHEN NEW.status IN ('ended', 'cancelled') THEN 'expired'
    ELSE 'terminated'
  END;
  v_occupancy_status := CASE
    WHEN NEW.status = 'notice_given' THEN 'notice_given'
    WHEN NEW.status IN ('ended', 'terminated') THEN 'vacated'
    WHEN NEW.status = 'cancelled' THEN 'cancelled'
    WHEN NEW.status = 'draft' THEN 'reserved'
    ELSE 'occupied'
  END;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(current_setting('role', true), 'none')
      NOT IN ('none', 'postgres', 'supabase_admin')
      AND coalesce(
        current_setting('app.lease_creation_context', true),
        ''
      ) <> 'checked-v1' THEN
      RAISE EXCEPTION
        'Lease creation requires the checked authoritative-term workflow'
        USING ERRCODE = '42501';
    END IF;

    PERFORM set_config(
      'app.lease_history_write_context',
      'checked-lease-create-v1',
      true
    );

    INSERT INTO public.lease_parties (
      organization_id,
      lease_id,
      person_id,
      party_role,
      is_primary,
      started_on,
      ended_on,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.primary_tenant_person_id,
      'primary_tenant',
      true,
      NULL,
      NULL,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    )
    RETURNING * INTO v_party;

    INSERT INTO public.lease_occupancies (
      organization_id,
      lease_id,
      property_id,
      unit_id,
      status,
      scheduled_move_in_date,
      actual_move_in_date,
      notice_date,
      scheduled_move_out_date,
      actual_move_out_date,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.property_id,
      NEW.unit_id,
      v_occupancy_status,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    )
    RETURNING * INTO v_occupancy;

    PERFORM set_config(
      'app.lease_history_write_context',
      coalesce(v_history_context, 'off'),
      true
    );

    INSERT INTO public.lease_terms (
      organization_id,
      lease_id,
      term_sequence,
      start_date,
      end_date,
      rent_amount,
      rent_currency,
      rent_due_day,
      payment_frequency,
      status,
      authority_kind,
      created_by,
      updated_by,
      archived_at,
      archived_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      1,
      NEW.lease_start_date,
      NEW.lease_end_date,
      NEW.monthly_rent_amount,
      NEW.monthly_rent_currency,
      NULL,
      'monthly',
      v_term_status,
      'legacy_inferred',
      (SELECT auth.uid()),
      (SELECT auth.uid()),
      NEW.archived_at,
      NEW.archived_by
    )
    ON CONFLICT ON CONSTRAINT lease_terms_sequence_unique
    DO NOTHING;
  ELSE
    SELECT parties.*
    INTO v_party
    FROM public.lease_parties AS parties
    WHERE parties.organization_id = NEW.organization_id
      AND parties.lease_id = NEW.id
      AND parties.party_role = 'primary_tenant'
      AND parties.archived_at IS NULL
    ORDER BY
      CASE
        WHEN parties.person_id = NEW.primary_tenant_person_id THEN 0
        ELSE 1
      END,
      parties.created_at,
      parties.id
    LIMIT 1;

    SELECT occupancies.*
    INTO v_occupancy
    FROM public.lease_occupancies AS occupancies
    WHERE occupancies.organization_id = NEW.organization_id
      AND occupancies.lease_id = NEW.id
      AND occupancies.archived_at IS NULL
    ORDER BY
      CASE
        WHEN occupancies.property_id = NEW.property_id
          AND occupancies.unit_id IS NOT DISTINCT FROM NEW.unit_id
          THEN 0
        ELSE 1
      END,
      occupancies.created_at,
      occupancies.id
    LIMIT 1;
  END IF;

  SELECT deposits.id
  INTO v_existing_deposit_id
  FROM public.lease_deposits AS deposits
  WHERE deposits.organization_id = NEW.organization_id
    AND deposits.lease_id = NEW.id
    AND deposits.deposit_type = 'security'
    AND deposits.archived_at IS NULL
  ORDER BY deposits.created_at, deposits.id
  LIMIT 1;

  IF NEW.deposit_amount IS NULL THEN
    IF v_existing_deposit_id IS NOT NULL THEN
      UPDATE public.lease_deposits
      SET
        archived_at = now(),
        archived_by = (SELECT auth.uid()),
        updated_by = (SELECT auth.uid())
      WHERE id = v_existing_deposit_id
        AND organization_id = NEW.organization_id;
    END IF;
  ELSIF v_existing_deposit_id IS NULL THEN
    INSERT INTO public.lease_deposits (
      organization_id,
      lease_id,
      deposit_type,
      amount,
      currency,
      status,
      received_on,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      'security',
      NEW.deposit_amount,
      coalesce(NEW.deposit_currency, NEW.monthly_rent_currency),
      'held',
      NEW.lease_start_date,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_deposits
    SET
      amount = NEW.deposit_amount,
      currency = coalesce(
        NEW.deposit_currency,
        NEW.monthly_rent_currency
      ),
      received_on = coalesce(received_on, NEW.lease_start_date),
      updated_by = (SELECT auth.uid())
    WHERE id = v_existing_deposit_id
      AND organization_id = NEW.organization_id;
  END IF;

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
    NEW.organization_id,
    (SELECT auth.uid()),
    'lease',
    NEW.id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'lease_created'
      ELSE 'lease_updated'
    END,
    CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'tenant_name', OLD.tenant_name,
        'primary_tenant_person_id', OLD.primary_tenant_person_id,
        'property_id', OLD.property_id,
        'unit_id', OLD.unit_id,
        'lease_start_date', OLD.lease_start_date,
        'lease_end_date', OLD.lease_end_date,
        'monthly_rent_amount', OLD.monthly_rent_amount,
        'monthly_rent_currency', OLD.monthly_rent_currency,
        'deposit_amount', OLD.deposit_amount,
        'deposit_currency', OLD.deposit_currency,
        'status', OLD.status,
        'archived_at', OLD.archived_at,
        'lease_party_id', v_party.id,
        'party_started_on', v_party.started_on,
        'party_ended_on', v_party.ended_on,
        'lease_occupancy_id', v_occupancy.id,
        'occupancy_scheduled_move_in_date',
          v_occupancy.scheduled_move_in_date,
        'occupancy_actual_move_in_date',
          v_occupancy.actual_move_in_date,
        'occupancy_scheduled_move_out_date',
          v_occupancy.scheduled_move_out_date,
        'occupancy_actual_move_out_date',
          v_occupancy.actual_move_out_date
      )
      ELSE NULL
    END,
    jsonb_build_object(
      'tenant_name', NEW.tenant_name,
      'primary_tenant_person_id', NEW.primary_tenant_person_id,
      'property_id', NEW.property_id,
      'unit_id', NEW.unit_id,
      'lease_start_date', NEW.lease_start_date,
      'lease_end_date', NEW.lease_end_date,
      'monthly_rent_amount', NEW.monthly_rent_amount,
      'monthly_rent_currency', NEW.monthly_rent_currency,
      'deposit_amount', NEW.deposit_amount,
      'deposit_currency', NEW.deposit_currency,
      'status', NEW.status,
      'archived_at', NEW.archived_at,
      'lease_party_id', v_party.id,
      'party_started_on', v_party.started_on,
      'party_ended_on', v_party.ended_on,
      'lease_occupancy_id', v_occupancy.id,
      'occupancy_scheduled_move_in_date',
        v_occupancy.scheduled_move_in_date,
      'occupancy_actual_move_in_date',
        v_occupancy.actual_move_in_date,
      'occupancy_scheduled_move_out_date',
        v_occupancy.scheduled_move_out_date,
      'occupancy_actual_move_out_date',
        v_occupancy.actual_move_out_date
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lease_backbone_records()
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.update_lease_with_authoritative_term(
  uuid,
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

ALTER FUNCTION app_private.update_lease_with_authoritative_term(
  uuid,
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
RENAME TO update_lease_with_authoritative_term_plan04;

REVOKE ALL ON FUNCTION
  app_private.update_lease_with_authoritative_term_plan04(
    uuid,
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

CREATE FUNCTION public.update_lease_with_authoritative_term(
  p_lease_id uuid,
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
  v_existing_lease public.leases%ROWTYPE;
  v_header_context text :=
    current_setting('app.lease_header_write_context', true);
  v_result uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT leases.*
  INTO v_existing_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF v_existing_lease.primary_tenant_person_id
    IS DISTINCT FROM p_primary_tenant_person_id THEN
    RAISE EXCEPTION
      'Changing the primary Tenant requires a checked relationship transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  IF v_existing_lease.property_id IS DISTINCT FROM p_property_id
    OR v_existing_lease.unit_id IS DISTINCT FROM p_unit_id THEN
    RAISE EXCEPTION
      'Changing Lease property or Unit requires a checked occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF v_existing_lease.status IS DISTINCT FROM lower(trim(p_lease_status)) THEN
    RAISE EXCEPTION
      'Changing Lease lifecycle status requires a checked occupancy transition'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  PERFORM set_config(
    'app.lease_header_write_context',
    'checked-lease-update-v1',
    true
  );

  v_result :=
    app_private.update_lease_with_authoritative_term_plan04(
      p_lease_id,
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

  PERFORM set_config(
    'app.lease_header_write_context',
    coalesce(v_header_context, 'off'),
    true
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_lease_with_authoritative_term(
  uuid,
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

GRANT EXECUTE ON FUNCTION public.update_lease_with_authoritative_term(
  uuid,
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

  IF EXISTS (
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
      AND parties.ended_on IS NULL
      AND leases.archived_at IS NULL
      AND leases.status IN ('active', 'draft', 'notice_given')
  ) THEN
    RAISE EXCEPTION
      'End or cancel the open Lease role through a checked relationship transition before archiving this Person'
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

CREATE OR REPLACE FUNCTION public.archive_lease(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_archive_context text :=
    current_setting('app.lease_archive_context', true);
  v_lease public.leases%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT leases.*
  INTO v_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF v_lease.status IN ('active', 'draft', 'notice_given')
    OR EXISTS (
      SELECT 1
      FROM public.lease_occupancies AS occupancies
      WHERE occupancies.organization_id = p_organization_id
        AND occupancies.lease_id = p_lease_id
        AND occupancies.archived_at IS NULL
        AND occupancies.actual_move_out_date IS NULL
        AND occupancies.status IN (
          'reserved',
          'occupied',
          'notice_given'
        )
    ) THEN
    RAISE EXCEPTION
      'End or cancel the open occupancy through a checked transition before archiving this Lease'
      USING
        ERRCODE = '55000',
        DETAIL = 'occupancy_transition_required';
  END IF;

  IF v_lease.status <> 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.lease_parties AS parties
      WHERE parties.organization_id = p_organization_id
        AND parties.lease_id = p_lease_id
        AND parties.archived_at IS NULL
        AND parties.ended_on IS NULL
    ) THEN
    RAISE EXCEPTION
      'End or cancel the open Lease roles through a checked transition before archiving this Lease'
      USING
        ERRCODE = '55000',
        DETAIL = 'relationship_transition_required';
  END IF;

  PERFORM set_config(
    'app.lease_archive_context',
    'checked-lease-archive-v1',
    true
  );

  UPDATE public.leases
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_lease_id
    AND organization_id = p_organization_id;

  PERFORM set_config(
    'app.lease_archive_context',
    coalesce(v_archive_context, 'off'),
    true
  );

  RETURN p_lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_lease(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archived Lease not found' USING ERRCODE = '23503';
  END IF;

  RAISE EXCEPTION
    'Lease restore requires checked relationship, occupancy, and dependency review'
    USING
      ERRCODE = '0A000',
      DETAIL = 'lease_restore_transition_required';
END;
$$;

REVOKE ALL ON FUNCTION public.archive_person(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.archive_lease(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.restore_lease(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.archive_person(uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_lease(uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_lease(uuid, uuid)
TO authenticated;
