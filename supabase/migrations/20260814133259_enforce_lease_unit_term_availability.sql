CREATE OR REPLACE FUNCTION app_private.enforce_lease_unit_term_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_unit_id uuid;
BEGIN
  IF NEW.archived_at IS NOT NULL
    OR NEW.status NOT IN ('active', 'draft', 'upcoming') THEN
    RETURN NEW;
  END IF;

  SELECT leases.unit_id
  INTO v_unit_id
  FROM public.leases AS leases
  WHERE leases.organization_id = NEW.organization_id
    AND leases.id = NEW.lease_id
    AND leases.archived_at IS NULL;

  IF v_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Every term write for a Unit takes the same row lock. This serializes the
  -- check with Lease creation and closes the gap between picker refresh and
  -- save without relying on occupancy evidence being present.
  PERFORM 1
  FROM public.units AS units
  WHERE units.organization_id = NEW.organization_id
    AND units.id = v_unit_id
    AND units.archived_at IS NULL
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.lease_terms AS terms
    JOIN public.leases AS leases
      ON leases.organization_id = terms.organization_id
      AND leases.id = terms.lease_id
    WHERE terms.organization_id = NEW.organization_id
      AND terms.lease_id <> NEW.lease_id
      AND terms.archived_at IS NULL
      AND terms.status IN ('active', 'draft', 'upcoming')
      AND leases.archived_at IS NULL
      AND leases.unit_id = v_unit_id
      AND daterange(terms.start_date, terms.end_date, '[]')
        && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION
      'Unit is already reserved for the selected Lease dates'
      USING
        ERRCODE = '23P01',
        DETAIL = 'lease_unit_term_conflict';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_lease_unit_term_availability()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lease_terms_enforce_unit_availability
ON public.lease_terms;

CREATE TRIGGER lease_terms_enforce_unit_availability
BEFORE INSERT OR UPDATE OF
  lease_id,
  start_date,
  end_date,
  status,
  archived_at
ON public.lease_terms
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_lease_unit_term_availability();
