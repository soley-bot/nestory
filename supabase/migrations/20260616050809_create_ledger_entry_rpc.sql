CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_transaction_date date,
  p_direction text,
  p_category text,
  p_amount numeric,
  p_currency public.currency_code,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_ledger_entry_id uuid;
  new_timeline_event_id uuid;
  normalized_category text := trim(p_category);
  normalized_description text := NULLIF(trim(coalesce(p_description, '')), '');
  normalized_direction text := lower(trim(p_direction));
  timeline_cost_amount numeric;
  timeline_cost_currency public.currency_code;
  timeline_event_type public.timeline_event_type := 'General Note'::public.timeline_event_type;
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

  IF normalized_direction NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Ledger direction must be income or expense'
      USING ERRCODE = '22023';
  END IF;

  IF length(normalized_category) < 2 THEN
    RAISE EXCEPTION 'Category is too short' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF normalized_direction = 'expense' THEN
    timeline_cost_amount := p_amount;
    timeline_cost_currency := p_currency;

    IF lower(normalized_category) = 'maintenance' THEN
      timeline_event_type := 'Maintenance'::public.timeline_event_type;
    ELSIF lower(normalized_category) = 'repair' THEN
      timeline_event_type := 'Repair'::public.timeline_event_type;
    ELSIF lower(normalized_category) = 'renovation' THEN
      timeline_event_type := 'Renovation'::public.timeline_event_type;
    END IF;
  END IF;

  INSERT INTO public.ledger_entries (
    organization_id,
    property_id,
    unit_id,
    transaction_date,
    direction,
    category,
    amount,
    currency,
    description,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_transaction_date,
    normalized_direction,
    normalized_category,
    p_amount,
    p_currency,
    normalized_description,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_ledger_entry_id;

  INSERT INTO public.timeline_events (
    organization_id,
    property_id,
    unit_id,
    ledger_entry_id,
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
    new_ledger_entry_id,
    p_transaction_date,
    timeline_event_type,
    initcap(normalized_direction) || ': ' || normalized_category,
    normalized_description,
    timeline_cost_amount,
    timeline_cost_currency,
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_timeline_event_id;

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
    'ledger_entry',
    new_ledger_entry_id,
    'created',
    jsonb_build_object(
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'transaction_date', p_transaction_date,
      'direction', normalized_direction,
      'category', normalized_category,
      'amount', p_amount,
      'currency', p_currency,
      'timeline_event_id', new_timeline_event_id
    )
  );

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
    new_timeline_event_id,
    'created_from_ledger',
    jsonb_build_object(
      'ledger_entry_id', new_ledger_entry_id,
      'property_id', p_property_id,
      'unit_id', p_unit_id,
      'event_date', p_transaction_date,
      'event_type', timeline_event_type,
      'title', initcap(normalized_direction) || ': ' || normalized_category,
      'cost_amount', timeline_cost_amount,
      'cost_currency', timeline_cost_currency
    )
  );

  RETURN new_ledger_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ledger_entry(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  numeric,
  public.currency_code,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_ledger_entry(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  numeric,
  public.currency_code,
  text
) TO authenticated;
