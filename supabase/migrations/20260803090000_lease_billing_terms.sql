-- IPS Finance operational rework: effective-dated lease billing authority.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE public.lease_billing_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  lease_id uuid NOT NULL,
  property_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  effective_range daterange
    GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[]')) STORED,
  collection_route text NOT NULL,
  management_fee_mode text NOT NULL,
  management_fee_value numeric(14, 4) NOT NULL,
  charge_management_fee_when_active boolean NOT NULL DEFAULT true,
  full_management_fee_during_proration boolean NOT NULL DEFAULT true,
  billing_recipient_kind text NOT NULL,
  billing_recipient_person_id uuid NOT NULL,
  first_period_prorated_amount numeric(14, 2),
  final_period_prorated_amount numeric(14, 2),
  supersedes_billing_term_id uuid,
  superseded_at timestamptz,
  superseded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_billing_terms_org_identity_unique
    UNIQUE (organization_id, lease_id, id),
  CONSTRAINT lease_billing_terms_lease_fkey
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT lease_billing_terms_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT lease_billing_terms_billing_recipient_fkey
    FOREIGN KEY (organization_id, billing_recipient_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT lease_billing_terms_supersedes_fkey
    FOREIGN KEY (organization_id, lease_id, supersedes_billing_term_id)
    REFERENCES public.lease_billing_terms(organization_id, lease_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT lease_billing_terms_date_range_check
    CHECK (effective_to >= effective_from),
  CONSTRAINT lease_billing_terms_collection_route_check
    CHECK (collection_route IN ('through_ips', 'direct_to_owner')),
  CONSTRAINT lease_billing_terms_fee_mode_check
    CHECK (management_fee_mode IN ('flat', 'percentage')),
  CONSTRAINT lease_billing_terms_fee_value_check
    CHECK (
      management_fee_value >= 0
      AND (
        management_fee_mode <> 'percentage'
        OR management_fee_value <= 100
      )
    ),
  CONSTRAINT lease_billing_terms_recipient_kind_check
    CHECK (billing_recipient_kind IN ('individual', 'company')),
  CONSTRAINT lease_billing_terms_proration_amounts_check
    CHECK (
      (first_period_prorated_amount IS NULL OR first_period_prorated_amount >= 0)
      AND (final_period_prorated_amount IS NULL OR final_period_prorated_amount >= 0)
    ),
  CONSTRAINT lease_billing_terms_not_self_superseding_check
    CHECK (supersedes_billing_term_id IS NULL OR supersedes_billing_term_id <> id),
  CONSTRAINT lease_billing_terms_superseded_evidence_check
    CHECK (
      (superseded_at IS NULL AND superseded_by IS NULL)
      OR (superseded_at IS NOT NULL AND superseded_by IS NOT NULL)
    )
);

ALTER TABLE public.lease_billing_terms
  ADD CONSTRAINT lease_billing_terms_effective_range_excl
  EXCLUDE USING gist (
    organization_id WITH =,
    lease_id WITH =,
    effective_range WITH &&
  )
  WHERE (archived_at IS NULL);

CREATE INDEX lease_billing_terms_resolution_idx
  ON public.lease_billing_terms (
    organization_id,
    lease_id,
    effective_from DESC,
    effective_to DESC
  )
  WHERE archived_at IS NULL;

CREATE INDEX lease_billing_terms_property_idx
  ON public.lease_billing_terms (
    organization_id,
    property_id,
    effective_from DESC
  )
  WHERE archived_at IS NULL;

CREATE INDEX lease_billing_terms_recipient_idx
  ON public.lease_billing_terms (
    organization_id,
    billing_recipient_person_id,
    effective_from DESC
  )
  WHERE archived_at IS NULL;

CREATE TRIGGER set_lease_billing_terms_updated_at
BEFORE UPDATE ON public.lease_billing_terms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lease_billing_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can read lease billing terms"
ON public.lease_billing_terms
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_member(organization_id)));

REVOKE ALL ON TABLE public.lease_billing_terms
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.lease_billing_terms
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_lease_billing_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS SETOF public.lease_billing_terms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Lease billing resolution inputs are required'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT billing.*
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND p_effective_date BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_lease_billing_term(uuid, uuid, date)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_lease_billing_term(uuid, uuid, date)
TO authenticated;

