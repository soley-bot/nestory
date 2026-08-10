-- Track 3 correction round 2: every owner-balance mutation takes the
-- financial-month key before lifecycle and stable owner/source keys.

CREATE OR REPLACE FUNCTION app_private.lock_owner_balance_mutation(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_effective_date date
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
BEGIN
  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency
  );
END;
$$;

ALTER FUNCTION app_private.lock_owner_balance_mutation(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_balance_mutation(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.lock_owner_event_mutation(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_event_date date,
  p_explicit_owner_person_id uuid,
  p_reversal_of_allocation_set_id uuid
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
BEGIN
  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_event_date
  );
  PERFORM app_private.lock_owner_event_lifecycle(
    p_organization_id,
    p_property_id,
    p_currency,
    p_event_date,
    p_explicit_owner_person_id,
    p_reversal_of_allocation_set_id
  );
END;
$$;

ALTER FUNCTION app_private.lock_owner_event_mutation(
  uuid, uuid, public.currency_code, date, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_event_mutation(
  uuid, uuid, public.currency_code, date, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.lock_owner_transfer_mutation(
  p_organization_id uuid,
  p_property_id uuid,
  p_from_owner_person_id uuid,
  p_to_owner_person_id uuid,
  p_currency public.currency_code,
  p_effective_date date
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
BEGIN
  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );
  IF p_from_owner_person_id::text < p_to_owner_person_id::text THEN
    PERFORM app_private.lock_owner_balance_lifecycle(
      p_organization_id, p_property_id, p_from_owner_person_id, p_currency
    );
    PERFORM app_private.lock_owner_balance_lifecycle(
      p_organization_id, p_property_id, p_to_owner_person_id, p_currency
    );
  ELSE
    PERFORM app_private.lock_owner_balance_lifecycle(
      p_organization_id, p_property_id, p_to_owner_person_id, p_currency
    );
    PERFORM app_private.lock_owner_balance_lifecycle(
      p_organization_id, p_property_id, p_from_owner_person_id, p_currency
    );
  END IF;
END;
$$;

ALTER FUNCTION app_private.lock_owner_transfer_mutation(
  uuid, uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_transfer_mutation(
  uuid, uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

DO $patch_owner_allocator_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  PERFORM app_private.lock_owner_event_lifecycle(\n    p_organization_id,\n    v_source.property_id,\n    v_source.currency,\n    v_source.event_date,\n    v_source.explicit_owner_person_id,\n    v_source.reversal_of_allocation_set_id\n  );\n\n  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    v_source.property_id,\n    v_source.currency,\n    v_source.event_date\n  );';
  v_new text := E'  PERFORM app_private.lock_owner_event_mutation(\n    p_organization_id,\n    v_source.property_id,\n    v_source.currency,\n    v_source.event_date,\n    v_source.explicit_owner_person_id,\n    v_source.reversal_of_allocation_set_id\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.allocate_owner_event(uuid,text,uuid,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'allocate_owner_event_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_allocator_lock_order$;

DO $patch_owner_cash_baseline_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    p_property_id,\n    p_currency,\n    p_event_date\n  );';
  v_new text := E'  PERFORM app_private.lock_owner_balance_mutation(\n    p_organization_id,\n    p_property_id,\n    p_owner_person_id,\n    p_currency,\n    p_event_date\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.record_owner_cash_event_baseline(uuid,uuid,uuid,public.currency_code,text,date,numeric,text,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'record_owner_cash_event_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_cash_baseline_lock_order$;

DO $patch_owner_distribution_baseline_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    p_property_id,\n    p_currency,\n    p_distribution_date\n  );';
  v_new text := E'  PERFORM app_private.lock_owner_balance_mutation(\n    p_organization_id,\n    p_property_id,\n    p_owner_person_id,\n    p_currency,\n    p_distribution_date\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.record_owner_distribution_baseline(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'record_owner_distribution_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_distribution_baseline_lock_order$;

DO $patch_owner_transfer_baseline_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    p_property_id,\n    p_currency,\n    p_effective_date\n  );';
  v_new text := E'  PERFORM app_private.lock_owner_transfer_mutation(\n    p_organization_id,\n    p_property_id,\n    p_from_owner_person_id,\n    p_to_owner_person_id,\n    p_currency,\n    p_effective_date\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.transfer_owner_balance_component_baseline(uuid,uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,text,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'transfer_owner_balance_component_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_transfer_baseline_lock_order$;

DO $patch_withdrawal_reversal_baseline_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    v_original.property_id,\n    v_original.currency,\n    p_reversal_date\n  );';
  v_new text := E'  PERFORM app_private.lock_owner_balance_mutation(\n    p_organization_id,\n    v_original.property_id,\n    v_original.owner_person_id,\n    v_original.currency,\n    p_reversal_date\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.reverse_property_withdrawal_baseline(uuid,uuid,date,text,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'reverse_property_withdrawal_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_withdrawal_reversal_baseline_lock_order$;

DO $patch_payment_reversal_baseline_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    v_original.property_id,\n    v_original.currency,\n    p_reversal_date\n  );';
  v_new text := E'  PERFORM app_private.lock_owner_balance_mutation(\n    p_organization_id,\n    v_original.property_id,\n    v_original.owner_person_id,\n    v_original.currency,\n    p_reversal_date\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.reverse_owner_invoice_payment_baseline(uuid,uuid,date,text,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'reverse_owner_invoice_payment_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_payment_reversal_baseline_lock_order$;

