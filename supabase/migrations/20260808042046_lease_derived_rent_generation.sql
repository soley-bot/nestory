-- Lease-derived rent generation.
--
-- This migration deliberately leaves the historical migrations intact.  It
-- replaces the callable manual paths at the current schema boundary and keeps
-- one invoice identity per organization, lease, and month.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- A due date is not a rent-period identity. Under the supported
-- next-calendar-month rule, consecutive billing periods can legitimately have
-- the same due date (for example February and March both due on March 31).
ALTER TABLE public.finance_income_items
  ADD COLUMN rent_billing_period_start date,
  ADD CONSTRAINT finance_income_items_rent_billing_period_check
    CHECK (
      rent_billing_period_start IS NULL
      OR (
        income_type = 'rent'
        AND rent_billing_period_start =
          date_trunc('month', rent_billing_period_start)::date
      )
    );

DROP INDEX IF EXISTS public.finance_income_items_org_lease_rent_due_unique;

CREATE UNIQUE INDEX finance_income_items_org_lease_rent_period_unique
  ON public.finance_income_items (
    organization_id,
    lease_id,
    rent_billing_period_start
  )
  WHERE archived_at IS NULL
    AND lease_id IS NOT NULL
    AND income_type = 'rent'
    AND rent_billing_period_start IS NOT NULL;