CREATE OR REPLACE FUNCTION public.set_lease_billing_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_effective_from date,
  p_collection_route text,
  p_management_fee_mode text,
  p_management_fee_value numeric,
  p_charge_management_fee_when_active boolean,
  p_full_management_fee_during_proration boolean,
  p_billing_recipient_kind text,
  p_billing_recipient_person_id uuid,
  p_first_period_prorated_amount numeric,
  p_final_period_prorated_amount numeric,
  p_supersedes_billing_term_id uuid,
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
  v_recipient public.people%ROWTYPE;
  v_previous public.lease_billing_terms%ROWTYPE;
  v_term_id uuid := gen_random_uuid();
  v_effective_to date;
  v_collection_route text := lower(pg_catalog.btrim(coalesce(p_collection_route, '')));
  v_fee_mode text := lower(pg_catalog.btrim(coalesce(p_management_fee_mode, '')));
  v_recipient_kind text := lower(pg_catalog.btrim(coalesce(p_billing_recipient_kind, '')));
  v_payload jsonb;
  v_claim record;
  v_active_owner_count integer;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_effective_from IS NULL
    OR p_billing_recipient_person_id IS NULL
    OR p_charge_management_fee_when_active IS NULL
    OR p_full_management_fee_during_proration IS NULL
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR v_collection_route NOT IN ('through_ips', 'direct_to_owner')
    OR v_fee_mode NOT IN ('flat', 'percentage')
    OR v_recipient_kind NOT IN ('individual', 'company')
    OR p_management_fee_value IS NULL
    OR p_management_fee_value < 0
    OR (v_fee_mode = 'percentage' AND p_management_fee_value > 100)
    OR (
      v_fee_mode = 'flat'
      AND p_management_fee_value IS DISTINCT FROM pg_catalog.round(p_management_fee_value, 2)
    )
    OR (
      v_fee_mode = 'percentage'
      AND p_management_fee_value IS DISTINCT FROM pg_catalog.round(p_management_fee_value, 4)
    )
    OR coalesce(p_first_period_prorated_amount, 0) < 0
    OR coalesce(p_final_period_prorated_amount, 0) < 0
    OR (
      p_first_period_prorated_amount IS NOT NULL
      AND p_first_period_prorated_amount IS DISTINCT FROM
        pg_catalog.round(p_first_period_prorated_amount, 2)
    )
    OR (
      p_final_period_prorated_amount IS NOT NULL
      AND p_final_period_prorated_amount IS DISTINCT FROM
        pg_catalog.round(p_final_period_prorated_amount, 2)
    ) THEN
    RAISE EXCEPTION 'Lease billing inputs are incomplete or invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT leases.*
  INTO v_lease
  FROM public.leases AS leases
  WHERE leases.id = p_lease_id
    AND leases.organization_id = p_organization_id
    AND leases.archived_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
  END IF;

  IF p_effective_from NOT BETWEEN v_lease.lease_start_date AND v_lease.lease_end_date THEN
    RAISE EXCEPTION 'Billing effective date must fall within the lease'
      USING ERRCODE = '22023';
  END IF;

  SELECT people.*
  INTO v_recipient
  FROM public.people AS people
  WHERE people.id = p_billing_recipient_person_id
    AND people.organization_id = p_organization_id
    AND people.archived_at IS NULL;

  IF NOT FOUND OR v_recipient.party_type IS DISTINCT FROM v_recipient_kind THEN
    RAISE EXCEPTION 'Billing recipient does not match the selected recipient type'
      USING ERRCODE = '23503';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_active_owner_count
  FROM public.property_owners AS owners
  WHERE owners.organization_id = p_organization_id
    AND owners.property_id = v_lease.property_id
    AND owners.is_primary
    AND owners.archived_at IS NULL
    AND (owners.started_on IS NULL OR owners.started_on <= p_effective_from)
    AND (owners.ended_on IS NULL OR owners.ended_on >= p_effective_from);

  IF v_active_owner_count <> 1 THEN
    RAISE EXCEPTION 'Property must have one active owner before billing is activated'
      USING ERRCODE = '23514';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'leaseId', p_lease_id,
    'effectiveFrom', p_effective_from,
    'collectionRoute', v_collection_route,
    'managementFeeMode', v_fee_mode,
    'managementFeeValue', p_management_fee_value,
    'chargeManagementFeeWhenActive', p_charge_management_fee_when_active,
    'fullManagementFeeDuringProration', p_full_management_fee_during_proration,
    'billingRecipientKind', v_recipient_kind,
    'billingRecipientPersonId', p_billing_recipient_person_id,
    'firstPeriodProratedAmount', p_first_period_prorated_amount,
    'finalPeriodProratedAmount', p_final_period_prorated_amount,
    'supersedesBillingTermId', p_supersedes_billing_term_id
  );

  SELECT *
  INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'set_lease_billing_term',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'billingTermId')::uuid;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'lease_billing_term_v1',
        p_organization_id,
        p_lease_id
      ),
      0
    )
  );

  IF p_supersedes_billing_term_id IS NULL THEN
    IF p_effective_from IS DISTINCT FROM v_lease.lease_start_date THEN
      RAISE EXCEPTION 'Initial billing rules must begin with the lease'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.lease_billing_terms AS billing
      WHERE billing.organization_id = p_organization_id
        AND billing.lease_id = p_lease_id
        AND billing.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Choose the billing rule being replaced'
        USING ERRCODE = '23514';
    END IF;

    v_effective_to := v_lease.lease_end_date;
  ELSE
    SELECT billing.*
    INTO v_previous
    FROM public.lease_billing_terms AS billing
    WHERE billing.id = p_supersedes_billing_term_id
      AND billing.organization_id = p_organization_id
      AND billing.lease_id = p_lease_id
      AND billing.archived_at IS NULL
      AND billing.superseded_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Billing rule being replaced was not found'
        USING ERRCODE = '23503';
    END IF;

    IF p_effective_from <= v_previous.effective_from
      OR p_effective_from > v_previous.effective_to THEN
      RAISE EXCEPTION 'New billing rules must start inside the current billing period'
        USING ERRCODE = '22023';
    END IF;

    v_effective_to := v_previous.effective_to;

    UPDATE public.lease_billing_terms
    SET
      effective_to = p_effective_from - 1,
      superseded_at = pg_catalog.clock_timestamp(),
      superseded_by = v_actor_id,
      updated_by = v_actor_id
    WHERE id = v_previous.id
      AND organization_id = p_organization_id;
  END IF;

  INSERT INTO public.lease_billing_terms (
    id,
    organization_id,
    lease_id,
    property_id,
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
    supersedes_billing_term_id,
    confirmed_at,
    confirmed_by,
    created_by,
    updated_by
  )
  VALUES (
    v_term_id,
    p_organization_id,
    p_lease_id,
    v_lease.property_id,
    p_effective_from,
    v_effective_to,
    v_collection_route,
    v_fee_mode,
    p_management_fee_value,
    p_charge_management_fee_when_active,
    p_full_management_fee_during_proration,
    v_recipient_kind,
    p_billing_recipient_person_id,
    p_first_period_prorated_amount,
    p_final_period_prorated_amount,
    p_supersedes_billing_term_id,
    pg_catalog.clock_timestamp(),
    v_actor_id,
    v_actor_id,
    v_actor_id
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
    v_actor_id,
    'lease_billing_term',
    v_term_id,
    CASE
      WHEN p_supersedes_billing_term_id IS NULL
        THEN 'lease_billing_activated'
      ELSE 'lease_billing_changed'
    END,
    CASE
      WHEN p_supersedes_billing_term_id IS NULL THEN NULL
      ELSE pg_catalog.to_jsonb(v_previous)
    END,
    pg_catalog.to_jsonb((
      SELECT billing
      FROM public.lease_billing_terms AS billing
      WHERE billing.id = v_term_id
    ))
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'leaseId', p_lease_id,
      'billingTermId', v_term_id
    )
  );

  RETURN v_term_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_lease_billing_term(
  uuid, uuid, date, text, text, numeric, boolean, boolean, text, uuid,
  numeric, numeric, uuid, text
)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.set_lease_billing_term(
  uuid, uuid, date, text, text, numeric, boolean, boolean, text, uuid,
  numeric, numeric, uuid, text
)
TO authenticated;

COMMENT ON TABLE public.lease_billing_terms IS
  'Effective-dated IPS rent collection, management fee, billing recipient, and manual proration rules per lease.';

COMMENT ON FUNCTION public.set_lease_billing_term(
  uuid, uuid, date, text, text, numeric, boolean, boolean, text, uuid,
  numeric, numeric, uuid, text
) IS
  'Creates initial lease billing authority or schedules a checked effective-dated replacement.';
