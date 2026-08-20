CREATE TABLE app_private.lease_scope_terminal_recovery_tokens (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  organization_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (backend_pid, transaction_id, organization_id, lease_id)
);

ALTER TABLE app_private.lease_scope_terminal_recovery_tokens OWNER TO postgres;
ALTER TABLE app_private.lease_scope_terminal_recovery_tokens
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.lease_scope_terminal_recovery_tokens
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE app_private.lease_scope_terminal_recovery_tokens IS
  'Transaction-local capabilities issued only by the checked Lease lifecycle writer for terminal recovery on legacy archived scope.';

CREATE OR REPLACE FUNCTION app_private.lock_live_unit_lease_scope(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM 1
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
    AND property.archived_at IS NULL
    AND property.rental_structure = 'multi_unit'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found under selected property'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1
  FROM public.units AS unit
  WHERE unit.organization_id = p_organization_id
    AND unit.property_id = p_property_id
    AND unit.id = p_unit_id
    AND unit.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found under selected property'
      USING ERRCODE = '23503';
  END IF;
END;
$$;

ALTER FUNCTION app_private.lock_live_unit_lease_scope(uuid, uuid, uuid)
OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_live_unit_lease_scope(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.lock_live_unit_lease_scope(uuid, uuid, uuid) IS
  'Locks a live multi-unit Property before its Unit so Lease creation and scope archival serialize in one order.';

DO $$
DECLARE
  v_definition text;
  v_previous_scope_lock constant text := pg_catalog.replace($scope$
  PERFORM 1
  FROM public.units AS units
  WHERE units.organization_id = p_organization_id
    AND units.property_id = p_property_id
    AND units.id = p_unit_id
    AND units.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found under selected property'
      USING ERRCODE = '23503';
  END IF;
$scope$, E'\r\n', E'\n');
  v_serialized_scope_lock constant text := pg_catalog.replace($scope$
  PERFORM app_private.lock_live_unit_lease_scope(
    p_organization_id,
    p_property_id,
    p_unit_id
  );
$scope$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'app_private.create_lease_with_relationships_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_previous_scope_lock) = 0 THEN
    RAISE EXCEPTION
      'Expected unit Lease creation scope lock was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_previous_scope_lock,
    v_serialized_scope_lock
  );

  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_forgeable_guard constant text := pg_catalog.replace($guard$current_setting(
              'app.lease_scope_terminal_recovery_context',
              true
            ) = 'checked-lease-lifecycle-v1'$guard$, E'\r\n', E'\n');
  v_private_guard constant text := pg_catalog.replace($guard$EXISTS (
              SELECT 1
              FROM app_private.lease_scope_terminal_recovery_tokens AS recovery
              WHERE recovery.backend_pid = pg_catalog.pg_backend_pid()
                AND recovery.transaction_id = pg_catalog.txid_current()
                AND recovery.organization_id = p_organization_id
                AND recovery.lease_id = p_lease_id
            )$guard$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'app_private.create_authoritative_lease_term_internal(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_forgeable_guard) = 0 THEN
    RAISE EXCEPTION
      'Expected unit Lease terminal recovery guard was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_forgeable_guard,
    v_private_guard
  );

  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_forgeable_guard constant text := pg_catalog.replace($guard$current_setting(
         'app.lease_scope_terminal_recovery_context',
         true
       ) = 'checked-lease-lifecycle-v1'$guard$, E'\r\n', E'\n');
  v_private_guard constant text := pg_catalog.replace($guard$EXISTS (
         SELECT 1
         FROM app_private.lease_scope_terminal_recovery_tokens AS recovery
         WHERE recovery.backend_pid = pg_catalog.pg_backend_pid()
           AND recovery.transaction_id = pg_catalog.txid_current()
           AND recovery.organization_id = p_organization_id
           AND recovery.lease_id = p_lease_id
       )$guard$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'app_private.create_authoritative_property_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_forgeable_guard) = 0 THEN
    RAISE EXCEPTION
      'Expected whole-property Lease terminal recovery guard was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_forgeable_guard,
    v_private_guard
  );

  EXECUTE v_definition;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_forgeable_issue constant text := pg_catalog.replace($issue$
    PERFORM set_config(
      'app.lease_scope_terminal_recovery_context',
      'checked-lease-lifecycle-v1',
      true
    );
$issue$, E'\r\n', E'\n');
  v_private_issue constant text := pg_catalog.replace($issue$
    INSERT INTO app_private.lease_scope_terminal_recovery_tokens (
      backend_pid,
      transaction_id,
      organization_id,
      lease_id
    )
    VALUES (
      pg_catalog.pg_backend_pid(),
      pg_catalog.txid_current(),
      p_organization_id,
      p_lease_id
    );
$issue$, E'\r\n', E'\n');
  v_forgeable_revoke constant text := pg_catalog.replace($revoke$
    PERFORM set_config(
      'app.lease_scope_terminal_recovery_context',
      'off',
      true
    );
$revoke$, E'\r\n', E'\n');
  v_private_revoke constant text := pg_catalog.replace($revoke$
    DELETE FROM app_private.lease_scope_terminal_recovery_tokens AS recovery
    WHERE recovery.backend_pid = pg_catalog.pg_backend_pid()
      AND recovery.transaction_id = pg_catalog.txid_current()
      AND recovery.organization_id = p_organization_id
      AND recovery.lease_id = p_lease_id;
$revoke$, E'\r\n', E'\n');
BEGIN
  SELECT pg_get_functiondef(
    'public.transition_lease_lifecycle(uuid,uuid,text,uuid,text,date,date,text,text)'::regprocedure
  )
  INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  IF strpos(v_definition, v_forgeable_issue) = 0
    OR strpos(v_definition, v_forgeable_revoke) = 0 THEN
    RAISE EXCEPTION
      'Expected checked lifecycle recovery context was not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_forgeable_issue,
    v_private_issue
  );
  v_definition := replace(
    v_definition,
    v_forgeable_revoke,
    v_private_revoke
  );

  EXECUTE v_definition;
END;
$$;

COMMENT ON FUNCTION app_private.create_lease_with_relationships_internal(
  uuid, uuid, uuid, uuid, date, date, numeric, public.currency_code, integer,
  text, text, numeric, public.currency_code, text, jsonb, text
) IS
  'Creates a Unit Lease only after locking its live Property and Unit in archive-safe order.';

COMMENT ON FUNCTION public.transition_lease_lifecycle(
  uuid, uuid, text, uuid, text, date, date, text, text
) IS
  'Checked Lease lifecycle transition writer; issues a private transaction capability only while recording a terminal term for legacy archived scope.';
