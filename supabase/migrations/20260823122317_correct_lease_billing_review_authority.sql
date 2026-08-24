-- Correct the current Lease-owned billing authorities without rewriting their
-- historical migrations or any invoice snapshots already issued from them.

CREATE FUNCTION app_private.assert_lease_billing_destination(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_effective_on date,
  p_billing_rule jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recipient_id uuid;
  v_recipient_kind text := p_billing_rule ->> 'billingRecipientKind';
  v_route text := p_billing_rule ->> 'collectionRoute';
BEGIN
  BEGIN
    v_recipient_id := NULLIF(
      p_billing_rule ->> 'billingRecipientPersonId', ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Lease billing inputs are incomplete or invalid'
      USING ERRCODE = '22023', DETAIL = 'lease_billing_rule_invalid';
  END;

  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_effective_on IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.properties AS property
      WHERE property.organization_id = p_organization_id
        AND property.id = p_property_id
        AND property.archived_at IS NULL
    )
    OR (
      p_unit_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.units AS unit
        WHERE unit.organization_id = p_organization_id
          AND unit.id = p_unit_id
          AND unit.property_id = p_property_id
          AND unit.archived_at IS NULL
      )
    ) THEN
    RAISE EXCEPTION 'Lease destination is invalid'
      USING ERRCODE = '23503', DETAIL = 'lease_billing_destination_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = v_recipient_id
      AND person.party_type = v_recipient_kind
      AND person.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Billing recipient does not match the selected recipient type'
      USING ERRCODE = '23503', DETAIL = 'lease_billing_recipient_invalid';
  END IF;

  PERFORM app_private.assert_person_in_property_branch(
    p_organization_id,
    p_property_id,
    v_recipient_id
  );

  IF v_route = 'direct_to_owner'
    AND NOT EXISTS (
      SELECT 1
      FROM public.property_owners AS owner
      WHERE owner.organization_id = p_organization_id
        AND owner.property_id = p_property_id
        AND owner.is_primary
        AND owner.archived_at IS NULL
        AND (owner.started_on IS NULL OR owner.started_on <= p_effective_on)
        AND (owner.ended_on IS NULL OR owner.ended_on >= p_effective_on)
    ) THEN
    RAISE EXCEPTION
      'Property must have one active owner before direct collection is used'
      USING ERRCODE = '23514', DETAIL = 'lease_billing_owner_required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.assert_lease_billing_destination(
  uuid, uuid, uuid, date, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

-- Non-null overrides are explicit charge amounts; zero is never a valid Rent
-- charge. Fail closed if any legacy row would be reinterpreted by tightening
-- the constraint. The pre-migration local-chain audit found no such rows.
DO $audit$
DECLARE
  v_zero_rows bigint;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_zero_rows
  FROM public.lease_billing_terms AS billing
  WHERE billing.first_period_prorated_amount = 0
     OR billing.final_period_prorated_amount = 0;

  IF v_zero_rows > 0 THEN
    RAISE EXCEPTION
      'Cannot reject zero Lease proration overrides while % existing rows require remediation',
      v_zero_rows
      USING ERRCODE = '23514', DETAIL = 'lease_proration_zero_audit_failed';
  END IF;
END;
$audit$;

ALTER TABLE public.lease_billing_terms
  DROP CONSTRAINT lease_billing_terms_proration_amounts_check;
ALTER TABLE public.lease_billing_terms
  ADD CONSTRAINT lease_billing_terms_proration_amounts_check CHECK (
    (first_period_prorated_amount IS NULL OR first_period_prorated_amount > 0)
    AND
    (final_period_prorated_amount IS NULL OR final_period_prorated_amount > 0)
  ) NOT VALID;
ALTER TABLE public.lease_billing_terms
  VALIDATE CONSTRAINT lease_billing_terms_proration_amounts_check;

