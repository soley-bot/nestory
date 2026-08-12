-- Track 3 correction round 1: one lifecycle lock, complete source authority,
-- exact cash lineage, period continuity, and predecessor-bound transfers.

ALTER TABLE public.owner_cash_source_consumptions
  ALTER COLUMN source_movement_id DROP NOT NULL,
  ADD COLUMN source_opening_entry_id uuid,
  ADD CONSTRAINT owner_cash_source_consumptions_opening_fk
    FOREIGN KEY (organization_id, source_opening_entry_id)
    REFERENCES public.owner_opening_balance_entries (organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_cash_source_consumptions_one_source_check CHECK (
    (source_movement_id IS NOT NULL)::integer
      + (source_opening_entry_id IS NOT NULL)::integer = 1
  );

CREATE UNIQUE INDEX owner_cash_source_consumptions_opening_pair_uidx
  ON public.owner_cash_source_consumptions (
    source_opening_entry_id,
    consumer_movement_id
  )
  WHERE source_opening_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.lock_owner_balance_lifecycle(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code
) RETURNS void
LANGUAGE sql
VOLATILE
SET search_path TO ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_balance_lifecycle_v1',
        p_organization_id::text,
        p_property_id::text,
        p_owner_person_id::text,
        p_currency::text
      ),
      0
    )
  );
$$;

ALTER FUNCTION app_private.lock_owner_balance_lifecycle(
  uuid, uuid, uuid, public.currency_code
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_balance_lifecycle(
  uuid, uuid, uuid, public.currency_code
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.lock_owner_event_lifecycle(
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
DECLARE
  v_owner_person_id uuid;
BEGIN
  IF p_reversal_of_allocation_set_id IS NOT NULL THEN
    FOR v_owner_person_id IN
      SELECT owner_allocation.owner_person_id
      FROM public.owner_event_owner_allocations AS owner_allocation
      WHERE owner_allocation.organization_id = p_organization_id
        AND owner_allocation.allocation_set_id = p_reversal_of_allocation_set_id
      ORDER BY owner_allocation.owner_person_id
    LOOP
      PERFORM app_private.lock_owner_balance_lifecycle(
        p_organization_id,
        p_property_id,
        v_owner_person_id,
        p_currency
      );
    END LOOP;
  ELSIF p_explicit_owner_person_id IS NOT NULL THEN
    PERFORM app_private.lock_owner_balance_lifecycle(
      p_organization_id,
      p_property_id,
      p_explicit_owner_person_id,
      p_currency
    );
  ELSE
    FOR v_owner_person_id IN
      SELECT roster.owner_person_id
      FROM app_private.validate_owner_roster_on_date(
        p_organization_id,
        p_property_id,
        p_event_date
      ) AS roster
      ORDER BY roster.owner_person_id
    LOOP
      PERFORM app_private.lock_owner_balance_lifecycle(
        p_organization_id,
        p_property_id,
        v_owner_person_id,
        p_currency
      );
    END LOOP;
  END IF;
END;
$$;

ALTER FUNCTION app_private.lock_owner_event_lifecycle(
  uuid, uuid, public.currency_code, date, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_event_lifecycle(
  uuid, uuid, public.currency_code, date, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.legacy_owner_cash_source_state(
  p_organization_id uuid,
  p_source_type text,
  p_source_line_id uuid
) RETURNS TABLE (
  is_mappable boolean,
  remediation_code text
)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_expected_owner_id uuid;
  v_original_set_id uuid;
  v_owner_count integer;
  v_matching_owner_count integer;
BEGIN
  IF p_source_type = 'owner_invoice_payment' THEN
    SELECT invoice.owner_person_id, original_set.id
    INTO v_expected_owner_id, v_original_set_id
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_invoice_lines AS line
      ON line.organization_id = cash.organization_id
     AND line.id = cash.owner_invoice_line_id
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = line.organization_id
     AND original_set.source_type = CASE line.source_type
       WHEN 'management_fee' THEN 'management_fee_occurrence'
       WHEN 'owner_expense' THEN 'owner_paid_cost'
     END
     AND original_set.source_line_id = line.source_id
    WHERE cash.organization_id = p_organization_id
      AND cash.id = p_source_line_id
      AND cash.reversal_of_id IS NULL;
  ELSIF p_source_type = 'reversal'
    AND EXISTS (
      SELECT 1
      FROM public.owner_charge_cash_allocations AS cash
      WHERE cash.organization_id = p_organization_id
        AND cash.id = p_source_line_id
        AND cash.reversal_of_id IS NOT NULL
    ) THEN
    SELECT invoice.owner_person_id, original_set.id
    INTO v_expected_owner_id, v_original_set_id
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_charge_cash_allocations AS original_cash
      ON original_cash.organization_id = cash.organization_id
     AND original_cash.id = cash.reversal_of_id
    JOIN public.owner_invoice_lines AS line
      ON line.organization_id = cash.organization_id
     AND line.id = cash.owner_invoice_line_id
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = original_cash.organization_id
     AND original_set.source_type = 'owner_invoice_payment'
     AND original_set.source_line_id = original_cash.id
    WHERE cash.organization_id = p_organization_id
      AND cash.id = p_source_line_id;
  ELSIF p_source_type = 'reversal' THEN
    SELECT invoice.owner_person_id, original_set.id
    INTO v_expected_owner_id, v_original_set_id
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = adjustment.organization_id
     AND invoice.id = adjustment.owner_invoice_id
    LEFT JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = adjustment.organization_id
     AND original_set.source_type = 'owner_paid_cost'
     AND original_set.source_line_id = adjustment.responsibility_id
    WHERE adjustment.organization_id = p_organization_id
      AND adjustment.id = p_source_line_id
      AND adjustment.responsibility = 'owner';
  ELSE
    RETURN QUERY SELECT false, 'legacy_owner_cash_source_not_found'::text;
    RETURN;
  END IF;

  IF v_expected_owner_id IS NULL THEN
    RETURN QUERY SELECT false, 'legacy_owner_cash_source_not_found'::text;
    RETURN;
  END IF;
  IF v_original_set_id IS NULL THEN
    RETURN QUERY SELECT false,
      CASE
        WHEN p_source_type = 'owner_invoice_payment'
          THEN 'legacy_owner_cash_settlement_source_unallocated'
        ELSE 'legacy_owner_cash_reversal_source_unallocated'
      END::text;
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE owner_allocation.owner_person_id = v_expected_owner_id
    )::integer
  INTO v_owner_count, v_matching_owner_count
  FROM public.owner_event_owner_allocations AS owner_allocation
  WHERE owner_allocation.organization_id = p_organization_id
    AND owner_allocation.allocation_set_id = v_original_set_id;

  IF v_owner_count <> 1 OR v_matching_owner_count <> 1 THEN
    RETURN QUERY SELECT false, 'legacy_owner_cash_settlement_owner_ambiguous'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

ALTER FUNCTION app_private.legacy_owner_cash_source_state(uuid, text, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.legacy_owner_cash_source_state(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.resolve_legacy_owner_cash_source(
  p_organization_id uuid,
  p_source_type text,
  p_source_line_id uuid
) RETURNS TABLE (
  source_id uuid,
  property_id uuid,
  currency public.currency_code,
  event_date date,
  gross_signed_amount numeric(14,2),
  allocation_basis text,
  explicit_owner_person_id uuid,
  component public.owner_balance_component,
  activity_only boolean,
  source_fingerprint text,
  reversal_of_allocation_set_id uuid
)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_state record;
BEGIN
  SELECT state.* INTO STRICT v_state
  FROM app_private.legacy_owner_cash_source_state(
    p_organization_id,
    p_source_type,
    p_source_line_id
  ) AS state;
  IF NOT v_state.is_mappable THEN
    RAISE EXCEPTION '%', v_state.remediation_code USING ERRCODE = '23514';
  END IF;

  IF p_source_type = 'owner_invoice_payment' THEN
    RETURN QUERY
    SELECT
      invoice.id,
      cash.property_id,
      invoice.currency,
      cash.allocation_date,
      (-cash.amount)::numeric(14,2),
      'explicit_owner'::text,
      invoice.owner_person_id,
      'ips_held_owner_cash'::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', p_source_type,
          'source_line_id', cash.id::text,
          'owner_invoice_id', invoice.id::text,
          'owner_invoice_line_id', line.id::text,
          'underlying_source_type', original_set.source_type,
          'underlying_allocation_set_id', original_set.id::text,
          'owner_person_id', invoice.owner_person_id::text,
          'event_date', cash.allocation_date::text,
          'signed_amount', pg_catalog.to_char(-cash.amount, 'FM999999999990.00')
        )
      ),
      NULL::uuid
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_invoice_lines AS line
      ON line.organization_id = cash.organization_id
     AND line.id = cash.owner_invoice_line_id
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = line.organization_id
     AND original_set.source_type = CASE line.source_type
       WHEN 'management_fee' THEN 'management_fee_occurrence'
       WHEN 'owner_expense' THEN 'owner_paid_cost'
     END
     AND original_set.source_line_id = line.source_id
    WHERE cash.organization_id = p_organization_id
      AND cash.id = p_source_line_id
      AND cash.reversal_of_id IS NULL;
  ELSIF EXISTS (
    SELECT 1
    FROM public.owner_charge_cash_allocations AS cash
    WHERE cash.organization_id = p_organization_id
      AND cash.id = p_source_line_id
      AND cash.reversal_of_id IS NOT NULL
  ) THEN
    RETURN QUERY
    SELECT
      original_set.source_id,
      original_set.property_id,
      original_set.currency,
      cash.allocation_date,
      (-original_set.gross_signed_amount)::numeric(14,2),
      original_set.allocation_basis,
      original_set.explicit_owner_person_id,
      NULL::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', 'reversal',
          'source_line_id', cash.id::text,
          'reversal_of_allocation_set_id', original_set.id::text,
          'event_date', cash.allocation_date::text,
          'gross_signed_amount', pg_catalog.to_char(
            -original_set.gross_signed_amount,
            'FM999999999990.00'
          ),
          'original_source_fingerprint', original_set.source_fingerprint
        )
      ),
      original_set.id
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_charge_cash_allocations AS original_cash
      ON original_cash.organization_id = cash.organization_id
     AND original_cash.id = cash.reversal_of_id
    JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = original_cash.organization_id
     AND original_set.source_type = 'owner_invoice_payment'
     AND original_set.source_line_id = original_cash.id
    WHERE cash.organization_id = p_organization_id
      AND cash.id = p_source_line_id;
  ELSE
    RETURN QUERY
    SELECT
      adjustment.submission_id,
      adjustment.property_id,
      invoice.currency,
      adjustment.adjustment_date,
      (-original_set.gross_signed_amount)::numeric(14,2),
      original_set.allocation_basis,
      original_set.explicit_owner_person_id,
      NULL::public.owner_balance_component,
      false,
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'source_type', 'reversal',
          'source_line_id', adjustment.id::text,
          'reversal_of_allocation_set_id', original_set.id::text,
          'event_date', adjustment.adjustment_date::text,
          'gross_signed_amount', pg_catalog.to_char(
            -original_set.gross_signed_amount,
            'FM999999999990.00'
          ),
          'original_source_fingerprint', original_set.source_fingerprint
        )
      ),
      original_set.id
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = adjustment.organization_id
     AND invoice.id = adjustment.owner_invoice_id
    JOIN public.owner_event_allocation_sets AS original_set
      ON original_set.organization_id = adjustment.organization_id
     AND original_set.source_type = 'owner_paid_cost'
     AND original_set.source_line_id = adjustment.responsibility_id
    WHERE adjustment.organization_id = p_organization_id
      AND adjustment.id = p_source_line_id
      AND adjustment.responsibility = 'owner';
  END IF;
