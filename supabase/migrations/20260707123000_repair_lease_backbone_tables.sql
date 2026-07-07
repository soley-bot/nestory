CREATE TABLE IF NOT EXISTS public.lease_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  term_sequence integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  rent_amount numeric(14, 2) NOT NULL,
  rent_currency public.currency_code NOT NULL,
  rent_due_day integer,
  payment_frequency text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  notice_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_terms_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_terms_sequence_unique UNIQUE (organization_id, lease_id, term_sequence),
  CONSTRAINT lease_terms_sequence_positive_check CHECK (term_sequence > 0),
  CONSTRAINT lease_terms_date_range_check CHECK (end_date >= start_date),
  CONSTRAINT lease_terms_rent_non_negative_check CHECK (rent_amount >= 0),
  CONSTRAINT lease_terms_due_day_check CHECK (rent_due_day IS NULL OR rent_due_day BETWEEN 1 AND 31),
  CONSTRAINT lease_terms_payment_frequency_check CHECK (
    payment_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'one_time')
  ),
  CONSTRAINT lease_terms_status_check CHECK (
    status IN ('draft', 'upcoming', 'active', 'expired', 'terminated', 'superseded')
  )
);

CREATE TABLE IF NOT EXISTS public.lease_occupancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  property_id uuid NOT NULL,
  unit_id uuid,
  status text NOT NULL DEFAULT 'occupied',
  scheduled_move_in_date date,
  actual_move_in_date date,
  notice_date date,
  scheduled_move_out_date date,
  actual_move_out_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_occupancies_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_occupancies_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_occupancies_unit_fk
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id)
    ON DELETE SET NULL (unit_id),
  CONSTRAINT lease_occupancies_status_check CHECK (
    status IN ('reserved', 'occupied', 'notice_given', 'vacated', 'cancelled')
  ),
  CONSTRAINT lease_occupancies_scheduled_range_check CHECK (
    scheduled_move_out_date IS NULL
    OR scheduled_move_in_date IS NULL
    OR scheduled_move_out_date >= scheduled_move_in_date
  ),
  CONSTRAINT lease_occupancies_actual_range_check CHECK (
    actual_move_out_date IS NULL
    OR actual_move_in_date IS NULL
    OR actual_move_out_date >= actual_move_in_date
  )
);

CREATE TABLE IF NOT EXISTS public.lease_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  deposit_type text NOT NULL DEFAULT 'security',
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL,
  status text NOT NULL DEFAULT 'held',
  received_on date,
  returned_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_deposits_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_deposits_type_not_blank_check CHECK (length(trim(deposit_type)) > 0),
  CONSTRAINT lease_deposits_amount_non_negative_check CHECK (amount >= 0),
  CONSTRAINT lease_deposits_status_check CHECK (
    status IN ('pending', 'received', 'held', 'partially_returned', 'returned', 'forfeited', 'waived')
  ),
  CONSTRAINT lease_deposits_date_range_check CHECK (
    returned_on IS NULL OR received_on IS NULL OR returned_on >= received_on
  )
);

CREATE OR REPLACE FUNCTION public.validate_lease_occupancy_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  linked_lease record;
BEGIN
  SELECT property_id, unit_id
  INTO linked_lease
  FROM public.leases
  WHERE organization_id = NEW.organization_id
    AND id = NEW.lease_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found for occupancy'
      USING ERRCODE = '23503';
  END IF;

  IF linked_lease.property_id <> NEW.property_id THEN
    RAISE EXCEPTION 'Lease occupancy property must match the lease property'
      USING ERRCODE = '23503';
  END IF;

  IF linked_lease.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM linked_lease.unit_id THEN
    RAISE EXCEPTION 'Lease occupancy unit must match the lease unit'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE organization_id = NEW.organization_id
      AND id = NEW.unit_id
      AND property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Lease occupancy unit must belong to the selected property'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lease_backbone_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  existing_deposit_id uuid;
  existing_occupancy_id uuid;
  existing_party_id uuid;
  lease_party_ended_on date;
  occupancy_actual_move_out date;
  occupancy_notice_date date;
  occupancy_status text;
  term_status text;
