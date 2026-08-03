CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE public.lease_terms
  ADD COLUMN authority_kind text NOT NULL DEFAULT 'legacy_inferred',
  ADD COLUMN supersedes_term_id uuid,
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN effective_range daterange
    GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
  ADD CONSTRAINT lease_terms_authority_kind_check
    CHECK (authority_kind IN ('legacy_inferred', 'authoritative'));

ALTER TABLE public.lease_terms
  ADD CONSTRAINT lease_terms_identity_unique
    UNIQUE (organization_id, lease_id, id);

ALTER TABLE public.lease_terms
  ADD CONSTRAINT lease_terms_supersedes_term_fk
    FOREIGN KEY (organization_id, lease_id, supersedes_term_id)
    REFERENCES public.lease_terms(organization_id, lease_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT lease_terms_authoritative_confirmation_check
    CHECK (
      authority_kind = 'legacy_inferred'
      OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
    );

DROP INDEX IF EXISTS public.lease_terms_one_active_term_idx;

ALTER TABLE public.lease_terms
  ADD CONSTRAINT lease_terms_authoritative_effective_range_excl
  EXCLUDE USING gist (
    organization_id WITH =,
    lease_id WITH =,
    effective_range WITH &&
  )
  WHERE (
    archived_at IS NULL
    AND authority_kind = 'authoritative'
    AND status IN ('upcoming', 'active')
  );

CREATE INDEX lease_terms_authority_resolution_idx
  ON public.lease_terms (
    organization_id,
    lease_id,
    authority_kind,
    status,
    start_date,
    end_date
  )
  WHERE archived_at IS NULL;

CREATE TABLE public.rent_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  effective_from date NOT NULL,
  supported_frequencies text[],
  rent_calculation_timezone text,
  due_day_source text,
  policy_default_due_day integer,
  short_month_due_day_rule text,
  lease_start_proration_rule text,
  lease_end_proration_rule text,
  notice_period_charging_rule text,
  mid_period_rent_change_rule text,
  concessions_support_state text,
  rent_free_support_state text,
  waivers_support_state text,
  lifecycle text NOT NULL DEFAULT 'draft',
  supersedes_policy_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  superseded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  retired_at timestamptz,
  retired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT rent_policy_versions_org_version_unique
    UNIQUE (organization_id, version_number),
  CONSTRAINT rent_policy_versions_org_identity_unique
    UNIQUE (organization_id, id),
  CONSTRAINT rent_policy_versions_version_positive
    CHECK (version_number > 0),
  CONSTRAINT rent_policy_versions_lifecycle_check
    CHECK (lifecycle IN ('draft', 'approved', 'superseded', 'retired')),
  CONSTRAINT rent_policy_versions_frequency_check
    CHECK (
      supported_frequencies IS NULL
      OR (
        cardinality(supported_frequencies) > 0
        AND supported_frequencies <@ ARRAY[
          'monthly',
          'quarterly',
          'semi_annual',
          'annual',
          'one_time'
        ]::text[]
      )
    ),
  CONSTRAINT rent_policy_versions_due_day_source_check
    CHECK (due_day_source IS NULL OR due_day_source IN ('term', 'policy_default')),
  CONSTRAINT rent_policy_versions_default_due_day_check
    CHECK (
      policy_default_due_day IS NULL
      OR policy_default_due_day BETWEEN 1 AND 31
    ),
  CONSTRAINT rent_policy_versions_short_month_check
    CHECK (
      short_month_due_day_rule IS NULL
      OR short_month_due_day_rule IN ('last_calendar_day', 'next_calendar_month')
    ),
  CONSTRAINT rent_policy_versions_start_proration_check
    CHECK (
      lease_start_proration_rule IS NULL
      OR lease_start_proration_rule IN ('actual_days', 'thirty_day', 'no_proration')
    ),
  CONSTRAINT rent_policy_versions_end_proration_check
    CHECK (
      lease_end_proration_rule IS NULL
      OR lease_end_proration_rule IN (
        'actual_days',
        'thirty_day',
        'no_proration',
        'through_move_out'
      )
    ),
  CONSTRAINT rent_policy_versions_notice_check
    CHECK (
      notice_period_charging_rule IS NULL
      OR notice_period_charging_rule IN (
        'through_lease_end',
        'through_move_out',
        'stop_on_notice'
      )
    ),
  CONSTRAINT rent_policy_versions_mid_period_check
    CHECK (
      mid_period_rent_change_rule IS NULL
      OR mid_period_rent_change_rule IN (
        'prorate_actual_days',
        'prorate_thirty_day',
        'next_full_period'
      )
    ),
  CONSTRAINT rent_policy_versions_concession_check
    CHECK (
      concessions_support_state IS NULL
      OR concessions_support_state IN ('supported', 'unsupported')
    ),
  CONSTRAINT rent_policy_versions_rent_free_check
    CHECK (
      rent_free_support_state IS NULL
      OR rent_free_support_state IN ('supported', 'unsupported')
    ),
  CONSTRAINT rent_policy_versions_waiver_check
    CHECK (
      waivers_support_state IS NULL
      OR waivers_support_state IN ('supported', 'unsupported')
    ),
  CONSTRAINT rent_policy_versions_approval_check
    CHECK (
      lifecycle <> 'approved'
      OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
    ),
  CONSTRAINT rent_policy_versions_supersedes_fk
    FOREIGN KEY (organization_id, supersedes_policy_id)
    REFERENCES public.rent_policy_versions(organization_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX rent_policy_versions_one_approved_effective_idx
  ON public.rent_policy_versions (organization_id, effective_from)
  WHERE lifecycle = 'approved';

CREATE INDEX rent_policy_versions_resolution_idx
  ON public.rent_policy_versions (
    organization_id,
    lifecycle,
    effective_from DESC,
    version_number DESC
  );

ALTER TABLE public.rent_policy_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read rent policy versions"
ON public.rent_policy_versions
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

REVOKE ALL ON TABLE public.rent_policy_versions
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.rent_policy_versions
TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.lease_terms
FROM authenticated, service_role;

DROP POLICY IF EXISTS "Admins can manage lease terms"
ON public.lease_terms;

CREATE POLICY "Organization members can read lease terms"
ON public.lease_terms
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

CREATE OR REPLACE FUNCTION app_private.guard_approved_rent_policy_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rent policy versions cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.lifecycle IN ('approved', 'superseded', 'retired')
    AND (
      NEW.organization_id,
      NEW.version_number,
      NEW.effective_from,
      NEW.supported_frequencies,
      NEW.rent_calculation_timezone,
      NEW.due_day_source,
      NEW.policy_default_due_day,
      NEW.short_month_due_day_rule,
      NEW.lease_start_proration_rule,
      NEW.lease_end_proration_rule,
      NEW.notice_period_charging_rule,
      NEW.mid_period_rent_change_rule,
      NEW.concessions_support_state,
      NEW.rent_free_support_state,
      NEW.waivers_support_state,
      NEW.created_at,
      NEW.created_by
    ) IS DISTINCT FROM (
      OLD.organization_id,
      OLD.version_number,
      OLD.effective_from,
      OLD.supported_frequencies,
      OLD.rent_calculation_timezone,
      OLD.due_day_source,
      OLD.policy_default_due_day,
      OLD.short_month_due_day_rule,
      OLD.lease_start_proration_rule,
      OLD.lease_end_proration_rule,
      OLD.notice_period_charging_rule,
      OLD.mid_period_rent_change_rule,
      OLD.concessions_support_state,
      OLD.rent_free_support_state,
      OLD.waivers_support_state,
      OLD.created_at,
      OLD.created_by
    ) THEN
    RAISE EXCEPTION 'Approved rent policy versions are immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_approved_rent_policy_immutability
BEFORE UPDATE OR DELETE ON public.rent_policy_versions
FOR EACH ROW EXECUTE FUNCTION
  app_private.guard_approved_rent_policy_immutability();

REVOKE ALL ON FUNCTION
  app_private.guard_approved_rent_policy_immutability()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_authoritative_lease_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'postgres'
    AND current_setting('app.lease_term_projection_context', true) = 'checked-v1' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.lease_start_date,
    NEW.lease_end_date,
    NEW.monthly_rent_amount,
    NEW.monthly_rent_currency
  ) IS DISTINCT FROM (
    OLD.lease_start_date,
    OLD.lease_end_date,
    OLD.monthly_rent_amount,
    OLD.monthly_rent_currency
  ) AND EXISTS (
    SELECT 1
    FROM public.lease_terms AS terms
    WHERE terms.organization_id = OLD.organization_id
      AND terms.lease_id = OLD.id
      AND terms.authority_kind = 'authoritative'
      AND terms.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Authoritative lease economics must be changed through the term workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_authoritative_lease_projection
BEFORE UPDATE OF
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency
ON public.leases
FOR EACH ROW EXECUTE FUNCTION
  app_private.guard_authoritative_lease_projection();

REVOKE ALL ON FUNCTION
  app_private.guard_authoritative_lease_projection()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_checked_lease_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin')
    OR (
      session_user NOT IN ('postgres', 'supabase_admin')
      AND coalesce(
        current_setting('app.lease_creation_context', true),
        ''
      ) <> 'checked-v1'
    ) THEN
    RAISE EXCEPTION
      'Lease creation requires the checked authoritative-term workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_checked_lease_creation
BEFORE INSERT ON public.leases
FOR EACH ROW EXECUTE FUNCTION app_private.guard_checked_lease_creation();

REVOKE ALL ON FUNCTION app_private.guard_checked_lease_creation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.lock_open_lease_term_periods(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_start_date date,
  p_end_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period_start date;
BEGIN
  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Valid lease-term dates are required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_period_start IN
    SELECT months.period_start::date
    FROM pg_catalog.generate_series(
      pg_catalog.date_trunc('month', p_start_date),
      pg_catalog.date_trunc('month', p_end_date),
      interval '1 month'
    ) AS months(period_start)
    ORDER BY months.period_start
  LOOP
    PERFORM app_private.lock_open_property_reporting_period(
      p_organization_id,
      p_property_id,
      p_currency,
      v_period_start
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.lock_open_lease_term_periods(
    uuid,
    uuid,
    public.currency_code,
    date,
    date
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_lease_backbone_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  existing_deposit_id uuid;
  existing_occupancy_id uuid;
  existing_party_id uuid;
  lease_party_ended_on date;
  occupancy_actual_move_out date;
  occupancy_notice_date date;
  occupancy_status text;
  term_status text;
BEGIN
  IF current_setting('app.people_leases_skip_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  lease_party_ended_on := CASE
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN NEW.lease_end_date
    ELSE NULL
  END;
  term_status := CASE
    WHEN NEW.status IN ('active', 'notice_given') THEN 'active'
    WHEN NEW.status = 'draft' THEN 'draft'
    WHEN NEW.status IN ('ended', 'cancelled') THEN 'expired'
    ELSE 'terminated'
  END;
  occupancy_status := CASE
    WHEN NEW.status = 'notice_given' THEN 'notice_given'
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN 'vacated'
    WHEN NEW.status = 'draft' THEN 'reserved'
    ELSE 'occupied'
  END;
  occupancy_notice_date := CASE
    WHEN NEW.status = 'notice_given' THEN least(current_date, NEW.lease_end_date)
    ELSE NULL
  END;
  occupancy_actual_move_out := CASE
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN NEW.lease_end_date
    ELSE NULL
  END;

  SELECT id
  INTO existing_party_id
  FROM public.lease_parties
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND party_role = 'primary_tenant'
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF existing_party_id IS NULL THEN
    INSERT INTO public.lease_parties (
      organization_id, lease_id, person_id, party_role, is_primary,
      started_on, ended_on, created_by, updated_by
    )
    VALUES (
      NEW.organization_id, NEW.id, NEW.primary_tenant_person_id,
      'primary_tenant', true, NEW.lease_start_date, lease_party_ended_on,
      (SELECT auth.uid()), (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_parties
    SET
      person_id = NEW.primary_tenant_person_id,
      is_primary = true,
      started_on = NEW.lease_start_date,
      ended_on = lease_party_ended_on,
      updated_by = (SELECT auth.uid())
    WHERE id = existing_party_id
      AND organization_id = NEW.organization_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lease_terms (
      organization_id, lease_id, term_sequence, start_date, end_date,
      rent_amount, rent_currency, rent_due_day, payment_frequency, status,
      authority_kind, created_by, updated_by, archived_at, archived_by
    )
    VALUES (
      NEW.organization_id, NEW.id, 1, NEW.lease_start_date, NEW.lease_end_date,
      NEW.monthly_rent_amount, NEW.monthly_rent_currency, NULL, 'monthly',
      term_status, 'legacy_inferred', (SELECT auth.uid()), (SELECT auth.uid()),
      NEW.archived_at, NEW.archived_by
    )
    ON CONFLICT ON CONSTRAINT lease_terms_sequence_unique
    DO NOTHING;
  END IF;

  SELECT id
  INTO existing_occupancy_id
  FROM public.lease_occupancies
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF existing_occupancy_id IS NULL THEN
    INSERT INTO public.lease_occupancies (
      organization_id, lease_id, property_id, unit_id, status,
      scheduled_move_in_date, actual_move_in_date, notice_date,
      scheduled_move_out_date, actual_move_out_date, created_by, updated_by
    )
    VALUES (
      NEW.organization_id, NEW.id, NEW.property_id, NEW.unit_id,
      occupancy_status, NEW.lease_start_date, NEW.lease_start_date,
      occupancy_notice_date, NEW.lease_end_date, occupancy_actual_move_out,
      (SELECT auth.uid()), (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_occupancies
    SET
      property_id = NEW.property_id,
      unit_id = NEW.unit_id,
      status = occupancy_status,
      scheduled_move_in_date = NEW.lease_start_date,
      actual_move_in_date = NEW.lease_start_date,
      notice_date = occupancy_notice_date,
      scheduled_move_out_date = NEW.lease_end_date,
      actual_move_out_date = occupancy_actual_move_out,
      updated_by = (SELECT auth.uid())
    WHERE id = existing_occupancy_id
      AND organization_id = NEW.organization_id;
  END IF;

  SELECT id
  INTO existing_deposit_id
  FROM public.lease_deposits
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND deposit_type = 'security'
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF NEW.deposit_amount IS NULL THEN
    IF existing_deposit_id IS NOT NULL THEN
      UPDATE public.lease_deposits
      SET
        archived_at = now(),
        archived_by = (SELECT auth.uid()),
        updated_by = (SELECT auth.uid())
      WHERE id = existing_deposit_id
        AND organization_id = NEW.organization_id;
    END IF;
  ELSIF existing_deposit_id IS NULL THEN
    INSERT INTO public.lease_deposits (
      organization_id, lease_id, deposit_type, amount, currency, status,
      received_on, created_by, updated_by
    )
    VALUES (
      NEW.organization_id, NEW.id, 'security', NEW.deposit_amount,
      coalesce(NEW.deposit_currency, NEW.monthly_rent_currency), 'held',
      NEW.lease_start_date, (SELECT auth.uid()), (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_deposits
    SET
      amount = NEW.deposit_amount,
      currency = coalesce(NEW.deposit_currency, NEW.monthly_rent_currency),
      received_on = coalesce(received_on, NEW.lease_start_date),
      updated_by = (SELECT auth.uid())
    WHERE id = existing_deposit_id
      AND organization_id = NEW.organization_id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action,
    previous_values, new_values
  )
  VALUES (
    NEW.organization_id,
    (SELECT auth.uid()),
    'lease',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'lease_created' ELSE 'lease_updated' END,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
      'tenant_name', OLD.tenant_name,
      'property_id', OLD.property_id,
      'unit_id', OLD.unit_id,
      'lease_start_date', OLD.lease_start_date,
      'lease_end_date', OLD.lease_end_date,
      'monthly_rent_amount', OLD.monthly_rent_amount,
      'monthly_rent_currency', OLD.monthly_rent_currency,
      'deposit_amount', OLD.deposit_amount,
      'deposit_currency', OLD.deposit_currency,
      'status', OLD.status
    ) ELSE NULL END,
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
      'status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS TABLE (
  resolution_status text,
  blocker_code text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  term_id uuid,
  term_sequence integer,
  effective_range daterange,
  start_date date,
  end_date date,
  rent_amount numeric,
  rent_currency public.currency_code,
  rent_due_day integer,
  payment_frequency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT leases.*
  INTO v_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'blocked', 'scope_mismatch', p_organization_id, NULL::uuid, NULL::uuid,
      p_lease_id, NULL::uuid, NULL::integer, NULL::daterange, NULL::date,
      NULL::date, NULL::numeric, NULL::public.currency_code, NULL::integer,
      NULL::text;
    RETURN;
  END IF;

  IF v_lease.status IN ('ended', 'terminated', 'cancelled') THEN
    RETURN QUERY SELECT
      'blocked', 'inactive_lease', v_lease.organization_id,
      v_lease.property_id, v_lease.unit_id, v_lease.id, NULL::uuid,
      NULL::integer, NULL::daterange, NULL::date, NULL::date, NULL::numeric,
      NULL::public.currency_code, NULL::integer, NULL::text;
    RETURN;
  END IF;

  IF v_lease.unit_id IS NULL THEN
    RETURN QUERY SELECT
      'blocked', 'scope_mismatch', v_lease.organization_id,
      v_lease.property_id, v_lease.unit_id, v_lease.id, NULL::uuid,
      NULL::integer, NULL::daterange, NULL::date, NULL::date, NULL::numeric,
      NULL::public.currency_code, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'authoritative'
    AND terms.status IN ('active', 'upcoming')
    AND terms.archived_at IS NULL
    AND p_effective_date <@ terms.effective_range;

  IF v_count > 1 THEN
    RETURN QUERY SELECT
      'blocked', 'term_conflict', v_lease.organization_id,
      v_lease.property_id, v_lease.unit_id, v_lease.id, NULL::uuid,
      NULL::integer, NULL::daterange, NULL::date, NULL::date, NULL::numeric,
      NULL::public.currency_code, NULL::integer, NULL::text;
    RETURN;
  END IF;

  IF v_count = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.lease_terms AS terms
      WHERE terms.organization_id = p_organization_id
        AND terms.lease_id = p_lease_id
        AND terms.authority_kind = 'legacy_inferred'
        AND terms.archived_at IS NULL
        AND p_effective_date <@ terms.effective_range
    ) THEN
      RETURN QUERY SELECT
        'blocked', 'legacy_unconfirmed', v_lease.organization_id,
        v_lease.property_id, v_lease.unit_id, v_lease.id, NULL::uuid,
        NULL::integer, NULL::daterange, NULL::date, NULL::date, NULL::numeric,
        NULL::public.currency_code, NULL::integer, NULL::text;
    ELSE
      RETURN QUERY SELECT
        'blocked', 'no_authoritative_term', v_lease.organization_id,
        v_lease.property_id, v_lease.unit_id, v_lease.id, NULL::uuid,
        NULL::integer, NULL::daterange, NULL::date, NULL::date, NULL::numeric,
        NULL::public.currency_code, NULL::integer, NULL::text;
    END IF;
    RETURN;
  END IF;

  SELECT terms.*
  INTO v_term
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'authoritative'
    AND terms.status IN ('active', 'upcoming')
    AND terms.archived_at IS NULL
    AND p_effective_date <@ terms.effective_range;

  IF v_term.rent_currency IS DISTINCT FROM v_lease.monthly_rent_currency THEN
    RETURN QUERY SELECT
      'blocked', 'scope_mismatch', v_lease.organization_id,
      v_lease.property_id, v_lease.unit_id, v_lease.id, v_term.id,
      v_term.term_sequence, v_term.effective_range, v_term.start_date,
      v_term.end_date, v_term.rent_amount, v_term.rent_currency,
      v_term.rent_due_day, v_term.payment_frequency;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'resolved', NULL::text, v_lease.organization_id, v_lease.property_id,
    v_lease.unit_id, v_lease.id, v_term.id, v_term.term_sequence,
    v_term.effective_range, v_term.start_date, v_term.end_date,
    v_term.rent_amount, v_term.rent_currency, v_term.rent_due_day,
    v_term.payment_frequency;
END;
$$;

REVOKE ALL ON FUNCTION
  public.resolve_authoritative_lease_term(uuid, uuid, date)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.resolve_authoritative_lease_term(uuid, uuid, date)
TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_term_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_status text,
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

  PERFORM 1
  FROM public.lease_terms AS terms
  WHERE terms.id = p_term_id
    AND terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'authoritative'
    AND terms.status IN ('draft', 'upcoming')
    AND terms.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a draft or upcoming term can be corrected'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.create_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_start_date,
    p_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_status,
    p_term_id,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_legacy_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_legacy_term_id uuid,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_status text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_legacy public.lease_terms%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT terms.*
  INTO v_legacy
  FROM public.lease_terms AS terms
  WHERE terms.id = p_legacy_term_id
    AND terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'legacy_inferred'
    AND terms.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Legacy lease term was not found'
      USING ERRCODE = '23503';
  END IF;

  RETURN public.create_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    v_legacy.start_date,
    v_legacy.end_date,
    v_legacy.rent_amount,
    v_legacy.rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_status,
    p_legacy_term_id,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.terminate_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_term_id uuid,
  p_effective_date date,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_lease public.leases%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_replacement_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT terms.*
  INTO v_term
  FROM public.lease_terms AS terms
  WHERE terms.id = p_term_id
    AND terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.authority_kind = 'authoritative'
    AND terms.status IN ('active', 'upcoming')
    AND terms.archived_at IS NULL;

  IF NOT FOUND
    OR p_effective_date NOT BETWEEN v_term.start_date AND v_term.end_date THEN
    RAISE EXCEPTION 'Termination date must fall inside the authoritative term'
      USING ERRCODE = '22023';
  END IF;

  SELECT leases.*
  INTO v_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease was not found' USING ERRCODE = '23503';
  END IF;

  IF p_effective_date <= v_lease.lease_start_date THEN
    RAISE EXCEPTION
      'Termination date must be after the lease start date'
      USING ERRCODE = '22023';
  END IF;

  v_replacement_id := public.create_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_effective_date,
    p_effective_date,
    v_term.rent_amount,
    v_term.rent_currency,
    v_term.rent_due_day,
    v_term.payment_frequency,
    'terminated',
    p_term_id,
    p_idempotency_key
  );

  PERFORM set_config(
    'app.lease_term_projection_context',
    'checked-v1',
    true
  );

  UPDATE public.leases
  SET
    lease_end_date = p_effective_date,
    status = 'terminated',
    updated_by = v_actor_id
  WHERE id = p_lease_id
    AND organization_id = p_organization_id;

  PERFORM set_config(
    'app.lease_term_projection_context',
    'off',
    true
  );

  RETURN v_replacement_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.correct_authoritative_lease_term(
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
    text
  ),
  public.confirm_legacy_lease_term(
    uuid,
    uuid,
    uuid,
    integer,
    text,
    text,
    text
  ),
  public.terminate_authoritative_lease_term(uuid, uuid, uuid, date, text)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.correct_authoritative_lease_term(
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
    text
  ),
  public.confirm_legacy_lease_term(
    uuid,
    uuid,
    uuid,
    integer,
    text,
    text,
    text
  ),
  public.terminate_authoritative_lease_term(uuid, uuid, uuid, date, text)
TO authenticated;

ALTER FUNCTION public.generate_monthly_rent_income_items(uuid, date)
RENAME TO generate_monthly_rent_income_items_legacy_unchecked;

REVOKE ALL ON FUNCTION
  public.generate_monthly_rent_income_items_legacy_unchecked(uuid, date)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_monthly_rent_income_items(
  p_organization_id uuid,
  p_month date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.leases AS leases
    WHERE leases.organization_id = p_organization_id
      AND leases.archived_at IS NULL
      AND leases.status IN ('active', 'notice_given')
      AND leases.lease_start_date <=
        (
          date_trunc('month', coalesce(p_month, current_date))
          + interval '1 month - 1 day'
        )::date
      AND leases.lease_end_date >=
        date_trunc('month', coalesce(p_month, current_date))::date
  ) THEN
    RAISE EXCEPTION
      'Legacy rent generation is blocked until Plan 09 consumes authoritative term and policy identities'
      USING
        ERRCODE = '0A000',
        DETAIL = 'rent_generation_blocked_plan_09';
  END IF;

  RETURN public.generate_monthly_rent_income_items_legacy_unchecked(
    p_organization_id,
    p_month
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.generate_monthly_rent_income_items(uuid, date)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.generate_monthly_rent_income_items(uuid, date)
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
  v_actor_id uuid := (SELECT auth.uid());
  v_claim record;
  v_lease_id uuid;
  v_legacy_term_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.lock_open_lease_term_periods(
    p_organization_id,
    p_property_id,
    p_rent_currency,
    p_lease_start_date,
    p_lease_end_date
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'create_lease_with_authoritative_term',
    p_idempotency_key,
    v_actor_id,
    jsonb_build_object(
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'tenantPersonId', p_primary_tenant_person_id,
      'leaseStartDate', p_lease_start_date,
      'leaseEndDate', p_lease_end_date,
      'rentAmount', p_rent_amount,
      'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day,
      'paymentFrequency', p_payment_frequency,
      'termStatus', p_term_status,
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'leaseStatus', p_lease_status
    )
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'leaseId')::uuid;
  END IF;

  PERFORM set_config('app.lease_creation_context', 'checked-v1', true);

  v_lease_id := public.create_lease(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_rent_amount,
    p_rent_currency,
    p_deposit_amount,
    p_deposit_currency,
    p_lease_status
  );

  PERFORM set_config('app.lease_creation_context', 'off', true);

  SELECT terms.id
  INTO v_legacy_term_id
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = v_lease_id
    AND terms.authority_kind = 'legacy_inferred'
  ORDER BY terms.term_sequence
  LIMIT 1;

  PERFORM public.create_authoritative_lease_term(
    p_organization_id,
    v_lease_id,
    p_lease_start_date,
    p_lease_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    p_term_status,
    v_legacy_term_id,
    p_idempotency_key || ':term'
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    jsonb_build_object('leaseId', v_lease_id)
  );

  RETURN v_lease_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_lease_with_authoritative_term(
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
  v_actor_id uuid := (SELECT auth.uid());
  v_claim record;
  v_current_term public.lease_terms%ROWTYPE;
  v_existing_lease public.leases%ROWTYPE;
  v_term_id uuid;
BEGIN
  IF v_actor_id IS NULL
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

  IF v_existing_lease.property_id IS DISTINCT FROM p_property_id
    OR v_existing_lease.unit_id IS DISTINCT FROM p_unit_id THEN
    RAISE EXCEPTION
      'Lease property and unit scope cannot change through a term correction'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.property_id = p_property_id
    AND leases.unit_id IS NOT DISTINCT FROM p_unit_id
    AND leases.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease scope changed during the term mutation'
      USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'update_lease_with_authoritative_term',
    p_idempotency_key,
    v_actor_id,
    jsonb_build_object(
      'leaseId', p_lease_id,
      'propertyId', p_property_id,
      'unitId', p_unit_id,
      'tenantPersonId', p_primary_tenant_person_id,
      'leaseStartDate', p_lease_start_date,
      'leaseEndDate', p_lease_end_date,
      'rentAmount', p_rent_amount,
      'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day,
      'paymentFrequency', p_payment_frequency,
      'termStatus', p_term_status,
      'depositAmount', p_deposit_amount,
      'depositCurrency', p_deposit_currency,
      'leaseStatus', p_lease_status
    )
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'leaseId')::uuid;
  END IF;

  IF lower(trim(p_lease_status)) IN ('ended', 'terminated', 'cancelled')
    AND lower(trim(p_term_status)) IN ('active', 'upcoming') THEN
    RAISE EXCEPTION
      'An inactive lease cannot retain an active or upcoming authoritative term'
      USING ERRCODE = '23514';
  END IF;

  SELECT terms.*
  INTO v_current_term
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id
    AND terms.archived_at IS NULL
    AND terms.status NOT IN ('superseded', 'terminated')
  ORDER BY
    CASE WHEN terms.authority_kind = 'authoritative' THEN 0 ELSE 1 END,
    terms.term_sequence DESC
  LIMIT 1
  FOR UPDATE;

  PERFORM set_config(
    'app.lease_term_projection_context',
    'checked-v1',
    true
  );

  PERFORM public.update_lease(
    p_lease_id,
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_primary_tenant_person_id,
    p_lease_start_date,
    p_lease_end_date,
    p_rent_amount,
    p_rent_currency,
    p_deposit_amount,
    p_deposit_currency,
    p_lease_status
  );

  PERFORM set_config(
    'app.lease_term_projection_context',
    'off',
    true
  );

  IF v_current_term.id IS NOT NULL
    AND v_current_term.authority_kind = 'authoritative'
    AND (
      v_current_term.start_date,
      v_current_term.end_date,
      v_current_term.rent_amount,
      v_current_term.rent_currency,
      v_current_term.rent_due_day,
      v_current_term.payment_frequency,
      v_current_term.status
    ) IS NOT DISTINCT FROM (
      p_lease_start_date,
      p_lease_end_date,
      p_rent_amount,
      p_rent_currency,
      p_rent_due_day,
      lower(trim(p_payment_frequency)),
      lower(trim(p_term_status))
    ) THEN
    v_term_id := v_current_term.id;
  ELSE
    PERFORM app_private.lock_open_lease_term_periods(
      p_organization_id,
      p_property_id,
      p_rent_currency,
      p_lease_start_date,
      p_lease_end_date
    );

    v_term_id := public.create_authoritative_lease_term(
      p_organization_id,
      p_lease_id,
      p_lease_start_date,
      p_lease_end_date,
      p_rent_amount,
      p_rent_currency,
      p_rent_due_day,
      p_payment_frequency,
      p_term_status,
      v_current_term.id,
      p_idempotency_key || ':term'
    );
  END IF;

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    jsonb_build_object('leaseId', p_lease_id, 'termId', v_term_id)
  );

  RETURN p_lease_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.create_lease_with_authoritative_term(
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
  ),
  public.update_lease_with_authoritative_term(
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
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.create_lease_with_authoritative_term(
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
  ),
  public.update_lease_with_authoritative_term(
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

CREATE OR REPLACE FUNCTION public.create_rent_policy_draft(
  p_organization_id uuid,
  p_effective_from date,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_claim record;
  v_policy_id uuid;
  v_version integer;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Policy effective date is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'rent_policy_version_v1', p_organization_id),
      0
    )
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'create_rent_policy_draft',
    p_idempotency_key,
    v_actor_id,
    jsonb_build_object('effectiveFrom', p_effective_from)
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'policyId')::uuid;
  END IF;

  SELECT coalesce(max(policy.version_number), 0) + 1
  INTO v_version
  FROM public.rent_policy_versions AS policy
  WHERE policy.organization_id = p_organization_id;

  INSERT INTO public.rent_policy_versions (
    organization_id,
    version_number,
    effective_from,
    lifecycle,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    v_version,
    p_effective_from,
    'draft',
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_policy_id;

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
    v_actor_id,
    'rent_policy_version',
    v_policy_id,
    'rent_policy_draft_created',
    jsonb_build_object(
      'policyId', v_policy_id,
      'versionNumber', v_version,
      'effectiveFrom', p_effective_from,
      'lifecycle', 'draft'
    )
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    jsonb_build_object('policyId', v_policy_id)
  );

  RETURN v_policy_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_rent_policy_draft(
  p_organization_id uuid,
  p_policy_id uuid,
  p_supported_frequencies text[],
  p_rent_calculation_timezone text,
  p_due_day_source text,
  p_policy_default_due_day integer,
  p_short_month_due_day_rule text,
  p_lease_start_proration_rule text,
  p_lease_end_proration_rule text,
  p_notice_period_charging_rule text,
  p_mid_period_rent_change_rule text,
  p_concessions_support_state text,
  p_rent_free_support_state text,
  p_waivers_support_state text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_previous public.rent_policy_versions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'rent_policy_version_v1', p_organization_id),
      0
    )
  );

  SELECT policy.*
  INTO v_previous
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id
    AND policy.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent policy version was not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_previous.lifecycle <> 'draft' THEN
    RAISE EXCEPTION 'Only draft rent policy versions can be edited'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.rent_policy_versions
  SET
    supported_frequencies = p_supported_frequencies,
    rent_calculation_timezone =
      nullif(trim(p_rent_calculation_timezone), ''),
    due_day_source = nullif(lower(trim(p_due_day_source)), ''),
    policy_default_due_day = p_policy_default_due_day,
    short_month_due_day_rule =
      nullif(lower(trim(p_short_month_due_day_rule)), ''),
    lease_start_proration_rule =
      nullif(lower(trim(p_lease_start_proration_rule)), ''),
    lease_end_proration_rule =
      nullif(lower(trim(p_lease_end_proration_rule)), ''),
    notice_period_charging_rule =
      nullif(lower(trim(p_notice_period_charging_rule)), ''),
    mid_period_rent_change_rule =
      nullif(lower(trim(p_mid_period_rent_change_rule)), ''),
    concessions_support_state =
      nullif(lower(trim(p_concessions_support_state)), ''),
    rent_free_support_state =
      nullif(lower(trim(p_rent_free_support_state)), ''),
    waivers_support_state =
      nullif(lower(trim(p_waivers_support_state)), ''),
    updated_at = now(),
    updated_by = v_actor_id
  WHERE id = p_policy_id
    AND organization_id = p_organization_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  SELECT
    p_organization_id,
    v_actor_id,
    'rent_policy_version',
    policy.id,
    'rent_policy_draft_updated',
    to_jsonb(v_previous),
    to_jsonb(policy)
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id;

  RETURN p_policy_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_rent_policy_version(
  p_organization_id uuid,
  p_policy_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_policy public.rent_policy_versions%ROWTYPE;
  v_property_scope record;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'rent_policy_version_v1', p_organization_id),
      0
    )
  );

  SELECT policy.*
  INTO v_policy
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id
    AND policy.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent policy version was not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_policy.lifecycle <> 'draft' THEN
    RAISE EXCEPTION 'Only draft rent policy versions can be approved'
      USING ERRCODE = '42501';
  END IF;

  IF v_policy.effective_from < current_date THEN
    RAISE EXCEPTION
      'Rent policy effective date cannot be in the past'
      USING ERRCODE = '22023';
  END IF;

  IF v_policy.supported_frequencies IS NULL
    OR cardinality(v_policy.supported_frequencies) = 0
    OR v_policy.rent_calculation_timezone IS NULL
    OR v_policy.due_day_source IS NULL
    OR v_policy.short_month_due_day_rule IS NULL
    OR v_policy.lease_start_proration_rule IS NULL
    OR v_policy.lease_end_proration_rule IS NULL
    OR v_policy.notice_period_charging_rule IS NULL
    OR v_policy.mid_period_rent_change_rule IS NULL
    OR v_policy.concessions_support_state IS NULL
    OR v_policy.rent_free_support_state IS NULL
    OR v_policy.waivers_support_state IS NULL
    OR (
      v_policy.due_day_source = 'policy_default'
      AND v_policy.policy_default_due_day IS NULL
    )
    OR (
      v_policy.due_day_source = 'term'
      AND v_policy.policy_default_due_day IS NOT NULL
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_timezone_names AS timezone
      WHERE timezone.name = v_policy.rent_calculation_timezone
    ) THEN
    RAISE EXCEPTION 'Rent policy is incomplete and cannot be approved'
      USING ERRCODE = '23514';
  END IF;

  FOR v_property_scope IN
    SELECT DISTINCT
      leases.property_id,
      leases.monthly_rent_currency AS currency
    FROM public.leases AS leases
    WHERE leases.organization_id = p_organization_id
      AND leases.archived_at IS NULL
      AND leases.property_id IS NOT NULL
      AND leases.lease_end_date >= v_policy.effective_from
    ORDER BY leases.property_id, leases.monthly_rent_currency
  LOOP
    PERFORM app_private.lock_open_lease_term_periods(
      p_organization_id,
      v_property_scope.property_id,
      v_property_scope.currency,
      v_policy.effective_from,
      greatest(v_policy.effective_from, current_date)
    );
  END LOOP;

  PERFORM 1
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id
    AND policy.organization_id = p_organization_id
    AND policy.lifecycle = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent policy version changed during approval'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.rent_policy_versions
  SET
    lifecycle = 'approved',
    approved_at = now(),
    approved_by = v_actor_id,
    updated_at = now(),
    updated_by = v_actor_id
  WHERE id = p_policy_id
    AND organization_id = p_organization_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  SELECT
    p_organization_id,
    v_actor_id,
    'rent_policy_version',
    policy.id,
    'rent_policy_version_approved',
    to_jsonb(v_policy),
    to_jsonb(policy)
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id;

  RETURN p_policy_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.create_rent_policy_draft(uuid, date, text),
  public.update_rent_policy_draft(
    uuid,
    uuid,
    text[],
    text,
    text,
    integer,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  public.approve_rent_policy_version(uuid, uuid)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.create_rent_policy_draft(uuid, date, text),
  public.update_rent_policy_draft(
    uuid,
    uuid,
    text[],
    text,
    text,
    integer,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  public.approve_rent_policy_version(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_lease_rent_readiness(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS TABLE (
  readiness_status text,
  reason_code text,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  lease_id uuid,
  term_id uuid,
  policy_id uuid,
  policy_version integer,
  effective_date date,
  rent_amount numeric,
  rent_currency public.currency_code,
  rent_due_day integer,
  payment_frequency text,
  repair_context jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_term record;
  v_policy public.rent_policy_versions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_term
  FROM public.resolve_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_effective_date
  );

  IF v_term.resolution_status <> 'resolved' THEN
    RETURN QUERY SELECT
      CASE
        WHEN v_term.blocker_code = 'legacy_unconfirmed'
          THEN 'legacy_unconfirmed'
        WHEN v_term.blocker_code = 'term_conflict'
          THEN 'term_conflict'
        ELSE 'blocked'
      END,
      v_term.blocker_code,
      v_term.organization_id,
      v_term.property_id,
      v_term.unit_id,
      v_term.lease_id,
      v_term.term_id,
      NULL::uuid,
      NULL::integer,
      p_effective_date,
      v_term.rent_amount,
      v_term.rent_currency,
      v_term.rent_due_day,
      v_term.payment_frequency,
      jsonb_build_object(
        'repair', CASE
          WHEN v_term.blocker_code = 'legacy_unconfirmed'
            THEN 'confirm_or_replace_legacy_term'
          ELSE 'repair_lease_term_authority'
        END
      );
    RETURN;
  END IF;

  SELECT policy.*
  INTO v_policy
  FROM public.rent_policy_versions AS policy
  WHERE policy.organization_id = p_organization_id
    AND policy.lifecycle = 'approved'
    AND policy.effective_from <= p_effective_date
  ORDER BY policy.effective_from DESC, policy.version_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.rent_policy_versions AS policy
      WHERE policy.organization_id = p_organization_id
        AND policy.lifecycle = 'draft'
        AND policy.effective_from <= p_effective_date
    ) THEN
      RETURN QUERY SELECT
        'policy_unapproved', 'policy_unapproved', v_term.organization_id,
        v_term.property_id, v_term.unit_id, v_term.lease_id, v_term.term_id,
        NULL::uuid, NULL::integer, p_effective_date, v_term.rent_amount,
        v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
        jsonb_build_object('repair', 'complete_and_approve_rent_policy');
    ELSE
      RETURN QUERY SELECT
        'blocked', 'policy_not_effective', v_term.organization_id,
        v_term.property_id, v_term.unit_id, v_term.lease_id, v_term.term_id,
        NULL::uuid, NULL::integer, p_effective_date, v_term.rent_amount,
        v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
        jsonb_build_object('repair', 'create_effective_rent_policy');
    END IF;
    RETURN;
  END IF;

  IF NOT (v_term.payment_frequency = ANY(v_policy.supported_frequencies)) THEN
    RETURN QUERY SELECT
      'unsupported_frequency', 'unsupported_frequency',
      v_term.organization_id, v_term.property_id, v_term.unit_id,
      v_term.lease_id, v_term.term_id, v_policy.id,
      v_policy.version_number, p_effective_date, v_term.rent_amount,
      v_term.rent_currency, v_term.rent_due_day, v_term.payment_frequency,
      jsonb_build_object(
        'repair', 'approve_frequency_or_replace_term',
        'supportedFrequencies', v_policy.supported_frequencies
      );
    RETURN;
  END IF;

  IF v_policy.due_day_source = 'term' AND v_term.rent_due_day IS NULL THEN
    RETURN QUERY SELECT
      'missing_due_day', 'missing_due_day', v_term.organization_id,
      v_term.property_id, v_term.unit_id, v_term.lease_id, v_term.term_id,
      v_policy.id, v_policy.version_number, p_effective_date,
      v_term.rent_amount, v_term.rent_currency, v_term.rent_due_day,
      v_term.payment_frequency,
      jsonb_build_object('repair', 'replace_term_with_explicit_due_day');
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'ready', 'ready', v_term.organization_id, v_term.property_id,
    v_term.unit_id, v_term.lease_id, v_term.term_id, v_policy.id,
    v_policy.version_number, p_effective_date, v_term.rent_amount,
    v_term.rent_currency,
    CASE
      WHEN v_policy.due_day_source = 'term' THEN v_term.rent_due_day
      ELSE v_policy.policy_default_due_day
    END,
    v_term.payment_frequency,
    jsonb_build_object(
      'termId', v_term.term_id,
      'policyId', v_policy.id,
      'policyVersion', v_policy.version_number
    );
END;
$$;

REVOKE ALL ON FUNCTION
  public.resolve_lease_rent_readiness(uuid, uuid, date)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.resolve_lease_rent_readiness(uuid, uuid, date)
TO authenticated;

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
  v_lease public.leases%ROWTYPE;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_frequency text := lower(trim(coalesce(p_payment_frequency, '')));
  v_payload jsonb;
  v_claim record;
  v_term_id uuid;
  v_sequence integer;
  v_previous public.lease_terms%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_end_date < p_start_date
    OR p_rent_amount IS NULL
    OR p_rent_amount < 0
    OR p_rent_due_day IS NULL
    OR p_rent_due_day NOT BETWEEN 1 AND 31
    OR v_frequency NOT IN (
      'monthly',
      'quarterly',
      'semi_annual',
      'annual',
      'one_time'
    )
    OR v_status NOT IN (
      'draft',
      'upcoming',
      'active',
      'expired',
      'terminated'
    ) THEN
    RAISE EXCEPTION 'Authoritative lease term inputs are incomplete or invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_rent_currency::text <> 'USD' THEN
    RAISE EXCEPTION 'Only USD lease terms are currently supported'
      USING ERRCODE = '0A000';
  END IF;

  IF v_status = 'active'
    AND current_date NOT BETWEEN p_start_date AND p_end_date THEN
    RAISE EXCEPTION 'An active term must include the current date'
      USING ERRCODE = '22023';
  END IF;

  IF v_status = 'upcoming' AND p_start_date <= current_date THEN
    RAISE EXCEPTION 'An upcoming term must start in the future'
      USING ERRCODE = '22023';
  END IF;

  SELECT leases.*
  INTO v_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.archived_at IS NULL;

  IF NOT FOUND
    OR v_lease.unit_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.units AS units
      WHERE units.id = v_lease.unit_id
        AND units.organization_id = p_organization_id
        AND units.property_id = v_lease.property_id
        AND units.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Lease scope is not supported or no longer exists'
      USING ERRCODE = '23503';
  END IF;

  IF v_lease.status IN ('ended', 'terminated', 'cancelled')
    AND v_status IN ('active', 'upcoming') THEN
    RAISE EXCEPTION
      'An inactive lease cannot retain an active or upcoming authoritative term'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app_private.lock_open_lease_term_periods(
    p_organization_id,
    v_lease.property_id,
    p_rent_currency,
    p_start_date,
    p_end_date
  );

  PERFORM 1
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.property_id = v_lease.property_id
    AND leases.unit_id = v_lease.unit_id
    AND leases.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease scope changed during the term mutation'
      USING ERRCODE = '40001';
  END IF;

  v_payload := jsonb_build_object(
    'leaseId', p_lease_id,
    'startDate', p_start_date,
    'endDate', p_end_date,
    'rentAmount', p_rent_amount,
    'rentCurrency', p_rent_currency,
    'rentDueDay', p_rent_due_day,
    'paymentFrequency', v_frequency,
    'status', v_status,
    'supersedesTermId', p_supersedes_term_id
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'create_authoritative_lease_term',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'termId')::uuid;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'lease_term_v1', p_organization_id, p_lease_id),
      0
    )
  );

  IF p_supersedes_term_id IS NOT NULL THEN
    SELECT terms.*
    INTO v_previous
    FROM public.lease_terms AS terms
    WHERE terms.id = p_supersedes_term_id
      AND terms.organization_id = p_organization_id
      AND terms.lease_id = p_lease_id
      AND terms.archived_at IS NULL
      AND terms.status NOT IN ('superseded', 'terminated')
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Superseded lease term was not found'
        USING ERRCODE = '23503';
    END IF;

    UPDATE public.lease_terms
    SET
      status = 'superseded',
      updated_at = now(),
      updated_by = v_actor_id
    WHERE id = v_previous.id;
  END IF;

  SELECT coalesce(max(terms.term_sequence), 0) + 1
  INTO v_sequence
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = p_organization_id
    AND terms.lease_id = p_lease_id;

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
    supersedes_term_id,
    confirmed_at,
    confirmed_by,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_lease_id,
    v_sequence,
    p_start_date,
    p_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    v_frequency,
    v_status,
    'authoritative',
    p_supersedes_term_id,
    now(),
    v_actor_id,
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_term_id;

  IF current_date BETWEEN p_start_date AND p_end_date
    AND v_status = 'active' THEN
    PERFORM set_config(
      'app.lease_term_projection_context',
      'checked-v1',
      true
    );

    UPDATE public.leases
    SET
      lease_start_date = p_start_date,
      lease_end_date = p_end_date,
      monthly_rent_amount = p_rent_amount,
      monthly_rent_currency = p_rent_currency,
      updated_by = v_actor_id
    WHERE id = p_lease_id
      AND organization_id = p_organization_id;

    PERFORM set_config(
      'app.lease_term_projection_context',
      'off',
      true
    );
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
    p_organization_id,
    v_actor_id,
    'lease_term',
    v_term_id,
    CASE
      WHEN p_supersedes_term_id IS NULL
        THEN 'authoritative_lease_term_created'
      ELSE 'authoritative_lease_term_superseded'
    END,
    CASE
      WHEN p_supersedes_term_id IS NULL THEN NULL
      ELSE to_jsonb(v_previous)
    END,
    jsonb_build_object(
      'leaseId', p_lease_id,
      'termId', v_term_id,
      'termSequence', v_sequence,
      'startDate', p_start_date,
      'endDate', p_end_date,
      'rentAmount', p_rent_amount,
      'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day,
      'paymentFrequency', v_frequency,
      'status', v_status,
      'supersedesTermId', p_supersedes_term_id
    )
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    jsonb_build_object('leaseId', p_lease_id, 'termId', v_term_id)
  );

  RETURN v_term_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
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
  v_lease public.leases%ROWTYPE;
  v_previous public.lease_terms%ROWTYPE;
  v_expected_term_end date;
  v_expected_term_start date;
  v_term_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_supersedes_term_id IS NOT NULL THEN
    SELECT terms.*
    INTO v_previous
    FROM public.lease_terms AS terms
    WHERE terms.id = p_supersedes_term_id
      AND terms.organization_id = p_organization_id
      AND terms.lease_id = p_lease_id
      AND terms.authority_kind = 'authoritative'
      AND terms.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Scheduled term to supersede was not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_previous.status = 'active' THEN
      v_expected_term_start := v_previous.start_date;
      v_expected_term_end := v_previous.end_date;

      IF p_start_date <= current_date
        OR p_start_date <= v_previous.start_date THEN
        RAISE EXCEPTION
          'A future rent change must begin after today and after the active term starts'
          USING ERRCODE = '22023';
      END IF;

      SELECT leases.*
      INTO v_lease
      FROM public.leases AS leases
      WHERE leases.id = p_lease_id
        AND leases.organization_id = p_organization_id
        AND leases.archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lease was not found' USING ERRCODE = '23503';
      END IF;

      IF p_start_date <= v_previous.end_date THEN
        PERFORM app_private.lock_open_lease_term_periods(
          p_organization_id,
          v_lease.property_id,
          p_rent_currency,
          p_start_date,
          v_previous.end_date
        );
      END IF;

      SELECT leases.*
      INTO v_lease
      FROM public.leases AS leases
      WHERE leases.id = p_lease_id
        AND leases.organization_id = p_organization_id
        AND leases.archived_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lease was not found' USING ERRCODE = '23503';
      END IF;

      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          concat_ws(':', 'lease_term_v1', p_organization_id, p_lease_id),
          0
        )
      );

      SELECT terms.*
      INTO v_previous
      FROM public.lease_terms AS terms
      WHERE terms.id = p_supersedes_term_id
        AND terms.organization_id = p_organization_id
        AND terms.lease_id = p_lease_id
        AND terms.authority_kind = 'authoritative'
        AND terms.status = 'active'
        AND terms.archived_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Active term changed while scheduling its replacement'
          USING ERRCODE = '40001';
      END IF;

      IF v_previous.start_date <> v_expected_term_start
        OR v_previous.end_date <> v_expected_term_end THEN
        RAISE EXCEPTION 'Active term changed while scheduling its replacement'
          USING ERRCODE = '40001';
      END IF;

      IF p_start_date <= v_previous.end_date THEN
        UPDATE public.lease_terms
        SET
          end_date = p_start_date - 1,
          updated_at = now(),
          updated_by = v_actor_id
        WHERE id = v_previous.id;

        INSERT INTO public.activity_logs (
          organization_id,
          actor_id,
          entity_type,
          entity_id,
          action,
          previous_values,
          new_values
        )
        SELECT
          p_organization_id,
          v_actor_id,
          'lease_term',
          terms.id,
          'authoritative_lease_term_future_range_shortened',
          to_jsonb(v_previous),
          to_jsonb(terms)
        FROM public.lease_terms AS terms
        WHERE terms.id = v_previous.id;
      END IF;

      v_term_id := public.create_authoritative_lease_term(
        p_organization_id,
        p_lease_id,
        p_start_date,
        p_end_date,
        p_rent_amount,
        p_rent_currency,
        p_rent_due_day,
        p_payment_frequency,
        'upcoming',
        NULL,
        p_idempotency_key
      );

      UPDATE public.lease_terms
      SET supersedes_term_id = p_supersedes_term_id
      WHERE id = v_term_id
        AND supersedes_term_id IS NULL;

      IF p_end_date > v_lease.lease_end_date THEN
        PERFORM set_config(
          'app.lease_term_projection_context',
          'checked-v1',
          true
        );

        UPDATE public.leases
        SET
          lease_end_date = p_end_date,
          updated_by = v_actor_id
        WHERE id = p_lease_id
          AND organization_id = p_organization_id;

        PERFORM set_config(
          'app.lease_term_projection_context',
          'off',
          true
        );
      END IF;

      RETURN v_term_id;
    END IF;
  END IF;

  RETURN public.create_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_start_date,
    p_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    'upcoming',
    p_supersedes_term_id,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.create_authoritative_lease_term(
    uuid,
    uuid,
    date,
    date,
    numeric,
    public.currency_code,
    integer,
    text,
    text,
    uuid,
    text
  ),
  public.schedule_authoritative_lease_term(
    uuid,
    uuid,
    date,
    date,
    numeric,
    public.currency_code,
    integer,
    text,
    uuid,
    text
  )
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.create_authoritative_lease_term(
    uuid,
    uuid,
    date,
    date,
    numeric,
    public.currency_code,
    integer,
    text,
    text,
    uuid,
    text
  ),
  public.schedule_authoritative_lease_term(
    uuid,
    uuid,
    date,
    date,
    numeric,
    public.currency_code,
    integer,
    text,
    uuid,
    text
  )
TO authenticated;

ALTER FUNCTION public.commit_generic_import_run(uuid, uuid)
RENAME TO commit_generic_import_run_legacy_unchecked;

REVOKE ALL ON FUNCTION
  public.commit_generic_import_run_legacy_unchecked(uuid, uuid)
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
        OR NULLIF(v_row.normalized_data ->> 'paymentFrequency', '') IS NULL
        OR NULLIF(v_row.normalized_data ->> 'termStatus', '') IS NULL THEN
        RAISE EXCEPTION
          'Lease import requires explicit due day, payment frequency, and term status'
          USING ERRCODE = '23514';
      END IF;

      PERFORM public.create_lease_with_authoritative_term(
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
        NULLIF(v_row.normalized_data ->> 'depositAmount', '')::numeric,
        CASE
          WHEN NULLIF(v_row.normalized_data ->> 'depositAmount', '') IS NULL
            THEN NULL
          ELSE 'USD'::public.currency_code
        END,
        v_row.normalized_data ->> 'status',
        concat('import:', v_run.id, ':', v_row.id)
      );

      v_created_total := v_created_total + 1;

      UPDATE public.import_rows
      SET
        row_status = 'committed',
        result_action = 'created',
        error_message = NULL
      WHERE id = v_row.id;
    EXCEPTION WHEN OTHERS THEN
      v_failed_total := v_failed_total + 1;
      v_row_error := SQLERRM;

      IF v_row_error ILIKE '%Unit already has an open lease%'
        OR v_row_error ILIKE '%lease_occupancies_one_active_unit_idx%' THEN
        v_row_error :=
          'Unit already has an open lease. End or cancel the existing lease before importing another open lease.';
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
      'authority_workflow', 'checked-v1'
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
