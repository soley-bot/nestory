-- Rental setup answers only one operational question: can this lease begin
-- charging rent? Opening-balance migration and deposit custody remain Finance
-- work, but they no longer block a newly configured rental.

ALTER FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  RENAME TO get_ips_setup_readiness_before_rental_flow_simplification;

ALTER FUNCTION public.get_ips_setup_readiness_before_rental_flow_simplification(
  uuid, uuid, uuid, uuid, date
) SET SCHEMA app_private;

REVOKE ALL ON FUNCTION app_private.get_ips_setup_readiness_before_rental_flow_simplification(
  uuid, uuid, uuid, uuid, date
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_ips_setup_readiness(
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
  v_owner_ready boolean;
  v_ready boolean;
BEGIN
  v_result := app_private.get_ips_setup_readiness_before_rental_flow_simplification(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_effective_date
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.property_owners AS owner
    WHERE owner.organization_id = p_organization_id
      AND owner.property_id = p_property_id
      AND owner.archived_at IS NULL
      AND owner.effective_range @> p_effective_date
  )
  INTO v_owner_ready;

  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN item.value ->> 'code' = 'owner_roster'
          THEN item.value || jsonb_build_object(
            'ready', v_owner_ready,
            'label', 'Property owner'
          )
        ELSE item.value
      END
      ORDER BY item.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM jsonb_array_elements(v_result -> 'items')
    WITH ORDINALITY AS item(value, ordinality)
  WHERE item.value ->> 'code' NOT IN ('opening_balance', 'deposit');

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
  'Returns rent-start readiness. Finance migration balances and deposit custody do not block initial rent charging.';

ALTER FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  TO authenticated;
