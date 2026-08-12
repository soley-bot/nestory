CREATE OR REPLACE FUNCTION app_private.lock_owner_opening_roster_property(
  p_organization_id uuid,
  p_property_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL OR p_property_id IS NULL THEN
    RAISE EXCEPTION 'Owner opening roster property scope is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_opening_roster_property_v1',
        p_organization_id::text,
        p_property_id::text
      ),
      0
    )
  );
END;
$$;

ALTER FUNCTION app_private.lock_owner_opening_roster_property(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_opening_roster_property(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.lock_owner_opening_roster_person(
  p_organization_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL OR p_person_id IS NULL THEN
    RAISE EXCEPTION 'Owner opening roster person scope is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_opening_roster_person_v1',
        p_organization_id::text,
        p_person_id::text
      ),
      0
    )
  );
END;
$$;

ALTER FUNCTION app_private.lock_owner_opening_roster_person(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_opening_roster_person(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_roster_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE
    WHEN TG_OP IN ('UPDATE', 'DELETE') THEN pg_catalog.to_jsonb(OLD)
    ELSE '{}'::jsonb
  END;
  v_new jsonb := CASE
    WHEN TG_OP IN ('INSERT', 'UPDATE') THEN pg_catalog.to_jsonb(NEW)
    ELSE '{}'::jsonb
  END;
  v_scope record;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
    OR TG_TABLE_NAME NOT IN ('properties', 'property_owners', 'people', 'person_roles') THEN
    RAISE EXCEPTION 'Unexpected owner opening roster mutation source'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'TRUNCATE' THEN
    IF TG_TABLE_NAME = 'properties' THEN
      FOR v_scope IN
        SELECT property.organization_id, property.id AS property_id
        FROM public.properties AS property
        ORDER BY property.organization_id, property.id
      LOOP
        PERFORM app_private.lock_owner_opening_roster_property(
          v_scope.organization_id,
          v_scope.property_id
        );
      END LOOP;
    ELSIF TG_TABLE_NAME = 'property_owners' THEN
      FOR v_scope IN
        SELECT DISTINCT assignment.organization_id, assignment.person_id
        FROM public.property_owners AS assignment
        ORDER BY assignment.organization_id, assignment.person_id
      LOOP
        PERFORM app_private.lock_owner_opening_roster_person(
          v_scope.organization_id,
          v_scope.person_id
        );
      END LOOP;
      FOR v_scope IN
        SELECT DISTINCT assignment.organization_id, assignment.property_id
        FROM public.property_owners AS assignment
        ORDER BY assignment.organization_id, assignment.property_id
      LOOP
        PERFORM app_private.lock_owner_opening_roster_property(
          v_scope.organization_id,
          v_scope.property_id
        );
      END LOOP;
    ELSIF TG_TABLE_NAME = 'people' THEN
      FOR v_scope IN
        SELECT person.organization_id, person.id AS person_id
        FROM public.people AS person
        ORDER BY person.organization_id, person.id
      LOOP
        PERFORM app_private.lock_owner_opening_roster_person(
          v_scope.organization_id,
          v_scope.person_id
        );
      END LOOP;
      FOR v_scope IN
        SELECT DISTINCT assignment.organization_id, assignment.property_id
        FROM public.property_owners AS assignment
        ORDER BY assignment.organization_id, assignment.property_id
      LOOP
        PERFORM app_private.lock_owner_opening_roster_property(
          v_scope.organization_id,
          v_scope.property_id
        );
      END LOOP;
    ELSE
      FOR v_scope IN
        SELECT DISTINCT role_row.organization_id, role_row.person_id
        FROM public.person_roles AS role_row
        WHERE role_row.role = 'owner'
        ORDER BY role_row.organization_id, role_row.person_id
      LOOP
        PERFORM app_private.lock_owner_opening_roster_person(
          v_scope.organization_id,
          v_scope.person_id
        );
      END LOOP;
      FOR v_scope IN
        SELECT DISTINCT assignment.organization_id, assignment.property_id
        FROM public.property_owners AS assignment
        JOIN public.person_roles AS role_row
          ON role_row.organization_id = assignment.organization_id
         AND role_row.person_id = assignment.person_id
         AND role_row.role = 'owner'
        ORDER BY assignment.organization_id, assignment.property_id
      LOOP
        PERFORM app_private.lock_owner_opening_roster_property(
          v_scope.organization_id,
          v_scope.property_id
        );
      END LOOP;
    END IF;
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'property_owners' THEN
    FOR v_scope IN
      SELECT DISTINCT scope.organization_id, scope.person_id
      FROM (
        VALUES
          ((v_old ->> 'organization_id')::uuid, (v_old ->> 'person_id')::uuid),
          ((v_new ->> 'organization_id')::uuid, (v_new ->> 'person_id')::uuid)
      ) AS scope(organization_id, person_id)
      WHERE scope.organization_id IS NOT NULL AND scope.person_id IS NOT NULL
      ORDER BY scope.organization_id, scope.person_id
    LOOP
      PERFORM app_private.lock_owner_opening_roster_person(
        v_scope.organization_id,
        v_scope.person_id
      );
    END LOOP;

    FOR v_scope IN
      SELECT DISTINCT scope.organization_id, scope.property_id
      FROM (
        VALUES
          ((v_old ->> 'organization_id')::uuid, (v_old ->> 'property_id')::uuid),
          ((v_new ->> 'organization_id')::uuid, (v_new ->> 'property_id')::uuid)
      ) AS scope(organization_id, property_id)
      WHERE scope.organization_id IS NOT NULL AND scope.property_id IS NOT NULL
      ORDER BY scope.organization_id, scope.property_id
    LOOP
      PERFORM app_private.lock_owner_opening_roster_property(
        v_scope.organization_id,
        v_scope.property_id
      );
    END LOOP;

    IF TG_OP <> 'DELETE'
      AND (v_new ->> 'archived_at') IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.people AS person
        WHERE person.organization_id = (v_new ->> 'organization_id')::uuid
          AND person.id = (v_new ->> 'person_id')::uuid
          AND person.archived_at IS NULL
      ) THEN
      RAISE EXCEPTION 'owner_person_inactive' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME IN ('people', 'person_roles') THEN
    IF TG_TABLE_NAME = 'person_roles'
      AND coalesce(v_old ->> 'role', '') <> 'owner'
      AND coalesce(v_new ->> 'role', '') <> 'owner' THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;

    FOR v_scope IN
      SELECT DISTINCT scope.organization_id, scope.person_id
      FROM (
        VALUES
          (
            (v_old ->> 'organization_id')::uuid,
            CASE WHEN TG_TABLE_NAME = 'people'
              THEN (v_old ->> 'id')::uuid ELSE (v_old ->> 'person_id')::uuid END
          ),
          (
            (v_new ->> 'organization_id')::uuid,
            CASE WHEN TG_TABLE_NAME = 'people'
              THEN (v_new ->> 'id')::uuid ELSE (v_new ->> 'person_id')::uuid END
          )
      ) AS scope(organization_id, person_id)
      WHERE scope.organization_id IS NOT NULL AND scope.person_id IS NOT NULL
      ORDER BY scope.organization_id, scope.person_id
    LOOP
      PERFORM app_private.lock_owner_opening_roster_person(
        v_scope.organization_id,
        v_scope.person_id
      );
    END LOOP;

    FOR v_scope IN
      WITH affected_people AS (
        SELECT DISTINCT scope.organization_id, scope.person_id
        FROM (
          VALUES
            (
              (v_old ->> 'organization_id')::uuid,
              CASE WHEN TG_TABLE_NAME = 'people'
                THEN (v_old ->> 'id')::uuid ELSE (v_old ->> 'person_id')::uuid END
            ),
            (
              (v_new ->> 'organization_id')::uuid,
              CASE WHEN TG_TABLE_NAME = 'people'
                THEN (v_new ->> 'id')::uuid ELSE (v_new ->> 'person_id')::uuid END
            )
        ) AS scope(organization_id, person_id)
        WHERE scope.organization_id IS NOT NULL AND scope.person_id IS NOT NULL
      )
      SELECT DISTINCT assignment.organization_id, assignment.property_id
      FROM public.property_owners AS assignment
      JOIN affected_people AS affected
        ON affected.organization_id = assignment.organization_id
       AND affected.person_id = assignment.person_id
      ORDER BY assignment.organization_id, assignment.property_id
    LOOP
      PERFORM app_private.lock_owner_opening_roster_property(
        v_scope.organization_id,
        v_scope.property_id
      );
    END LOOP;
  ELSE
    FOR v_scope IN
      SELECT DISTINCT scope.organization_id, scope.property_id
      FROM (
        VALUES
          ((v_old ->> 'organization_id')::uuid, (v_old ->> 'id')::uuid),
          ((v_new ->> 'organization_id')::uuid, (v_new ->> 'id')::uuid)
      ) AS scope(organization_id, property_id)
      WHERE scope.organization_id IS NOT NULL AND scope.property_id IS NOT NULL
      ORDER BY scope.organization_id, scope.property_id
    LOOP
      PERFORM app_private.lock_owner_opening_roster_property(
        v_scope.organization_id,
        v_scope.property_id
      );
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_opening_roster_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_opening_roster_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_owner_opening_roster_property_mutation
BEFORE INSERT OR DELETE OR UPDATE OF organization_id, id, archived_at
ON public.properties
FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE TRIGGER guard_owner_opening_roster_property_truncate
BEFORE TRUNCATE ON public.properties
FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE TRIGGER guard_owner_opening_roster_assignment_mutation
BEFORE INSERT OR DELETE OR UPDATE OF
  organization_id, property_id, person_id, id, ownership_percent,
  started_on, ended_on, archived_at
ON public.property_owners
FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE TRIGGER guard_owner_opening_roster_assignment_truncate
BEFORE TRUNCATE ON public.property_owners
FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE TRIGGER guard_owner_opening_roster_person_mutation
BEFORE INSERT OR DELETE OR UPDATE OF organization_id, id, archived_at
ON public.people
FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE TRIGGER guard_owner_opening_roster_person_truncate
BEFORE TRUNCATE ON public.people
FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE TRIGGER guard_owner_opening_roster_role_mutation
BEFORE INSERT OR DELETE OR UPDATE OF
  organization_id, person_id, role, status, archived_at
ON public.person_roles
FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE TRIGGER guard_owner_opening_roster_role_truncate
BEFORE TRUNCATE ON public.person_roles
FOR EACH STATEMENT EXECUTE FUNCTION app_private.guard_owner_opening_roster_mutation();

CREATE OR REPLACE FUNCTION app_private.lock_owner_opening_property_month(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_opening_property_month_v1',
        p_organization_id::text,
        p_property_id::text,
        p_currency::text,
        pg_catalog.date_trunc('month', p_effective_date)::date::text
      ),
      0
    )
  );

