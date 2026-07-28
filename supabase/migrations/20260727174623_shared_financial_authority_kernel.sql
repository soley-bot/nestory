-- Plan 03: shared financial-authority infrastructure only.
-- Mandatory lock order for later domain writes and close transitions:
--   1. property/currency/month advisory lock
--   2. stable property_reporting_periods row FOR UPDATE
--   3. lifecycle, organization Ledger, and accounting-book lock checks
--   4. idempotency advisory lock and request row
--   5. domain source rows
--   6. reserved Ledger and journal projections
--
-- This migration does not wire any current settlement workflow to the kernel.

CREATE OR REPLACE FUNCTION app_private.is_reserved_financial_source_type(
  p_source_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT lower(trim(coalesce(p_source_type, ''))) = ANY (ARRAY[
    'receipt_allocation',
    'payment_allocation',
    'deposit_event',
    'petty_cash_entry',
    'rent_charge_occurrence',
    'maintenance_handoff',
    'management_fee_assessment',
    'owner_cash_event',
    'financial_adjustment'
  ]);
$$;

REVOKE ALL ON FUNCTION app_private.is_reserved_financial_source_type(text)
FROM PUBLIC, anon, authenticated, service_role;
-- This pure classifier is shared by invoker-owned generic RPCs and table
-- triggers. It exposes no row data and must be executable by the roles whose
-- writes it guards so they receive the deliberate domain denial.
GRANT EXECUTE ON FUNCTION app_private.is_reserved_financial_source_type(text)
TO authenticated, service_role;

CREATE TABLE public.property_reporting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  period_start date NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'open'
    CHECK (lifecycle_status IN ('open', 'in_review', 'closed', 'reopened')),
  current_close_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT property_reporting_periods_month_start_check
    CHECK (period_start = date_trunc('month', period_start)::date),
  CONSTRAINT property_reporting_periods_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT property_reporting_periods_scope_unique
    UNIQUE (organization_id, property_id, currency, period_start),
  CONSTRAINT property_reporting_periods_organization_id_id_key
    UNIQUE (organization_id, id)
);

