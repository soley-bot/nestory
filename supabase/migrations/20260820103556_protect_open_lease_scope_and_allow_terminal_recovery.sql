CREATE OR REPLACE FUNCTION app_private.guard_open_lease_scope_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.archived_at IS NULL OR OLD.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'units' AND EXISTS (
    SELECT 1
    FROM public.leases AS lease
    WHERE lease.organization_id = NEW.organization_id
      AND lease.unit_id = NEW.id
      AND lease.archived_at IS NULL
      AND lease.status IN ('draft', 'active', 'notice_given')
  ) THEN
    RAISE EXCEPTION 'Unit has an open Lease'
      USING ERRCODE = '55000', DETAIL = 'lease_transition_required';
  END IF;

  IF TG_TABLE_NAME = 'properties' AND EXISTS (
    SELECT 1
    FROM public.leases AS lease
    WHERE lease.organization_id = NEW.organization_id
      AND lease.property_id = NEW.id
      AND lease.archived_at IS NULL
      AND lease.status IN ('draft', 'active', 'notice_given')
  ) THEN
    RAISE EXCEPTION 'Property has an open Lease'
      USING ERRCODE = '55000', DETAIL = 'lease_transition_required';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_open_lease_scope_archive() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_open_lease_scope_archive()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_unit_open_lease_scope_archive
ON public.units;

CREATE TRIGGER guard_unit_open_lease_scope_archive
BEFORE UPDATE OF archived_at ON public.units
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_open_lease_scope_archive();

DROP TRIGGER IF EXISTS guard_property_open_lease_scope_archive
ON public.properties;

CREATE TRIGGER guard_property_open_lease_scope_archive
BEFORE UPDATE OF archived_at ON public.properties
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_open_lease_scope_archive();

COMMENT ON FUNCTION app_private.guard_open_lease_scope_archive() IS
  'Prevents property or unit archival from orphaning a draft, active, or notice-given Lease.';

DO $$
DECLARE
  v_definition text;
  v_previous_scope_guard constant text := $guard$
  IF NOT FOUND
    OR NOT EXISTS (
      SELECT 1
      FROM public.properties AS properties
      WHERE properties.id = v_lease.property_id
        AND properties.organization_id = p_organization_id
        AND properties.archived_at IS NULL
        AND (
          (
            properties.rental_structure = 'single_space'
            AND v_lease.unit_id IS NULL
          )
          OR (
            properties.rental_structure = 'multi_unit'
            AND v_lease.unit_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.units AS units
              WHERE units.id = v_lease.unit_id
                AND units.organization_id = p_organization_id
                AND units.property_id = v_lease.property_id
                AND units.archived_at IS NULL
            )
          )
        )
    ) THEN
$guard$;
  v_recovery_scope_guard constant text := $guard$
  IF NOT FOUND
    OR NOT EXISTS (
      SELECT 1
      FROM public.properties AS properties
      WHERE properties.id = v_lease.property_id
        AND properties.organization_id = p_organization_id
        AND (
          (
            properties.rental_structure = 'single_space'
            AND v_lease.unit_id IS NULL
          )
          OR (
            properties.rental_structure = 'multi_unit'
            AND v_lease.unit_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.units AS units
              WHERE units.id = v_lease.unit_id
                AND units.organization_id = p_organization_id
                AND units.property_id = v_lease.property_id
            )
          )
        )
        AND (
          (
            properties.archived_at IS NULL
            AND (
              properties.rental_structure = 'single_space'
              OR EXISTS (
                SELECT 1
                FROM public.units AS units
                WHERE units.id = v_lease.unit_id
                  AND units.organization_id = p_organization_id
                  AND units.property_id = v_lease.property_id
                  AND units.archived_at IS NULL
              )
            )
          )
          OR (
            v_status = 'terminated'
            AND v_lease.status IN ('draft', 'active', 'notice_given')
            AND current_setting(
              'app.lease_scope_terminal_recovery_context',
              true
            ) = 'checked-lease-lifecycle-v1'
          )
        )
    ) THEN