CREATE OR REPLACE FUNCTION public.record_owner_cash_event(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_event_type text,
  p_event_date date,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_cash_event_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN app_private.record_owner_cash_event_baseline(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_event_type, p_event_date, p_amount, p_reason, p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_owner_distribution(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_amount numeric,
  p_distribution_date date,
  p_reference text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_operate_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_distribution_forbidden' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.property_withdrawals AS withdrawal
    WHERE withdrawal.organization_id = p_organization_id
      AND withdrawal.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  ) THEN
    RETURN app_private.record_owner_distribution_baseline(
      p_organization_id, p_property_id, p_owner_person_id, p_currency,
      p_amount, p_distribution_date, p_reference, p_idempotency_key
    );
  END IF;

  PERFORM app_private.lock_owner_balance_mutation(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_distribution_date
  );

  PERFORM app_private.assert_owner_cash_sources_allocated(
    p_organization_id, p_property_id, p_currency, p_distribution_date
  );

  IF EXISTS (
    SELECT 1
    FROM public.owner_component_movements AS movement
    WHERE movement.organization_id = p_organization_id
      AND movement.property_id = p_property_id
      AND movement.owner_person_id = p_owner_person_id
      AND movement.currency = p_currency
      AND movement.component = 'ips_held_owner_cash'
      AND movement.signed_amount < 0
      AND movement.event_date > p_distribution_date
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_component_movements AS reversal
        WHERE reversal.organization_id = movement.organization_id
          AND reversal.reversal_of_movement_id = movement.id
      )
  ) THEN
    RAISE EXCEPTION 'backdated_owner_cash_consumer' USING ERRCODE = '23514';
  END IF;

  RETURN app_private.record_owner_distribution_baseline(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_amount, p_distribution_date, p_reference, p_idempotency_key
  );
END;
$$;

DO $patch_owner_transfer_wrapper_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  IF p_from_owner_person_id::text < p_to_owner_person_id::text THEN\n    PERFORM app_private.lock_owner_balance_lifecycle(\n      p_organization_id, p_property_id, p_from_owner_person_id, p_currency\n    );\n    PERFORM app_private.lock_owner_balance_lifecycle(\n      p_organization_id, p_property_id, p_to_owner_person_id, p_currency\n    );\n  ELSE\n    PERFORM app_private.lock_owner_balance_lifecycle(\n      p_organization_id, p_property_id, p_to_owner_person_id, p_currency\n    );\n    PERFORM app_private.lock_owner_balance_lifecycle(\n      p_organization_id, p_property_id, p_from_owner_person_id, p_currency\n    );\n  END IF;\n\n  IF EXISTS (\n    SELECT 1\n    FROM public.owner_component_transfer_instructions AS instruction\n    WHERE instruction.organization_id = p_organization_id\n      AND instruction.idempotency_key = pg_catalog.btrim(p_idempotency_key)\n  ) THEN\n    RETURN app_private.transfer_owner_balance_component_baseline(\n      p_organization_id, p_property_id,\n      p_from_owner_person_id, p_to_owner_person_id, p_currency,\n      p_effective_date, p_component, p_amount, p_reason,\n      p_evidence_reference, p_evidence_sha256, p_idempotency_key\n    );\n  END IF;';
  v_new text := E'  IF EXISTS (\n    SELECT 1\n    FROM public.owner_component_transfer_instructions AS instruction\n    WHERE instruction.organization_id = p_organization_id\n      AND instruction.idempotency_key = pg_catalog.btrim(p_idempotency_key)\n  ) THEN\n    RETURN app_private.transfer_owner_balance_component_baseline(\n      p_organization_id, p_property_id,\n      p_from_owner_person_id, p_to_owner_person_id, p_currency,\n      p_effective_date, p_component, p_amount, p_reason,\n      p_evidence_reference, p_evidence_sha256, p_idempotency_key\n    );\n  END IF;\n\n  PERFORM app_private.lock_owner_transfer_mutation(\n    p_organization_id,\n    p_property_id,\n    p_from_owner_person_id,\n    p_to_owner_person_id,\n    p_currency,\n    p_effective_date\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.transfer_owner_balance_component(uuid,uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,text,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'transfer_owner_balance_component_wrapper_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_owner_transfer_wrapper_lock_order$;

CREATE OR REPLACE FUNCTION public.reverse_property_withdrawal(
  p_organization_id uuid,
  p_withdrawal_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_distribution_reversal_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN app_private.reverse_property_withdrawal_baseline(
    p_organization_id, p_withdrawal_id, p_reversal_date,
    p_reason, p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_owner_invoice_payment(
  p_organization_id uuid,
  p_owner_payment_id uuid,
  p_reversal_date date,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_payment_reversal_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN app_private.reverse_owner_invoice_payment_baseline(
    p_organization_id, p_owner_payment_id, p_reversal_date,
    p_reason, p_idempotency_key
  );
END;
$$;

DO $patch_automatic_owner_cash_lock_order$
DECLARE
  v_definition text;
  v_old text := E'  PERFORM pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(\n      p_organization_id::text || '':'' || p_property_id::text || '':owner-cash'',\n      0\n    )\n  );\n\n  FOR v_line IN\n    SELECT DISTINCT invoice.owner_person_id\n    FROM public.owner_invoices AS invoice\n    WHERE invoice.organization_id = p_organization_id\n      AND invoice.property_id = p_property_id\n      AND invoice.lifecycle = ''issued''\n    ORDER BY invoice.owner_person_id\n  LOOP\n    PERFORM app_private.lock_owner_balance_lifecycle(\n      p_organization_id,\n      p_property_id,\n      v_line.owner_person_id,\n      ''USD''::public.currency_code\n    );\n  END LOOP;';
  v_new text := E'  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    p_property_id,\n    ''USD''::public.currency_code,\n    p_allocation_date\n  );\n\n  FOR v_line IN\n    SELECT DISTINCT invoice.owner_person_id\n    FROM public.owner_invoices AS invoice\n    WHERE invoice.organization_id = p_organization_id\n      AND invoice.property_id = p_property_id\n      AND invoice.lifecycle = ''issued''\n    ORDER BY invoice.owner_person_id\n  LOOP\n    PERFORM app_private.lock_owner_balance_lifecycle(\n      p_organization_id,\n      p_property_id,\n      v_line.owner_person_id,\n      ''USD''::public.currency_code\n    );\n  END LOOP;\n\n  PERFORM pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(\n      p_organization_id::text || '':'' || p_property_id::text || '':owner-cash'',\n      0\n    )\n  );';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.apply_available_owner_cash(uuid,uuid,date,uuid)'::regprocedure
  ) INTO v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'apply_available_owner_cash_lock_order_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$patch_automatic_owner_cash_lock_order$;

CREATE OR REPLACE FUNCTION app_private.lock_legacy_owner_cash_effect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_owner_person_id uuid;
  v_currency public.currency_code;
  v_effective_date date;
BEGIN
  IF TG_TABLE_NAME = 'owner_charge_cash_allocations' THEN
    SELECT invoice.owner_person_id, invoice.currency
    INTO STRICT v_owner_person_id, v_currency
    FROM public.owner_invoice_lines AS line
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE line.organization_id = NEW.organization_id
      AND line.id = NEW.owner_invoice_line_id;
    v_effective_date := NEW.allocation_date;
  ELSE
    SELECT invoice.owner_person_id, invoice.currency
    INTO STRICT v_owner_person_id, v_currency
    FROM public.owner_invoices AS invoice
    WHERE invoice.organization_id = NEW.organization_id
      AND invoice.id = NEW.owner_invoice_id;
    v_effective_date := NEW.adjustment_date;
  END IF;
  PERFORM app_private.lock_owner_balance_mutation(
    NEW.organization_id,
    NEW.property_id,
    v_owner_person_id,
    v_currency,
    v_effective_date
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.lock_legacy_owner_cash_effect() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_legacy_owner_cash_effect()
  FROM PUBLIC, anon, authenticated, service_role;