BEGIN
  IF current_setting('app.people_leases_skip_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  lease_party_ended_on := CASE
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN NEW.lease_end_date
    ELSE NULL
  END;
  term_status := CASE
    WHEN NEW.status IN ('active', 'notice_given') THEN 'active'
    WHEN NEW.status = 'draft' THEN 'draft'
    WHEN NEW.status IN ('ended', 'cancelled') THEN 'expired'
    ELSE 'terminated'
  END;
  occupancy_status := CASE
    WHEN NEW.status = 'notice_given' THEN 'notice_given'
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN 'vacated'
    WHEN NEW.status = 'draft' THEN 'reserved'
    ELSE 'occupied'
  END;
  occupancy_notice_date := CASE
    WHEN NEW.status = 'notice_given' THEN least(current_date, NEW.lease_end_date)
    ELSE NULL
  END;
  occupancy_actual_move_out := CASE
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN NEW.lease_end_date
    ELSE NULL
  END;

  SELECT id
  INTO existing_party_id
  FROM public.lease_parties
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND party_role = 'primary_tenant'
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF existing_party_id IS NULL THEN
    INSERT INTO public.lease_parties (
      organization_id,
      lease_id,
      person_id,
      party_role,
      is_primary,
      started_on,
      ended_on,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.primary_tenant_person_id,
      'primary_tenant',
      true,
      NEW.lease_start_date,
      lease_party_ended_on,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_parties
    SET
      person_id = NEW.primary_tenant_person_id,
      is_primary = true,
      started_on = NEW.lease_start_date,
      ended_on = lease_party_ended_on,
      updated_by = (SELECT auth.uid())
    WHERE id = existing_party_id
      AND organization_id = NEW.organization_id;
  END IF;

  INSERT INTO public.lease_terms (
    organization_id,
    lease_id,
    term_sequence,
    start_date,
    end_date,
    rent_amount,
    rent_currency,
    rent_due_day,
    payment_frequency,
    status,
    created_by,
    updated_by,
    archived_at,
    archived_by
  )
  VALUES (
    NEW.organization_id,
    NEW.id,
    1,
    NEW.lease_start_date,
    NEW.lease_end_date,
    NEW.monthly_rent_amount,
    NEW.monthly_rent_currency,
    extract(day from NEW.lease_start_date)::integer,
    'monthly',
    term_status,
    (SELECT auth.uid()),
    (SELECT auth.uid()),
    NEW.archived_at,
    NEW.archived_by
  )
  ON CONFLICT ON CONSTRAINT lease_terms_sequence_unique
  DO UPDATE SET
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    rent_amount = EXCLUDED.rent_amount,
    rent_currency = EXCLUDED.rent_currency,
    rent_due_day = EXCLUDED.rent_due_day,
    payment_frequency = EXCLUDED.payment_frequency,
    status = EXCLUDED.status,
    updated_by = (SELECT auth.uid()),
    archived_at = EXCLUDED.archived_at,
    archived_by = EXCLUDED.archived_by;

  SELECT id
  INTO existing_occupancy_id
  FROM public.lease_occupancies
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF existing_occupancy_id IS NULL THEN
    INSERT INTO public.lease_occupancies (
      organization_id,
      lease_id,
      property_id,
      unit_id,
      status,
      scheduled_move_in_date,
      actual_move_in_date,
      notice_date,
      scheduled_move_out_date,
      actual_move_out_date,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.property_id,
      NEW.unit_id,
      occupancy_status,
      NEW.lease_start_date,
      NEW.lease_start_date,
      occupancy_notice_date,
      NEW.lease_end_date,
      occupancy_actual_move_out,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_occupancies
    SET
      property_id = NEW.property_id,
      unit_id = NEW.unit_id,
      status = occupancy_status,
      scheduled_move_in_date = NEW.lease_start_date,
      actual_move_in_date = NEW.lease_start_date,
      notice_date = occupancy_notice_date,
      scheduled_move_out_date = NEW.lease_end_date,
      actual_move_out_date = occupancy_actual_move_out,
      updated_by = (SELECT auth.uid())
    WHERE id = existing_occupancy_id
      AND organization_id = NEW.organization_id;
  END IF;

  SELECT id
  INTO existing_deposit_id
  FROM public.lease_deposits
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND deposit_type = 'security'
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF NEW.deposit_amount IS NULL THEN
    IF existing_deposit_id IS NOT NULL THEN
      UPDATE public.lease_deposits
      SET
        archived_at = now(),
        archived_by = (SELECT auth.uid()),
        updated_by = (SELECT auth.uid())
      WHERE id = existing_deposit_id
        AND organization_id = NEW.organization_id;
    END IF;
  ELSIF existing_deposit_id IS NULL THEN
    INSERT INTO public.lease_deposits (
      organization_id,
      lease_id,
      deposit_type,
      amount,
      currency,
      status,
      received_on,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      'security',
      NEW.deposit_amount,
      coalesce(NEW.deposit_currency, NEW.monthly_rent_currency),
      'held',
      NEW.lease_start_date,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_deposits
    SET
      amount = NEW.deposit_amount,
      currency = coalesce(NEW.deposit_currency, NEW.monthly_rent_currency),
      received_on = coalesce(received_on, NEW.lease_start_date),
      updated_by = (SELECT auth.uid())
    WHERE id = existing_deposit_id
      AND organization_id = NEW.organization_id;
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
    NEW.organization_id,
    (SELECT auth.uid()),
    'lease',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'lease_created' ELSE 'lease_updated' END,
    CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'tenant_name', OLD.tenant_name,
        'property_id', OLD.property_id,
        'unit_id', OLD.unit_id,
        'lease_start_date', OLD.lease_start_date,
        'lease_end_date', OLD.lease_end_date,
        'monthly_rent_amount', OLD.monthly_rent_amount,
        'monthly_rent_currency', OLD.monthly_rent_currency,
        'deposit_amount', OLD.deposit_amount,
        'deposit_currency', OLD.deposit_currency,
        'status', OLD.status
      )
      ELSE NULL
    END,
    jsonb_build_object(
      'tenant_name', NEW.tenant_name,
      'primary_tenant_person_id', NEW.primary_tenant_person_id,
      'property_id', NEW.property_id,
      'unit_id', NEW.unit_id,
      'lease_start_date', NEW.lease_start_date,
      'lease_end_date', NEW.lease_end_date,
      'monthly_rent_amount', NEW.monthly_rent_amount,
      'monthly_rent_currency', NEW.monthly_rent_currency,
      'deposit_amount', NEW.deposit_amount,
      'deposit_currency', NEW.deposit_currency,
      'status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

ALTER TABLE public.lease_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_occupancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_deposits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lease_terms'
      AND policyname = 'Admins can manage lease terms'
  ) THEN
    CREATE POLICY "Admins can manage lease terms"
    ON public.lease_terms
    FOR ALL
    TO authenticated
    USING (app_private.is_org_admin(organization_id))
    WITH CHECK (app_private.is_org_admin(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lease_occupancies'
      AND policyname = 'Admins can manage lease occupancies'
  ) THEN
    CREATE POLICY "Admins can manage lease occupancies"
    ON public.lease_occupancies
    FOR ALL
    TO authenticated
    USING (app_private.is_org_admin(organization_id))
    WITH CHECK (app_private.is_org_admin(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lease_deposits'
      AND policyname = 'Admins can manage lease deposits'
  ) THEN
    CREATE POLICY "Admins can manage lease deposits"
    ON public.lease_deposits
    FOR ALL
    TO authenticated
    USING (app_private.is_org_admin(organization_id))
    WITH CHECK (app_private.is_org_admin(organization_id));
  END IF;
END;
$$;

REVOKE ALL ON
  public.lease_terms,
  public.lease_occupancies,
  public.lease_deposits
FROM PUBLIC, anon;

REVOKE ALL ON
  public.lease_terms,
  public.lease_occupancies,
  public.lease_deposits
FROM authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON
  public.lease_terms,
  public.lease_occupancies,
  public.lease_deposits
TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS lease_terms_org_lease_id_idx
  ON public.lease_terms (organization_id, lease_id);
CREATE INDEX IF NOT EXISTS lease_terms_created_by_idx ON public.lease_terms (created_by);
CREATE INDEX IF NOT EXISTS lease_terms_updated_by_idx ON public.lease_terms (updated_by);
CREATE INDEX IF NOT EXISTS lease_terms_archived_by_idx ON public.lease_terms (archived_by);
CREATE INDEX IF NOT EXISTS lease_terms_active_end_date_idx
  ON public.lease_terms (organization_id, end_date)
  WHERE archived_at IS NULL AND status IN ('upcoming', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS lease_terms_one_active_term_idx
  ON public.lease_terms (organization_id, lease_id)
  WHERE archived_at IS NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS lease_occupancies_org_lease_id_idx
  ON public.lease_occupancies (organization_id, lease_id);
CREATE INDEX IF NOT EXISTS lease_occupancies_org_property_id_idx
  ON public.lease_occupancies (organization_id, property_id);
CREATE INDEX IF NOT EXISTS lease_occupancies_org_unit_id_idx
  ON public.lease_occupancies (organization_id, unit_id)
  WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lease_occupancies_created_by_idx ON public.lease_occupancies (created_by);
CREATE INDEX IF NOT EXISTS lease_occupancies_updated_by_idx ON public.lease_occupancies (updated_by);
CREATE INDEX IF NOT EXISTS lease_occupancies_archived_by_idx ON public.lease_occupancies (archived_by);
CREATE INDEX IF NOT EXISTS lease_occupancies_org_property_unit_move_in_idx
  ON public.lease_occupancies (
    organization_id,
    property_id,
    unit_id,
    actual_move_in_date DESC
  );
CREATE UNIQUE INDEX IF NOT EXISTS lease_occupancies_one_active_unit_idx
  ON public.lease_occupancies (organization_id, unit_id)
  WHERE unit_id IS NOT NULL
    AND archived_at IS NULL
    AND actual_move_out_date IS NULL
    AND status IN ('reserved', 'occupied', 'notice_given');

CREATE INDEX IF NOT EXISTS lease_deposits_org_lease_id_idx
  ON public.lease_deposits (organization_id, lease_id);
CREATE INDEX IF NOT EXISTS lease_deposits_created_by_idx ON public.lease_deposits (created_by);
CREATE INDEX IF NOT EXISTS lease_deposits_updated_by_idx ON public.lease_deposits (updated_by);
CREATE INDEX IF NOT EXISTS lease_deposits_archived_by_idx ON public.lease_deposits (archived_by);
CREATE INDEX IF NOT EXISTS lease_deposits_org_lease_status_idx
  ON public.lease_deposits (organization_id, lease_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'validate_lease_occupancies_scope'
      AND tgrelid = 'public.lease_occupancies'::regclass
  ) THEN
    CREATE TRIGGER validate_lease_occupancies_scope
    BEFORE INSERT OR UPDATE OF organization_id, lease_id, property_id, unit_id
    ON public.lease_occupancies
    FOR EACH ROW EXECUTE FUNCTION public.validate_lease_occupancy_scope();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_lease_terms_updated_at'
      AND tgrelid = 'public.lease_terms'::regclass
  ) THEN
    CREATE TRIGGER set_lease_terms_updated_at
    BEFORE UPDATE ON public.lease_terms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_lease_occupancies_updated_at'
      AND tgrelid = 'public.lease_occupancies'::regclass
  ) THEN
    CREATE TRIGGER set_lease_occupancies_updated_at
    BEFORE UPDATE ON public.lease_occupancies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_lease_deposits_updated_at'
      AND tgrelid = 'public.lease_deposits'::regclass
  ) THEN
    CREATE TRIGGER set_lease_deposits_updated_at
    BEFORE UPDATE ON public.lease_deposits
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sync_leases_backbone_records'
      AND tgrelid = 'public.leases'::regclass
  ) THEN
    CREATE TRIGGER sync_leases_backbone_records
    AFTER INSERT OR UPDATE OF
      tenant_name,
      primary_tenant_person_id,
      property_id,
      unit_id,
      lease_start_date,
      lease_end_date,
      monthly_rent_amount,
      monthly_rent_currency,
      deposit_amount,
      deposit_currency,
      status,
      archived_at,
      archived_by
    ON public.leases
    FOR EACH ROW EXECUTE FUNCTION public.sync_lease_backbone_records();
  END IF;
END;
$$;

INSERT INTO public.lease_terms (
  organization_id,
  lease_id,
  term_sequence,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  status,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  organization_id,
  id,
  1,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
  extract(day from lease_start_date)::integer,
  'monthly',
  CASE
    WHEN status IN ('active', 'notice_given') THEN 'active'
    WHEN status = 'draft' THEN 'draft'
    WHEN status IN ('ended', 'cancelled') THEN 'expired'
    ELSE 'terminated'
  END,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
FROM public.leases AS leases
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lease_terms AS terms
  WHERE terms.organization_id = leases.organization_id
    AND terms.lease_id = leases.id
    AND terms.term_sequence = 1
);

WITH occupancy_source AS (
  SELECT
    leases.*,
    row_number() OVER (
      PARTITION BY leases.organization_id, leases.unit_id
      ORDER BY
        CASE
          WHEN leases.unit_id IS NOT NULL
            AND leases.archived_at IS NULL
            AND leases.status IN ('active', 'notice_given', 'draft')
          THEN 0
          ELSE 1
        END,
        leases.lease_start_date DESC,
        leases.created_at DESC,
        leases.id
    ) AS unit_rank
  FROM public.leases AS leases
)
INSERT INTO public.lease_occupancies (
  organization_id,
  lease_id,
  property_id,
  unit_id,
  status,
  scheduled_move_in_date,
  actual_move_in_date,
  notice_date,
  scheduled_move_out_date,
  actual_move_out_date,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  organization_id,
  id,
  property_id,
  unit_id,
  CASE
    WHEN unit_id IS NOT NULL
      AND unit_rank > 1
      AND status IN ('active', 'notice_given', 'draft')
    THEN 'vacated'
    WHEN status = 'notice_given' THEN 'notice_given'
    WHEN status IN ('ended', 'terminated', 'cancelled') THEN 'vacated'
    WHEN status = 'draft' THEN 'reserved'
    ELSE 'occupied'
  END,
  lease_start_date,
  lease_start_date,
  CASE WHEN status = 'notice_given' THEN least(current_date, lease_end_date) ELSE NULL END,
  lease_end_date,
  CASE
    WHEN status IN ('ended', 'terminated', 'cancelled') THEN lease_end_date
    WHEN unit_id IS NOT NULL
      AND unit_rank > 1
      AND status IN ('active', 'notice_given', 'draft')
    THEN lease_end_date
    ELSE NULL
  END,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
FROM occupancy_source AS leases
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lease_occupancies AS occupancies
  WHERE occupancies.organization_id = leases.organization_id
    AND occupancies.lease_id = leases.id
);

INSERT INTO public.lease_deposits (
  organization_id,
  lease_id,
  deposit_type,
  amount,
  currency,
  status,
  received_on,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  organization_id,
  id,
  'security',
  deposit_amount,
  coalesce(deposit_currency, monthly_rent_currency),
  'held',
  lease_start_date,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
FROM public.leases AS leases
WHERE deposit_amount IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.lease_deposits AS deposits
    WHERE deposits.organization_id = leases.organization_id
      AND deposits.lease_id = leases.id
      AND deposits.deposit_type = 'security'
      AND deposits.archived_at IS NULL
  );

REVOKE ALL ON FUNCTION public.validate_lease_occupancy_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_lease_backbone_records() FROM PUBLIC;