CREATE TABLE public.property_close_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_reporting_period_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  revision_kind text NOT NULL
    CHECK (revision_kind IN ('initial_close', 'reopen', 'reclose')),
  previous_revision_id uuid,
  calculation_contract_version text NOT NULL,
  source_manifest_hash text,
  owner_roster_hash text,
  reconciliation_manifest_hash text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT property_close_revisions_contract_version_check
    CHECK (length(trim(calculation_contract_version)) BETWEEN 1 AND 80),
  CONSTRAINT property_close_revisions_source_hash_check
    CHECK (
      source_manifest_hash IS NULL
      OR source_manifest_hash ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT property_close_revisions_owner_hash_check
    CHECK (
      owner_roster_hash IS NULL
      OR owner_roster_hash ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT property_close_revisions_reconciliation_hash_check
    CHECK (
      reconciliation_manifest_hash IS NULL
      OR reconciliation_manifest_hash ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT property_close_revisions_reason_check
    CHECK (
      (revision_kind = 'initial_close' AND reason IS NULL)
      OR (
        revision_kind IN ('reopen', 'reclose')
        AND length(trim(coalesce(reason, ''))) BETWEEN 3 AND 500
      )
    ),
  CONSTRAINT property_close_revisions_period_number_unique
    UNIQUE (property_reporting_period_id, revision_number),
  CONSTRAINT property_close_revisions_org_period_id_key
    UNIQUE (organization_id, property_reporting_period_id, id),
  CONSTRAINT property_close_revisions_org_period_fkey
    FOREIGN KEY (organization_id, property_reporting_period_id)
    REFERENCES public.property_reporting_periods(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT property_close_revisions_previous_fkey
    FOREIGN KEY (
      organization_id,
      property_reporting_period_id,
      previous_revision_id
    )
    REFERENCES public.property_close_revisions(
      organization_id,
      property_reporting_period_id,
      id
    )
    ON DELETE RESTRICT,
  CONSTRAINT property_close_revisions_not_self_previous_check
    CHECK (previous_revision_id IS NULL OR previous_revision_id <> id)
);

ALTER TABLE public.property_reporting_periods
  ADD CONSTRAINT property_reporting_periods_current_revision_fkey
  FOREIGN KEY (organization_id, id, current_close_revision_id)
  REFERENCES public.property_close_revisions(
    organization_id,
    property_reporting_period_id,
    id
  )
  ON DELETE RESTRICT;

CREATE INDEX property_reporting_periods_property_period_idx
  ON public.property_reporting_periods (
    organization_id,
    property_id,
    currency,
    period_start DESC
  );

CREATE INDEX property_reporting_periods_current_revision_idx
  ON public.property_reporting_periods(current_close_revision_id)
  WHERE current_close_revision_id IS NOT NULL;

CREATE INDEX property_close_revisions_period_created_idx
  ON public.property_close_revisions(
    property_reporting_period_id,
    revision_number DESC
  );

CREATE INDEX property_close_revisions_previous_idx
  ON public.property_close_revisions(previous_revision_id)
  WHERE previous_revision_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.enforce_property_period_mutation_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Property reporting periods cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF coalesce(
    current_setting('app.financial_authority_period_context', true),
    'off'
  ) <> 'on' THEN
    RAISE EXCEPTION 'Property reporting periods require the private authority workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_close_revision_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_latest_revision public.property_close_revisions%ROWTYPE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Property close revisions are append-only'
      USING ERRCODE = '55000';
  END IF;

  IF coalesce(
    current_setting('app.financial_authority_period_context', true),
    'off'
  ) <> 'on' THEN
    RAISE EXCEPTION 'Property close revisions require the private authority workflow'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.property_reporting_periods AS reporting_period
  WHERE reporting_period.id = NEW.property_reporting_period_id
    AND reporting_period.organization_id = NEW.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property reporting period not found'
      USING ERRCODE = '23503';
  END IF;

  SELECT revision.*
  INTO v_latest_revision
  FROM public.property_close_revisions AS revision
  WHERE revision.organization_id = NEW.organization_id
    AND revision.property_reporting_period_id =
      NEW.property_reporting_period_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.revision_number <> 1
      OR NEW.revision_kind <> 'initial_close'
      OR NEW.previous_revision_id IS NOT NULL THEN
      RAISE EXCEPTION 'The first close revision must be initial revision 1'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF NEW.revision_number <> v_latest_revision.revision_number + 1
      OR NEW.previous_revision_id IS DISTINCT FROM v_latest_revision.id THEN
      RAISE EXCEPTION 'Close revisions must append to the exact latest revision'
        USING ERRCODE = '22023';
    END IF;

    IF (
      v_latest_revision.revision_kind IN ('initial_close', 'reclose')
      AND NEW.revision_kind <> 'reopen'
    ) OR (
      v_latest_revision.revision_kind = 'reopen'
      AND NEW.revision_kind <> 'reclose'
    ) THEN
      RAISE EXCEPTION
        'Close revision kind must alternate reopen and reclose after initial close'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.enforce_property_period_mutation_context(),
  app_private.enforce_close_revision_append_only()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_property_period_mutation_context
BEFORE INSERT OR UPDATE OR DELETE ON public.property_reporting_periods
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_property_period_mutation_context();

CREATE TRIGGER enforce_close_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON public.property_close_revisions
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_close_revision_append_only();

ALTER TABLE public.property_reporting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_close_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization admins can read property reporting periods"
ON public.property_reporting_periods
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

CREATE POLICY "Organization admins can read property close revisions"
ON public.property_close_revisions
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

REVOKE ALL ON TABLE
  public.property_reporting_periods,
  public.property_close_revisions
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.property_reporting_periods,
  public.property_close_revisions
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.lock_property_reporting_period_internal(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date,
  p_assert_open boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_period_start date;
  v_reporting_period public.property_reporting_periods%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_currency IS NULL
    OR p_effective_date IS NULL
    OR p_assert_open IS NULL THEN
    RAISE EXCEPTION 'Property reporting-period identity is required'
      USING ERRCODE = '22004';
  END IF;

  v_period_start := date_trunc('month', p_effective_date)::date;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.id = p_property_id
      AND property.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Property is outside the requested organization'
      USING ERRCODE = '23503';
  END IF;

  -- This advisory lock is the mandatory first lock for both future source
  -- operations and future close transitions.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'property_reporting_period_v1',
        p_organization_id,
        p_property_id,
        p_currency,
        v_period_start
      ),
      0
    )
  );

  PERFORM set_config(
    'app.financial_authority_period_context',
    'on',
    true
  );

  INSERT INTO public.property_reporting_periods (
    organization_id,
    property_id,
    currency,
    period_start
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_currency,
    v_period_start
  )
  ON CONFLICT (organization_id, property_id, currency, period_start)
  DO NOTHING;

  PERFORM set_config(
    'app.financial_authority_period_context',
    'off',
    true
  );

  SELECT reporting_period.*
  INTO STRICT v_reporting_period
  FROM public.property_reporting_periods AS reporting_period
  WHERE reporting_period.organization_id = p_organization_id
    AND reporting_period.property_id = p_property_id
    AND reporting_period.currency = p_currency
    AND reporting_period.period_start = v_period_start
  FOR UPDATE;

  IF p_assert_open THEN
    IF v_reporting_period.lifecycle_status NOT IN ('open', 'reopened') THEN
      RAISE EXCEPTION 'Property reporting period is not open'
        USING ERRCODE = '22023';
    END IF;

    IF app_private.is_ledger_period_locked(
      p_organization_id,
      v_period_start
    ) THEN
      RAISE EXCEPTION 'Organization Ledger period is locked'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.accounting_periods AS accounting_period
      JOIN public.accounting_books AS book
        ON book.id = accounting_period.book_id
       AND book.organization_id = accounting_period.organization_id
      WHERE accounting_period.organization_id = p_organization_id
        AND accounting_period.period_start = v_period_start
        AND accounting_period.status = 'locked'
        AND book.book_type = 'client'
        AND book.currency = p_currency
        AND book.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Accounting book period is locked'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_reporting_period.id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.lock_property_reporting_period(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.lock_property_reporting_period_internal(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date,
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.lock_open_property_reporting_period(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.lock_property_reporting_period_internal(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date,
    true
  );
$$;

REVOKE ALL ON FUNCTION
  app_private.lock_property_reporting_period_internal(
    uuid,
    uuid,
    public.currency_code,
    date,
    boolean
  ),
  app_private.lock_property_reporting_period(
    uuid,
    uuid,
    public.currency_code,
    date
  ),
  app_private.lock_open_property_reporting_period(
    uuid,
    uuid,
    public.currency_code,
    date
  )
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.lock_property_reporting_period(
  uuid,
  uuid,
  public.currency_code,
  date
) IS
  'Private lock-only entry point for a future close transition. Acquires the shared property-period advisory lock and header row lock.';

COMMENT ON FUNCTION app_private.lock_open_property_reporting_period(
  uuid,
  uuid,
  public.currency_code,
  date
) IS
  'Private source-operation entry point. Acquires the shared property-period locks, then rejects closed property, organization Ledger, or client-book periods.';

CREATE TABLE public.financial_reconciliation_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  property_id uuid,
  currency public.currency_code NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  source_kind text NOT NULL
    CHECK (source_kind IN ('bank', 'cash', 'petty_cash', 'clearing', 'other')),
  scope_kind text NOT NULL
    CHECK (scope_kind IN ('organization_pooled', 'property_dedicated')),
  masked_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT financial_reconciliation_sources_code_check
    CHECK (
      length(code) BETWEEN 2 AND 40
      AND code = upper(code)
      AND code ~ '^[A-Z0-9][A-Z0-9_-]*$'
    ),
  CONSTRAINT financial_reconciliation_sources_display_name_check
    CHECK (length(trim(display_name)) BETWEEN 2 AND 120),
  CONSTRAINT financial_reconciliation_sources_masked_reference_check
    CHECK (
      masked_reference IS NULL
      OR length(trim(masked_reference)) BETWEEN 2 AND 80
    ),
  CONSTRAINT financial_reconciliation_sources_scope_check
    CHECK (
      (scope_kind = 'organization_pooled' AND property_id IS NULL)
      OR (scope_kind = 'property_dedicated' AND property_id IS NOT NULL)
    ),
  CONSTRAINT financial_reconciliation_sources_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT financial_reconciliation_sources_org_code_unique
    UNIQUE (organization_id, code),
  CONSTRAINT financial_reconciliation_sources_organization_id_id_key
    UNIQUE (organization_id, id)
);

CREATE INDEX financial_reconciliation_sources_selector_idx
  ON public.financial_reconciliation_sources(
    organization_id,
    currency,
    scope_kind,
    property_id,
    code
  )
  WHERE archived_at IS NULL;

CREATE INDEX financial_reconciliation_sources_property_idx
  ON public.financial_reconciliation_sources(property_id)
  WHERE property_id IS NOT NULL;

CREATE TRIGGER set_financial_reconciliation_sources_updated_at
BEFORE UPDATE ON public.financial_reconciliation_sources
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.financial_reconciliation_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization admins can read financial reconciliation sources"
ON public.financial_reconciliation_sources
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

REVOKE ALL ON TABLE public.financial_reconciliation_sources
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.financial_reconciliation_sources
TO authenticated;

ALTER TABLE public.finance_receipts
  ADD COLUMN reconciliation_source_id uuid;

ALTER TABLE public.finance_payments
  ADD COLUMN reconciliation_source_id uuid;

ALTER TABLE public.lease_deposit_events
  ADD COLUMN reconciliation_source_id uuid;

ALTER TABLE public.petty_cash_entries
  ADD COLUMN reconciliation_source_id uuid;

ALTER TABLE public.finance_receipts
  ADD CONSTRAINT finance_receipts_org_reconciliation_source_fkey
  FOREIGN KEY (organization_id, reconciliation_source_id)
  REFERENCES public.financial_reconciliation_sources(organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.finance_payments
  ADD CONSTRAINT finance_payments_org_reconciliation_source_fkey
  FOREIGN KEY (organization_id, reconciliation_source_id)
  REFERENCES public.financial_reconciliation_sources(organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.lease_deposit_events
  ADD CONSTRAINT lease_deposit_events_org_reconciliation_source_fkey
  FOREIGN KEY (organization_id, reconciliation_source_id)
  REFERENCES public.financial_reconciliation_sources(organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.petty_cash_entries
  ADD CONSTRAINT petty_cash_entries_org_reconciliation_source_fkey
  FOREIGN KEY (organization_id, reconciliation_source_id)
  REFERENCES public.financial_reconciliation_sources(organization_id, id)
  ON DELETE RESTRICT;

CREATE INDEX finance_receipts_reconciliation_source_idx
  ON public.finance_receipts(organization_id, reconciliation_source_id)
  WHERE reconciliation_source_id IS NOT NULL;

CREATE INDEX finance_payments_reconciliation_source_idx
  ON public.finance_payments(organization_id, reconciliation_source_id)
  WHERE reconciliation_source_id IS NOT NULL;

CREATE INDEX lease_deposit_events_reconciliation_source_idx
  ON public.lease_deposit_events(organization_id, reconciliation_source_id)
  WHERE reconciliation_source_id IS NOT NULL;

CREATE INDEX petty_cash_entries_reconciliation_source_idx
  ON public.petty_cash_entries(organization_id, reconciliation_source_id)
  WHERE reconciliation_source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.enforce_reconciliation_source_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.financial_reconciliation_sources%ROWTYPE;
BEGIN
  IF NEW.reconciliation_source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT source.*
  INTO v_source
  FROM public.financial_reconciliation_sources AS source
  WHERE source.id = NEW.reconciliation_source_id
    AND source.organization_id = NEW.organization_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial reconciliation source is outside the organization'
      USING ERRCODE = '23503';
  END IF;

  IF v_source.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Financial reconciliation source is archived'
      USING ERRCODE = '22023';
  END IF;

  IF v_source.currency <> NEW.currency THEN
    RAISE EXCEPTION 'Financial reconciliation source currency does not match'
      USING ERRCODE = '22023';
  END IF;

  IF v_source.scope_kind = 'property_dedicated'
    AND v_source.property_id IS DISTINCT FROM NEW.property_id THEN
    RAISE EXCEPTION 'Dedicated financial reconciliation source does not match the property'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_reconciliation_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_referenced boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Financial reconciliation sources cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF coalesce(
    current_setting('app.financial_reconciliation_source_context', true),
    'off'
  ) <> 'on' THEN
    RAISE EXCEPTION 'Financial reconciliation sources require the checked admin workflow'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.property_id IS DISTINCT FROM NEW.property_id
      OR OLD.currency IS DISTINCT FROM NEW.currency
      OR OLD.code IS DISTINCT FROM NEW.code
      OR OLD.source_kind IS DISTINCT FROM NEW.source_kind
      OR OLD.scope_kind IS DISTINCT FROM NEW.scope_kind
    ) THEN
    SELECT
      EXISTS (
        SELECT 1 FROM public.finance_receipts
        WHERE reconciliation_source_id = OLD.id
      )
      OR EXISTS (
        SELECT 1 FROM public.finance_payments
        WHERE reconciliation_source_id = OLD.id
      )
      OR EXISTS (
        SELECT 1 FROM public.lease_deposit_events
        WHERE reconciliation_source_id = OLD.id
      )
      OR EXISTS (
        SELECT 1 FROM public.petty_cash_entries
        WHERE reconciliation_source_id = OLD.id
      )
    INTO v_is_referenced;

    IF v_is_referenced THEN
      RAISE EXCEPTION 'Referenced financial reconciliation source scope is immutable'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.enforce_reconciliation_source_link(),
  app_private.enforce_reconciliation_source_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_finance_receipt_reconciliation_source
BEFORE INSERT OR UPDATE OF
  organization_id,
  property_id,
  currency,
  reconciliation_source_id
ON public.finance_receipts
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_reconciliation_source_link();

CREATE TRIGGER enforce_finance_payment_reconciliation_source
BEFORE INSERT OR UPDATE OF
  organization_id,
  property_id,
  currency,
  reconciliation_source_id
ON public.finance_payments
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_reconciliation_source_link();

CREATE TRIGGER enforce_lease_deposit_reconciliation_source
BEFORE INSERT OR UPDATE OF
  organization_id,
  property_id,
  currency,
  reconciliation_source_id
ON public.lease_deposit_events
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_reconciliation_source_link();

CREATE TRIGGER enforce_petty_cash_reconciliation_source
BEFORE INSERT OR UPDATE OF
  organization_id,
  property_id,
  currency,
  reconciliation_source_id
ON public.petty_cash_entries
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_reconciliation_source_link();

CREATE TRIGGER enforce_financial_reconciliation_source_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_reconciliation_sources
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_reconciliation_source_mutation();

CREATE OR REPLACE FUNCTION public.create_financial_reconciliation_source(
  p_organization_id uuid,
  p_code text,
  p_display_name text,
  p_source_kind text,
  p_scope_kind text,
  p_currency public.currency_code,
  p_property_id uuid DEFAULT NULL,
  p_masked_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_source_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'on',
    true
  );

  INSERT INTO public.financial_reconciliation_sources (
    organization_id,
    property_id,
    currency,
    code,
    display_name,
    source_kind,
    scope_kind,
    masked_reference,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_currency,
    upper(trim(coalesce(p_code, ''))),
    trim(coalesce(p_display_name, '')),
    lower(trim(coalesce(p_source_kind, ''))),
    lower(trim(coalesce(p_scope_kind, ''))),
    nullif(trim(coalesce(p_masked_reference, '')), ''),
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_source_id;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'off',
    true
  );

  RETURN v_source_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_financial_reconciliation_source_label(
  p_organization_id uuid,
  p_source_id uuid,
  p_display_name text,
  p_masked_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'on',
    true
  );

  UPDATE public.financial_reconciliation_sources
  SET display_name = trim(coalesce(p_display_name, '')),
      masked_reference = nullif(
        trim(coalesce(p_masked_reference, '')),
        ''
      ),
      updated_by = v_actor_id
  WHERE id = p_source_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial reconciliation source not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'off',
    true
  );

  RETURN p_source_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_financial_reconciliation_source(
  p_organization_id uuid,
  p_source_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'on',
    true
  );

  UPDATE public.financial_reconciliation_sources
  SET archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, v_actor_id),
      updated_by = v_actor_id
  WHERE id = p_source_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial reconciliation source not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config(
    'app.financial_reconciliation_source_context',
    'off',
    true
  );

  RETURN p_source_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.create_financial_reconciliation_source(
    uuid,
    text,
    text,
    text,
    text,
    public.currency_code,
    uuid,
    text
  ),
  public.update_financial_reconciliation_source_label(
    uuid,
    uuid,
    text,
    text
  ),
  public.archive_financial_reconciliation_source(uuid, uuid)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.create_financial_reconciliation_source(
    uuid,
    text,
    text,
    text,
    text,
    public.currency_code,
    uuid,
    text
  ),
  public.update_financial_reconciliation_source_label(
    uuid,
    uuid,
    text,
    text
  ),
  public.archive_financial_reconciliation_source(uuid, uuid)
TO authenticated;

CREATE TABLE app_private.financial_idempotency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  result_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT financial_idempotency_operation_check
    CHECK (length(trim(operation)) BETWEEN 2 AND 80),
  CONSTRAINT financial_idempotency_key_check
    CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 160),
  CONSTRAINT financial_idempotency_payload_hash_check
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT financial_idempotency_completion_check
    CHECK (
      (
        status = 'pending'
        AND result_ids IS NULL
        AND completed_at IS NULL
      )
      OR (
        status = 'completed'
        AND result_ids IS NOT NULL
        AND completed_at IS NOT NULL
      )
    ),
  CONSTRAINT financial_idempotency_scope_unique
    UNIQUE (organization_id, operation, idempotency_key)
);

