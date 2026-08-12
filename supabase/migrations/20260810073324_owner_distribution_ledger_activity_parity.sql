DO $add_owner_distribution_ledger_activity_parity$
DECLARE
  v_definition text;
  v_declaration_target text := $target$  v_withdrawal_id uuid;
  v_allocation_result jsonb;$target$;
  v_declaration_replacement text := $replacement$  v_withdrawal_id uuid;
  v_ledger_entry_id uuid;
  v_allocation_result jsonb;$replacement$;
  v_write_target text := $target$  RETURNING id INTO v_withdrawal_id;

  v_allocation_result := public.allocate_owner_event($target$;
  v_write_replacement text := $replacement$  RETURNING id INTO v_withdrawal_id;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    p_property_id,
    NULL,
    p_distribution_date,
    'expense',
    'Owner withdrawal',
    p_amount,
    p_currency,
    v_reference,
    'owner_cash_event',
    v_withdrawal_id,
    v_actor_id,
    NULL
  );

  UPDATE public.property_withdrawals AS withdrawal
  SET ledger_entry_id = v_ledger_entry_id
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.id = v_withdrawal_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'property_withdrawal',
    v_withdrawal_id,
    'owner_withdrawal_recorded',
    pg_catalog.jsonb_build_object(
      'property_id', p_property_id,
      'owner_person_id', p_owner_person_id,
      'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
      'currency', p_currency::text,
      'withdrawal_date', p_distribution_date,
      'available_after', pg_catalog.to_char(
        v_available - p_amount,
        'FM999999999990.00'
      )
    )
  );

  v_allocation_result := public.allocate_owner_event($replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.record_owner_distribution(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)'::regprocedure
  )
  INTO v_definition;

  IF pg_catalog.strpos(v_definition, v_declaration_target) = 0
    OR pg_catalog.strpos(v_definition, v_write_target) = 0 THEN
    RAISE EXCEPTION
      'record_owner_distribution Ledger/activity insertion point not found';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    v_declaration_target,
    v_declaration_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition,
    v_write_target,
    v_write_replacement
  );
  EXECUTE v_definition;
END;
$add_owner_distribution_ledger_activity_parity$;

DO $add_owner_distribution_reversal_ledger_activity_parity$
DECLARE
  v_definition text;
  v_declaration_target text := $target$  v_reversal_id uuid;
  v_allocation_result jsonb;$target$;
  v_declaration_replacement text := $replacement$  v_reversal_id uuid;
  v_ledger_entry_id uuid;
  v_allocation_result jsonb;$replacement$;
  v_write_target text := $target$  INSERT INTO public.property_withdrawals (
    organization_id,$target$;
  v_write_replacement text := $replacement$  IF v_original.ledger_entry_id IS NULL THEN
    RAISE EXCEPTION 'owner_distribution_ledger_missing'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.property_withdrawals (
    organization_id,$replacement$;
  v_allocation_target text := $target$  RETURNING id INTO v_reversal_id;

  v_allocation_result := public.allocate_owner_event($target$;
  v_allocation_replacement text := $replacement$  RETURNING id INTO v_reversal_id;

  v_ledger_entry_id := app_private.create_operational_ledger_event(
    p_organization_id,
    v_original.property_id,
    NULL,
    p_reversal_date,
    'income',
    'Owner withdrawal reversal',
    v_original.amount,
    v_original.currency,
    v_original.reference,
    'owner_cash_event',
    v_reversal_id,
    v_actor_id,
    v_original.ledger_entry_id
  );

  UPDATE public.property_withdrawals AS withdrawal
  SET ledger_entry_id = v_ledger_entry_id
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.id = v_reversal_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'property_withdrawal',
    v_reversal_id,
    'owner_withdrawal_reversed',
    pg_catalog.jsonb_build_object(
      'property_id', v_original.property_id,
      'owner_person_id', v_original.owner_person_id,
      'amount', pg_catalog.to_char(v_original.amount, 'FM999999999990.00'),
      'currency', v_original.currency::text,
      'withdrawal_date', p_reversal_date,
      'reversal_of_id', v_original.id::text,
      'reason', v_reason
    )
  );

  v_allocation_result := public.allocate_owner_event($replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.reverse_property_withdrawal(uuid,uuid,date,text,text)'::regprocedure
  )
  INTO v_definition;

  IF pg_catalog.strpos(v_definition, v_declaration_target) = 0
    OR pg_catalog.strpos(v_definition, v_write_target) = 0
    OR pg_catalog.strpos(v_definition, v_allocation_target) = 0 THEN
    RAISE EXCEPTION
      'reverse_property_withdrawal Ledger/activity insertion point not found';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    v_declaration_target,
    v_declaration_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition,
    v_write_target,
    v_write_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition,
    v_allocation_target,
    v_allocation_replacement
  );
  EXECUTE v_definition;
END;
$add_owner_distribution_reversal_ledger_activity_parity$;

ALTER FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) TO authenticated;

ALTER FUNCTION public.reverse_property_withdrawal(
  uuid, uuid, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_property_withdrawal(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_property_withdrawal(
  uuid, uuid, date, text, text
) TO authenticated;
