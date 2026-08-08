-- Maintenance records describe the work. Finance approval owns any Ledger effect.
DO $migration$
DECLARE
  definition text;
  start_pos integer;
  end_pos integer;
BEGIN
  definition := pg_get_functiondef(
    'app_private.update_maintenance_task_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,boolean,uuid,uuid)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(
    definition,
    ', p_link_actual_cost_to_ledger boolean',
    ''
  );
  definition := replace(definition, E'  new_ledger_entry_id uuid;\n', '');
  definition := replace(definition, E'  ledger_category text;\n', '');
  definition := replace(definition, E'  ledger_transaction_date date;\n', '');

  start_pos := strpos(
    definition,
    E'  IF actor_role = ''operations_manager'' AND coalesce(p_link_actual_cost_to_ledger, false) THEN'
  );
  IF start_pos > 0 THEN
    end_pos := start_pos - 1 + strpos(
      substring(definition FROM start_pos),
      E'  END IF;'
    ) + length(E'  END IF;');
    definition := substring(definition FROM 1 FOR start_pos - 1)
      || substring(definition FROM end_pos);
  END IF;

  start_pos := strpos(
    definition,
    E'  new_ledger_entry_id := old_task.ledger_entry_id;'
  );
  end_pos := strpos(
    definition,
    E'  IF new_timeline_event_id IS NULL THEN'
  );
  IF start_pos = 0 OR end_pos <= start_pos THEN
    RAISE EXCEPTION 'Could not remove retired maintenance Ledger block';
  END IF;
  definition := substring(definition FROM 1 FOR start_pos - 1)
    || E'  new_timeline_event_id := old_task.timeline_event_id;\n\n'
    || substring(definition FROM end_pos);

  definition := replace(definition, E'      ledger_entry_id,\n', '');
  definition := replace(definition, E'      new_ledger_entry_id,\n', '');
  definition := replace(
    definition,
    E'      ledger_entry_id = new_ledger_entry_id,\n',
    ''
  );
  definition := replace(
    definition,
    E'    ledger_entry_id = new_ledger_entry_id,\n',
    ''
  );
  definition := replace(
    definition,
    E'      ''ledger_entry_id'', old_task.ledger_entry_id,\n',
    ''
  );
  definition := replace(
    definition,
    E'      ''ledger_entry_id'', new_task.ledger_entry_id,\n',
    ''
  );
  EXECUTE definition;

  definition := pg_get_functiondef(
    'public.update_maintenance_task(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,boolean,uuid,uuid)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(
    definition,
    ', p_link_actual_cost_to_ledger boolean',
    ''
  );
  start_pos := strpos(
    definition,
    E'  IF coalesce(p_link_actual_cost_to_ledger, false) THEN'
  );
  IF start_pos > 0 THEN
    end_pos := start_pos - 1 + strpos(
      substring(definition FROM start_pos),
      E'  END IF;'
    ) + length(E'  END IF;');
    definition := substring(definition FROM 1 FOR start_pos - 1)
      || substring(definition FROM end_pos);
  END IF;
  definition := replace(
    definition,
    E'    p_recurrence_frequency,\n    false,\n    p_branch_id,',
    E'    p_recurrence_frequency,\n    p_branch_id,'
  );
  EXECUTE definition;
END;
$migration$;

DROP FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
);
DROP FUNCTION app_private.update_maintenance_task_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
);

REVOKE ALL ON FUNCTION app_private.update_maintenance_task_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_maintenance_task(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, uuid, uuid
) TO authenticated;

DO $migration$
DECLARE
  routine_name text;
  routine_oid regprocedure;
  definition text;
  start_pos integer;
  end_pos integer;
BEGIN
  definition := pg_get_functiondef(
    'app_private.guard_maintenance_cost_fields()'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  start_pos := strpos(
    definition,
    E'  IF TG_OP = ''INSERT'' AND NEW.ledger_entry_id IS NOT NULL THEN'
  );
  IF start_pos > 0 THEN
    end_pos := start_pos - 1 + strpos(
      substring(definition FROM start_pos),
      E'  END IF;'
    ) + length(E'  END IF;');
    definition := substring(definition FROM 1 FOR start_pos - 1)
      || substring(definition FROM end_pos);
  END IF;
  start_pos := strpos(
    definition,
    E'    IF NEW.ledger_entry_id IS DISTINCT FROM OLD.ledger_entry_id'
  );
  IF start_pos > 0 THEN
    end_pos := start_pos - 1 + strpos(
      substring(definition FROM start_pos),
      E'    END IF;'
    ) + length(E'    END IF;');
    definition := substring(definition FROM 1 FOR start_pos - 1)
      || substring(definition FROM end_pos);
  END IF;
  EXECUTE definition;

  definition := pg_get_functiondef(
    'public.submit_maintenance_cost(uuid,uuid,date,uuid,text,text)'::regprocedure
  );
  definition := replace(definition, E'\r\n', E'\n');
  start_pos := strpos(
    definition,
    E'  IF v_task.ledger_entry_id IS NOT NULL THEN'
  );
  IF start_pos > 0 THEN
    end_pos := start_pos - 1 + strpos(
      substring(definition FROM start_pos),
      E'  END IF;'
    ) + length(E'  END IF;');
    definition := substring(definition FROM 1 FOR start_pos - 1)
      || substring(definition FROM end_pos);
  END IF;
  EXECUTE definition;

  FOREACH routine_name IN ARRAY ARRAY[
    'public.archive_maintenance_task(uuid,uuid)',
    'public.restore_maintenance_task(uuid,uuid)'
  ]
  LOOP
    routine_oid := routine_name::regprocedure;
    definition := pg_get_functiondef(routine_oid);
    definition := replace(definition, E'\r\n', E'\n');
    definition := replace(
      definition,
      E'      ''ledger_entry_id'', old_task.ledger_entry_id,\n',
      ''
    );
    definition := replace(
      definition,
      E'      ''ledger_entry_id'', new_task.ledger_entry_id,\n',
      ''
    );
    EXECUTE definition;
  END LOOP;
END;
$migration$;

DROP TRIGGER guard_maintenance_cost_fields ON public.tasks;
CREATE TRIGGER guard_maintenance_cost_fields
BEFORE INSERT OR UPDATE OF
  actual_cost_amount,
  actual_cost_currency,
  property_id,
  unit_id,
  actual_cost_date,
  actual_cost_document_id,
  actual_cost_reference,
  vendor_person_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_maintenance_cost_fields();

ALTER TABLE public.tasks DROP COLUMN ledger_entry_id;