-- Patch the normalization authority at a fail-closed, exact source anchor so
-- API calls reject zero before attempting the table write.
DO $patch_normalize$
DECLARE
  v_function constant regprocedure :=
    'app_private.normalize_lease_billing_rule(uuid,uuid,date,jsonb)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text := $old$
    OR coalesce(v_first_period_prorated_amount, 0) < 0
    OR coalesce(v_final_period_prorated_amount, 0) < 0$old$;
  v_new text := $new$
    OR (
      v_first_period_prorated_amount IS NOT NULL
      AND v_first_period_prorated_amount <= 0
    )
    OR (
      v_final_period_prorated_amount IS NOT NULL
      AND v_final_period_prorated_amount <= 0
    )$new$;
BEGIN
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected Lease billing normalization anchor is missing'
      USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_normalize$;

-- Validate a draft edit against its proposed Property and Unit before the
-- checked authoritative-term mutation runs. The existing occupancy-transition
-- guard remains authoritative and can still reject the move afterward.
DO $patch_draft_update$
DECLARE
  v_function constant regprocedure :=
    'public.update_lease_with_billing_rules(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text := $old$
  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    p_lease_id,
    p_lease_start_date,
    p_billing_rule
  );$old$;
  v_new text := $new$
  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    NULL,
    p_lease_start_date,
    p_billing_rule
  );
  PERFORM app_private.assert_lease_billing_destination(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_start_date,
    v_billing_rule
  );$new$;
BEGIN
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected draft Lease billing validation anchor is missing'
      USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_draft_update$;