END;
$$;

ALTER FUNCTION app_private.resolve_legacy_owner_cash_source(uuid, text, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.resolve_legacy_owner_cash_source(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $patch_owner_source_resolver$
DECLARE
  v_definition text;
  v_marker text := E'BEGIN\n  IF NOT EXISTS (';
  v_replacement text := E'BEGIN\n  IF (v_source_type = ''owner_invoice_payment'' AND EXISTS (\n    SELECT 1 FROM public.owner_charge_cash_allocations AS cash\n    WHERE cash.organization_id = p_organization_id\n      AND cash.id = p_source_line_id\n  )) OR (v_source_type = ''reversal'' AND (\n    EXISTS (\n      SELECT 1 FROM public.owner_charge_cash_allocations AS cash\n      WHERE cash.organization_id = p_organization_id\n        AND cash.id = p_source_line_id\n        AND cash.reversal_of_id IS NOT NULL\n    ) OR EXISTS (\n      SELECT 1 FROM public.expense_customer_adjustments AS adjustment\n      WHERE adjustment.organization_id = p_organization_id\n        AND adjustment.id = p_source_line_id\n        AND adjustment.responsibility = ''owner''\n    )\n  )) THEN\n    RETURN QUERY\n    SELECT resolved.*\n    FROM app_private.resolve_legacy_owner_cash_source(\n      p_organization_id, v_source_type, p_source_line_id\n    ) AS resolved;\n    RETURN;\n  END IF;\n\n  IF NOT EXISTS (';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.resolve_owner_event_source(uuid,text,uuid)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_marker) = 0 THEN
    RAISE EXCEPTION 'resolve_owner_event_source_patch_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_marker, v_replacement);
  EXECUTE v_definition;
END;
$patch_owner_source_resolver$;

CREATE OR REPLACE FUNCTION app_private.consume_owner_held_cash(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_event_date date,
  p_consumer_movement_id uuid,
  p_amount numeric,
  p_actor_id uuid
) RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
DECLARE
  v_source record;
  v_remaining numeric(14,2) := p_amount::numeric(14,2);
  v_available numeric(14,2);
  v_consume numeric(14,2);
BEGIN
  IF v_remaining IS NULL OR v_remaining <= 0
    OR v_remaining <> pg_catalog.round(v_remaining, 2) THEN
    RAISE EXCEPTION 'owner_cash_consumption_amount_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency
  );

  FOR v_source IN
    WITH opening_sources AS (
      SELECT
        'opening'::text AS source_kind,
        entry.id AS source_id,
        entry.effective_date AS source_date,
        entry.created_at,
        (
          entry.signed_amount
          - coalesce((
            SELECT pg_catalog.sum(consumption.consumed_amount)
            FROM public.owner_cash_source_consumptions AS consumption
            WHERE consumption.organization_id = p_organization_id
              AND consumption.source_opening_entry_id = entry.id
              AND NOT EXISTS (
                SELECT 1
                FROM public.owner_component_movements AS consumer_reversal
                WHERE consumer_reversal.organization_id = consumption.organization_id
                  AND consumer_reversal.reversal_of_movement_id =
                    consumption.consumer_movement_id
              )
          ), 0)
        )::numeric(14,2) AS unconsumed_amount
      FROM public.owner_opening_balance_entries AS entry
      WHERE entry.organization_id = p_organization_id
        AND entry.property_id = p_property_id
        AND entry.owner_person_id = p_owner_person_id
        AND entry.currency = p_currency
        AND entry.component = 'ips_held_owner_cash'
        AND entry.signed_amount > 0
        AND entry.effective_date <= p_event_date
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_opening_balance_entries AS entry_reversal
          WHERE entry_reversal.organization_id = entry.organization_id
            AND entry_reversal.reversal_of_entry_id = entry.id
        )
    ), movement_sources AS (
      SELECT
        'movement'::text AS source_kind,
        movement.id AS source_id,
        movement.event_date AS source_date,
        movement.created_at,
        (
          movement.signed_amount
          - coalesce((
            SELECT pg_catalog.sum(consumption.consumed_amount)
            FROM public.owner_cash_source_consumptions AS consumption
            WHERE consumption.organization_id = p_organization_id
              AND consumption.source_movement_id = movement.id
              AND NOT EXISTS (
                SELECT 1
                FROM public.owner_component_movements AS consumer_reversal
                WHERE consumer_reversal.organization_id = consumption.organization_id
                  AND consumer_reversal.reversal_of_movement_id =
                    consumption.consumer_movement_id
              )
          ), 0)
        )::numeric(14,2) AS unconsumed_amount
      FROM public.owner_component_movements AS movement
      WHERE movement.organization_id = p_organization_id
        AND movement.property_id = p_property_id
        AND movement.owner_person_id = p_owner_person_id
        AND movement.currency = p_currency
        AND movement.component = 'ips_held_owner_cash'
        AND movement.signed_amount > 0
        AND movement.event_date <= p_event_date
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_component_movements AS movement_reversal
          WHERE movement_reversal.organization_id = movement.organization_id
            AND movement_reversal.reversal_of_movement_id = movement.id
        )
    )
    SELECT source.*
    FROM (
      SELECT * FROM opening_sources
      UNION ALL
      SELECT * FROM movement_sources
    ) AS source
    WHERE source.unconsumed_amount > 0
    ORDER BY
      source.source_date,
      CASE source.source_kind WHEN 'opening' THEN 0 ELSE 1 END,
      source.created_at,
      source.source_id
  LOOP
    EXIT WHEN v_remaining = 0;

    IF v_source.source_kind = 'opening' THEN
      PERFORM 1
      FROM public.owner_opening_balance_entries AS entry
      WHERE entry.organization_id = p_organization_id
        AND entry.id = v_source.source_id
      FOR KEY SHARE;
    ELSE
      PERFORM 1
      FROM public.owner_component_movements AS movement
      WHERE movement.organization_id = p_organization_id
        AND movement.id = v_source.source_id
      FOR UPDATE;
    END IF;

    v_available := greatest(v_source.unconsumed_amount, 0);
    IF v_available > 0 THEN
      v_consume := least(v_available, v_remaining);
      INSERT INTO public.owner_cash_source_consumptions (
        organization_id,
        source_movement_id,
        source_opening_entry_id,
        consumer_movement_id,
        consumed_amount,
        created_by
      ) VALUES (
        p_organization_id,
        CASE WHEN v_source.source_kind = 'movement'
          THEN v_source.source_id ELSE NULL END,
        CASE WHEN v_source.source_kind = 'opening'
          THEN v_source.source_id ELSE NULL END,
        p_consumer_movement_id,
        v_consume,
        p_actor_id
      );
      v_remaining := v_remaining - v_consume;
    END IF;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'insufficient_authoritative_held_cash'
      USING ERRCODE = '23514';
  END IF;
  RETURN v_remaining;
