CREATE OR REPLACE FUNCTION public.create_timeline_event(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_event_date date,
  p_event_type public.timeline_event_type,
  p_title text,
  p_description text,
  p_cost_amount numeric,
  p_cost_currency public.currency_code
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_event_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE id = p_property_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.units
      WHERE id = p_unit_id
        AND property_id = p_property_id
        AND organization_id = p_organization_id
        AND archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Unit not found for property' USING ERRCODE = '23503';
  END IF;

  IF length(trim(p_title)) < 3 THEN
    RAISE EXCEPTION 'Title is too short' USING ERRCODE = '22023';
  END IF;

  IF p_cost_amount IS NOT NULL AND p_cost_amount < 0 THEN
    RAISE EXCEPTION 'Cost cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_cost_amount IS NULL) <> (p_cost_currency IS NULL) THEN
    RAISE EXCEPTION 'Cost amount and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.timeline_events (
    organization_id,
    property_id,
    unit_id,
    event_date,
    event_type,
    title,
    description,
    cost_amount,
    cost_currency,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_event_date,
    p_event_type,
    trim(p_title),
    NULLIF(trim(p_description), ''),
    p_cost_amount,
    p_cost_currency,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_event_id;

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
    'timeline_event',
    new_event_id,
    'created',
    jsonb_build_object(
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'event_date', p_event_date,
      'event_type', p_event_type,
      'title', trim(p_title),
      'cost_amount', p_cost_amount,
      'cost_currency', p_cost_currency
    )
  );

  RETURN new_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_timeline_event(
  uuid,
  uuid,
  uuid,
  date,
  public.timeline_event_type,
  text,
  text,
  numeric,
  public.currency_code
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_timeline_event(
  uuid,
  uuid,
  uuid,
  date,
  public.timeline_event_type,
  text,
  text,
  numeric,
  public.currency_code
) TO authenticated;