CREATE INDEX financial_idempotency_actor_idx
  ON app_private.financial_idempotency_requests(
    organization_id,
    actor_id,
    created_at DESC
  );

REVOKE ALL ON TABLE app_private.financial_idempotency_requests
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.canonical_financial_payload_hash(
  p_payload jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT encode(
    extensions.digest(p_payload::text, 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.claim_financial_idempotency(
  p_organization_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_actor_id uuid,
  p_payload jsonb
)
RETURNS TABLE (
  request_id uuid,
  is_replay boolean,
  result_ids jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation text := lower(trim(coalesce(p_operation, '')));
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_payload_hash text;
  v_existing app_private.financial_idempotency_requests%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL
    OR p_actor_id IS NULL
    OR p_payload IS NULL
    OR length(v_operation) < 2
    OR length(v_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Financial idempotency identity is required'
      USING ERRCODE = '22023';
  END IF;

  v_payload_hash :=
    app_private.canonical_financial_payload_hash(p_payload);

  -- The property-period lock must already be held by future callers. This is
  -- the mandatory fourth lock, before any domain or projection row.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(
        ':',
        'financial_idempotency_v1',
        p_organization_id,
        v_operation,
        v_idempotency_key
      ),
      0
    )
  );

  SELECT request.*
  INTO v_existing
  FROM app_private.financial_idempotency_requests AS request
  WHERE request.organization_id = p_organization_id
    AND request.operation = v_operation
    AND request.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id
      OR v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'Conflicting financial idempotency request'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.status = 'completed',
      CASE
        WHEN v_existing.status = 'completed' THEN v_existing.result_ids
        ELSE NULL::jsonb
      END;
    RETURN;
  END IF;

  INSERT INTO app_private.financial_idempotency_requests (
    organization_id,
    operation,
    idempotency_key,
    actor_id,
    payload_hash
  )
  VALUES (
    p_organization_id,
    v_operation,
    v_idempotency_key,
    p_actor_id,
    v_payload_hash
  )
  RETURNING * INTO v_existing;

  RETURN QUERY
  SELECT v_existing.id, false, NULL::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.complete_financial_idempotency(
  p_request_id uuid,
  p_organization_id uuid,
  p_actor_id uuid,
  p_result_ids jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request app_private.financial_idempotency_requests%ROWTYPE;
BEGIN
  IF p_request_id IS NULL
    OR p_organization_id IS NULL
    OR p_actor_id IS NULL
    OR p_result_ids IS NULL
    OR jsonb_typeof(p_result_ids) NOT IN ('array', 'object') THEN
    RAISE EXCEPTION 'Completed financial idempotency results are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_request
  FROM app_private.financial_idempotency_requests AS request
  WHERE request.id = p_request_id
    AND request.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_request.actor_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Conflicting financial idempotency request'
      USING ERRCODE = '22023';
  END IF;

  IF v_request.status = 'completed' THEN
    IF v_request.result_ids = p_result_ids THEN
      RETURN v_request.result_ids;
    END IF;

    RAISE EXCEPTION 'Conflicting financial idempotency request'
      USING ERRCODE = '22023';
  END IF;

  UPDATE app_private.financial_idempotency_requests
  SET status = 'completed',
      result_ids = p_result_ids,
      completed_at = now()
  WHERE id = v_request.id
  RETURNING result_ids INTO v_request.result_ids;

  RETURN v_request.result_ids;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.canonical_financial_payload_hash(jsonb),
  app_private.claim_financial_idempotency(
    uuid,
    text,
    text,
    uuid,
    jsonb
  ),
  app_private.complete_financial_idempotency(uuid, uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT ledger_entries_source_type_check;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_source_type_check
  CHECK (
    (
      source_type IN (
        'manual',
        'finance_income',
        'finance_expense',
        'petty_cash',
        'maintenance_task'
      )
      OR app_private.is_reserved_financial_source_type(source_type)
    )
    AND (
      NOT app_private.is_reserved_financial_source_type(source_type)
      OR (
        source_type = lower(btrim(source_type))
        AND source_id IS NOT NULL
      )
    )
  );

ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_reserved_source_canonical_check
  CHECK (
    NOT app_private.is_reserved_financial_source_type(source_type)
    OR source_type = lower(btrim(source_type))
  );

CREATE UNIQUE INDEX ledger_entries_reserved_source_unique_idx
  ON public.ledger_entries(
    organization_id,
    (lower(btrim(source_type))),
    source_id
  )
  WHERE source_id IS NOT NULL
    AND app_private.is_reserved_financial_source_type(source_type);

CREATE UNIQUE INDEX accounting_journal_reserved_source_unique_idx
  ON public.accounting_journal_entries(
    organization_id,
    book_id,
    (lower(btrim(source_type))),
    source_id
  )
  WHERE app_private.is_reserved_financial_source_type(source_type);

CREATE TABLE app_private.financial_projection_context_capability (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  capability_token text NOT NULL UNIQUE
    CHECK (capability_token ~ '^[0-9a-f]{64}$')
);

INSERT INTO app_private.financial_projection_context_capability(
  singleton,
  capability_token
)
VALUES (
  true,
  encode(extensions.gen_random_bytes(32), 'hex')
);

REVOKE ALL ON TABLE
  app_private.financial_projection_context_capability
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.set_financial_projection_context(
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capability_token text;
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Projection context state is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.financial_projection_context_capability AS capability
  WHERE capability.singleton;

  PERFORM set_config(
    'app.financial_projection_context',
    CASE WHEN p_enabled THEN v_capability_token ELSE 'off' END,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_reserved_ledger_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_reserved boolean := false;
  v_new_reserved boolean := false;
  v_capability_token text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_reserved :=
      app_private.is_reserved_financial_source_type(OLD.source_type);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_reserved :=
      app_private.is_reserved_financial_source_type(NEW.source_type);
  END IF;

  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.financial_projection_context_capability AS capability
  WHERE capability.singleton;

  IF (v_old_reserved OR v_new_reserved)
    AND current_setting(
      'app.financial_projection_context',
      true
    ) IS DISTINCT FROM v_capability_token THEN
    RAISE EXCEPTION
      'Reserved financial projection must use its domain source workflow'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_reserved_journal_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_reserved boolean := false;
  v_new_reserved boolean := false;
  v_capability_token text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_reserved :=
      app_private.is_reserved_financial_source_type(OLD.source_type);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_reserved :=
      app_private.is_reserved_financial_source_type(NEW.source_type);
  END IF;

  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.financial_projection_context_capability AS capability
  WHERE capability.singleton;

  IF (v_old_reserved OR v_new_reserved)
    AND current_setting(
      'app.financial_projection_context',
      true
    ) IS DISTINCT FROM v_capability_token THEN
    RAISE EXCEPTION
      'Reserved financial projection must use its domain source workflow'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.set_financial_projection_context(boolean),
  app_private.enforce_reserved_ledger_projection(),
  app_private.enforce_reserved_journal_projection()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_reserved_ledger_projection
BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_reserved_ledger_projection();

CREATE TRIGGER enforce_reserved_journal_projection
BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_journal_entries
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_reserved_journal_projection();

CREATE OR REPLACE FUNCTION public.post_accounting_journal(
  p_organization_id uuid,
  p_book_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_posting_key text,
  p_entry_date date,
  p_currency public.currency_code,
  p_description text,
  p_reference text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF app_private.is_reserved_financial_source_type(p_source_type) THEN
    RAISE EXCEPTION
      'Reserved financial projection must use its domain source workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN app_private.post_accounting_journal_internal(
    p_organization_id,
    p_book_id,
    p_source_type,
    p_source_id,
    p_posting_key,
    p_entry_date,
    p_currency,
    p_description,
    p_reference,
    p_lines,
    actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_accounting_journal(
  p_organization_id uuid,
  p_journal_id uuid,
  p_reversal_date date,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  v_source_type text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT journal.source_type
  INTO v_source_type
  FROM public.accounting_journal_entries AS journal
  WHERE journal.id = p_journal_id
    AND journal.organization_id = p_organization_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounting journal not found'
      USING ERRCODE = '23503';
  END IF;

  IF app_private.is_reserved_financial_source_type(v_source_type) THEN
    RAISE EXCEPTION
      'Reserved financial projection must use its domain source workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN app_private.reverse_accounting_journal_internal(
    p_organization_id,
    p_journal_id,
    p_reversal_date,
    p_reason,
    actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.post_accounting_journal(
    uuid,
    uuid,
    text,
    uuid,
    text,
    date,
    public.currency_code,
    text,
    text,
    jsonb
  ),
  public.reverse_accounting_journal(uuid, uuid, date, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.post_accounting_journal(
    uuid,
    uuid,
    text,
    uuid,
    text,
    date,
    public.currency_code,
    text,
    text,
    jsonb
  ),
  public.reverse_accounting_journal(uuid, uuid, date, text)
TO authenticated;

-- Preserve the reviewed v1 SQL source matrix and SECURITY INVOKER boundary.
-- This append-only migration changes only the final projection so the exact
-- source link can replace the previous explicit missing identity.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old_fragment text := $old$
  SELECT event.*
  FROM all_events AS event
  WHERE p_after_source_type IS NULL
    OR (
      p_after_event_date IS NULL
      AND event.event_date IS NULL
      AND (event.source_type, event.source_id)
        > (p_after_source_type, p_after_source_id)
    )
    OR (
      p_after_event_date IS NOT NULL
      AND (
        event.event_date > p_after_event_date
        OR event.event_date IS NULL
        OR (
          event.event_date = p_after_event_date
          AND (event.source_type, event.source_id)
            > (p_after_source_type, p_after_source_id)
        )
      )
    )
  ORDER BY
    event.event_date ASC NULLS LAST,
    event.source_type ASC,
    event.source_id ASC
  LIMIT p_page_size;$old$;
  v_new_fragment text := $new$
  SELECT
    event.contract_version,
    event.event_key,
    event.organization_id,
    event.property_id,
    event.unit_id,
    event.lease_id,
    event.task_id,
    event.owner_person_id,
    event.tenant_person_id,
    event.vendor_person_id,
    event.event_date,
    event.period_start,
    event.currency,
    event.amount,
    event.owner_cash_effect,
    event.operating_cash_effect,
    event.deposit_liability_effect,
    event.management_fee_effect,
    event.economic_class,
    event.statement_section,
    event.category_code,
    event.classification_status,
    event.source_type,
    event.source_id,
    event.source_parent_type,
    event.source_parent_id,
    event.obligation_type,
    event.obligation_id,
    event.reversal_source_type,
    event.reversal_source_id,
    event.is_reversal,
    event.is_legacy,
    CASE
      WHEN event.linked_reconciliation_source_id IS NOT NULL THEN
        coalesce(
          cardinality(array_remove(
            coalesce(event.resolution_codes, ARRAY[]::text[]),
            'missing_reconciliation_source'
          )),
          0
        ) > 0
      ELSE event.requires_resolution
    END AS requires_resolution,
    CASE
      WHEN event.linked_reconciliation_source_id IS NOT NULL THEN
        array_remove(
          coalesce(event.resolution_codes, ARRAY[]::text[]),
          'missing_reconciliation_source'
        )
      ELSE event.resolution_codes
    END AS resolution_codes,
    coalesce(
      event.linked_reconciliation_source_id,
      event.reconciliation_source_id
    ) AS reconciliation_source_id,
    CASE
      WHEN event.linked_reconciliation_source_id IS NOT NULL
        THEN 'linked_exact_identity'
      ELSE event.reconciliation_state
    END AS reconciliation_state,
    event.ledger_entry_id,
    event.journal_entry_id,
    event.projection_status,
    event.created_at,
    event.created_by,
    event.updated_at,
    event.updated_by,
    event.archived_at
  FROM (
    SELECT
      source_event.*,
      CASE source_event.source_type
        WHEN 'receipt_allocation' THEN (
          SELECT receipt.reconciliation_source_id
          FROM public.finance_receipt_allocations AS allocation
          JOIN public.finance_receipts AS receipt
            ON receipt.id = allocation.receipt_id
           AND receipt.organization_id = allocation.organization_id
          WHERE allocation.id = source_event.source_id
            AND allocation.organization_id = source_event.organization_id
        )
        WHEN 'receipt_header_residual' THEN (
          SELECT receipt.reconciliation_source_id
          FROM public.finance_receipts AS receipt
          WHERE receipt.id = source_event.source_id
            AND receipt.organization_id = source_event.organization_id
        )
        WHEN 'payment_allocation' THEN (
          SELECT payment.reconciliation_source_id
          FROM public.finance_payment_allocations AS allocation
          JOIN public.finance_payments AS payment
            ON payment.id = allocation.payment_id
           AND payment.organization_id = allocation.organization_id
          WHERE allocation.id = source_event.source_id
            AND allocation.organization_id = source_event.organization_id
        )
        WHEN 'payment_header_residual' THEN (
          SELECT payment.reconciliation_source_id
          FROM public.finance_payments AS payment
          WHERE payment.id = source_event.source_id
            AND payment.organization_id = source_event.organization_id
        )
        WHEN 'deposit_event' THEN (
          SELECT deposit.reconciliation_source_id
          FROM public.lease_deposit_events AS deposit
          WHERE deposit.id = source_event.source_id
            AND deposit.organization_id = source_event.organization_id
        )
        WHEN 'petty_cash_entry' THEN (
          SELECT petty.reconciliation_source_id
          FROM public.petty_cash_entries AS petty
          WHERE petty.id = source_event.source_id
            AND petty.organization_id = source_event.organization_id
        )
        ELSE NULL::uuid
      END AS linked_reconciliation_source_id
    FROM all_events AS source_event
  ) AS event
  WHERE p_after_source_type IS NULL
    OR (
      p_after_event_date IS NULL
      AND event.event_date IS NULL
      AND (event.source_type, event.source_id)
        > (p_after_source_type, p_after_source_id)
    )
    OR (
      p_after_event_date IS NOT NULL
      AND (
        event.event_date > p_after_event_date
        OR event.event_date IS NULL
        OR (
          event.event_date = p_after_event_date
          AND (event.source_type, event.source_id)
            > (p_after_source_type, p_after_source_id)
        )
      )
    )
  ORDER BY
    event.event_date ASC NULLS LAST,
    event.source_type ASC,
    event.source_id ASC
  LIMIT p_page_size;$new$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(routine.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND routine.proname = 'get_property_cash_events_v1_page'
    AND pg_catalog.pg_get_function_identity_arguments(routine.oid) =
      'p_organization_id uuid, p_property_id uuid, p_currency currency_code, p_period_start date, p_period_end date, p_after_event_date date, p_after_source_type text, p_after_source_id uuid, p_page_size integer';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Property cash events v1 function was not found';
  END IF;

  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_old_fragment := replace(v_old_fragment, E'\r\n', E'\n');
  v_new_fragment := replace(v_new_fragment, E'\r\n', E'\n');
  v_patched := replace(v_definition, v_old_fragment, v_new_fragment);

  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'Property cash events v1 projection did not match the reviewed baseline';
  END IF;

  EXECUTE v_patched;
END;
$migration$;

CREATE OR REPLACE FUNCTION app_private.finance_inventory_reconciliation_source_id(
  p_organization_id uuid,
  p_source_type text,
  p_source_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_source_type
    WHEN 'receipt_allocation' THEN (
      SELECT receipt.reconciliation_source_id
      FROM public.finance_receipt_allocations AS allocation
      JOIN public.finance_receipts AS receipt
        ON receipt.id = allocation.receipt_id
       AND receipt.organization_id = allocation.organization_id
      WHERE allocation.id = p_source_id
        AND allocation.organization_id = p_organization_id
    )
    WHEN 'payment_allocation' THEN (
      SELECT payment.reconciliation_source_id
      FROM public.finance_payment_allocations AS allocation
      JOIN public.finance_payments AS payment
        ON payment.id = allocation.payment_id
       AND payment.organization_id = allocation.organization_id
      WHERE allocation.id = p_source_id
        AND allocation.organization_id = p_organization_id
    )
    WHEN 'deposit_event' THEN (
      SELECT deposit.reconciliation_source_id
      FROM public.lease_deposit_events AS deposit
      WHERE deposit.id = p_source_id
        AND deposit.organization_id = p_organization_id
    )
    WHEN 'petty_cash_entry' THEN (
      SELECT petty.reconciliation_source_id
      FROM public.petty_cash_entries AS petty
      WHERE petty.id = p_source_id
        AND petty.organization_id = p_organization_id
    )
    ELSE NULL::uuid
  END;
$$;

REVOKE ALL ON FUNCTION
  app_private.finance_inventory_reconciliation_source_id(uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_before text;
  v_old_fragment text := $old$
  SELECT
    'finance_inventory_v2'::text,
    selected.section,
    selected.stable_key,
    selected.payload
  FROM selected
  WHERE p_after_key IS NULL OR selected.stable_key > p_after_key
  ORDER BY selected.stable_key
  LIMIT p_limit;$old$;
  v_new_fragment text := $new$
  SELECT
    'finance_inventory_v3'::text,
    inventory.section,
    inventory.stable_key,
    CASE
      WHEN inventory.section = 'watermark' THEN
        inventory.payload || jsonb_build_object(
          'hash',
          md5(
            coalesce(inventory.payload ->> 'hash', '')
            || '|financial_reconciliation_sources:'
            || coalesce((
              SELECT string_agg(
                to_jsonb(source)::text,
                '|' ORDER BY source.id
              )
              FROM public.financial_reconciliation_sources AS source
              WHERE source.organization_id = p_organization_id
                AND source.currency = p_currency
                AND (
                  source.scope_kind = 'organization_pooled'
                  OR source.property_id = p_property_id
                )
            ), '')
            || '|property_reporting_periods:'
            || coalesce((
              SELECT string_agg(
                to_jsonb(reporting_period)::text,
                '|' ORDER BY reporting_period.id
              )
              FROM public.property_reporting_periods AS reporting_period
              WHERE reporting_period.organization_id = p_organization_id
                AND reporting_period.property_id = p_property_id
                AND reporting_period.currency = p_currency
                AND reporting_period.period_start BETWEEN
                  date_trunc('month', p_period_start)::date
                  AND date_trunc('month', p_period_end)::date
            ), '')
            || '|property_close_revisions:'
            || coalesce((
              SELECT string_agg(
                to_jsonb(revision)::text,
                '|' ORDER BY revision.id
              )
              FROM public.property_close_revisions AS revision
              JOIN public.property_reporting_periods AS reporting_period
                ON reporting_period.id =
                  revision.property_reporting_period_id
               AND reporting_period.organization_id =
                  revision.organization_id
              WHERE reporting_period.organization_id = p_organization_id
                AND reporting_period.property_id = p_property_id
                AND reporting_period.currency = p_currency
                AND reporting_period.period_start BETWEEN
                  date_trunc('month', p_period_start)::date
                  AND date_trunc('month', p_period_end)::date
            ), '')
          ),
          'rowCount',
          (inventory.payload ->> 'rowCount')::bigint + (
            SELECT count(*)
            FROM public.financial_reconciliation_sources AS source
            WHERE source.organization_id = p_organization_id
              AND source.currency = p_currency
              AND (
                source.scope_kind = 'organization_pooled'
                OR source.property_id = p_property_id
              )
          ) + (
            SELECT count(*)
            FROM public.property_reporting_periods AS reporting_period
            WHERE reporting_period.organization_id = p_organization_id
              AND reporting_period.property_id = p_property_id
              AND reporting_period.currency = p_currency
              AND reporting_period.period_start BETWEEN
                date_trunc('month', p_period_start)::date
                AND date_trunc('month', p_period_end)::date
          ) + (
            SELECT count(*)
            FROM public.property_close_revisions AS revision
            JOIN public.property_reporting_periods AS reporting_period
              ON reporting_period.id = revision.property_reporting_period_id
             AND reporting_period.organization_id = revision.organization_id
            WHERE reporting_period.organization_id = p_organization_id
              AND reporting_period.property_id = p_property_id
              AND reporting_period.currency = p_currency
              AND reporting_period.period_start BETWEEN
                date_trunc('month', p_period_start)::date
                AND date_trunc('month', p_period_end)::date
          )
        )
      WHEN inventory.payload ->> 'sourceType' IN (
        'receipt_allocation',
        'payment_allocation',
        'deposit_event',
        'petty_cash_entry'
      ) THEN
        inventory.payload || jsonb_build_object(
          'reconciliationSourceId',
          link.reconciliation_source_id,
          'reconciliationSourceState',
          CASE
            WHEN link.reconciliation_source_id IS NULL
              THEN 'missing_stable_identity'
            ELSE 'linked_exact_identity'
          END
        )
      ELSE inventory.payload
    END AS payload
  FROM (
    SELECT
      selected.section,
      selected.stable_key,
      selected.payload
    FROM selected

    UNION ALL

    SELECT
      'diagnostics'::text,
      'MISSING_STABLE_RECONCILIATION_IDENTITY:petty_cash_entry:'
        || (source.payload ->> 'sourceId'),
      jsonb_build_object(
        'issueCode', 'MISSING_STABLE_RECONCILIATION_IDENTITY',
        'severity', 'High',
        'organizationId', p_organization_id,
        'propertyId', p_property_id,
        'sourceType', 'petty_cash_entry',
        'sourceId', source.payload ->> 'sourceId',
        'parentTransactionId', source.payload ->> 'parentTransactionId',
        'sourceReference', source.payload ->> 'sourceReference',
        'eventDate', source.payload ->> 'eventDate',
        'currency', source.payload ->> 'currency',
        'reconciliationSourceState', 'missing_stable_identity',
        'affectedSurfaces', source.payload -> 'affectedSurfaces',
        'affectedEconomicArea', coalesce(
          source.payload ->> 'economicArea',
          'reconciliation'
        ),
        'explanation',
          'Current source has no stable exact reconciliation identity.',
        'proposedResolutionClass', 'ambiguous_requires_resolution'
      )
    FROM source_rows AS source
    WHERE p_section = 'diagnostics'
      AND source.payload ->> 'sourceType' = 'petty_cash_entry'
      AND (
        p_issue_codes IS NULL
        OR 'MISSING_STABLE_RECONCILIATION_IDENTITY' = ANY(p_issue_codes)
      )
      AND (
        p_source_types IS NULL
        OR 'petty_cash_entry' = ANY(p_source_types)
      )
      AND app_private.finance_inventory_reconciliation_source_id(
        p_organization_id,
        'petty_cash_entry',
        (source.payload ->> 'sourceId')::uuid
      ) IS NULL
  ) AS inventory
  LEFT JOIN LATERAL (
    SELECT app_private.finance_inventory_reconciliation_source_id(
      p_organization_id,
      inventory.payload ->> 'sourceType',
      CASE
        WHEN coalesce(inventory.payload ->> 'sourceId', '') ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (inventory.payload ->> 'sourceId')::uuid
        ELSE NULL::uuid
      END
    ) AS reconciliation_source_id
  ) AS link ON true
  WHERE (
      p_after_key IS NULL
      OR inventory.stable_key > p_after_key
    )
    AND NOT (
      inventory.section = 'diagnostics'
      AND inventory.payload ->> 'issueCode' =
        'MISSING_STABLE_RECONCILIATION_IDENTITY'
      AND link.reconciliation_source_id IS NOT NULL
    )
  ORDER BY inventory.stable_key
  LIMIT p_limit;$new$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.get_finance_inventory_page(uuid,uuid,public.currency_code,date,date,text,text,integer,text[],text[])'::regprocedure
  )
  INTO v_definition;

  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_old_fragment := replace(v_old_fragment, E'\r\n', E'\n');
  v_new_fragment := replace(v_new_fragment, E'\r\n', E'\n');
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    replace(
      $old$      'accounting_periods'
    ])$old$,
      E'\r\n',
      E'\n'
    ),
    replace(
      $new$      'accounting_periods',
      'property_reporting_periods',
      'property_close_revisions',
      'financial_reconciliation_sources'
    ])$new$,
      E'\r\n',
      E'\n'
    )
  );

  IF v_definition = v_before THEN
    RAISE EXCEPTION
      'Finance inventory watermark privilege list did not match the reviewed baseline';
  END IF;

  v_before := v_definition;
  v_definition := replace(
    v_definition,
    replace(
      $old$        'accounting_periods'
      ])$old$,
      E'\r\n',
      E'\n'
    ),
    replace(
      $new$        'accounting_periods',
        'property_reporting_periods',
        'property_close_revisions',
        'financial_reconciliation_sources'
      ])$new$,
      E'\r\n',
      E'\n'
    )
  );

  IF v_definition = v_before THEN
    RAISE EXCEPTION
      'Finance inventory watermark policy lists did not match the reviewed baseline';
  END IF;

  v_patched := replace(v_definition, v_old_fragment, v_new_fragment);

  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'Finance inventory projection did not match the reviewed baseline';
  END IF;

  EXECUTE v_patched;
END;
$migration$;