-- The first pass in save_lease_billing_rules is shape normalization for the
-- idempotency payload. Destination/owner validation belongs at the actual
-- repair or replacement effective date, not the original term start.
DO $patch_save$
DECLARE
  v_function constant regprocedure :=
    'public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old_normalize text := $old$
  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    p_lease_id,
    v_term_start,
    p_billing_rule
  );$old$;
  v_new_normalize text := $new$
  v_billing_rule := app_private.normalize_lease_billing_rule(
    p_organization_id,
    NULL,
    v_term_start,
    p_billing_rule
  );$new$;
  v_old_write text := $old$
    v_billing_term_id := app_private.write_initial_lease_billing_rule($old$;
  v_new_write text := $new$
    PERFORM app_private.assert_lease_billing_destination(
      p_organization_id,
      v_lease.property_id,
      v_lease.unit_id,
      v_term_start,
      v_billing_rule
    );
    v_billing_term_id := app_private.write_initial_lease_billing_rule($new$;
BEGIN
  IF pg_catalog.strpos(v_definition, v_old_normalize) = 0
    OR pg_catalog.strpos(v_definition, v_old_write) = 0 THEN
    RAISE EXCEPTION 'Expected saved Lease billing validation anchor is missing'
      USING ERRCODE = '55000';
  END IF;
  v_definition := pg_catalog.replace(
    v_definition, v_old_normalize, v_new_normalize
  );
  v_definition := pg_catalog.replace(v_definition, v_old_write, v_new_write);
  EXECUTE v_definition;
END;
$patch_save$;

CREATE FUNCTION app_private.resolve_lease_billing_clock(
  p_organization_id uuid,
  p_lease_id uuid,
  p_clock timestamptz
)
RETURNS TABLE(billing_term_id uuid, business_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.lease_billing_terms%ROWTYPE;
  v_next public.lease_billing_terms%ROWTYPE;
  v_predecessor_date date;
  v_utc_date date := (p_clock AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT billing.*
  INTO v_current
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.rule_source = 'lease_default_v1'
    AND billing.archived_at IS NULL
  ORDER BY billing.effective_from, billing.created_at, billing.id
  LIMIT 1;

  IF NOT FOUND OR v_utc_date < v_current.effective_from THEN
    billing_term_id := NULL;
    business_date := v_utc_date;
    RETURN NEXT;
    RETURN;
  END IF;

  LOOP
    SELECT billing.*
    INTO v_next
    FROM public.lease_billing_terms AS billing
    WHERE billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.rule_source = 'lease_default_v1'
      AND billing.archived_at IS NULL
      AND billing.effective_from > v_current.effective_from
    ORDER BY billing.effective_from, billing.created_at, billing.id
    LIMIT 1;

    EXIT WHEN NOT FOUND;
    v_predecessor_date := (
      p_clock AT TIME ZONE v_current.rent_calculation_timezone
    )::date;
    EXIT WHEN v_predecessor_date < v_next.effective_from;
    v_current := v_next;
  END LOOP;

  business_date := greatest(
    (p_clock AT TIME ZONE v_current.rent_calculation_timezone)::date,
    v_current.effective_from
  );
  billing_term_id := CASE
    WHEN business_date BETWEEN v_current.effective_from AND v_current.effective_to
      THEN v_current.id
    ELSE NULL
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION app_private.resolve_lease_billing_clock(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.try_current_month_rent(
  p_organization_id uuid,
  p_lease_id uuid,
  p_generation_source text,
  p_clock timestamptz DEFAULT pg_catalog.now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid;
  v_business_date date;
  v_lease public.leases%ROWTYPE;
  v_period_start date;
  v_resolved_rule_id uuid;
BEGIN
  SELECT lease.*
  INTO v_lease
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL;

  IF NOT FOUND OR v_lease.status NOT IN ('active', 'notice_given') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'skipped');
  END IF;

  SELECT resolved.billing_term_id, resolved.business_date
  INTO v_resolved_rule_id, v_business_date
  FROM app_private.resolve_lease_billing_clock(
    p_organization_id, p_lease_id, p_clock
  ) AS resolved;

  IF v_business_date IS NULL THEN
    v_business_date := (p_clock AT TIME ZONE 'UTC')::date;
  END IF;
  v_period_start := pg_catalog.date_trunc('month', v_business_date)::date;

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
    v_actor_id,
    v_resolved_rule_id
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.try_current_month_rent(
  uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.try_current_month_rent(
  uuid, uuid, text, timestamptz
) IS
  'Generates the current rent month from the deterministic predecessor-owned Lease billing timezone transition; missing authority fails closed.';

-- Bound actual-day proration by both term dates, and prorate flat fees by the
-- same rent/full-period ratio unless the immutable rule keeps the full fee.
DO $patch_generation$
DECLARE
  v_function constant regprocedure :=
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old_proration text := $old$
  ELSIF v_term.start_date > p_billing_period_start THEN
    v_rent_amount := pg_catalog.round(
      v_term.rent_amount
        * (v_period_end - v_term.start_date + 1)
        / v_days_in_month,
      2
    );
    v_is_prorated := true;
    v_segment_rule := 'prorate_actual_days';
  ELSIF v_term.end_date < v_period_end THEN
    v_rent_amount := pg_catalog.round(
      v_term.rent_amount
        * (v_term.end_date - p_billing_period_start + 1)
        / v_days_in_month,
      2
    );
    v_is_prorated := true;
    v_segment_rule := 'prorate_actual_days';
  END IF;$old$;
  v_new_proration text := $new$
  ELSIF v_term.start_date > p_billing_period_start
    OR v_term.end_date < v_period_end THEN
    v_rent_amount := pg_catalog.round(
      v_term.rent_amount
        * (
          least(v_term.end_date, v_period_end)
          - greatest(v_term.start_date, p_billing_period_start)
          + 1
        )
        / v_days_in_month,
      2
    );
    v_is_prorated := true;
    v_segment_rule := 'prorate_actual_days';
  END IF;$new$;
  v_old_fee text := $old$
    v_fee_amount := CASE v_billing.management_fee_mode
      WHEN 'percentage' THEN pg_catalog.round(
        v_fee_base * v_billing.management_fee_value / 100,
        2
      )
      ELSE pg_catalog.round(v_billing.management_fee_value, 2)
    END;$old$;
  v_new_fee text := $new$
    v_fee_amount := CASE v_billing.management_fee_mode
      WHEN 'percentage' THEN pg_catalog.round(
        v_fee_base * v_billing.management_fee_value / 100,
        2
      )
      WHEN 'flat' THEN pg_catalog.round(
        CASE
          WHEN v_is_prorated
            AND NOT v_billing.full_management_fee_during_proration
            THEN v_billing.management_fee_value
              * v_rent_amount / v_term.rent_amount
          ELSE v_billing.management_fee_value
        END,
        2
      )
    END;$new$;
BEGIN
  IF pg_catalog.strpos(v_definition, v_old_proration) = 0
    OR pg_catalog.strpos(v_definition, v_old_fee) = 0 THEN
    RAISE EXCEPTION 'Expected Lease rent generation anchor is missing'
      USING ERRCODE = '55000';
  END IF;
  v_definition := pg_catalog.replace(
    v_definition, v_old_proration, v_new_proration
  );
  v_definition := pg_catalog.replace(v_definition, v_old_fee, v_new_fee);
  EXECUTE v_definition;
END;
$patch_generation$;

-- Preserve the general six-argument generation path for explicit historical
-- recovery, while giving current-month generation a private exact-authority
-- overload. The resolver's selected rule id is required by both the monthly
-- authority preflight and the downstream invoice snapshot selection.
DO $clone_exact_generation$
DECLARE
  v_function constant regprocedure :=
    'app_private.generate_simple_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old_signature text := $old$CREATE OR REPLACE FUNCTION app_private.generate_simple_lease_rent_invoice(p_organization_id uuid, p_lease_id uuid, p_billing_period_start date, p_issue_date date, p_generation_reason text, p_actor_id uuid)$old$;
  v_new_signature text := $new$CREATE OR REPLACE FUNCTION app_private.generate_simple_lease_rent_invoice(p_organization_id uuid, p_lease_id uuid, p_billing_period_start date, p_issue_date date, p_generation_reason text, p_actor_id uuid, p_expected_billing_term_id uuid)$new$;
  v_old_selection text := $old$    AND billing.rule_source = 'lease_default_v1'
    AND v_effective_date BETWEEN billing.effective_from AND billing.effective_to$old$;
  v_new_selection text := $new$    AND billing.rule_source = 'lease_default_v1'
    AND billing.id = p_expected_billing_term_id
    AND v_effective_date BETWEEN billing.effective_from AND billing.effective_to$new$;
BEGIN
  IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
          v_definition, v_old_signature, ''
        ))
    ) / pg_catalog.length(v_old_signature) <> 1
    OR (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
          v_definition, v_old_selection, ''
        ))
    ) / pg_catalog.length(v_old_selection) <> 1 THEN
    RAISE EXCEPTION 'Expected exact Lease generation anchors are missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition, v_old_signature, v_new_signature
  );
  v_definition := pg_catalog.replace(
    v_definition, v_old_selection, v_new_selection
  );
  EXECUTE v_definition;