ALTER TABLE public.tenant_invoices
  ADD COLUMN lease_term_id uuid,
  ADD COLUMN rent_policy_version_id uuid,
  ADD COLUMN generation_source text,
  ADD COLUMN generated_at timestamptz,
  ADD COLUMN base_rent_amount numeric(14, 2),
  ADD COLUMN is_prorated boolean,
  ADD COLUMN management_fee_mode text,
  ADD COLUMN management_fee_value numeric(14, 4),
  ADD COLUMN management_fee_amount numeric(14, 2),
  ADD CONSTRAINT tenant_invoices_lease_term_fkey
    FOREIGN KEY (organization_id, lease_id, lease_term_id)
    REFERENCES public.lease_terms(organization_id, lease_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_invoices_rent_policy_fkey
    FOREIGN KEY (organization_id, rent_policy_version_id)
    REFERENCES public.rent_policy_versions(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_invoices_generation_source_check
    CHECK (
      generation_source IS NULL
      OR generation_source IN (
        'scheduled',
        'activation_catch_up',
        'manual_recovery'
      )
    ),
  ADD CONSTRAINT tenant_invoices_generation_provenance_check
    CHECK (
      generation_source IS NULL
      OR (
        lease_term_id IS NOT NULL
        AND rent_policy_version_id IS NOT NULL
        AND generated_at IS NOT NULL
        AND base_rent_amount > 0
        AND is_prorated IS NOT NULL
        AND management_fee_mode IN ('flat', 'percentage')
        AND management_fee_value >= 0
        AND management_fee_amount >= 0
      )
    );

CREATE INDEX tenant_invoices_generation_source_idx
  ON public.tenant_invoices (
    organization_id,
    generation_source,
    billing_period_start DESC
  )
  WHERE generation_source IS NOT NULL;

CREATE TABLE public.rent_generation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  billing_period_start date NOT NULL,
  generation_source text NOT NULL,
  error_code text NOT NULL,
  safe_message text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rent_generation_exceptions_lease_period_unique
    UNIQUE (organization_id, lease_id, billing_period_start),
  CONSTRAINT rent_generation_exceptions_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT rent_generation_exceptions_lease_fkey
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT rent_generation_exceptions_invoice_fkey
    FOREIGN KEY (organization_id, resolved_invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rent_generation_exceptions_period_check
    CHECK (
      billing_period_start = date_trunc('month', billing_period_start)::date
    ),
  CONSTRAINT rent_generation_exceptions_source_check
    CHECK (
      generation_source IN (
        'scheduled',
        'activation_catch_up',
        'manual_recovery'
      )
    ),
  CONSTRAINT rent_generation_exceptions_code_check
    CHECK (length(trim(error_code)) > 0),
  CONSTRAINT rent_generation_exceptions_message_check
    CHECK (length(trim(safe_message)) > 0),
  CONSTRAINT rent_generation_exceptions_attempt_count_check
    CHECK (attempt_count > 0),
  CONSTRAINT rent_generation_exceptions_resolution_check
    CHECK (
      (resolved_at IS NULL AND resolved_invoice_id IS NULL)
      OR (resolved_at IS NOT NULL AND resolved_invoice_id IS NOT NULL)
    )
);

CREATE INDEX rent_generation_exceptions_worklist_idx
  ON public.rent_generation_exceptions (
    organization_id,
    resolved_at,
    last_attempt_at DESC,
    id
  );

CREATE TRIGGER set_rent_generation_exceptions_updated_at
BEFORE UPDATE ON public.rent_generation_exceptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rent_generation_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read rent generation exceptions"
ON public.rent_generation_exceptions
FOR SELECT
TO authenticated
USING ((SELECT app_private.can_read_finance(organization_id)));

REVOKE ALL ON TABLE public.rent_generation_exceptions
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.rent_generation_exceptions
TO authenticated, service_role;

CREATE TABLE app_private.tenant_invoice_settlement_context_capability (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  capability_token text NOT NULL UNIQUE
    CHECK (capability_token ~ '^[0-9a-f]{64}$')
);

INSERT INTO app_private.tenant_invoice_settlement_context_capability (
  singleton,
  capability_token
)
VALUES (true, encode(extensions.gen_random_bytes(32), 'hex'));

REVOKE ALL ON TABLE
  app_private.tenant_invoice_settlement_context_capability
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.set_tenant_invoice_settlement_context(
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
    RAISE EXCEPTION 'Tenant invoice settlement context state is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.tenant_invoice_settlement_context_capability AS capability
  WHERE capability.singleton;

  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_settlement_context',
    CASE WHEN p_enabled THEN v_capability_token ELSE 'off' END,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.has_tenant_invoice_settlement_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.current_setting(
    'app.tenant_invoice_settlement_context',
    true
  ) IS NOT DISTINCT FROM (
    SELECT capability.capability_token
    FROM app_private.tenant_invoice_settlement_context_capability AS capability
    WHERE capability.singleton
  );
$$;

REVOKE ALL ON FUNCTION
  app_private.set_tenant_invoice_settlement_context(boolean),
  app_private.has_tenant_invoice_settlement_context()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_lease_derived_rent_income(
  p_organization_id uuid,
  p_income_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.finance_income_items AS income
    WHERE income.organization_id = p_organization_id
      AND income.id = p_income_item_id
      AND income.rent_billing_period_start IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_lease_derived_rent_receipt(
  p_organization_id uuid,
  p_receipt_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.finance_receipt_allocations AS allocation
      JOIN public.finance_income_items AS income
        ON income.organization_id = allocation.organization_id
       AND income.id = allocation.income_item_id
      WHERE allocation.organization_id = p_organization_id
        AND allocation.receipt_id = p_receipt_id
        AND income.rent_billing_period_start IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenant_invoice_payment_allocations AS allocation
      JOIN public.tenant_invoice_payments AS payment
        ON payment.organization_id = allocation.organization_id
       AND payment.id = allocation.payment_id
      WHERE allocation.organization_id = p_organization_id
        AND allocation.finance_receipt_id = p_receipt_id
    );
$$;

REVOKE ALL ON FUNCTION
  app_private.is_lease_derived_rent_income(uuid, uuid),
  app_private.is_lease_derived_rent_receipt(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_lease_derived_rent_income()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.rent_billing_period_start IS NOT NULL
    AND coalesce(
      current_setting('app.rent_generation_context', true),
      ''
    ) <> 'lease-derived-v1'
    AND NOT app_private.has_tenant_invoice_settlement_context() THEN
    RAISE EXCEPTION
      'Lease-derived rent must be settled through its tenant invoice'
      USING ERRCODE = '42501';
  END IF;

  IF (
      TG_OP = 'INSERT'
      AND NEW.income_type = 'rent'
    ) OR (
      TG_OP = 'UPDATE'
      AND (
        NEW.income_type IS DISTINCT FROM OLD.income_type
        OR NEW.rent_billing_period_start IS DISTINCT FROM
          OLD.rent_billing_period_start
      )
      AND (
        NEW.income_type = 'rent'
        OR NEW.rent_billing_period_start IS NOT NULL
      )
    ) THEN
    IF coalesce(
      current_setting('app.rent_generation_context', true),
      ''
    ) <> 'lease-derived-v1' THEN
    RAISE EXCEPTION
      'Rent income is created automatically from the active lease configuration'
      USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_lease_derived_rent_income
BEFORE INSERT OR UPDATE
ON public.finance_income_items
FOR EACH ROW EXECUTE FUNCTION app_private.guard_lease_derived_rent_income();

REVOKE ALL ON FUNCTION app_private.guard_lease_derived_rent_income()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION
  app_private.guard_lease_derived_rent_receipt_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_income_item_id uuid := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.income_item_id
    ELSE NEW.income_item_id
  END;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.finance_income_items AS income
    WHERE income.id = v_income_item_id
      AND income.rent_billing_period_start IS NOT NULL
  ) AND NOT app_private.has_tenant_invoice_settlement_context() THEN
    RAISE EXCEPTION
      'Lease-derived rent must be settled through its tenant invoice'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_lease_derived_rent_receipt_allocation
BEFORE INSERT OR UPDATE OR DELETE
ON public.finance_receipt_allocations
FOR EACH ROW
EXECUTE FUNCTION
  app_private.guard_lease_derived_rent_receipt_allocation();

CREATE TRIGGER guard_lease_derived_rent_owner_collection_allocation
BEFORE INSERT OR UPDATE OR DELETE
ON public.owner_collection_confirmation_allocations
FOR EACH ROW
EXECUTE FUNCTION
  app_private.guard_lease_derived_rent_receipt_allocation();

REVOKE ALL ON FUNCTION
  app_private.guard_lease_derived_rent_receipt_allocation()
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.record_tenant_invoice_payment(
  uuid, uuid, numeric, date, uuid, text, jsonb, text
)
RENAME TO record_tenant_invoice_payment_lease_derived_unchecked;

REVOKE ALL ON FUNCTION
  public.record_tenant_invoice_payment_lease_derived_unchecked(
    uuid, uuid, numeric, date, uuid, text, jsonb, text
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_tenant_invoice_payment(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_received_date date,
  p_reconciliation_source_id uuid,
  p_reference text,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_id uuid;
  v_property_id uuid;
  v_currency public.currency_code;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT invoice.property_id, invoice.currency
  INTO v_property_id, v_currency
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id;

  IF FOUND AND p_received_date IS NOT NULL THEN
    PERFORM app_private.lock_open_property_reporting_period(
      p_organization_id,
      v_property_id,
      v_currency,
      p_received_date
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat_ws(
          ':',
          'tenant_invoice_payment_v1',
          p_organization_id,
          p_invoice_id
        ),
        0
      )
    );
  END IF;

  PERFORM app_private.set_tenant_invoice_settlement_context(true);

  BEGIN
    v_payment_id :=
      public.record_tenant_invoice_payment_lease_derived_unchecked(
        p_organization_id,
        p_invoice_id,
        p_amount,
        p_received_date,
        p_reconciliation_source_id,
        p_reference,
        p_allocations,
        p_idempotency_key
      );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_tenant_invoice_settlement_context(false);
    RAISE;
  END;

  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment(
  uuid, uuid, numeric, date, uuid, text, jsonb, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_tenant_invoice_payment(
  uuid, uuid, numeric, date, uuid, text, jsonb, text
)
TO authenticated;

ALTER FUNCTION public.confirm_owner_collected_rent(
  uuid, uuid, numeric, date, text, jsonb, text
)
RENAME TO confirm_owner_collected_rent_lease_derived_unchecked;

REVOKE ALL ON FUNCTION
  public.confirm_owner_collected_rent_lease_derived_unchecked(
    uuid, uuid, numeric, date, text, jsonb, text
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_owner_collected_rent(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_confirmed_date date,
  p_reference text,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_confirmation_id uuid;
  v_property_id uuid;
  v_currency public.currency_code;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT invoice.property_id, invoice.currency
  INTO v_property_id, v_currency
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id;

  IF FOUND AND p_confirmed_date IS NOT NULL THEN
    PERFORM app_private.lock_open_property_reporting_period(
      p_organization_id,
      v_property_id,
      v_currency,
      p_confirmed_date
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat_ws(
          ':',
          'owner_collection_v1',
          p_organization_id,
          p_invoice_id
        ),
        0
      )
    );
  END IF;

  PERFORM app_private.set_tenant_invoice_settlement_context(true);

  BEGIN
    v_confirmation_id :=
      public.confirm_owner_collected_rent_lease_derived_unchecked(
        p_organization_id,
        p_invoice_id,
        p_amount,
        p_confirmed_date,
        p_reference,
        p_allocations,
        p_idempotency_key
      );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_tenant_invoice_settlement_context(false);
    RAISE;
  END;

  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RETURN v_confirmation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent(
  uuid, uuid, numeric, date, text, jsonb, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_owner_collected_rent(
  uuid, uuid, numeric, date, text, jsonb, text
)
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.generate_lease_rent_invoice(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_generation_source text,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_term public.lease_terms%ROWTYPE;
  v_billing public.lease_billing_terms%ROWTYPE;
  v_policy public.rent_policy_versions%ROWTYPE;
  v_recipient public.people%ROWTYPE;
  v_existing_income public.finance_income_items%ROWTYPE;
  v_term_count integer;
  v_period_end date;
  v_effective_date date;
  v_due_day integer;
  v_days_in_month integer;
  v_due_date date;
  v_next_month date;
  v_next_month_days integer;
  v_rent_amount numeric(14, 2);
  v_fee_base numeric(14, 2);
  v_fee_amount numeric(14, 2) := 0;
  v_is_prorated boolean := false;
  v_invoice_id uuid;
  v_income_item_id uuid;
  v_line_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_occupant_labels text[];
BEGIN
  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_billing_period_start IS NULL
    OR p_issue_date IS NULL
    OR p_generation_source NOT IN (
      'scheduled',
      'activation_catch_up',
      'manual_recovery'
    )
    OR p_billing_period_start IS DISTINCT FROM
      date_trunc('month', p_billing_period_start)::date THEN
    RAISE EXCEPTION 'A lease, monthly billing period, issue date, and generation source are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.user_id = p_actor_id
        AND membership.role = 'super_admin'
    ) THEN
    RAISE EXCEPTION 'A Super Admin is required for automatic rent generation'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'lease_derived_rent_v1',
        p_organization_id,
        p_lease_id,
        p_billing_period_start
      ),
      0
    )
  );

  SELECT invoice.id
  INTO v_invoice_id
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.lease_id = p_lease_id
    AND invoice.billing_period_start = p_billing_period_start;

  IF FOUND THEN
    RETURN v_invoice_id;
  END IF;

  v_invoice_id := gen_random_uuid();

  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR SHARE;

  IF NOT FOUND OR (
    p_generation_source = 'manual_recovery'
    AND v_lease.status NOT IN (
      'active',
      'notice_given',
      'ended',
      'terminated'
    )
  ) OR (
    p_generation_source <> 'manual_recovery'
    AND v_lease.status NOT IN ('active', 'notice_given')
  ) THEN
    RAISE EXCEPTION 'The lease is not eligible for this rent month'
      USING ERRCODE = '23514';
  END IF;

  v_period_end := (
    p_billing_period_start + interval '1 month - 1 day'
  )::date;

  IF v_lease.lease_start_date > v_period_end
    OR v_lease.lease_end_date < p_billing_period_start THEN
    RAISE EXCEPTION 'The lease is not active in this billing period'
      USING ERRCODE = '23514';
  END IF;

  IF app_private.is_ledger_period_locked(
    p_organization_id,
    p_billing_period_start
  ) THEN
    RAISE EXCEPTION 'This month is locked; unlock it before generating rent'
      USING ERRCODE = '55000';
  END IF;

  v_effective_date := greatest(
    p_billing_period_start,
    v_lease.lease_start_date
  );

  SELECT count(*)::integer
  INTO v_term_count
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND v_effective_date <@ term.effective_range;

  IF v_term_count <> 1 THEN
    RAISE EXCEPTION 'Confirm one authoritative lease term for this month'
      USING ERRCODE = '23514';
  END IF;

  SELECT term.*
  INTO v_term
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND v_effective_date <@ term.effective_range;

  IF v_term.payment_frequency IS DISTINCT FROM 'monthly' THEN
    RAISE EXCEPTION 'Automatic rent currently supports monthly lease terms only'
      USING ERRCODE = '0A000';
  END IF;

  PERFORM app_private.lock_open_property_reporting_period(
    p_organization_id,
    v_lease.property_id,
    v_term.rent_currency,
    p_billing_period_start
  );

  SELECT policy.*
  INTO v_policy
  FROM public.rent_policy_versions AS policy
  WHERE policy.organization_id = p_organization_id
    AND policy.lifecycle IN ('approved', 'superseded')
    AND policy.effective_from <= v_effective_date
  ORDER BY policy.effective_from DESC, policy.version_number DESC, policy.id DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_policy.rent_calculation_timezone IS NULL
    OR NOT ('monthly' = ANY(v_policy.supported_frequencies)) THEN
    RAISE EXCEPTION 'Approve a complete monthly rent policy before generating rent'
      USING ERRCODE = '23514';
  END IF;

  SELECT billing.*
  INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND v_effective_date BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complete lease billing setup before generating rent'
      USING ERRCODE = '23514';
  END IF;

  SELECT people.*
  INTO v_recipient
  FROM public.people AS people
  WHERE people.organization_id = p_organization_id
    AND people.id = v_billing.billing_recipient_person_id
    AND (
      p_generation_source = 'manual_recovery'
      OR people.archived_at IS NULL
    );

  IF NOT FOUND
    OR v_recipient.party_type IS DISTINCT FROM v_billing.billing_recipient_kind THEN
    RAISE EXCEPTION 'The lease billing recipient is no longer valid'
      USING ERRCODE = '23503';
  END IF;

  v_due_day := CASE v_policy.due_day_source
    WHEN 'term' THEN v_term.rent_due_day
    WHEN 'policy_default' THEN v_policy.policy_default_due_day
    ELSE NULL
  END;

  IF v_due_day IS NULL OR v_due_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'Complete the rent due-day configuration before generating rent'
      USING ERRCODE = '23514';
  END IF;

  v_days_in_month := extract(day FROM v_period_end)::integer;

  IF v_due_day <= v_days_in_month
    OR v_policy.short_month_due_day_rule = 'last_calendar_day' THEN
    v_due_date := pg_catalog.make_date(
      extract(year FROM p_billing_period_start)::integer,
      extract(month FROM p_billing_period_start)::integer,
      least(v_due_day, v_days_in_month)
    );
  ELSE
    v_next_month := (p_billing_period_start + interval '1 month')::date;
    v_next_month_days := extract(
      day FROM (v_next_month + interval '1 month - 1 day')::date
    )::integer;
    v_due_date := pg_catalog.make_date(
      extract(year FROM v_next_month)::integer,
      extract(month FROM v_next_month)::integer,
      least(v_due_day, v_next_month_days)
    );
  END IF;

  v_rent_amount := v_term.rent_amount::numeric(14, 2);

  IF date_trunc('month', v_lease.lease_start_date)::date =
      p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.first_period_prorated_amount;
    v_is_prorated := true;
  ELSIF date_trunc('month', v_lease.lease_end_date)::date =
      p_billing_period_start
    AND v_billing.final_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.final_period_prorated_amount;
    v_is_prorated := true;
  END IF;

  IF v_rent_amount <= 0 THEN
    RAISE EXCEPTION 'The lease rent amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF v_billing.charge_management_fee_when_active THEN
    v_fee_base := CASE
      WHEN v_is_prorated AND NOT v_billing.full_management_fee_during_proration
        THEN v_rent_amount
      ELSE v_term.rent_amount::numeric(14, 2)
    END;
    v_fee_amount := CASE
      WHEN v_billing.management_fee_mode = 'percentage'
        THEN round(v_fee_base * v_billing.management_fee_value / 100, 2)
      ELSE round(v_billing.management_fee_value, 2)
    END;
  END IF;

  SELECT coalesce(
    array_agg(
      people.display_name
      ORDER BY party.is_primary DESC, people.display_name
    ),
    ARRAY[v_lease.tenant_name]::text[]
  )
  INTO v_occupant_labels
  FROM public.lease_parties AS party
  JOIN public.people AS people
    ON people.organization_id = party.organization_id
   AND people.id = party.person_id
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
    AND party.party_role IN (
      'primary_tenant',
      'co_tenant',
      'authorized_occupant'
    )
    AND (party.started_on IS NULL OR party.started_on <= v_period_end)
    AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
    AND people.archived_at IS NULL;

  v_invoice_number := pg_catalog.concat(
    'INV-',
    pg_catalog.to_char(p_billing_period_start, 'YYYYMM'),
    '-',
    pg_catalog.upper(
      pg_catalog.substr(
        pg_catalog.replace(v_invoice_id::text, '-', ''),
        1,
        8
      )
    )
  );

  SELECT income.*
  INTO v_existing_income
  FROM public.finance_income_items AS income
  WHERE income.organization_id = p_organization_id
    AND income.lease_id = p_lease_id
    AND income.income_type = 'rent'
    AND income.archived_at IS NULL
    AND (
      income.rent_billing_period_start = p_billing_period_start
      OR (
        income.rent_billing_period_start IS NULL
        AND income.due_date = p_billing_period_start
        AND income.reference = pg_catalog.to_char(
          p_billing_period_start,
          'YYYY-MM'
        )
        AND lower(trim(income.description)) = 'monthly rent'
      )
    )
  ORDER BY
    (income.rent_billing_period_start = p_billing_period_start) DESC,
    income.created_at,
    income.id
  LIMIT 1
  FOR SHARE;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.finance_income_items AS duplicate
      WHERE duplicate.organization_id = p_organization_id
        AND duplicate.lease_id = p_lease_id
        AND duplicate.income_type = 'rent'
        AND duplicate.archived_at IS NULL
        AND duplicate.id <> v_existing_income.id
        AND (
          duplicate.rent_billing_period_start = p_billing_period_start
          OR (
            duplicate.rent_billing_period_start IS NULL
            AND duplicate.due_date = p_billing_period_start
            AND duplicate.reference = pg_catalog.to_char(
              p_billing_period_start,
              'YYYY-MM'
            )
            AND lower(trim(duplicate.description)) = 'monthly rent'
          )
        )
    )
      OR v_existing_income.amount_due IS DISTINCT FROM v_rent_amount
      OR v_existing_income.currency IS DISTINCT FROM v_term.rent_currency
      OR v_existing_income.status = 'void'
      OR v_existing_income.property_id IS DISTINCT FROM v_lease.property_id
      OR v_existing_income.unit_id IS DISTINCT FROM v_lease.unit_id
      OR (
        v_existing_income.payer_person_id IS NOT NULL
        AND v_existing_income.payer_person_id IS DISTINCT FROM v_recipient.id
      )
      OR (
        v_existing_income.payer_person_id IS NULL
        AND trim(v_existing_income.payer_label) NOT IN (
          v_recipient.display_name,
          v_lease.tenant_name
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.tenant_invoice_lines AS existing_line
        WHERE existing_line.organization_id = p_organization_id
          AND existing_line.income_item_id = v_existing_income.id
      ) THEN
      RAISE EXCEPTION 'Existing rent activity conflicts with this lease month'
        USING ERRCODE = '23514';
    END IF;

    IF v_billing.collection_route = 'direct_to_owner'
      AND EXISTS (
        SELECT 1
        FROM public.finance_receipt_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.income_item_id = v_existing_income.id
      ) THEN
      RAISE EXCEPTION 'Existing rent activity conflicts with this lease month'
        USING ERRCODE = '23514';
    END IF;

    IF v_billing.collection_route = 'through_ips'
      AND EXISTS (
        SELECT 1
        FROM public.owner_collection_confirmation_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.income_item_id = v_existing_income.id
      ) THEN
      RAISE EXCEPTION 'Existing rent activity conflicts with this lease month'
        USING ERRCODE = '23514';
    END IF;

    PERFORM set_config(
      'app.rent_generation_context',
      'lease-derived-v1',
      true
    );

    UPDATE public.finance_income_items
    SET rent_billing_period_start = p_billing_period_start,
        due_date = v_due_date,
        payer_person_id = v_recipient.id,
        payer_label = v_recipient.display_name,
        description = 'Rent',
        reference = v_invoice_number,
        updated_by = p_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_existing_income.id;

    v_income_item_id := v_existing_income.id;
  ELSE
    v_income_item_id := gen_random_uuid();
    PERFORM set_config(
      'app.rent_generation_context',
      'lease-derived-v1',
      true
    );

    INSERT INTO public.finance_income_items (
      id,
      organization_id,
      property_id,
      unit_id,
      lease_id,
      income_type,
      payer_person_id,
      payer_label,
      rent_billing_period_start,
      due_date,
      amount_due,
      amount_received,
      currency,
      status,
      description,
      reference,
      created_by,
      updated_by
    )
    VALUES (
      v_income_item_id,
      p_organization_id,
      v_lease.property_id,
      v_lease.unit_id,
      p_lease_id,
      'rent',
      v_recipient.id,
      v_recipient.display_name,
      p_billing_period_start,
      v_due_date,
      v_rent_amount,
      0,
      v_term.rent_currency,
      'open',
      'Rent',
      v_invoice_number,
      p_actor_id,
      p_actor_id
    );
  END IF;

  INSERT INTO public.tenant_invoices (
    id,
    organization_id,
    invoice_number,
    property_id,
    unit_id,
    lease_id,
    billing_term_id,
    billing_period_start,
    billing_period_end,
    issue_date,
    due_date,
    collection_route,
    recipient_kind,
    recipient_person_id,
    recipient_label,
    occupant_labels,
    currency,
    total_amount,
    lease_term_id,
    rent_policy_version_id,
    generation_source,
    generated_at,
    base_rent_amount,
    is_prorated,
    management_fee_mode,
    management_fee_value,
    management_fee_amount,
    created_by
  )
  VALUES (
    v_invoice_id,
    p_organization_id,
    v_invoice_number,
    v_lease.property_id,
    v_lease.unit_id,
    p_lease_id,
    v_billing.id,
    p_billing_period_start,
    v_period_end,
    p_issue_date,
    v_due_date,
    v_billing.collection_route,
    v_billing.billing_recipient_kind,
    v_recipient.id,
    v_recipient.display_name,
    v_occupant_labels,
    v_term.rent_currency,
    v_rent_amount,
    v_term.id,
    v_policy.id,
    p_generation_source,
    now(),
    v_term.rent_amount,
    v_is_prorated,
    v_billing.management_fee_mode,
    v_billing.management_fee_value,
    v_fee_amount,
    p_actor_id
  );

  INSERT INTO public.tenant_invoice_lines (
    id,
    organization_id,
    invoice_id,
    income_item_id,
    line_type,
    customer_label,
    description,
    amount,
    internal_cost_amount,
    internal_markup_amount,
    sort_order,
    created_by
  )
  VALUES (
    v_line_id,
    p_organization_id,
    v_invoice_id,
    v_income_item_id,
    'rent',
    'Rent',
    pg_catalog.concat(
      pg_catalog.to_char(p_billing_period_start, 'Mon YYYY'),
      CASE WHEN v_is_prorated THEN ' - prorated' ELSE '' END
    ),
    v_rent_amount,
    NULL,
    0,
    1,
    p_actor_id
  );

  IF v_fee_amount > 0 THEN
    INSERT INTO public.management_fee_occurrences (
      organization_id,
      property_id,
      lease_id,
      tenant_invoice_id,
      billing_term_id,
      fee_date,
      amount,
      currency,
      fee_mode,
      fee_value,
      created_by
    )
    VALUES (
      p_organization_id,
      v_lease.property_id,
      p_lease_id,
      v_invoice_id,
      v_billing.id,
      p_billing_period_start,
      v_fee_amount,
      v_term.rent_currency,
      v_billing.management_fee_mode,
      v_billing.management_fee_value,
      p_actor_id
    );
  END IF;

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
    p_actor_id,
    'tenant_invoice',
    v_invoice_id,
    'lease_rent_generated',
    jsonb_build_object(
      'leaseId', p_lease_id,
      'billingPeriodStart', p_billing_period_start,
      'leaseTermId', v_term.id,
      'rentPolicyVersionId', v_policy.id,
      'generationSource', p_generation_source,
      'amount', v_rent_amount,
      'managementFeeAmount', v_fee_amount
    )
  );

  UPDATE public.rent_generation_exceptions AS exception
  SET
    resolved_at = now(),
    resolved_invoice_id = v_invoice_id,
    last_attempt_at = now(),
    last_attempted_by = p_actor_id
  WHERE exception.organization_id = p_organization_id
    AND exception.lease_id = p_lease_id
    AND exception.billing_period_start = p_billing_period_start
    AND exception.resolved_at IS NULL;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.generate_lease_rent_invoice(
  uuid,
  uuid,
  date,
  date,
  text,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.try_generate_lease_rent_invoice(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_generation_source text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
  v_invoice_id uuid;
  v_error_message text;
  v_error_code text;
  v_safe_message text;
BEGIN
  SELECT lease.property_id
  INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'failed',
      'code', 'lease_not_found',
      'message', 'The lease is no longer available.'
    );
  END IF;

  BEGIN
    v_invoice_id := app_private.generate_lease_rent_invoice(
      p_organization_id,
      p_lease_id,
      p_billing_period_start,
      p_issue_date,
      p_generation_source,
      p_actor_id
    );

    UPDATE public.rent_generation_exceptions AS exception
    SET
      resolved_at = coalesce(exception.resolved_at, now()),
      resolved_invoice_id = coalesce(
        exception.resolved_invoice_id,
        v_invoice_id
      ),
      last_attempt_at = now(),
      last_attempted_by = p_actor_id
    WHERE exception.organization_id = p_organization_id
      AND exception.lease_id = p_lease_id
      AND exception.billing_period_start = p_billing_period_start;

    RETURN jsonb_build_object(
      'status', 'generated',
      'invoiceId', v_invoice_id
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;

    v_error_code := CASE
      WHEN v_error_message LIKE 'A Super Admin is required%' THEN 'missing_super_admin'
      WHEN v_error_message LIKE 'Approve a complete monthly rent policy%' THEN 'rent_policy_missing'
      WHEN v_error_message LIKE 'Confirm one authoritative lease term%' THEN 'lease_term_missing'
      WHEN v_error_message LIKE 'Complete lease billing setup%' THEN 'billing_setup_missing'
      WHEN v_error_message LIKE 'The lease billing recipient%' THEN 'billing_recipient_invalid'
      WHEN v_error_message LIKE 'Automatic rent currently supports%' THEN 'unsupported_frequency'
      WHEN v_error_message LIKE 'This month is locked%'
        OR v_error_message LIKE 'Property reporting period is not open%'
        OR v_error_message LIKE 'Organization Ledger period is locked%'
        OR v_error_message LIKE 'Accounting book period is locked%'
        THEN 'period_locked'
      WHEN v_error_message LIKE 'The lease is not active%' THEN 'lease_outside_period'
      WHEN v_error_message LIKE 'Only an active lease%' THEN 'lease_inactive'
      WHEN v_error_message LIKE 'Complete the rent due-day%' THEN 'due_day_missing'
      WHEN v_error_message LIKE 'Existing rent activity conflicts%' THEN 'rent_conflict'
      ELSE 'generation_failed'
    END;

    v_safe_message := CASE v_error_code
      WHEN 'missing_super_admin' THEN 'Assign a Super Admin before automatic rent can run.'
      WHEN 'rent_policy_missing' THEN 'Approve the monthly rent policy for this organization.'
      WHEN 'lease_term_missing' THEN 'Confirm one authoritative lease term for this month.'
      WHEN 'billing_setup_missing' THEN 'Complete the lease billing and management-fee setup.'
      WHEN 'billing_recipient_invalid' THEN 'Select an active billing recipient for the lease.'
      WHEN 'unsupported_frequency' THEN 'Automatic rent currently supports monthly terms only.'
      WHEN 'period_locked' THEN 'Unlock this month before retrying rent generation.'
      WHEN 'lease_outside_period' THEN 'The lease is not active in this billing month.'
      WHEN 'lease_inactive' THEN 'The lease must be active before rent can be generated.'
      WHEN 'due_day_missing' THEN 'Complete the rent due-day configuration.'
      WHEN 'rent_conflict' THEN 'Resolve the existing rent record for this lease month.'
      ELSE 'Review the lease rent setup and retry.'
    END;

    INSERT INTO public.rent_generation_exceptions (
      organization_id,
      property_id,
      lease_id,
      billing_period_start,
      generation_source,
      error_code,
      safe_message,
      attempt_count,
      first_attempt_at,
      last_attempt_at,
      last_attempted_by,
      resolved_at,
      resolved_invoice_id
    )
    VALUES (
      p_organization_id,
      v_property_id,
      p_lease_id,
      p_billing_period_start,
      p_generation_source,
      v_error_code,
      v_safe_message,
      1,
      now(),
      now(),
      p_actor_id,
      NULL,
      NULL
    )
    ON CONFLICT ON CONSTRAINT rent_generation_exceptions_lease_period_unique
    DO UPDATE SET
      generation_source = EXCLUDED.generation_source,
      error_code = EXCLUDED.error_code,
      safe_message = EXCLUDED.safe_message,
      attempt_count = public.rent_generation_exceptions.attempt_count + 1,
      last_attempt_at = now(),
      last_attempted_by = EXCLUDED.last_attempted_by,
      resolved_at = NULL,
      resolved_invoice_id = NULL;

    RETURN jsonb_build_object(
      'status', 'failed',
      'code', v_error_code,
      'message', v_safe_message
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION app_private.try_generate_lease_rent_invoice(
  uuid,
  uuid,
  date,
  date,
  text,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.rent_business_date(
  p_organization_id uuid,
  p_clock timestamptz DEFAULT now()
)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    p_clock AT TIME ZONE coalesce(
      (
        SELECT policy.rent_calculation_timezone
        FROM public.rent_policy_versions AS policy
        WHERE policy.organization_id = p_organization_id
          AND policy.lifecycle = 'approved'
          AND policy.rent_calculation_timezone IS NOT NULL
          AND policy.effective_from <= (
            p_clock AT TIME ZONE policy.rent_calculation_timezone
          )::date
        ORDER BY
          policy.effective_from DESC,
          policy.version_number DESC,
          policy.id DESC
        LIMIT 1
      ),
      'UTC'
    )
  )::date;
$$;

REVOKE ALL ON FUNCTION app_private.rent_business_date(uuid, timestamptz)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.try_current_month_rent(
  p_organization_id uuid,
  p_lease_id uuid,
  p_generation_source text,
  p_clock timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_business_date date;
  v_period_start date;
  v_period_end date;
  v_lease public.leases%ROWTYPE;
BEGIN
  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL;

  IF NOT FOUND OR v_lease.status NOT IN ('active', 'notice_given') THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  v_business_date := app_private.rent_business_date(
    p_organization_id,
    p_clock
  );
  v_period_start := date_trunc('month', v_business_date)::date;
  v_period_end := (v_period_start + interval '1 month - 1 day')::date;

  IF v_lease.lease_start_date > v_period_end
    OR v_lease.lease_end_date < v_period_start THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  SELECT membership.user_id
  INTO v_actor_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.role = 'super_admin'
  ORDER BY membership.created_at, membership.id
  LIMIT 1;

  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id,
    p_lease_id,
    v_period_start,
    v_business_date,
    p_generation_source,
    v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.try_current_month_rent(
  uuid,
  uuid,
  text,
  timestamptz
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.run_due_rent_generation(
  p_clock timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease record;
  v_result jsonb;
  v_generated integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
BEGIN
  IF p_clock IS NULL THEN
    RAISE EXCEPTION 'A generation clock is required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_lease IN
    SELECT lease.organization_id, lease.id AS lease_id
    FROM public.leases AS lease
    WHERE lease.archived_at IS NULL
      AND lease.status IN ('active', 'notice_given')
    ORDER BY lease.organization_id, lease.id
  LOOP
    v_result := app_private.try_current_month_rent(
      v_lease.organization_id,
      v_lease.lease_id,
      'scheduled',
      p_clock
    );

    CASE v_result ->> 'status'
      WHEN 'generated' THEN v_generated := v_generated + 1;
      WHEN 'failed' THEN v_failed := v_failed + 1;
      ELSE v_skipped := v_skipped + 1;
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'generated', v_generated,
    'failed', v_failed,
    'skipped', v_skipped
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.run_due_rent_generation()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.run_due_rent_generation(now());
$$;

REVOKE ALL ON FUNCTION app_private.run_due_rent_generation(timestamptz)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.run_due_rent_generation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recover_rent_generation_exception(
  p_organization_id uuid,
  p_exception_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_exception public.rent_generation_exceptions%ROWTYPE;
  v_business_date date;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT exception.*
  INTO v_exception
  FROM public.rent_generation_exceptions AS exception
  WHERE exception.organization_id = p_organization_id
    AND exception.id = p_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent generation exception not found'
      USING ERRCODE = '23503';
  END IF;

  v_business_date := app_private.rent_business_date(
    p_organization_id,
    now()
  );

  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id,
    v_exception.lease_id,
    v_exception.billing_period_start,
    v_business_date,
    'manual_recovery',
    v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_rent_generation_exception(uuid, uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.recover_rent_generation_exception(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.recover_lease_rent_period(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_business_date date;
  v_current_period date;
BEGIN
  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_billing_period_start IS NULL
    OR p_billing_period_start IS DISTINCT FROM
      date_trunc('month', p_billing_period_start)::date THEN
    RAISE EXCEPTION 'Choose one lease and one complete billing month'
      USING ERRCODE = '22023';
  END IF;

  IF v_actor_id IS NULL
    OR NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_business_date := app_private.rent_business_date(
    p_organization_id,
    now()
  );
  v_current_period := date_trunc('month', v_business_date)::date;

  IF p_billing_period_start >= v_current_period THEN
    RAISE EXCEPTION 'Choose a completed historical rent month'
      USING ERRCODE = '22023';
  END IF;

  -- The private generator locks and keys by lease plus billing month. Repeating
  -- this action therefore returns the same invoice instead of backfilling any
  -- adjacent month or creating a duplicate obligation.
  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id,
    p_lease_id,
    p_billing_period_start,
    v_business_date,
    'manual_recovery',
    v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_lease_rent_period(uuid, uuid, date)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.recover_lease_rent_period(uuid, uuid, date)
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.catch_up_lease_rent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_lease_id uuid;
BEGIN
  v_organization_id := NEW.organization_id;
  IF TG_TABLE_NAME = 'leases' THEN
    v_lease_id := NEW.id;
    IF NEW.status NOT IN ('active', 'notice_given')
      OR NEW.archived_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'lease_terms' THEN
    v_lease_id := NEW.lease_id;
    IF (
      NEW.authority_kind IS DISTINCT FROM 'authoritative'
      OR NEW.status NOT IN ('active', 'upcoming')
      OR NEW.archived_at IS NOT NULL
    ) THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'lease_billing_terms' THEN
    v_lease_id := NEW.lease_id;
    IF NEW.archived_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM app_private.try_current_month_rent(
    v_organization_id,
    v_lease_id,
    'activation_catch_up',
    now()
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER zz_catch_up_rent_after_lease_activation
AFTER INSERT OR UPDATE OF status, archived_at
ON public.leases
FOR EACH ROW EXECUTE FUNCTION app_private.catch_up_lease_rent();

CREATE TRIGGER zz_catch_up_rent_after_authoritative_term
AFTER INSERT OR UPDATE OF
  status,
  authority_kind,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  archived_at
ON public.lease_terms
FOR EACH ROW EXECUTE FUNCTION app_private.catch_up_lease_rent();

CREATE TRIGGER zz_catch_up_rent_after_billing_term
AFTER INSERT OR UPDATE OF
  effective_from,
  effective_to,
  collection_route,
  management_fee_mode,
  management_fee_value,
  charge_management_fee_when_active,
  full_management_fee_during_proration,
  billing_recipient_kind,
  billing_recipient_person_id,
  first_period_prorated_amount,
  final_period_prorated_amount,
  archived_at
ON public.lease_billing_terms
FOR EACH ROW EXECUTE FUNCTION app_private.catch_up_lease_rent();

REVOKE ALL ON FUNCTION app_private.catch_up_lease_rent()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.catch_up_rent_after_policy_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease_id uuid;
BEGIN
  IF NEW.lifecycle IS DISTINCT FROM 'approved'
    OR (
      TG_OP = 'UPDATE'
      AND OLD.lifecycle IS NOT DISTINCT FROM NEW.lifecycle
      AND OLD.effective_from IS NOT DISTINCT FROM NEW.effective_from
    ) THEN
    RETURN NEW;
  END IF;

  FOR v_lease_id IN
    SELECT lease.id
    FROM public.leases AS lease
    WHERE lease.organization_id = NEW.organization_id
      AND lease.archived_at IS NULL
      AND lease.status IN ('active', 'notice_given')
    ORDER BY lease.id
  LOOP
    PERFORM app_private.try_current_month_rent(
      NEW.organization_id,
      v_lease_id,
      'activation_catch_up',
      now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER zz_catch_up_rent_after_policy_approval
AFTER INSERT OR UPDATE OF lifecycle, effective_from
ON public.rent_policy_versions
FOR EACH ROW EXECUTE FUNCTION app_private.catch_up_rent_after_policy_approval();

REVOKE ALL ON FUNCTION app_private.catch_up_rent_after_policy_approval()
FROM PUBLIC, anon, authenticated, service_role;

-- Preserve non-rent compatibility behind the existing checked implementation,
-- while rejecting rent before table privilege or trigger details can leak.
ALTER FUNCTION public.create_finance_income_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  numeric,
  date,
  text,
  text,
  uuid
)
SET SCHEMA app_private;

ALTER FUNCTION app_private.create_finance_income_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  numeric,
  date,
  text,
  text,
  uuid
)
RENAME TO create_finance_income_item_lease_unchecked;

REVOKE ALL ON FUNCTION app_private.create_finance_income_item_lease_unchecked(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  numeric,
  date,
  text,
  text,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_finance_income_item(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_income_type text,
  p_payer_label text,
  p_due_date date,
  p_amount_due numeric,
  p_amount_received numeric,
  p_received_date date,
  p_description text,
  p_reference text,
  p_payer_person_id uuid DEFAULT NULL
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
    OR NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF lower(trim(coalesce(p_income_type, 'rent'))) = 'rent' THEN
    RAISE EXCEPTION
      'Rent income is created automatically from the active lease configuration'
      USING ERRCODE = '42501';
  END IF;

  RETURN app_private.create_finance_income_item_lease_unchecked(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_income_type,
    p_payer_label,
    p_due_date,
    p_amount_due,
    p_amount_received,
    p_received_date,
    p_description,
    p_reference,
    p_payer_person_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_income_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  numeric,
  date,
  text,
  text,
  uuid
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_finance_income_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  numeric,
  date,
  text,
  text,
  uuid
)
TO authenticated;

-- Manual and compatibility rent writers are retired at the Data API boundary.
REVOKE ALL ON FUNCTION public.generate_tenant_rent_invoice(
  uuid,
  uuid,
  date,
  date,
  text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_monthly_rent_income_items(uuid, date)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.generate_monthly_rent_income_items_legacy_unchecked(uuid, date)
FROM PUBLIC, anon, authenticated, service_role;

-- Compatibility settlement remains available for historical non-rent rows.
-- Triggers above reject only lease-derived rent unless the checked tenant
-- invoice payment boundary establishes its private capability context.
REVOKE ALL ON FUNCTION public.void_finance_income_item(uuid, uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.void_finance_income_item(uuid, uuid)
TO authenticated;
REVOKE ALL ON FUNCTION public.post_finance_income_item(uuid, uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.post_finance_income_item(uuid, uuid)
TO authenticated;
REVOKE ALL ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_finance_income_payment(
  uuid, uuid, numeric, date, text
)
TO authenticated;
REVOKE ALL ON FUNCTION public.record_finance_receipt(
  uuid, uuid, numeric, date, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_finance_receipt(
  uuid, uuid, numeric, date, text
)
TO authenticated;
REVOKE ALL ON FUNCTION public.record_finance_receipt_v2(
  uuid, uuid, numeric, date, uuid, text, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_finance_receipt_v2(
  uuid, uuid, numeric, date, uuid, text, text
)
TO authenticated;
REVOKE ALL ON FUNCTION public.reverse_finance_receipt(
  uuid, uuid, date, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_finance_receipt(
  uuid, uuid, date, text
)
TO authenticated;
REVOKE ALL ON FUNCTION public.reverse_finance_receipt_v2(
  uuid, uuid, date, uuid, text, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_finance_receipt_v2(
  uuid, uuid, date, uuid, text, text
)
TO authenticated;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'nestory-hourly-rent-generation'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'nestory-hourly-rent-generation',
  '17 * * * *',
  'SELECT app_private.run_due_rent_generation();'
);

COMMENT ON TABLE public.rent_generation_exceptions IS
  'Safe, retryable per-lease failures from automatic monthly rent generation.';
COMMENT ON FUNCTION app_private.generate_lease_rent_invoice(
  uuid,
  uuid,
  date,
  date,
  text,
  uuid
) IS
  'Private authority for one lease-derived monthly invoice. Uses lease, policy, billing, and month identities for deterministic replay.';
COMMENT ON FUNCTION public.recover_rent_generation_exception(uuid, uuid) IS
  'Super-Admin-only retry for one typed automatic-rent exception.';
COMMENT ON FUNCTION public.recover_lease_rent_period(uuid, uuid, date) IS
  'Super-Admin-only, lease-month-idempotent recovery for one selected historical rent month; it never backfills adjacent periods.';
