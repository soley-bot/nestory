DO $migration$
DECLARE
  v_definition text;
  v_anchor constant text := 'IF NOT app_private.is_org_admin(p_organization_id) THEN';
  v_replacement constant text := 'IF NOT app_private.can_manage_petty_cash(p_organization_id) THEN';
  v_anchor_count integer;
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.create_petty_cash_entry(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric)'::regprocedure,
    'public.post_petty_cash_entry(uuid,uuid)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_function) INTO v_definition;
    v_anchor_count := (
      length(v_definition) - length(replace(v_definition, v_anchor, ''))
    ) / length(v_anchor);

    IF v_anchor_count <> 1 THEN
      RAISE EXCEPTION
        'Expected exactly one Petty Cash authorization anchor in %, found %',
        v_function,
        v_anchor_count;
    END IF;

    EXECUTE replace(v_definition, v_anchor, v_replacement);
  END LOOP;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_anchor constant text := 'IF NOT app_private.is_org_admin(p_organization_id) THEN';
  v_replacement constant text := $replacement$IF (
    p_locked
    AND NOT app_private.can_lock_financial_month(p_organization_id)
  ) OR (
    NOT p_locked
    AND NOT app_private.can_unlock_financial_month(p_organization_id)
  ) THEN$replacement$;
  v_anchor_count integer;
  v_function constant regprocedure :=
    'public.set_financial_month_lock(uuid,date,boolean,text)'::regprocedure;
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;
  v_anchor_count := (
    length(v_definition) - length(replace(v_definition, v_anchor, ''))
  ) / length(v_anchor);

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one financial-month authorization anchor in %, found %',
      v_function,
      v_anchor_count;
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;