END;
$$;

ALTER FUNCTION app_private.consume_owner_held_cash(
  uuid, uuid, uuid, public.currency_code, date, uuid, numeric, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.consume_owner_held_cash(
  uuid, uuid, uuid, public.currency_code, date, uuid, numeric, uuid
) FROM PUBLIC, anon, authenticated, service_role;

DO $patch_owner_allocator$
DECLARE
  v_definition text;
  v_lock_marker text := E'  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    v_source.property_id,\n    v_source.currency,\n    v_source.event_date\n  );';
  v_lock_replacement text := E'  PERFORM app_private.lock_owner_event_lifecycle(\n    p_organization_id,\n    v_source.property_id,\n    v_source.currency,\n    v_source.event_date,\n    v_source.explicit_owner_person_id,\n    v_source.reversal_of_allocation_set_id\n  );\n\n  PERFORM app_private.lock_property_financial_month(\n    p_organization_id,\n    v_source.property_id,\n    v_source.currency,\n    v_source.event_date\n  );';
  v_remaining_marker text := E'          v_remaining := -v_allocation.allocated_gross_signed_amount;';
  v_remaining_replacement text := E'          v_remaining := app_private.consume_owner_held_cash(\n            p_organization_id,\n            v_source.property_id,\n            v_allocation.owner_person_id,\n            v_source.currency,\n            v_source.event_date,\n            v_movement_id,\n            -v_allocation.allocated_gross_signed_amount,\n            v_actor_id\n          );';
  v_movement_marker text := E'        RETURNING id INTO v_movement_id;\n        v_movement_count := v_movement_count + 1;\n\n        IF v_source.component = ''ips_held_owner_cash''';
  v_movement_replacement text := E'        RETURNING id INTO v_movement_id;\n        v_movement_count := v_movement_count + 1;\n\n        IF v_source_type = ''owner_invoice_payment''\n          AND EXISTS (\n            SELECT 1\n            FROM public.owner_charge_cash_allocations AS legacy_cash\n            WHERE legacy_cash.organization_id = p_organization_id\n              AND legacy_cash.id = p_source_line_id\n          ) THEN\n          INSERT INTO public.owner_component_movements (\n            organization_id,\n            owner_event_owner_allocation_id,\n            property_id,\n            owner_person_id,\n            currency,\n            event_date,\n            month_start,\n            component,\n            signed_amount,\n            movement_order,\n            created_by\n          ) VALUES (\n            p_organization_id,\n            v_allocation.id,\n            v_source.property_id,\n            v_allocation.owner_person_id,\n            v_source.currency,\n            v_source.event_date,\n            pg_catalog.date_trunc(''month'', v_source.event_date)::date,\n            ''owner_due_to_ips'',\n            v_allocation.allocated_gross_signed_amount,\n            2,\n            v_actor_id\n          );\n          v_movement_count := v_movement_count + 1;\n        END IF;\n\n        IF v_source.component = ''ips_held_owner_cash''';
  v_check_marker text := E'          END LOOP;\n        END IF;\n      END LOOP;';
  v_check_replacement text := E'          END LOOP;\n          IF v_remaining <> 0 THEN\n            RAISE EXCEPTION ''owner_cash_consumption_incomplete''\n              USING ERRCODE = ''23514'';\n          END IF;\n        END IF;\n      END LOOP;';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.allocate_owner_event(uuid,text,uuid,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_lock_marker) = 0
    OR pg_catalog.strpos(v_definition, v_remaining_marker) = 0
    OR pg_catalog.strpos(v_definition, v_movement_marker) = 0
    OR pg_catalog.strpos(v_definition, v_check_marker) = 0 THEN
    RAISE EXCEPTION 'allocate_owner_event_patch_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_lock_marker, v_lock_replacement);
  v_definition := pg_catalog.replace(
    v_definition,
    v_remaining_marker,
    v_remaining_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition,
    v_movement_marker,
    v_movement_replacement
  );
  v_definition := pg_catalog.replace(v_definition, v_check_marker, v_check_replacement);
  EXECUTE v_definition;
END;
$patch_owner_allocator$;

CREATE OR REPLACE FUNCTION app_private.assert_owner_cash_sources_allocated(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_as_of_date date
) RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_blocker jsonb;
BEGIN
  WITH source_rows AS (
    SELECT
      CASE WHEN cash.reversal_of_id IS NULL
        THEN 'owner_invoice_payment' ELSE 'reversal' END AS source_type,
      cash.id AS source_line_id,
      cash.allocation_date AS event_date
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_invoice_lines AS line
      ON line.organization_id = cash.organization_id
     AND line.id = cash.owner_invoice_line_id
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE cash.organization_id = p_organization_id
      AND cash.property_id = p_property_id
      AND invoice.currency = p_currency
      AND cash.allocation_date <= p_as_of_date

    UNION ALL

    SELECT
      'reversal',
      adjustment.id,
      adjustment.adjustment_date
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = adjustment.organization_id
     AND invoice.id = adjustment.owner_invoice_id
    WHERE adjustment.organization_id = p_organization_id
      AND adjustment.property_id = p_property_id
      AND adjustment.responsibility = 'owner'
      AND invoice.currency = p_currency
      AND adjustment.adjustment_date <= p_as_of_date
  ), unresolved AS (
    SELECT source.*,
      state.is_mappable,
      state.remediation_code
    FROM source_rows AS source
    CROSS JOIN LATERAL app_private.legacy_owner_cash_source_state(
      p_organization_id,
      source.source_type,
      source.source_line_id
    ) AS state
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.owner_event_allocation_sets AS allocation_set
      WHERE allocation_set.organization_id = p_organization_id
        AND allocation_set.source_type = source.source_type
        AND allocation_set.source_line_id = source.source_line_id
    )
  )
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source_type', unresolved.source_type,
      'source_line_id', unresolved.source_line_id::text,
      'event_date', unresolved.event_date::text,
      'remediation_code', coalesce(
        unresolved.remediation_code,
        'legacy_owner_cash_allocation_pending'
      )
    )
    ORDER BY unresolved.event_date, unresolved.source_type, unresolved.source_line_id
  )
  INTO v_blocker
  FROM unresolved;

  IF v_blocker IS NOT NULL THEN
    RAISE EXCEPTION 'owner_cash_source_remediation_required'
      USING ERRCODE = '23514', DETAIL = v_blocker::text;
  END IF;