END;
$clone_exact_generation$;

DO $clone_exact_try_generation$
DECLARE
  v_function constant regprocedure :=
    'app_private.try_generate_lease_rent_invoice(uuid,uuid,date,date,text,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old_signature text := $old$CREATE OR REPLACE FUNCTION app_private.try_generate_lease_rent_invoice(p_organization_id uuid, p_lease_id uuid, p_billing_period_start date, p_issue_date date, p_generation_source text, p_actor_id uuid)$old$;
  v_new_signature text := $new$CREATE OR REPLACE FUNCTION app_private.try_generate_lease_rent_invoice(p_organization_id uuid, p_lease_id uuid, p_billing_period_start date, p_issue_date date, p_generation_source text, p_actor_id uuid, p_expected_billing_term_id uuid)$new$;
  v_old_authority text := $old$      AND billing.rule_source = 'lease_default_v1'
      AND billing.archived_at IS NULL
      AND billing.effective_from <= v_period_end$old$;
  v_new_authority text := $new$      AND billing.rule_source = 'lease_default_v1'
      AND billing.archived_at IS NULL
      AND billing.id = p_expected_billing_term_id
      AND billing.effective_from <= v_period_end$new$;
  v_old_call text := $old$      p_generation_source,
      p_actor_id
    );$old$;
  v_new_call text := $new$      p_generation_source,
      p_actor_id,
      p_expected_billing_term_id
    );$new$;
