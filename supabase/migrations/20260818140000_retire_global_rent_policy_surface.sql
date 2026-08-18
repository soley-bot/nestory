-- Retire the global rent policy as an operator-facing surface. Lease-owned
-- billing terms are the sole rent authority, so the readiness item is relabelled
-- and repaired through the lease. Existing policy rows are kept as evidence.

CREATE OR REPLACE FUNCTION public.get_ips_setup_readiness(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_effective_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_items jsonb;
  v_policy_effective_date date;
  v_policy_ready boolean;
  v_policy_reason text;
  v_ready boolean;
  v_rent_authority jsonb;
BEGIN
  v_result :=
    app_private.get_ips_setup_readiness_before_billing_period_alignment(
      p_organization_id,
      p_property_id,
      p_unit_id,
      p_lease_id,
      p_effective_date
    );

  SELECT greatest(
    date_trunc('month', p_effective_date)::date,
    term.start_date
  )
  INTO v_policy_effective_date
  FROM public.resolve_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_effective_date
  ) AS term
  WHERE term.resolution_status = 'resolved';

  -- Applied even when no term resolves, so a draft never links to the retired screen.
  v_rent_authority := jsonb_build_object(
    'label', 'Lease rent authority',
    'repairHref', '/leases/' || coalesce(p_lease_id::text, '')
  );

  IF v_policy_effective_date IS NOT NULL THEN
    SELECT readiness.readiness_status = 'ready', readiness.reason_code
    INTO v_policy_ready, v_policy_reason
    FROM public.resolve_lease_rent_readiness(
      p_organization_id,
      p_lease_id,
      v_policy_effective_date
    ) AS readiness;

    v_rent_authority := v_rent_authority || jsonb_build_object(
      'ready', coalesce(v_policy_ready, false),
      'reason', coalesce(v_policy_reason, 'rent_not_ready'),
      'policyEffectiveDate', v_policy_effective_date
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      CASE WHEN item.value ->> 'code' = 'rent_policy'
        THEN item.value || v_rent_authority
        ELSE item.value END
      ORDER BY item.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM jsonb_array_elements(v_result -> 'items')
    WITH ORDINALITY AS item(value, ordinality);

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS item
    WHERE NOT coalesce((item ->> 'ready')::boolean, false)
  )
  INTO v_ready;

  RETURN jsonb_set(
    jsonb_set(v_result, '{items}', v_items),
    '{ready}',
    to_jsonb(v_ready)
  );
END;
$$;

COMMENT ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date) IS
  'Returns compositional IPS readiness. Rent authority reflects lease-owned billing terms; the global rent policy is retained only as historical evidence.';

ALTER FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  TO authenticated;