END;
$$;

ALTER FUNCTION app_private.assert_owner_cash_sources_allocated(
  uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assert_owner_cash_sources_allocated(
  uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) SET SCHEMA app_private;
ALTER FUNCTION app_private.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) RENAME TO get_owner_event_allocation_queue_baseline;

CREATE OR REPLACE FUNCTION public.get_owner_event_allocation_queue(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date
) RETURNS TABLE (
  source_type text,
  source_id uuid,
  source_line_id uuid,
  event_date date,
  gross_signed_amount text,
  allocation_state text,
  remediation_code text,
  remediation_detail jsonb,
  allocation_set_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_allocation_queue_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'owner_allocation_queue_period_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT baseline.*
  FROM app_private.get_owner_event_allocation_queue_baseline(
    p_organization_id,
    p_property_id,
    p_currency,
    p_period_start,
    p_period_end
  ) AS baseline;

  RETURN QUERY
  WITH legacy_sources AS (
    SELECT
      CASE WHEN cash.reversal_of_id IS NULL
        THEN 'owner_invoice_payment' ELSE 'reversal' END::text AS source_type,
      invoice.id AS source_id,
      cash.id AS source_line_id,
      cash.allocation_date AS event_date,
      (-cash.amount)::numeric(14,2) AS gross_signed_amount
    FROM public.owner_charge_cash_allocations AS cash
    JOIN public.owner_invoice_lines AS line
      ON line.organization_id = cash.organization_id
     AND line.id = cash.owner_invoice_line_id
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = line.organization_id
     AND invoice.id = line.invoice_id
    WHERE cash.organization_id = p_organization_id
      AND cash.property_id = p_property_id
      AND invoice.currency = p_currency
      AND cash.allocation_date BETWEEN p_period_start AND p_period_end

    UNION ALL

    SELECT
      'reversal'::text,
      adjustment.submission_id,
      adjustment.id,
      adjustment.adjustment_date,
      adjustment.amount::numeric(14,2)
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.owner_invoices AS invoice
      ON invoice.organization_id = adjustment.organization_id
     AND invoice.id = adjustment.owner_invoice_id
    WHERE adjustment.organization_id = p_organization_id
      AND adjustment.property_id = p_property_id
      AND adjustment.responsibility = 'owner'
      AND invoice.currency = p_currency
      AND adjustment.adjustment_date BETWEEN p_period_start AND p_period_end
  )
  SELECT
    legacy.source_type,
    legacy.source_id,
    legacy.source_line_id,
    legacy.event_date,
    pg_catalog.to_char(legacy.gross_signed_amount, 'FM999999999990.00'),
    CASE
      WHEN allocation_set.id IS NOT NULL THEN 'allocated'
      WHEN state.is_mappable THEN 'pending'
      ELSE 'blocked'
    END::text,
    CASE WHEN allocation_set.id IS NULL THEN state.remediation_code ELSE NULL END,
    CASE
      WHEN allocation_set.id IS NULL AND NOT state.is_mappable
        THEN pg_catalog.jsonb_build_object(
          'source_line_id', legacy.source_line_id::text,
          'remediation_code', state.remediation_code,
          'setup_path', '/balances'
        )
      ELSE NULL
    END,
    allocation_set.id
  FROM legacy_sources AS legacy
  CROSS JOIN LATERAL app_private.legacy_owner_cash_source_state(
    p_organization_id,
    legacy.source_type,
    legacy.source_line_id
  ) AS state
  LEFT JOIN public.owner_event_allocation_sets AS allocation_set
    ON allocation_set.organization_id = p_organization_id
   AND allocation_set.source_type = legacy.source_type
   AND allocation_set.source_line_id = legacy.source_line_id
  ORDER BY legacy.event_date, legacy.source_type, legacy.source_line_id;
END;
$$;

ALTER FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_event_allocation_queue(
  uuid, uuid, public.currency_code, date, date
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.get_owner_event_allocation_queue_baseline(
  uuid, uuid, public.currency_code, date, date
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.get_unresolved_owner_transfer_detail(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH successor AS MATERIALIZED (
    SELECT assignment.started_on
    FROM public.property_owners AS assignment
    WHERE assignment.organization_id = p_organization_id
      AND assignment.property_id = p_property_id
      AND assignment.person_id = p_owner_person_id
      AND assignment.archived_at IS NULL
      AND assignment.started_on < (p_month_start + INTERVAL '1 month')::date
      AND (assignment.ended_on IS NULL OR assignment.ended_on > p_month_start)
    ORDER BY assignment.started_on DESC, assignment.id
    LIMIT 1
  ), predecessor AS MATERIALIZED (
    SELECT
      assignment.person_id AS previous_owner_person_id,
      successor.started_on AS ownership_started_on
    FROM successor
    JOIN public.property_owners AS assignment
      ON assignment.organization_id = p_organization_id
     AND assignment.property_id = p_property_id
     AND assignment.person_id <> p_owner_person_id
     AND assignment.archived_at IS NULL
     AND assignment.ended_on = successor.started_on
  ), predecessor_period AS MATERIALIZED (
    SELECT
      predecessor.previous_owner_person_id,
      predecessor.ownership_started_on,
      (
        pg_catalog.date_trunc('month', predecessor.ownership_started_on)
        - INTERVAL '1 month'
      )::date AS expected_month_start,
      period.id,
      period.status
    FROM predecessor
    LEFT JOIN public.owner_balance_periods AS period
      ON period.organization_id = p_organization_id
     AND period.property_id = p_property_id
     AND period.owner_person_id = predecessor.previous_owner_person_id
     AND period.currency = p_currency
     AND period.month_start = (
       pg_catalog.date_trunc('month', predecessor.ownership_started_on)
       - INTERVAL '1 month'
     )::date
  ), predecessor_issue AS MATERIALIZED (
    SELECT *
    FROM predecessor_period
    WHERE id IS NULL OR status NOT IN ('ready', 'closed')
  ), remaining AS MATERIALIZED (
    SELECT
      predecessor_period.previous_owner_person_id,
      predecessor_period.ownership_started_on,
      component.component,
      component.closing_amount AS predecessor_closing_amount,
      transferred.transferred_amount,
      (component.closing_amount - transferred.transferred_amount)::numeric(14,2)
        AS remaining_amount
    FROM predecessor_period
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = p_organization_id
     AND component.owner_balance_period_id = predecessor_period.id
    CROSS JOIN LATERAL (
      SELECT coalesce(pg_catalog.sum(to_line.signed_amount), 0)::numeric(14,2)
        AS transferred_amount
          FROM public.owner_component_transfer_instructions AS instruction
          JOIN public.owner_component_transfer_lines AS from_line
            ON from_line.organization_id = instruction.organization_id
           AND from_line.transfer_instruction_id = instruction.id
           AND from_line.owner_person_id = instruction.from_owner_person_id
           AND from_line.line_direction = 'from_owner'
           AND from_line.signed_amount = -instruction.amount
          JOIN public.owner_component_transfer_lines AS to_line
            ON to_line.organization_id = instruction.organization_id
           AND to_line.transfer_instruction_id = instruction.id
           AND to_line.owner_person_id = instruction.to_owner_person_id
           AND to_line.line_direction = 'to_owner'
           AND to_line.signed_amount = instruction.amount
          WHERE instruction.organization_id = p_organization_id
            AND instruction.property_id = p_property_id
            AND instruction.from_owner_person_id =
              predecessor_period.previous_owner_person_id
            AND instruction.to_owner_person_id = p_owner_person_id
            AND instruction.currency = p_currency
            AND instruction.component = component.component
            AND instruction.effective_date =
              predecessor_period.ownership_started_on
    ) AS transferred
    WHERE predecessor_period.status IN ('ready', 'closed')
  ), unresolved AS (
    SELECT * FROM remaining WHERE remaining_amount <> 0
  ), issue_detail AS (
    SELECT CASE WHEN count(*) = 0 THEN NULL ELSE pg_catalog.jsonb_build_object(
      'previous_owner_person_id', CASE
        WHEN count(DISTINCT previous_owner_person_id) = 1
          THEN min(previous_owner_person_id::text)
        ELSE NULL
      END,
      'previous_owner_person_ids', pg_catalog.to_jsonb(
        ARRAY(
          SELECT DISTINCT item.previous_owner_person_id::text
          FROM predecessor_issue AS item
          ORDER BY item.previous_owner_person_id::text
        )
      ),
      'ownership_started_on', min(ownership_started_on)::text,
      'expected_month_start', min(expected_month_start)::text,
      'predecessor_status', CASE
        WHEN count(DISTINCT coalesce(status, 'missing')) = 1
          THEN min(coalesce(status, 'missing'))
        ELSE 'mixed'
      END,
      'remediation_code', CASE
        WHEN pg_catalog.bool_or(id IS NULL)
          THEN 'owner_transfer_predecessor_missing'
        ELSE 'owner_transfer_predecessor_not_authoritative'
      END,
      'unsettled_component_count', 0,
      'unsettled_components', pg_catalog.jsonb_build_array(),
      'setup_path', '/balances'
    ) END AS detail
    FROM predecessor_issue
  ), unresolved_detail AS (
    SELECT CASE WHEN count(*) = 0 THEN NULL ELSE pg_catalog.jsonb_build_object(
      'previous_owner_person_id', CASE
        WHEN count(DISTINCT previous_owner_person_id) = 1
          THEN min(previous_owner_person_id::text)
        ELSE NULL
      END,
      'previous_owner_person_ids', pg_catalog.to_jsonb(
        ARRAY(
          SELECT DISTINCT item.previous_owner_person_id::text
          FROM unresolved AS item
          ORDER BY item.previous_owner_person_id::text
        )
      ),
      'ownership_started_on', min(ownership_started_on)::text,
      'unsettled_component_count', count(*),
      'unsettled_components', pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'previous_owner_person_id', previous_owner_person_id::text,
          'component', component::text,
          'closing_amount', pg_catalog.to_char(
            remaining_amount,
            'FM999999999990.00'
          ),
          'predecessor_closing_amount', pg_catalog.to_char(
            predecessor_closing_amount,
            'FM999999999990.00'
          ),
          'transferred_amount', pg_catalog.to_char(
            transferred_amount,
            'FM999999999990.00'
          ),
          'remaining_amount', pg_catalog.to_char(
            remaining_amount,
            'FM999999999990.00'
          )
        )
        ORDER BY previous_owner_person_id::text, component::text
      ),
      'setup_path', '/balances'
    ) END AS detail
    FROM unresolved
  )
  SELECT coalesce(issue_detail.detail, unresolved_detail.detail)
  FROM issue_detail
  CROSS JOIN unresolved_detail;
$$;

ALTER FUNCTION app_private.get_unresolved_owner_transfer_detail(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.get_unresolved_owner_transfer_detail(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) SET SCHEMA app_private;
ALTER FUNCTION app_private.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) RENAME TO record_owner_cash_event_baseline;

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
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id, p_property_id, p_owner_person_id, p_currency
  );
  RETURN app_private.record_owner_cash_event_baseline(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_event_type, p_event_date, p_amount, p_reason, p_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_cash_event(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.record_owner_cash_event_baseline(
  uuid, uuid, uuid, public.currency_code, text, date, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) SET SCHEMA app_private;
ALTER FUNCTION app_private.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) RENAME TO record_owner_distribution_baseline;

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
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id, p_property_id, p_owner_person_id, p_currency
  );

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

ALTER FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_distribution(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.record_owner_distribution_baseline(
  uuid, uuid, uuid, public.currency_code, numeric, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) SET SCHEMA app_private;
ALTER FUNCTION app_private.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) RENAME TO transfer_owner_balance_component_baseline;

CREATE OR REPLACE FUNCTION public.transfer_owner_balance_component(
  p_organization_id uuid,
  p_property_id uuid,
  p_from_owner_person_id uuid,
  p_to_owner_person_id uuid,
  p_currency public.currency_code,
  p_effective_date date,
  p_component public.owner_balance_component,
  p_amount numeric,
  p_reason text,
  p_evidence_reference text,
  p_evidence_sha256 text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_boundary date;
  v_period public.owner_balance_periods%ROWTYPE;
  v_closing numeric(14,2);
  v_transferred numeric(14,2);
  v_remaining numeric(14,2);
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_review_owner_opening_balance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_component_transfer_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
    OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'owner_component_transfer_amount_invalid' USING ERRCODE = '22023';
  END IF;

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

  IF EXISTS (
    SELECT 1
    FROM public.owner_component_transfer_instructions AS instruction
    WHERE instruction.organization_id = p_organization_id
      AND instruction.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  ) THEN
    RETURN app_private.transfer_owner_balance_component_baseline(
      p_organization_id, p_property_id,
      p_from_owner_person_id, p_to_owner_person_id, p_currency,
      p_effective_date, p_component, p_amount, p_reason,
      p_evidence_reference, p_evidence_sha256, p_idempotency_key
    );
  END IF;

  SELECT successor.started_on
  INTO v_boundary
  FROM public.property_owners AS successor
  JOIN public.property_owners AS predecessor
    ON predecessor.organization_id = successor.organization_id
   AND predecessor.property_id = successor.property_id
   AND predecessor.person_id = p_from_owner_person_id
   AND predecessor.archived_at IS NULL
   AND predecessor.ended_on = successor.started_on
  WHERE successor.organization_id = p_organization_id
    AND successor.property_id = p_property_id
    AND successor.person_id = p_to_owner_person_id
    AND successor.archived_at IS NULL
  ORDER BY successor.started_on DESC, successor.id
  LIMIT 1;

  IF v_boundary IS NULL OR v_boundary IS DISTINCT FROM p_effective_date THEN
    RAISE EXCEPTION 'owner_transfer_effective_date_mismatch'
      USING ERRCODE = '22023';
  END IF;

  SELECT period.*
  INTO v_period
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_from_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = (
      pg_catalog.date_trunc('month', v_boundary) - INTERVAL '1 month'
    )::date
  FOR KEY SHARE;

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'owner_transfer_predecessor_missing' USING ERRCODE = '23514';
  END IF;
  IF v_period.status NOT IN ('ready', 'closed') THEN
    RAISE EXCEPTION 'owner_transfer_predecessor_not_authoritative'
      USING ERRCODE = '23514';
  END IF;

  SELECT component.closing_amount
  INTO v_closing
  FROM public.owner_balance_period_components AS component
  WHERE component.organization_id = p_organization_id
    AND component.owner_balance_period_id = v_period.id
    AND component.component = p_component;
  IF v_closing IS NULL THEN
    RAISE EXCEPTION 'owner_transfer_predecessor_component_missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(pg_catalog.sum(instruction.amount), 0)::numeric(14,2)
  INTO v_transferred
  FROM public.owner_component_transfer_instructions AS instruction
  WHERE instruction.organization_id = p_organization_id
    AND instruction.property_id = p_property_id
    AND instruction.from_owner_person_id = p_from_owner_person_id
    AND instruction.to_owner_person_id = p_to_owner_person_id
    AND instruction.currency = p_currency
    AND instruction.component = p_component
    AND instruction.effective_date = v_boundary;
  v_remaining := (v_closing - v_transferred)::numeric(14,2);

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'owner_transfer_no_remaining_balance'
      USING ERRCODE = '23514';
  END IF;
  IF p_amount < v_remaining THEN
    RAISE EXCEPTION 'owner_transfer_amount_below_predecessor_remaining'
      USING ERRCODE = '23514';
  END IF;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'owner_transfer_amount_exceeds_predecessor_remaining'
      USING ERRCODE = '23514';
  END IF;

  RETURN app_private.transfer_owner_balance_component_baseline(
    p_organization_id, p_property_id,
    p_from_owner_person_id, p_to_owner_person_id, p_currency,
    p_effective_date, p_component, p_amount, p_reason,
    p_evidence_reference, p_evidence_sha256, p_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_owner_balance_component(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.transfer_owner_balance_component_baseline(
  uuid, uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

DO $patch_automatic_owner_cash_lock$
DECLARE
  v_definition text;
  v_marker text := '  v_available := app_private.property_held_cash_balance(';
  v_replacement text := E'  FOR v_line IN\n    SELECT DISTINCT invoice.owner_person_id\n    FROM public.owner_invoices AS invoice\n    WHERE invoice.organization_id = p_organization_id\n      AND invoice.property_id = p_property_id\n      AND invoice.lifecycle = ''issued''\n    ORDER BY invoice.owner_person_id\n  LOOP\n    PERFORM app_private.lock_owner_balance_lifecycle(\n      p_organization_id,\n      p_property_id,\n      v_line.owner_person_id,\n      ''USD''::public.currency_code\n    );\n  END LOOP;\n\n  v_available := app_private.property_held_cash_balance(';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.apply_available_owner_cash(uuid,uuid,date,uuid)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_marker) = 0 THEN
    RAISE EXCEPTION 'apply_available_owner_cash_patch_contract_changed';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_marker, v_replacement);
  EXECUTE v_definition;
END;
$patch_automatic_owner_cash_lock$;

CREATE OR REPLACE FUNCTION app_private.lock_legacy_owner_cash_effect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_owner_person_id uuid;
  v_currency public.currency_code;
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
  ELSE
    SELECT invoice.owner_person_id, invoice.currency
    INTO STRICT v_owner_person_id, v_currency
    FROM public.owner_invoices AS invoice
    WHERE invoice.organization_id = NEW.organization_id
      AND invoice.id = NEW.owner_invoice_id;
  END IF;
  PERFORM app_private.lock_owner_balance_lifecycle(
    NEW.organization_id,
    NEW.property_id,
    v_owner_person_id,
    v_currency
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.lock_legacy_owner_cash_effect() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_legacy_owner_cash_effect()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER a_lock_owner_charge_cash_lifecycle
  BEFORE INSERT ON public.owner_charge_cash_allocations
  FOR EACH ROW EXECUTE FUNCTION app_private.lock_legacy_owner_cash_effect();
CREATE TRIGGER a_lock_owner_expense_adjustment_lifecycle
  BEFORE INSERT ON public.expense_customer_adjustments
  FOR EACH ROW EXECUTE FUNCTION app_private.lock_legacy_owner_cash_effect();

ALTER FUNCTION public.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) SET SCHEMA app_private;
ALTER FUNCTION app_private.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) RENAME TO get_owner_available_withdrawal_baseline;

CREATE OR REPLACE FUNCTION public.get_owner_available_withdrawal(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_as_of_date date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_period_status text;
  v_status text;
  v_sources_ready boolean := true;
BEGIN
  v_result := app_private.get_owner_available_withdrawal_baseline(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_currency,
    p_as_of_date
  );

  BEGIN
    PERFORM app_private.assert_owner_cash_sources_allocated(
      p_organization_id, p_property_id, p_currency, p_as_of_date
    );
  EXCEPTION WHEN check_violation THEN
    v_sources_ready := false;
  END;

  SELECT period.status
  INTO v_period_status
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = pg_catalog.date_trunc('month', p_as_of_date)::date;

  v_status := CASE
    WHEN NOT v_sources_ready THEN 'blocked'
    WHEN pg_catalog.date_trunc('month', p_as_of_date)::date
      <> pg_catalog.date_trunc('month', current_date)::date THEN 'historical'
    WHEN v_period_status IN ('stale', 'blocked') THEN v_period_status
    ELSE 'available'
  END;

  RETURN v_result || pg_catalog.jsonb_build_object(
    'status', v_status,
    'period_status', v_period_status,
    'available_withdrawal', CASE WHEN v_status = 'available'
      THEN v_result->'available_withdrawal' ELSE 'null'::jsonb END
  );
END;
$$;

ALTER FUNCTION public.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_available_withdrawal(
  uuid, uuid, uuid, public.currency_code, date
) TO authenticated;
REVOKE ALL ON FUNCTION app_private.get_owner_available_withdrawal_baseline(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

-- These legacy trigger helpers produce the baseline cash effects now projected
-- into Track 3. Trigger dispatch does not require Data API roles to execute the
-- function directly, so retain them as private implementation details.
REVOKE ALL ON FUNCTION app_private.apply_owner_cash_after_tenant_payment()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.create_management_fee_owner_charge()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.reverse_property_withdrawal(uuid, uuid, date, text, text)
  SET SCHEMA app_private;
ALTER FUNCTION app_private.reverse_property_withdrawal(uuid, uuid, date, text, text)
  RENAME TO reverse_property_withdrawal_baseline;

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
DECLARE
  v_withdrawal public.property_withdrawals%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_distribution_reversal_forbidden'
      USING ERRCODE = '42501';
  END IF;
  SELECT withdrawal.* INTO STRICT v_withdrawal
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = p_organization_id
    AND withdrawal.id = p_withdrawal_id;
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id,
    v_withdrawal.property_id,
    v_withdrawal.owner_person_id,
    v_withdrawal.currency
  );
  RETURN app_private.reverse_property_withdrawal_baseline(
    p_organization_id, p_withdrawal_id, p_reversal_date,
    p_reason, p_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.reverse_property_withdrawal(uuid, uuid, date, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_property_withdrawal(uuid, uuid, date, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_property_withdrawal(uuid, uuid, date, text, text)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.reverse_property_withdrawal_baseline(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  SET SCHEMA app_private;
ALTER FUNCTION app_private.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  RENAME TO reverse_owner_invoice_payment_baseline;

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
DECLARE
  v_payment public.owner_payments%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_correct_finance(p_organization_id) THEN
    RAISE EXCEPTION 'owner_payment_reversal_forbidden'
      USING ERRCODE = '42501';
  END IF;
  SELECT payment.* INTO STRICT v_payment
  FROM public.owner_payments AS payment
  WHERE payment.organization_id = p_organization_id
    AND payment.id = p_owner_payment_id;
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id,
    v_payment.property_id,
    v_payment.owner_person_id,
    v_payment.currency
  );
  RETURN app_private.reverse_owner_invoice_payment_baseline(
    p_organization_id, p_owner_payment_id, p_reversal_date,
    p_reason, p_idempotency_key
  );
END;
$$;

ALTER FUNCTION public.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_owner_invoice_payment(uuid, uuid, date, text, text)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.reverse_owner_invoice_payment_baseline(
  uuid, uuid, date, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_owner_balance_period_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_prior_status text;
  v_has_earlier_authority boolean;
BEGIN
  PERFORM app_private.lock_owner_balance_lifecycle(
    NEW.organization_id,
    NEW.property_id,
    NEW.owner_person_id,
    NEW.currency
  );

  IF NEW.status = 'ready' THEN
    SELECT period.status
    INTO v_prior_status
    FROM public.owner_balance_periods AS period
    WHERE period.organization_id = NEW.organization_id
      AND period.property_id = NEW.property_id
      AND period.owner_person_id = NEW.owner_person_id
      AND period.currency = NEW.currency
      AND period.month_start = (NEW.month_start - INTERVAL '1 month')::date
    FOR KEY SHARE;

    IF v_prior_status IS NULL THEN
      SELECT
        EXISTS (
          SELECT 1
          FROM public.owner_balance_periods AS earlier_period
          WHERE earlier_period.organization_id = NEW.organization_id
            AND earlier_period.property_id = NEW.property_id
            AND earlier_period.owner_person_id = NEW.owner_person_id
            AND earlier_period.currency = NEW.currency
            AND earlier_period.month_start < NEW.month_start
        ) OR EXISTS (
          SELECT 1
          FROM public.owner_opening_balance_entries AS earlier_entry
          WHERE earlier_entry.organization_id = NEW.organization_id
            AND earlier_entry.property_id = NEW.property_id
            AND earlier_entry.owner_person_id = NEW.owner_person_id
            AND earlier_entry.currency = NEW.currency
            AND earlier_entry.effective_date < NEW.month_start
        )
      INTO v_has_earlier_authority;

      IF v_has_earlier_authority THEN
        NEW.status := 'blocked';
        NEW.blocked_reason_code := 'prior_period_missing';
        NEW.blocked_reason_detail := pg_catalog.jsonb_build_object(
          'expected_month_start',
          (NEW.month_start - INTERVAL '1 month')::date::text,
          'setup_path', '/balances'
        );
        NEW.stale_at := NULL;
        NEW.stale_reason := NULL;
      END IF;
    ELSIF v_prior_status NOT IN ('ready', 'closed') THEN
      NEW.status := 'blocked';
      NEW.blocked_reason_code := 'prior_period_not_ready';
      NEW.blocked_reason_detail := pg_catalog.jsonb_build_object(
        'expected_month_start',
        (NEW.month_start - INTERVAL '1 month')::date::text,
        'prior_period_status', v_prior_status,
        'setup_path', '/balances'
      );
      NEW.stale_at := NULL;
      NEW.stale_reason := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_balance_period_lifecycle() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_balance_period_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER a_owner_balance_period_lifecycle
  BEFORE INSERT OR UPDATE ON public.owner_balance_periods
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_balance_period_lifecycle();

CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_cash_dependency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_downstream jsonb;
BEGIN
  PERFORM app_private.lock_owner_balance_lifecycle(
    NEW.organization_id,
    NEW.property_id,
    NEW.owner_person_id,
    NEW.currency
  );

  IF NEW.entry_kind = 'correction_reversal'
    AND NEW.reversal_of_entry_id IS NOT NULL THEN
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'consumer_source_type', consumer_set.source_type,
        'consumer_source_id', consumer_set.source_id::text,
        'consumer_source_line_id', consumer_set.source_line_id::text,
        'consumed_amount', pg_catalog.to_char(
          consumption.consumed_amount,
          'FM999999999990.00'
        )
      )
      ORDER BY consumer_set.source_type, consumer_set.source_line_id
    )
    INTO v_downstream
    FROM public.owner_cash_source_consumptions AS consumption
    JOIN public.owner_component_movements AS consumer_movement
      ON consumer_movement.organization_id = consumption.organization_id
     AND consumer_movement.id = consumption.consumer_movement_id
    JOIN public.owner_event_owner_allocations AS consumer_owner
      ON consumer_owner.organization_id = consumer_movement.organization_id
     AND consumer_owner.id = consumer_movement.owner_event_owner_allocation_id
    JOIN public.owner_event_allocation_sets AS consumer_set
      ON consumer_set.organization_id = consumer_owner.organization_id
     AND consumer_set.id = consumer_owner.allocation_set_id
    WHERE consumption.organization_id = NEW.organization_id
      AND consumption.source_opening_entry_id = NEW.reversal_of_entry_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_component_movements AS consumer_reversal
        WHERE consumer_reversal.organization_id = consumption.organization_id
          AND consumer_reversal.reversal_of_movement_id =
            consumption.consumer_movement_id
      );

    IF v_downstream IS NOT NULL THEN
      RAISE EXCEPTION 'dependent_owner_cash:%', v_downstream::text
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_opening_cash_dependency() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_opening_cash_dependency()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER a_owner_opening_cash_dependency
  BEFORE INSERT ON public.owner_opening_balance_entries
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_opening_cash_dependency();

CREATE INDEX owner_component_movements_lifecycle_source_idx
  ON public.owner_component_movements (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    component,
    event_date,
    created_at,
    id
  );
CREATE INDEX owner_opening_balance_entries_lifecycle_source_idx
  ON public.owner_opening_balance_entries (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    component,
    effective_date,
    created_at,
    id
  );
