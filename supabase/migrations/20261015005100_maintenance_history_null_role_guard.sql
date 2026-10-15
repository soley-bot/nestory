-- NULL is not an allowed legacy role. Without this explicit guard, a custom
-- member's real branch/Person assignment can satisfy the history query after
-- SQL three-valued logic skips the existing NOT IN authorization check.
-- Keep the existing allowed roles, task filters, function attributes and ACL.
DO $maintenance_history_null_role_guard$
DECLARE
  v_signature constant regprocedure :=
    'public.get_maintenance_cost_status_history(uuid,uuid[])'::regprocedure;
  v_anchor constant text :=
    '  IF v_actor_role NOT IN (''super_admin'', ''operations_manager'', ''operations_member'') THEN';
  v_replacement constant text :=
    '  IF v_actor_role IS NULL OR v_actor_role NOT IN (''super_admin'', ''operations_manager'', ''operations_member'') THEN';
  v_definition text;
  v_source_before text;
  v_source_after text;
  v_attributes_before jsonb;
  v_attributes_after jsonb;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(routine.oid), routine.prosrc,
    pg_catalog.to_jsonb(routine) - 'prosrc'
  INTO STRICT v_definition, v_source_before, v_attributes_before
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_signature;

  IF (length(v_source_before) - length(replace(v_source_before, v_anchor, '')))
      / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected maintenance history role guard predecessor: %', v_signature;
  END IF;

  -- The single-line replacement preserves either LF or CRLF source bytes.
  EXECUTE replace(v_definition, v_anchor, v_replacement);

  SELECT routine.prosrc, pg_catalog.to_jsonb(routine) - 'prosrc'
  INTO STRICT v_source_after, v_attributes_after
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_signature;

  IF v_source_after IS DISTINCT FROM replace(v_source_before, v_anchor, v_replacement) THEN
    RAISE EXCEPTION 'Maintenance history source changed outside the NULL-role guard';
  END IF;
  -- Includes owner, ACL, security mode, volatility, search path, arguments,
  -- return type, OID and all other pg_proc attributes.
  IF v_attributes_after IS DISTINCT FROM v_attributes_before THEN
    RAISE EXCEPTION 'Maintenance history function attributes or ACL changed';
  END IF;
END;
$maintenance_history_null_role_guard$;