$guard$;
BEGIN
  SELECT pg_get_functiondef(
    'app_private.create_authoritative_lease_term_internal(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure
  )
  INTO v_definition;

  IF strpos(v_definition, v_previous_scope_guard) = 0 THEN
    RAISE EXCEPTION
      'Expected authoritative lease-term scope guard was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_previous_scope_guard,
    v_recovery_scope_guard
  );

  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_previous_scope_query constant text := $scope$
  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  JOIN public.properties AS property
    ON property.organization_id = lease.organization_id
   AND property.id = lease.property_id
   AND property.archived_at IS NULL
   AND property.rental_structure = 'single_space'
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.unit_id IS NULL
    AND lease.archived_at IS NULL
  FOR UPDATE OF lease;
$scope$;
  v_recovery_scope_query constant text := $scope$
  SELECT lease.* INTO v_lease
  FROM public.leases AS lease
  JOIN public.properties AS property
    ON property.organization_id = lease.organization_id
   AND property.id = lease.property_id
   AND property.rental_structure = 'single_space'
   AND (
     property.archived_at IS NULL
     OR (
       v_status = 'terminated'
       AND lease.status IN ('draft', 'active', 'notice_given')
       AND current_setting(
         'app.lease_scope_terminal_recovery_context',
         true
       ) = 'checked-lease-lifecycle-v1'
     )
   )
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.unit_id IS NULL
    AND lease.archived_at IS NULL
  FOR UPDATE OF lease;
$scope$;
BEGIN
  SELECT pg_get_functiondef(
    'app_private.create_authoritative_property_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure
  )
  INTO v_definition;

  IF strpos(v_definition, v_previous_scope_query) = 0 THEN
    RAISE EXCEPTION
      'Expected whole-property lease-term scope query was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_previous_scope_query,
    v_recovery_scope_query
  );

  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_previous_terminal_term_call constant text := $call$
    v_term_id := public.create_authoritative_lease_term(
      p_organization_id,
      p_lease_id,
      v_current_term.start_date,
      v_term_end_date,
      v_current_term.rent_amount,
      v_current_term.rent_currency,
      v_current_term.rent_due_day,
      v_current_term.payment_frequency,
      'terminated',
      v_current_term.id,
      v_idempotency_key || ':term'
    );
$call$;
  v_checked_terminal_term_call constant text := $call$
    PERFORM set_config(
      'app.lease_scope_terminal_recovery_context',
      'checked-lease-lifecycle-v1',
      true
    );

    v_term_id := public.create_authoritative_lease_term(
      p_organization_id,
      p_lease_id,
      v_current_term.start_date,
      v_term_end_date,
      v_current_term.rent_amount,
      v_current_term.rent_currency,
      v_current_term.rent_due_day,
      v_current_term.payment_frequency,
      'terminated',
      v_current_term.id,
      v_idempotency_key || ':term'
    );

    PERFORM set_config(
      'app.lease_scope_terminal_recovery_context',
      'off',
      true
    );
$call$;
BEGIN
  SELECT pg_get_functiondef(
    'public.transition_lease_lifecycle(uuid,uuid,text,uuid,text,date,date,text,text)'::regprocedure
  )
  INTO v_definition;

  IF strpos(v_definition, v_previous_terminal_term_call) = 0 THEN
    RAISE EXCEPTION
      'Expected checked lifecycle terminal term call was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_previous_terminal_term_call,
    v_checked_terminal_term_call
  );

  EXECUTE v_definition;
END;
$$;

COMMENT ON FUNCTION app_private.create_authoritative_lease_term_internal(
  uuid, uuid, date, date, numeric, public.currency_code, integer, text, text, uuid, text
) IS
  'Creates authoritative Lease terms for supported scopes and checked terminal recovery of legacy archived scopes.';

COMMENT ON FUNCTION app_private.create_authoritative_property_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code, integer, text, text, uuid, text
) IS
  'Creates authoritative whole-property Lease terms and checked terminal recovery of legacy archived scopes.';

COMMENT ON FUNCTION public.transition_lease_lifecycle(
  uuid, uuid, text, uuid, text, date, date, text, text
) IS
  'Transitions Lease lifecycle with stale-write checks, immutable evidence history, and terminal recovery for legacy archived scopes.';