BEGIN
  IF (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
          v_definition, v_old_signature, ''
        ))
    ) / pg_catalog.length(v_old_signature) <> 1
    OR (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
          v_definition, v_old_authority, ''
        ))
    ) / pg_catalog.length(v_old_authority) <> 1
    OR (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(
          v_definition, v_old_call, ''
        ))
    ) / pg_catalog.length(v_old_call) <> 1 THEN
    RAISE EXCEPTION 'Expected exact Lease attempt anchors are missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition, v_old_signature, v_new_signature
  );
  v_definition := pg_catalog.replace(
    v_definition, v_old_authority, v_new_authority
  );
  v_definition := pg_catalog.replace(
    v_definition, v_old_call, v_new_call
  );
  EXECUTE v_definition;
END;
$clone_exact_try_generation$;

-- Finance Manager retry is a current-period authority, so it must use the
-- same Lease-owned transition clock and exact selected rule as scheduled and
-- activation generation. Super Admin's explicit historical recovery remains
-- on the general six-argument path in recover_rent_generation_exception.
CREATE OR REPLACE FUNCTION app_private.is_checked_current_rent_retry_generation(
  p_organization_id uuid,
  p_lease_id uuid,
  p_billing_period_start date,
  p_issue_date date,
  p_generation_source text,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_actor_id IS NOT NULL
    AND p_actor_id = (SELECT auth.uid())
    AND (
      app_private.can_retry_current_rent(p_organization_id)
      OR app_private.has_finance_branch_authority_context(
        p_organization_id, 'finance.record_payments'
      )
    )
    AND p_generation_source = 'manual_recovery'
    AND EXISTS (
      SELECT 1
      FROM app_private.resolve_lease_billing_clock(
        p_organization_id,
        p_lease_id,
        pg_catalog.now()
      ) AS resolved
      WHERE resolved.billing_term_id IS NOT NULL
        AND p_issue_date = resolved.business_date
        AND p_billing_period_start = pg_catalog.date_trunc(
          'month', resolved.business_date::timestamp
        )::date
    )
    AND EXISTS (
      SELECT 1
      FROM public.rent_generation_exceptions AS exception
      WHERE exception.organization_id = p_organization_id
        AND exception.lease_id = p_lease_id
        AND exception.billing_period_start = p_billing_period_start
        AND exception.resolved_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION app_private.try_generate_current_rent_retry(
  p_organization_id uuid,
  p_exception_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_date date;
  v_exception public.rent_generation_exceptions%ROWTYPE;
  v_resolved_rule_id uuid;
BEGIN
  IF p_actor_id IS NULL
    OR p_actor_id IS DISTINCT FROM (SELECT auth.uid())
    OR NOT (
      app_private.can_retry_current_rent(p_organization_id)
      OR app_private.has_finance_branch_authority_context(
        p_organization_id, 'finance.record_payments'
      )
    ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT exception.*
  INTO v_exception
  FROM public.rent_generation_exceptions AS exception
  WHERE exception.organization_id = p_organization_id
    AND exception.id = p_exception_id
    AND exception.resolved_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent generation exception not found'
      USING ERRCODE = '23503';
  END IF;

  SELECT resolved.billing_term_id, resolved.business_date
  INTO v_resolved_rule_id, v_business_date
  FROM app_private.resolve_lease_billing_clock(
    p_organization_id,
    v_exception.lease_id,
    pg_catalog.now()
  ) AS resolved;

  IF v_business_date IS NULL THEN
    v_business_date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  END IF;

  IF v_exception.billing_period_start
    <> pg_catalog.date_trunc('month', v_business_date)::date THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.try_generate_lease_rent_invoice(
    p_organization_id,
    v_exception.lease_id,
    v_exception.billing_period_start,
    v_business_date,
    'manual_recovery',
    p_actor_id,
    v_resolved_rule_id
  );
END;
$$;

COMMENT ON FUNCTION app_private.try_generate_current_rent_retry(
  uuid, uuid, uuid
) IS
  'Private checked retry for one unresolved current Lease billing month, bound to the deterministic Lease-owned transition clock and exact selected rule.';

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
  v_property_id uuid;
  v_business_date date;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT exception.*
  INTO v_exception
  FROM public.rent_generation_exceptions AS exception
  WHERE exception.organization_id = p_organization_id
    AND exception.id = p_exception_id
  FOR UPDATE OF exception;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent generation exception not found'
      USING ERRCODE = '23503';
  END IF;

  SELECT lease_record.property_id
  INTO v_property_id
  FROM public.leases AS lease_record
  WHERE lease_record.organization_id = p_organization_id
    AND lease_record.id = v_exception.lease_id;

  IF NOT app_private.can_access_property(
    p_organization_id,
    v_property_id,
    'finance.record_payments'
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT app_private.is_super_admin(p_organization_id)
    AND v_exception.resolved_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'already_generated',
      'invoiceId', v_exception.resolved_invoice_id,
      'exceptionId', v_exception.id
    );
  END IF;

  IF app_private.is_super_admin(p_organization_id) THEN
    v_business_date := app_private.rent_business_date(
      p_organization_id,
      pg_catalog.now()
    );

    RETURN app_private.try_generate_lease_rent_invoice(
      p_organization_id,
      v_exception.lease_id,
      v_exception.billing_period_start,
      v_business_date,
      'manual_recovery',
      v_actor_id
    );
  END IF;

  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,
    v_property_id,
    'finance.record_payments'
  );

  BEGIN
    v_result := app_private.try_generate_current_rent_retry(
      p_organization_id,
      p_exception_id,
      v_actor_id
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,
      NULL,
      'finance.record_payments',
      false
    );
    RAISE;
  END;

  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,
    NULL,
    'finance.record_payments',
    false
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.recover_rent_generation_exception(uuid, uuid) IS
  'Retries one rent generation exception: Super Admin retains explicit historical recovery, while Finance Manager current-period validation delegates to the deterministic Lease-owned billing clock.';

ALTER FUNCTION app_private.normalize_lease_billing_rule(uuid,uuid,date,jsonb)
  OWNER TO postgres;
ALTER FUNCTION public.update_lease_with_billing_rules(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,jsonb,text
) OWNER TO postgres;
ALTER FUNCTION public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)
  OWNER TO postgres;
ALTER FUNCTION app_private.resolve_lease_billing_clock(uuid,uuid,timestamptz)
  OWNER TO postgres;
ALTER FUNCTION app_private.try_current_month_rent(uuid,uuid,text,timestamptz)
  OWNER TO postgres;
ALTER FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid,uuid,date,date,text,uuid
) OWNER TO postgres;
ALTER FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid,uuid,date,date,text,uuid,uuid
) OWNER TO postgres;
ALTER FUNCTION app_private.try_generate_lease_rent_invoice(
  uuid,uuid,date,date,text,uuid,uuid
) OWNER TO postgres;
ALTER FUNCTION app_private.is_checked_current_rent_retry_generation(
  uuid,uuid,date,date,text,uuid
) OWNER TO postgres;
ALTER FUNCTION app_private.try_generate_current_rent_retry(uuid,uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.recover_rent_generation_exception(uuid,uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.update_lease_with_billing_rules(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,jsonb,text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_lease_with_billing_rules(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,jsonb,text
) TO authenticated;
REVOKE ALL ON FUNCTION public.save_lease_billing_rules(
  uuid,uuid,jsonb,uuid,text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_lease_billing_rules(
  uuid,uuid,jsonb,uuid,text
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.normalize_lease_billing_rule(
  uuid,uuid,date,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid,uuid,date,date,text,uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.generate_simple_lease_rent_invoice(
  uuid,uuid,date,date,text,uuid,uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.try_generate_lease_rent_invoice(
  uuid,uuid,date,date,text,uuid,uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.is_checked_current_rent_retry_generation(
  uuid,uuid,date,date,text,uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.try_generate_current_rent_retry(
  uuid,uuid,uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recover_rent_generation_exception(
  uuid,uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.recover_rent_generation_exception(
  uuid,uuid
) TO authenticated;
