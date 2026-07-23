ALTER TABLE public.finance_income_items
  ADD COLUMN payer_person_id uuid,
  ADD CONSTRAINT finance_income_items_payer_person_fk
    FOREIGN KEY (organization_id, payer_person_id)
    REFERENCES public.people(organization_id, id)
    ON DELETE SET NULL (payer_person_id);

CREATE INDEX finance_income_items_org_payer_due_idx
  ON public.finance_income_items (
    organization_id,
    payer_person_id,
    due_date DESC,
    id DESC
  )
  WHERE payer_person_id IS NOT NULL AND archived_at IS NULL;

DROP FUNCTION public.create_finance_income_item(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, date, text, text
);

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
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_income_id uuid;
  normalized_income_type text := lower(trim(coalesce(p_income_type, 'rent')));
  normalized_payer_label text := NULLIF(trim(coalesce(p_payer_label, '')), '');
  normalized_amount_due numeric := coalesce(p_amount_due, 0);
  normalized_amount_received numeric := coalesce(p_amount_received, 0);
  derived_status text;
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

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = p_unit_id
      AND organization_id = p_organization_id
      AND property_id = p_property_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unit not found under selected property' USING ERRCODE = '23503';
  END IF;

  IF p_lease_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.leases
    WHERE id = p_lease_id
      AND organization_id = p_organization_id
      AND property_id = p_property_id
      AND (p_unit_id IS NULL OR unit_id IS NOT DISTINCT FROM p_unit_id)
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Lease not found for selected property and unit'
      USING ERRCODE = '23503';
  END IF;

  IF p_payer_person_id IS NOT NULL THEN
    SELECT display_name
    INTO normalized_payer_label
    FROM public.people
    WHERE id = p_payer_person_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL;

    IF normalized_payer_label IS NULL THEN
      RAISE EXCEPTION 'Payer person not found' USING ERRCODE = '23503';
    END IF;
  ELSIF normalized_payer_label IS NULL THEN
    RAISE EXCEPTION 'External payer name is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_due <= 0 THEN
    RAISE EXCEPTION 'Income amount is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_received < 0
    OR normalized_amount_received > normalized_amount_due THEN
    RAISE EXCEPTION 'Initial received amount exceeds income amount due'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_amount_received > 0 AND p_received_date IS NULL THEN
    RAISE EXCEPTION 'Received date is required for initial received income'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_income_items (
    organization_id,
    property_id,
    unit_id,
    lease_id,
    payer_person_id,
    income_type,
    payer_label,
    due_date,
    amount_due,
    amount_received,
    received_date,
    status,
    description,
    reference,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_payer_person_id,
    normalized_income_type,
    normalized_payer_label,
    p_due_date,
    normalized_amount_due,
    0,
    NULL,
    'open',
    NULLIF(trim(coalesce(p_description, '')), ''),
    NULLIF(trim(coalesce(p_reference, '')), ''),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_income_id;

  IF normalized_amount_received > 0 THEN
    PERFORM public.record_finance_receipt(
      p_organization_id,
      new_income_id,
      normalized_amount_received,
      p_received_date,
      p_reference
    );
  END IF;

  SELECT status
  INTO derived_status
  FROM public.finance_income_items
  WHERE id = new_income_id;

  INSERT INTO public.activity_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    new_values
  )
  VALUES (
    p_organization_id,
    'finance_income_item',
    new_income_id,
    'created',
    (SELECT auth.uid()),
    jsonb_build_object(
      'income_type', normalized_income_type,
      'payer_person_id', p_payer_person_id,
      'payer_label', normalized_payer_label,
      'amount_due', normalized_amount_due,
      'amount_received', normalized_amount_received,
      'status', derived_status
    )
  );

  RETURN new_income_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_income_item(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, date, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_finance_income_item(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, date, text, text, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_finance_income_item(
  p_income_item_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_income public.finance_income_items%ROWTYPE;
  new_ledger_entry_id uuid;
  journal_entry_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_income
  FROM public.finance_income_items
  WHERE id = p_income_item_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
  END IF;

  IF target_income.status = 'posted' AND target_income.ledger_entry_id IS NOT NULL THEN
    RETURN target_income.ledger_entry_id;
  END IF;

  IF target_income.status = 'void' THEN
    RAISE EXCEPTION 'Voided income cannot be posted' USING ERRCODE = '22023';
  END IF;

  IF target_income.amount_received <= 0 OR target_income.received_date IS NULL THEN
    RAISE EXCEPTION 'Record received money before posting' USING ERRCODE = '22023';
  END IF;

  IF target_income.amount_received < target_income.amount_due THEN
    RAISE EXCEPTION 'Record the remaining receipt before posting to the ledger'
      USING ERRCODE = '22023';
  END IF;

  new_ledger_entry_id := app_private.create_legacy_ledger_entry_internal(
    p_organization_id,
    target_income.property_id,
    target_income.unit_id,
    target_income.received_date,
    'income',
    replace(initcap(replace(target_income.income_type, '_', ' ')), '  ', ' '),
    target_income.amount_received,
    target_income.currency,
    concat_ws(' - ', target_income.payer_label, target_income.description),
    'finance_income',
    target_income.id,
    actor_id
  );

  journal_entry_id := app_private.post_legacy_ledger_accounting_internal(
    new_ledger_entry_id,
    target_income.income_type,
    NULL,
    NULL,
    target_income.lease_id,
    NULL,
    'received',
    actor_id
  );

  UPDATE public.finance_income_items
  SET ledger_entry_id = new_ledger_entry_id,
      status = 'posted',
      updated_by = actor_id
  WHERE id = target_income.id;

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
    actor_id,
    'finance_income_item',
    target_income.id,
    'posted_to_ledger',
    jsonb_build_object(
      'ledger_entry_id', new_ledger_entry_id,
      'accounting_journal_entry_id', journal_entry_id
    )
  );

  RETURN new_ledger_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_finance_income_item(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_finance_income_item(uuid, uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION app_private.enforce_active_lease_tenant_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.primary_tenant_person_id IS NOT DISTINCT FROM OLD.primary_tenant_person_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.people AS person
    JOIN public.person_roles AS person_role
      ON person_role.organization_id = person.organization_id
     AND person_role.person_id = person.id
    WHERE person.id = NEW.primary_tenant_person_id
      AND person.organization_id = NEW.organization_id
      AND person.archived_at IS NULL
      AND person_role.role = 'tenant'
      AND person_role.status = 'active'
      AND person_role.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'An active Tenant role is required for the primary tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_active_lease_tenant_role()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_active_lease_tenant_role ON public.leases;
CREATE TRIGGER enforce_active_lease_tenant_role
BEFORE INSERT OR UPDATE OF primary_tenant_person_id
ON public.leases
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_lease_tenant_role();
