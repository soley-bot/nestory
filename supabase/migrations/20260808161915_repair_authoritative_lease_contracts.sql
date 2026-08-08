-- Lease identity no longer owns term end dates, and non-Lease imports must not
-- retain a dead call to the retired lease writer. Keep both routines aligned
-- with the authoritative lease-term backbone before migration consolidation.
DO $migration$
DECLARE
  definition text;
  start_pos integer;
  end_pos integer;
BEGIN
  definition := pg_get_functiondef(
    'public.schedule_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,uuid,text)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');

  start_pos := strpos(
    definition,
    E'      IF p_end_date > v_lease.lease_end_date THEN'
  );
  end_pos := strpos(
    substring(definition FROM start_pos),
    E'\n\n      RETURN v_term_id;'
  );

  IF start_pos = 0 OR end_pos = 0 THEN
    RAISE EXCEPTION 'Could not remove retired lease end-date projection';
  END IF;

  end_pos := start_pos - 1 + end_pos;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || substring(definition FROM end_pos);
  EXECUTE definition;

  definition := pg_get_functiondef(
    'public.commit_generic_import_run_internal(uuid,uuid)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(
    definition,
    $snippet$    AND import_type IN ('properties', 'people', 'leases')$snippet$,
    $snippet$    AND import_type IN ('properties', 'people')$snippet$
  );

  start_pos := strpos(
    definition,
    $snippet$      ELSIF v_import_type = 'leases' THEN$snippet$
  );
  end_pos := strpos(
    substring(definition FROM start_pos),
    E'\n      ELSE\n        RAISE EXCEPTION ''Import type is not supported'''
  );

  IF start_pos = 0 OR end_pos = 0 THEN
    RAISE EXCEPTION 'Could not remove retired Lease import branch';
  END IF;

  end_pos := start_pos - 1 + end_pos + 1;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || substring(definition FROM end_pos);
  definition := replace(
    definition,
    E'          WHEN v_import_type = ''leases'' THEN ''created''\n',
    ''
  );
  EXECUTE definition;
END;
$migration$;
