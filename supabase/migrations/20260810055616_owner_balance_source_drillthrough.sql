CREATE OR REPLACE FUNCTION public.get_owner_balance_source_ledger(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date
) RETURNS TABLE (
  allocation_set_id uuid,
  event_date date,
  source_type text,
  source_id uuid,
  source_line_id uuid,
  gross_signed_amount text,
  source_fingerprint text,
  allocation_basis text,
  allocated_gross_signed_amount text,
  ownership_percent_snapshot text,
  ownership_roster_hash text,
  reversal_of_allocation_set_id uuid,
  movement_id uuid,
  component public.owner_balance_component,
  signed_amount text,
  reversal_of_movement_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_balance_source_ledger_forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end < p_period_start
    OR p_period_start <> pg_catalog.date_trunc('month', p_period_start)::date
    OR p_period_end <> pg_catalog.date_trunc('month', p_period_end)::date THEN
    RAISE EXCEPTION 'owner_balance_source_ledger_period_invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_owner_person_id
  ) THEN
    RAISE EXCEPTION 'owner_balance_source_ledger_scope_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    allocation_set.id,
    allocation_set.event_date,
    allocation_set.source_type,
    allocation_set.source_id,
    allocation_set.source_line_id,
    pg_catalog.to_char(allocation_set.gross_signed_amount, 'FM999999999990.00'),
    allocation_set.source_fingerprint,
    allocation_set.allocation_basis,
    pg_catalog.to_char(owner_allocation.allocated_gross_signed_amount, 'FM999999999990.00'),
    pg_catalog.to_char(owner_allocation.ownership_percent_snapshot, 'FM990.000'),
    owner_allocation.ownership_roster_hash,
    allocation_set.reversal_of_allocation_set_id,
    movement.id,
    movement.component,
    CASE WHEN movement.id IS NULL THEN NULL ELSE
      pg_catalog.to_char(movement.signed_amount, 'FM999999999990.00')
    END,
    movement.reversal_of_movement_id
  FROM public.owner_event_allocation_sets AS allocation_set
  JOIN public.owner_event_owner_allocations AS owner_allocation
    ON owner_allocation.organization_id = allocation_set.organization_id
    AND owner_allocation.allocation_set_id = allocation_set.id
    AND owner_allocation.owner_person_id = p_owner_person_id
  LEFT JOIN public.owner_component_movements AS movement
    ON movement.organization_id = owner_allocation.organization_id
    AND movement.owner_event_owner_allocation_id = owner_allocation.id
  WHERE allocation_set.organization_id = p_organization_id
    AND allocation_set.property_id = p_property_id
    AND allocation_set.currency = p_currency
    AND allocation_set.event_date >= p_period_start
    AND allocation_set.event_date < (p_period_end + INTERVAL '1 month')::date
  ORDER BY
    allocation_set.event_date,
    allocation_set.source_type,
    allocation_set.source_line_id,
    movement.component,
    movement.movement_order,
    movement.id;
END;
$$;

ALTER FUNCTION public.get_owner_balance_source_ledger(
  uuid, uuid, uuid, public.currency_code, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_balance_source_ledger(
  uuid, uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_balance_source_ledger(
  uuid, uuid, uuid, public.currency_code, date, date
) TO authenticated;
