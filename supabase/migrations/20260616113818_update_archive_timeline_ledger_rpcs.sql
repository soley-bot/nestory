CREATE OR REPLACE FUNCTION public.update_timeline_event(
  p_event_id uuid,
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
  old_event public.timeline_events%ROWTYPE;
  new_event public.timeline_events%ROWTYPE;
  previous_values jsonb;
  next_values jsonb;
  normalized_description text := NULLIF(trim(coalesce(p_description, '')), '');
  normalized_title text := trim(p_title);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_event
  FROM public.timeline_events
  WHERE id = p_event_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeline event not found' USING ERRCODE = '23503';
  END IF;

  IF old_event.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ledger-linked timeline events must be edited from ledger'
      USING ERRCODE = '22023';
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

  IF length(normalized_title) < 3 THEN
    RAISE EXCEPTION 'Title is too short' USING ERRCODE = '22023';
  END IF;

  IF p_cost_amount IS NOT NULL AND p_cost_amount < 0 THEN
    RAISE EXCEPTION 'Cost cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF (p_cost_amount IS NULL) <> (p_cost_currency IS NULL) THEN
    RAISE EXCEPTION 'Cost amount and currency must be provided together'
      USING ERRCODE = '22023';
  END IF;

  previous_values := jsonb_build_object(
    'property_id', old_event.property_id,
    'unit_id', old_event.unit_id,
    'event_date', old_event.event_date,
    'event_type', old_event.event_type,
    'title', old_event.title,
    'description', old_event.description,
    'cost_amount', old_event.cost_amount,
    'cost_currency', old_event.cost_currency
  );

  UPDATE public.timeline_events
  SET
    property_id = p_property_id,
    unit_id = p_unit_id,
    event_date = p_event_date,
    event_type = p_event_type,
    title = normalized_title,
    description = normalized_description,
    cost_amount = p_cost_amount,
    cost_currency = p_cost_currency,
    updated_by = (SELECT auth.uid())
  WHERE id = p_event_id
  RETURNING * INTO new_event;

  next_values := jsonb_build_object(
    'property_id', new_event.property_id,
    'unit_id', new_event.unit_id,
    'event_date', new_event.event_date,
    'event_type', new_event.event_type,
    'title', new_event.title,
    'description', new_event.description,
    'cost_amount', new_event.cost_amount,
    'cost_currency', new_event.cost_currency
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
    (SELECT auth.uid()),
    'timeline_event',
    p_event_id,
    'updated',
    previous_values,
    next_values
  );

  RETURN p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_timeline_event(
  p_event_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_event public.timeline_events%ROWTYPE;
  new_event public.timeline_events%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_event
  FROM public.timeline_events
  WHERE id = p_event_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeline event not found' USING ERRCODE = '23503';
  END IF;

  IF old_event.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ledger-linked timeline events must be archived from ledger'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.timeline_events
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_event_id
  RETURNING * INTO new_event;

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
    (SELECT auth.uid()),
    'timeline_event',
    p_event_id,
    'archived',
    jsonb_build_object(
      'archived_at', old_event.archived_at,
      'archived_by', old_event.archived_by
    ),
    jsonb_build_object(
      'archived_at', new_event.archived_at,
      'archived_by', new_event.archived_by
    )
  );

  RETURN p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ledger_entry(
  p_entry_id uuid,
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
  old_ledger public.ledger_entries%ROWTYPE;
  new_ledger public.ledger_entries%ROWTYPE;
  old_timeline public.timeline_events%ROWTYPE;
  new_timeline public.timeline_events%ROWTYPE;
  linked_timeline_found boolean := false;
  normalized_category text := trim(p_category);
  normalized_description text := NULLIF(trim(coalesce(p_description, '')), '');
  normalized_direction text := lower(trim(p_direction));
  timeline_cost_amount numeric;
  timeline_cost_currency public.currency_code;
  timeline_event_type public.timeline_event_type := 'General Note';
  timeline_title text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_ledger
  FROM public.ledger_entries
  WHERE id = p_entry_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger entry not found' USING ERRCODE = '23503';
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
      timeline_event_type := 'Maintenance';
    ELSIF lower(normalized_category) = 'repair' THEN
      timeline_event_type := 'Repair';
    ELSIF lower(normalized_category) = 'renovation' THEN
      timeline_event_type := 'Renovation';
    END IF;
  END IF;

  timeline_title := initcap(normalized_direction) || ': ' || normalized_category;

  SELECT *
  INTO old_timeline
  FROM public.timeline_events
  WHERE ledger_entry_id = p_entry_id
    AND organization_id = p_organization_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  linked_timeline_found := FOUND;

  UPDATE public.ledger_entries
  SET
    property_id = p_property_id,
    unit_id = p_unit_id,
    transaction_date = p_transaction_date,
    direction = normalized_direction,
    category = normalized_category,
    amount = p_amount,
    currency = p_currency,
    description = normalized_description,
    updated_by = (SELECT auth.uid())
  WHERE id = p_entry_id
  RETURNING * INTO new_ledger;

  IF linked_timeline_found THEN
    UPDATE public.timeline_events
    SET
      property_id = p_property_id,
      unit_id = p_unit_id,
      event_date = p_transaction_date,
      event_type = timeline_event_type,
      title = timeline_title,
      description = normalized_description,
      cost_amount = timeline_cost_amount,
      cost_currency = timeline_cost_currency,
      archived_at = NULL,
      archived_by = NULL,
      updated_by = (SELECT auth.uid())
    WHERE id = old_timeline.id
    RETURNING * INTO new_timeline;

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
      (SELECT auth.uid()),
      'timeline_event',
      new_timeline.id,
      'updated_from_ledger',
      jsonb_build_object(
        'ledger_entry_id', old_timeline.ledger_entry_id,
        'property_id', old_timeline.property_id,
        'unit_id', old_timeline.unit_id,
        'event_date', old_timeline.event_date,
        'event_type', old_timeline.event_type,
        'title', old_timeline.title,
        'description', old_timeline.description,
        'cost_amount', old_timeline.cost_amount,
        'cost_currency', old_timeline.cost_currency,
        'archived_at', old_timeline.archived_at
      ),
      jsonb_build_object(
        'ledger_entry_id', new_timeline.ledger_entry_id,
        'property_id', new_timeline.property_id,
        'unit_id', new_timeline.unit_id,
        'event_date', new_timeline.event_date,
        'event_type', new_timeline.event_type,
        'title', new_timeline.title,
        'description', new_timeline.description,
        'cost_amount', new_timeline.cost_amount,
        'cost_currency', new_timeline.cost_currency,
        'archived_at', new_timeline.archived_at
      )
    );
  ELSE
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
      p_entry_id,
      p_transaction_date,
      timeline_event_type,
      timeline_title,
      normalized_description,
      timeline_cost_amount,
      timeline_cost_currency,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    )
    RETURNING * INTO new_timeline;

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
      new_timeline.id,
      'created_from_ledger_update',
      jsonb_build_object(
        'ledger_entry_id', new_timeline.ledger_entry_id,
        'property_id', new_timeline.property_id,
        'unit_id', new_timeline.unit_id,
        'event_date', new_timeline.event_date,
        'event_type', new_timeline.event_type,
        'title', new_timeline.title,
        'cost_amount', new_timeline.cost_amount,
        'cost_currency', new_timeline.cost_currency
      )
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
    (SELECT auth.uid()),
    'ledger_entry',
    p_entry_id,
    'updated',
    jsonb_build_object(
      'property_id', old_ledger.property_id,
      'unit_id', old_ledger.unit_id,
      'transaction_date', old_ledger.transaction_date,
      'direction', old_ledger.direction,
      'category', old_ledger.category,
      'amount', old_ledger.amount,
      'currency', old_ledger.currency,
      'description', old_ledger.description
    ),
    jsonb_build_object(
      'property_id', new_ledger.property_id,
      'unit_id', new_ledger.unit_id,
      'transaction_date', new_ledger.transaction_date,
      'direction', new_ledger.direction,
      'category', new_ledger.category,
      'amount', new_ledger.amount,
      'currency', new_ledger.currency,
      'description', new_ledger.description,
      'timeline_event_id', new_timeline.id
    )
  );

  RETURN p_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_ledger_entry(
  p_entry_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_ledger public.ledger_entries%ROWTYPE;
  new_ledger public.ledger_entries%ROWTYPE;
  old_timeline public.timeline_events%ROWTYPE;
  new_timeline public.timeline_events%ROWTYPE;
  linked_timeline_found boolean := false;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_ledger
  FROM public.ledger_entries
  WHERE id = p_entry_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger entry not found' USING ERRCODE = '23503';
  END IF;

  SELECT *
  INTO old_timeline
  FROM public.timeline_events
  WHERE ledger_entry_id = p_entry_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  linked_timeline_found := FOUND;

  UPDATE public.ledger_entries
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid()),
    updated_by = (SELECT auth.uid())
  WHERE id = p_entry_id
  RETURNING * INTO new_ledger;

  IF linked_timeline_found THEN
    UPDATE public.timeline_events
    SET
      archived_at = new_ledger.archived_at,
      archived_by = new_ledger.archived_by,
      updated_by = (SELECT auth.uid())
    WHERE id = old_timeline.id
    RETURNING * INTO new_timeline;

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
      (SELECT auth.uid()),
      'timeline_event',
      new_timeline.id,
      'archived_from_ledger',
      jsonb_build_object(
        'ledger_entry_id', old_timeline.ledger_entry_id,
        'archived_at', old_timeline.archived_at,
        'archived_by', old_timeline.archived_by
      ),
      jsonb_build_object(
        'ledger_entry_id', new_timeline.ledger_entry_id,
        'archived_at', new_timeline.archived_at,
        'archived_by', new_timeline.archived_by
      )
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
    (SELECT auth.uid()),
    'ledger_entry',
    p_entry_id,
    'archived',
    jsonb_build_object(
      'archived_at', old_ledger.archived_at,
      'archived_by', old_ledger.archived_by
    ),
    jsonb_build_object(
      'archived_at', new_ledger.archived_at,
      'archived_by', new_ledger.archived_by
    )
  );

  RETURN p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_timeline_event(
  uuid,
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

REVOKE ALL ON FUNCTION public.archive_timeline_event(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_ledger_entry(
  uuid,
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

REVOKE ALL ON FUNCTION public.archive_ledger_entry(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_timeline_event(
  uuid,
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

GRANT EXECUTE ON FUNCTION public.archive_timeline_event(uuid, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_ledger_entry(
  uuid,
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

GRANT EXECUTE ON FUNCTION public.archive_ledger_entry(uuid, uuid)
TO authenticated;
