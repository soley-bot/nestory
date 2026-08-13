DO $project_owner_distribution_reversals$
DECLARE
  v_definition text;
  v_target text := $target$    SELECT
      'property_withdrawal:' || withdrawal.id::text,
      withdrawal.organization_id,
      withdrawal.property_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      withdrawal.owner_person_id,
      NULL::uuid,
      NULL::uuid,
      withdrawal.withdrawal_date,
      withdrawal.currency,
      -withdrawal.amount,
      -withdrawal.amount,
      0::numeric,
      0::numeric,
      0::numeric,
      'owner_distribution'::text,
      'owner_withdrawal'::text,
      'Owner withdrawal'::text,
      withdrawal.reference,
      'property_withdrawal'::text,
      withdrawal.id,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      false,
      NULL::uuid,
      withdrawal.ledger_entry_id,
      (
        ledger.id IS NOT NULL
        AND ledger.organization_id = withdrawal.organization_id
        AND ledger.property_id = withdrawal.property_id
        AND ledger.unit_id IS NULL
        AND ledger.transaction_date = withdrawal.withdrawal_date
        AND ledger.currency = withdrawal.currency
        AND ledger.direction = 'expense'
        AND ledger.amount = withdrawal.amount
        AND ledger.source_type = 'owner_cash_event'
        AND ledger.source_id = withdrawal.id
        AND ledger.reversal_of_ledger_entry_id IS NULL
        AND ledger.archived_at IS NULL
      )
    FROM public.property_withdrawals AS withdrawal
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = withdrawal.ledger_entry_id$target$;
  v_replacement text := $replacement$    SELECT
      'property_withdrawal:' || withdrawal.id::text,
      withdrawal.organization_id,
      withdrawal.property_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      withdrawal.owner_person_id,
      NULL::uuid,
      NULL::uuid,
      withdrawal.withdrawal_date,
      withdrawal.currency,
      CASE WHEN withdrawal.reversal_of_id IS NULL
        THEN -withdrawal.amount ELSE withdrawal.amount END,
      CASE WHEN withdrawal.reversal_of_id IS NULL
        THEN -withdrawal.amount ELSE withdrawal.amount END,
      0::numeric,
      0::numeric,
      0::numeric,
      'owner_distribution'::text,
      CASE WHEN withdrawal.reversal_of_id IS NULL
        THEN 'owner_withdrawal'::text
        ELSE 'owner_withdrawal_reversal'::text END,
      CASE WHEN withdrawal.reversal_of_id IS NULL
        THEN 'Owner withdrawal'::text
        ELSE 'Owner withdrawal reversal'::text END,
      withdrawal.reference,
      'property_withdrawal'::text,
      withdrawal.id,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      CASE WHEN withdrawal.reversal_of_id IS NULL
        THEN NULL::text ELSE 'property_withdrawal'::text END,
      withdrawal.reversal_of_id,
      withdrawal.reversal_of_id IS NOT NULL,
      NULL::uuid,
      withdrawal.ledger_entry_id,
      (
        (original.id IS NOT NULL OR withdrawal.reversal_of_id IS NULL)
        AND ledger.id IS NOT NULL
        AND ledger.organization_id = withdrawal.organization_id
        AND ledger.property_id = withdrawal.property_id
        AND ledger.unit_id IS NULL
        AND ledger.transaction_date = withdrawal.withdrawal_date
        AND ledger.currency = withdrawal.currency
        AND ledger.direction = CASE
          WHEN withdrawal.reversal_of_id IS NULL THEN 'expense'
          ELSE 'income'
        END
        AND ledger.amount = withdrawal.amount
        AND ledger.source_type = 'owner_cash_event'
        AND ledger.source_id = withdrawal.id
        AND ledger.archived_at IS NULL
        AND (
          (
            withdrawal.reversal_of_id IS NULL
            AND ledger.reversal_of_ledger_entry_id IS NULL
          )
          OR (
            withdrawal.reversal_of_id IS NOT NULL
            AND ledger.reversal_of_ledger_entry_id = original.ledger_entry_id
          )
        )
      )
    FROM public.property_withdrawals AS withdrawal
    LEFT JOIN public.property_withdrawals AS original
      ON original.organization_id = withdrawal.organization_id
      AND original.id = withdrawal.reversal_of_id
    LEFT JOIN public.ledger_entries AS ledger
      ON ledger.id = withdrawal.ledger_entry_id$replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.get_property_cash_events_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_definition := pg_catalog.replace(
    v_definition,
    pg_catalog.chr(13) || pg_catalog.chr(10),
    pg_catalog.chr(10)
  );
  v_target := pg_catalog.replace(
    v_target,
    pg_catalog.chr(13) || pg_catalog.chr(10),
    pg_catalog.chr(10)
  );
  v_replacement := pg_catalog.replace(
    v_replacement,
    pg_catalog.chr(13) || pg_catalog.chr(10),
    pg_catalog.chr(10)
  );

  IF pg_catalog.strpos(v_definition, v_target) = 0 THEN
    RAISE EXCEPTION
      'property cash distribution projection insertion point not found';
  END IF;

  v_definition := pg_catalog.replace(v_definition, v_target, v_replacement);
  EXECUTE v_definition;
END;
$project_owner_distribution_reversals$;

ALTER FUNCTION app_private.get_property_cash_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.get_property_cash_events_page(
  uuid, uuid, public.currency_code, date, date, date, text, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