END;
$$;

ALTER FUNCTION app_private.lock_owner_opening_property_month(
  uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_opening_property_month(
  uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

-- The shared advisory boundary supersedes row locks on mutable roster inputs.
-- Removing only those KEY SHARE clauses avoids a row-lock/advisory-lock cycle
-- when direct RLS-authorized DML reaches the BEFORE ROW mutation guards.
DO $$
DECLARE
  v_definition text;
  v_expected_count integer;
  v_actual_count integer;
  v_function regprocedure;
  v_lock_token text;
  v_lock_replacement text;
BEGIN
  FOR v_function, v_expected_count, v_lock_token, v_lock_replacement IN
    SELECT
      function_row.function_identity::regprocedure,
      function_row.expected_count,
      function_row.lock_token,
      function_row.lock_replacement
    FROM (
      VALUES
        (
          'public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)',
          3,
          $token$  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );$token$,
          $replacement$  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );

  PERFORM app_private.lock_owner_opening_roster_property(
    p_organization_id,
    p_property_id
  );$replacement$
        ),
        (
          'public.review_owner_opening_balance(uuid,uuid,text,text,text)',
          1,
          $token$  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    v_snapshot.property_id,
    v_snapshot.currency,
    v_snapshot.effective_date
  );$token$,
          $replacement$  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    v_snapshot.property_id,
    v_snapshot.currency,
    v_snapshot.effective_date
  );

  PERFORM app_private.lock_owner_opening_roster_property(
    p_organization_id,
    v_snapshot.property_id
  );$replacement$
        ),
        (
          'public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text)',
          1,
          $token$  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    v_target_snapshot.property_id,
    v_target_snapshot.currency,
    v_target_snapshot.effective_date
  );$token$,
          $replacement$  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    v_target_snapshot.property_id,
    v_target_snapshot.currency,
    v_target_snapshot.effective_date
  );

  PERFORM app_private.lock_owner_opening_roster_property(
    p_organization_id,
    v_target_snapshot.property_id
  );$replacement$
        )
    ) AS function_row(
      function_identity,
      expected_count,
      lock_token,
      lock_replacement
    )
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_function)
    INTO STRICT v_definition;

    SELECT count(*)::integer
    INTO v_actual_count
    FROM pg_catalog.regexp_matches(
      v_definition,
      E'\\n[[:space:]]*FOR KEY SHARE;',
      'g'
    );

    IF v_actual_count <> v_expected_count THEN
      RAISE EXCEPTION
        'Unexpected roster row-lock count for %: expected %, got %',
        v_function::text,
        v_expected_count,
        v_actual_count;
    END IF;

    v_definition := pg_catalog.regexp_replace(
      v_definition,
      E'\\n[[:space:]]*FOR KEY SHARE;',
      ';',
      'g'
    );

    v_actual_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_lock_token, ''))
    ) / pg_catalog.length(v_lock_token);
    IF v_actual_count <> 1 THEN
      RAISE EXCEPTION
        'Unexpected property-month lock call count for %: expected 1, got %',
        v_function::text,
        v_actual_count;
    END IF;

    v_definition := pg_catalog.replace(
      v_definition,
      v_lock_token,
      v_lock_replacement
    );
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
