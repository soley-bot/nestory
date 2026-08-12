CREATE OR REPLACE FUNCTION app_private.lock_owner_opening_roster_inputs(
  p_organization_id uuid,
  p_property_id uuid,
  p_effective_date date,
  p_target_property_owner_id uuid DEFAULT NULL,
  p_target_owner_person_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL
    OR p_property_id IS NULL
    OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Owner opening roster input scope is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_target_property_owner_id IS NOT NULL
    AND p_target_owner_person_id IS NULL THEN
    RAISE EXCEPTION 'Owner opening roster target person is required'
      USING ERRCODE = '22023';
  END IF;

  -- BEFORE ROW mutation triggers run after PostgreSQL has acquired the row being
  -- changed. Workflow paths must therefore take every shared validator/FK tuple
  -- before taking the advisory boundary used by those triggers.
  PERFORM property.id
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  PERFORM assignment.id
  FROM public.property_owners AS assignment
  WHERE assignment.organization_id = p_organization_id
    AND assignment.property_id = p_property_id
    AND (
      (
        assignment.archived_at IS NULL
        AND assignment.started_on <= p_effective_date
        AND (
          assignment.ended_on IS NULL
          OR p_effective_date < assignment.ended_on
        )
      )
      OR (
        p_target_property_owner_id IS NOT NULL
        AND assignment.id = p_target_property_owner_id
        AND assignment.person_id = p_target_owner_person_id
      )
    )
  ORDER BY assignment.id
  FOR SHARE;

  PERFORM person.id
  FROM public.people AS person
  WHERE person.organization_id = p_organization_id
    AND (
      person.id = p_target_owner_person_id
      OR EXISTS (
        SELECT 1
        FROM public.property_owners AS assignment
        WHERE assignment.organization_id = p_organization_id
          AND assignment.property_id = p_property_id
          AND assignment.person_id = person.id
          AND (
            (
              assignment.archived_at IS NULL
              AND assignment.started_on <= p_effective_date
              AND (
                assignment.ended_on IS NULL
                OR p_effective_date < assignment.ended_on
              )
            )
            OR (
              p_target_property_owner_id IS NOT NULL
              AND assignment.id = p_target_property_owner_id
              AND assignment.person_id = p_target_owner_person_id
            )
          )
      )
    )
  ORDER BY person.id
  FOR SHARE;

  PERFORM owner_role.id
  FROM public.person_roles AS owner_role
  WHERE owner_role.organization_id = p_organization_id
    AND owner_role.role = 'owner'
    AND (
      owner_role.person_id = p_target_owner_person_id
      OR EXISTS (
        SELECT 1
        FROM public.property_owners AS assignment
        WHERE assignment.organization_id = p_organization_id
          AND assignment.property_id = p_property_id
          AND assignment.person_id = owner_role.person_id
          AND (
            (
              assignment.archived_at IS NULL
              AND assignment.started_on <= p_effective_date
              AND (
                assignment.ended_on IS NULL
                OR p_effective_date < assignment.ended_on
              )
            )
            OR (
              p_target_property_owner_id IS NOT NULL
              AND assignment.id = p_target_property_owner_id
              AND assignment.person_id = p_target_owner_person_id
            )
          )
      )
    )
  ORDER BY owner_role.id
  FOR SHARE;

  PERFORM app_private.lock_owner_opening_roster_property(
    p_organization_id,
    p_property_id
  );
END;
$$;

ALTER FUNCTION app_private.lock_owner_opening_roster_inputs(
  uuid, uuid, date, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_opening_roster_inputs(
  uuid, uuid, date, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- Preserve replay-first and the established property-month lock order while
-- replacing the direct roster advisory with the tuple-before-advisory helper.
DO $$
DECLARE
  v_definition text;
  v_actual_count integer;
  v_function regprocedure;
  v_old_lock text;
  v_new_lock text;
BEGIN
  FOR v_function, v_old_lock, v_new_lock IN
    SELECT
      function_row.function_identity::regprocedure,
      function_row.old_lock,
      function_row.new_lock
    FROM (
      VALUES
        (
          'public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)',
          $old$  PERFORM app_private.lock_owner_opening_roster_property(
    p_organization_id,
    p_property_id
  );$old$,
          $new$  PERFORM app_private.lock_owner_opening_roster_inputs(
    p_organization_id,
    p_property_id,
    p_effective_date,
    NULL::uuid,
    p_owner_person_id
  );$new$
        ),
        (
          'public.review_owner_opening_balance(uuid,uuid,text,text,text)',
          $old$  PERFORM app_private.lock_owner_opening_roster_property(
    p_organization_id,
    v_snapshot.property_id
  );$old$,
          $new$  PERFORM app_private.lock_owner_opening_roster_inputs(
    p_organization_id,
    v_snapshot.property_id,
    v_snapshot.effective_date,
    v_snapshot.property_owner_id,
    v_snapshot.owner_person_id
  );$new$
        ),
        (
          'public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text)',
          $old$  PERFORM app_private.lock_owner_opening_roster_property(
    p_organization_id,
    v_target_snapshot.property_id
  );$old$,
          $new$  PERFORM app_private.lock_owner_opening_roster_inputs(
    p_organization_id,
    v_target_snapshot.property_id,
    v_target_snapshot.effective_date,
    v_target_snapshot.property_owner_id,
    v_target_snapshot.owner_person_id
  );$new$
        )
    ) AS function_row(function_identity, old_lock, new_lock)
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_function)
    INTO STRICT v_definition;

    v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');
    v_old_lock := pg_catalog.replace(v_old_lock, E'\r\n', E'\n');
    v_new_lock := pg_catalog.replace(v_new_lock, E'\r\n', E'\n');

    v_actual_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old_lock, ''))
    ) / pg_catalog.length(v_old_lock);
    IF v_actual_count <> 1 THEN
      RAISE EXCEPTION
        'Unexpected direct roster lock count for %: expected 1, got %',
        v_function::text,
        v_actual_count;
    END IF;

    v_definition := pg_catalog.replace(v_definition, v_old_lock, v_new_lock);
    EXECUTE v_definition;
  END LOOP;
END;
$$;

ALTER FUNCTION public.submit_owner_opening_balance(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, uuid, text, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, uuid, text, uuid, text
) TO authenticated;

ALTER FUNCTION public.review_owner_opening_balance(uuid, uuid, text, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_owner_opening_balance(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_owner_opening_balance(
  uuid, uuid, text, text, text
) TO authenticated;

ALTER FUNCTION public.submit_owner_opening_balance_correction(
  uuid, uuid, numeric, text, text, uuid, text, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance_correction(
  uuid, uuid, numeric, text, text, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance_correction(
  uuid, uuid, numeric, text, text, uuid, text, uuid, text
) TO authenticated;
