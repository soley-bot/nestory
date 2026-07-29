-- Plan 05: atomic income settlement, allocation-based projections, and
-- append-only reversal. This adopts the Plan 03 financial-authority kernel.

ALTER TABLE public.finance_receipts
  ADD COLUMN settlement_contract_version text;

ALTER TABLE public.finance_receipt_allocations
  ADD COLUMN property_id uuid,
  ADD COLUMN unit_id uuid,
  ADD COLUMN lease_id uuid,
  ADD COLUMN payer_person_id_snapshot uuid,
  ADD COLUMN payer_label_snapshot text,
  ADD COLUMN currency public.currency_code,
  ADD COLUMN received_date date,
  ADD COLUMN reconciliation_source_id uuid,
  ADD COLUMN external_reference text,
  ADD COLUMN economic_class text,
  ADD COLUMN obligation_type text,
  ADD COLUMN income_type_snapshot text,
  ADD COLUMN signed_amount numeric(14, 2),
  ADD COLUMN settlement_sequence integer,
  ADD COLUMN outstanding_balance_after numeric(14, 2),
  ADD COLUMN source_discriminator text,
  ADD COLUMN settlement_basis text,
  ADD COLUMN publication_source_class text,
  ADD COLUMN classification_evidence_kind text,
  ADD COLUMN classification_evidence_version integer,
  ADD COLUMN classification_evidence_hash text,
  ADD COLUMN committed_at timestamptz,
  ADD COLUMN settlement_contract_version text,
  ADD COLUMN reversal_of_allocation_id uuid,
  ADD COLUMN ledger_entry_id uuid;

ALTER TABLE public.finance_receipt_allocations
  ADD CONSTRAINT finance_receipt_allocations_org_id_unique
    UNIQUE (organization_id, id),
  ADD CONSTRAINT finance_receipt_allocations_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_receipt_allocations_org_reconciliation_source_fkey
    FOREIGN KEY (organization_id, reconciliation_source_id)
    REFERENCES public.financial_reconciliation_sources(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_receipt_allocations_reversal_scope_fkey
    FOREIGN KEY (organization_id, reversal_of_allocation_id)
    REFERENCES public.finance_receipt_allocations(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_receipt_allocations_reversal_unique
    UNIQUE (reversal_of_allocation_id),
  ADD CONSTRAINT finance_receipt_allocations_ledger_entry_fkey
    FOREIGN KEY (ledger_entry_id)
    REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_receipt_allocations_ledger_entry_unique
    UNIQUE (ledger_entry_id),
  ADD CONSTRAINT finance_receipt_allocations_canonical_check
    CHECK (
      settlement_contract_version IS NULL
      OR (
        settlement_contract_version = 'plan05.v1'
        AND property_id IS NOT NULL
        AND payer_label_snapshot IS NOT NULL
        AND currency IS NOT NULL
        AND received_date IS NOT NULL
        AND reconciliation_source_id IS NOT NULL
        AND economic_class IS NOT NULL
        AND obligation_type = 'finance_income_item'
        AND income_type_snapshot IS NOT NULL
        AND signed_amount IS NOT NULL
        AND signed_amount <> 0
        AND settlement_sequence > 0
        AND outstanding_balance_after >= 0
        AND source_discriminator = 'receipt_allocation'
        AND settlement_basis IS NOT NULL
        AND publication_source_class IS NOT NULL
        AND classification_evidence_kind IS NOT NULL
        AND classification_evidence_version > 0
        AND classification_evidence_hash ~ '^[0-9a-f]{64}$'
        AND committed_at IS NOT NULL
      )
    ),
  ADD CONSTRAINT finance_receipt_allocations_reversal_sign_check
    CHECK (
      settlement_contract_version IS NULL
      OR (
        (reversal_of_allocation_id IS NULL AND signed_amount > 0)
        OR (reversal_of_allocation_id IS NOT NULL AND signed_amount < 0)
      )
    ),
  ADD CONSTRAINT finance_receipt_allocations_snapshot_amount_check
    CHECK (
      settlement_contract_version IS NULL
      OR abs(signed_amount) = amount
    ),
  ADD CONSTRAINT finance_receipt_allocations_publication_class_check
    CHECK (
      publication_source_class IS NULL
      OR publication_source_class IN (
        'legacy_cash_non_publishable',
        'eligible_invoice_linked',
        'unclassified'
      )
    );

CREATE INDEX finance_receipt_allocations_reconciliation_source_idx
  ON public.finance_receipt_allocations(
    organization_id,
    reconciliation_source_id
  )
  WHERE reconciliation_source_id IS NOT NULL;

CREATE INDEX finance_receipt_allocations_snapshot_scope_idx
  ON public.finance_receipt_allocations(
    organization_id,
    property_id,
    currency,
    received_date,
    id
  )
  WHERE settlement_contract_version IS NOT NULL;

CREATE TABLE public.finance_receipt_allocation_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  allocation_id uuid NOT NULL,
  book_id uuid NOT NULL
    REFERENCES public.accounting_books(id) ON DELETE RESTRICT,
  journal_entry_id uuid NOT NULL
    REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT finance_receipt_allocation_journals_allocation_fkey
    FOREIGN KEY (organization_id, allocation_id)
    REFERENCES public.finance_receipt_allocations(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT finance_receipt_allocation_journals_allocation_book_unique
    UNIQUE (allocation_id, book_id),
  CONSTRAINT finance_receipt_allocation_journals_journal_unique
    UNIQUE (journal_entry_id)
);

CREATE INDEX finance_receipt_allocation_journals_org_allocation_idx
  ON public.finance_receipt_allocation_journals(
    organization_id,
    allocation_id
  );

ALTER TABLE public.finance_receipt_allocation_journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization admins can read receipt allocation journals"
ON public.finance_receipt_allocation_journals
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_org_admin(organization_id)));

REVOKE ALL ON TABLE public.finance_receipt_allocation_journals
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.finance_receipt_allocation_journals
TO authenticated;

CREATE TABLE app_private.finance_settlement_context_capability (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  capability_token text NOT NULL UNIQUE
    CHECK (capability_token ~ '^[0-9a-f]{64}$')
);

INSERT INTO app_private.finance_settlement_context_capability(
  singleton,
  capability_token
)
VALUES (
  true,
  encode(extensions.gen_random_bytes(32), 'hex')
);

REVOKE ALL ON TABLE app_private.finance_settlement_context_capability
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.set_finance_settlement_context(
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capability_token text;
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Settlement context state is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT capability.capability_token
  INTO STRICT v_capability_token
  FROM app_private.finance_settlement_context_capability AS capability
  WHERE capability.singleton;

  PERFORM pg_catalog.set_config(
    'app.finance_settlement_context',
    CASE WHEN p_enabled THEN v_capability_token ELSE 'off' END,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.has_finance_settlement_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.current_setting(
    'app.finance_settlement_context',
    true
  ) IS NOT DISTINCT FROM (
    SELECT capability.capability_token
    FROM app_private.finance_settlement_context_capability AS capability
    WHERE capability.singleton
  );
$$;

REVOKE ALL ON FUNCTION
  app_private.set_finance_settlement_context(boolean),
  app_private.has_finance_settlement_context()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_finance_income_owner_state_v1(
  p_organization_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_requested_action text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_source_type text := lower(pg_catalog.btrim(coalesce(p_source_type, '')));
  v_requested_action text :=
    NULLIF(lower(pg_catalog.btrim(coalesce(p_requested_action, ''))), '');
  v_source jsonb;
  v_scopes jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_state text;
  v_unavailable_reason text;
  v_material_hash text;
  v_outstanding numeric;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_source_id IS NULL
    OR v_source_type NOT IN (
      'finance_income_item',
      'finance_receipt',
      'receipt_allocation'
    ) THEN
    RAISE EXCEPTION 'Plan 05 owner source type is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_source_type = 'finance_income_item' THEN
    SELECT pg_catalog.to_jsonb(income)
    INTO v_source
    FROM public.finance_income_items AS income
    WHERE income.id = p_source_id
      AND income.organization_id = p_organization_id;

    IF v_source IS NULL THEN
      RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
    END IF;

    SELECT (
      (v_source->>'amount_due')::numeric
      - coalesce(pg_catalog.sum(
        CASE
          WHEN allocation.settlement_contract_version = 'plan05.v1'
            THEN allocation.signed_amount
          WHEN receipt.reversal_of_id IS NULL
            THEN allocation.amount
          ELSE -allocation.amount
        END
      ), 0)
    )
    INTO v_outstanding
    FROM public.finance_receipt_allocations AS allocation
    JOIN public.finance_receipts AS receipt
      ON receipt.id = allocation.receipt_id
     AND receipt.organization_id = allocation.organization_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.income_item_id = p_source_id;

    v_state := CASE
      WHEN v_source->>'archived_at' IS NOT NULL THEN 'archived'
      WHEN v_source->>'status' = 'void' THEN 'void'
      WHEN v_outstanding <= 0 THEN 'settled'
      WHEN v_outstanding < (v_source->>'amount_due')::numeric THEN 'partial'
      ELSE 'open'
    END;

    IF v_state IN ('open', 'partial')
      AND v_source->>'income_type' NOT IN (
        'security_deposit',
        'owner_contribution',
        'management_fee',
        'leasing_commission',
        'service_fee',
        'maintenance_markup'
      ) THEN
      v_actions := '["record_receipt"]'::jsonb;
    END IF;

    v_scopes := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'organization_id', p_organization_id,
        'property_id', v_source->>'property_id',
        'currency', v_source->>'currency',
        'period_start',
          pg_catalog.date_trunc(
            'month',
            (v_source->>'due_date')::date
          )::date
      )
    );
  ELSIF v_source_type = 'finance_receipt' THEN
    SELECT pg_catalog.jsonb_build_object(
      'receipt', pg_catalog.to_jsonb(receipt),
      'allocations', coalesce((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(allocation)
          ORDER BY allocation.id
        )
        FROM public.finance_receipt_allocations AS allocation
        WHERE allocation.organization_id = receipt.organization_id
          AND allocation.receipt_id = receipt.id
      ), '[]'::jsonb)
    )
    INTO v_source
    FROM public.finance_receipts AS receipt
    WHERE receipt.id = p_source_id
      AND receipt.organization_id = p_organization_id;

    IF v_source IS NULL THEN
      RAISE EXCEPTION 'Finance receipt not found' USING ERRCODE = '23503';
    END IF;

    IF v_source#>>'{receipt,reversal_of_id}' IS NOT NULL THEN
      v_state := 'reversal';
    ELSIF EXISTS (
      SELECT 1
      FROM public.finance_receipts AS reversal
      WHERE reversal.organization_id = p_organization_id
        AND reversal.reversal_of_id = p_source_id
    ) THEN
      v_state := 'reversed';
    ELSE
      v_state := 'received';
      v_actions := '["reverse_receipt"]'::jsonb;
    END IF;

    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'organization_id', receipt.organization_id,
          'property_id', receipt.property_id,
          'currency', receipt.currency,
          'period_start',
            pg_catalog.date_trunc('month', receipt.received_date)::date
        )
        ORDER BY receipt.received_date, receipt.id
      ),
      '[]'::jsonb
    )
    INTO v_scopes
    FROM public.finance_receipts AS receipt
    WHERE receipt.organization_id = p_organization_id
      AND (
        receipt.id = p_source_id
        OR receipt.reversal_of_id = p_source_id
        OR receipt.id = (
          SELECT original.reversal_of_id
          FROM public.finance_receipts AS original
          WHERE original.id = p_source_id
            AND original.organization_id = p_organization_id
        )
      );
  ELSE
    SELECT pg_catalog.jsonb_build_object(
      'allocation', pg_catalog.to_jsonb(allocation),
      'receipt', pg_catalog.to_jsonb(receipt),
      'journals', coalesce((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'book_id', link.book_id,
            'journal_entry_id', link.journal_entry_id
          )
          ORDER BY link.book_id
        )
        FROM public.finance_receipt_allocation_journals AS link
        WHERE link.organization_id = allocation.organization_id
          AND link.allocation_id = allocation.id
      ), '[]'::jsonb)
    )
    INTO v_source
    FROM public.finance_receipt_allocations AS allocation
    JOIN public.finance_receipts AS receipt
      ON receipt.id = allocation.receipt_id
     AND receipt.organization_id = allocation.organization_id
    WHERE allocation.id = p_source_id
      AND allocation.organization_id = p_organization_id;

    IF v_source IS NULL THEN
      RAISE EXCEPTION 'Receipt allocation not found' USING ERRCODE = '23503';
    END IF;

    v_state := CASE
      WHEN v_source#>>'{allocation,settlement_contract_version}' IS NULL
        THEN 'legacy_unclassified'
      WHEN v_source#>>'{allocation,reversal_of_allocation_id}' IS NOT NULL
        THEN 'reversal'
      WHEN EXISTS (
        SELECT 1
        FROM public.finance_receipt_allocations AS reversal
        WHERE reversal.organization_id = p_organization_id
          AND reversal.reversal_of_allocation_id = p_source_id
      ) THEN 'reversed'
      ELSE 'settled'
    END;

    IF v_state = 'settled' THEN
      v_actions := '["reverse_receipt"]'::jsonb;
    END IF;

    v_scopes := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'organization_id', p_organization_id,
        'property_id', v_source#>>'{allocation,property_id}',
        'currency', v_source#>>'{allocation,currency}',
        'period_start',
          pg_catalog.date_trunc(
            'month',
            (v_source#>>'{allocation,received_date}')::date
          )::date
      )
    );
  END IF;

  IF v_requested_action IS NOT NULL
    AND NOT v_actions ? v_requested_action THEN
    v_unavailable_reason := CASE
      WHEN v_requested_action = 'record_receipt'
        AND v_source_type = 'finance_income_item'
        AND v_source->>'income_type' IN (
          'security_deposit',
          'owner_contribution',
          'management_fee',
          'leasing_commission',
          'service_fee',
          'maintenance_markup'
        )
        THEN 'income_settlement_class_not_supported'
      WHEN v_requested_action IN ('record_receipt', 'reverse_receipt')
        THEN 'action_not_available_for_current_state'
      ELSE 'action_not_merged'
    END;
  END IF;

  v_material_hash :=
    app_private.canonical_financial_payload_hash(
      pg_catalog.jsonb_build_object(
        'contract_version', 'plan05.owner.v1',
        'source_type', v_source_type,
        'source_id', p_source_id,
        'state', v_state,
        'source', v_source,
        'actions', v_actions,
        'scopes', v_scopes
      )
    );

  RETURN pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'contract_version', 'plan05.owner.v1',
      'source_type', v_source_type,
      'source_id', p_source_id,
      'source_version', 1,
      'material_hash', v_material_hash,
      'owner_state', v_state,
      'actions', v_actions,
      'scopes', v_scopes,
      'requested_action', v_requested_action,
      'unavailable_reason', v_unavailable_reason,
      'source', v_source
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_income_owner_state_v1(
  uuid,
  text,
  uuid,
  text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_income_owner_state_v1(
  uuid,
  text,
  uuid,
  text
)
TO authenticated;

-- Remove every operator-visible split authority after the v2 commands exist.
REVOKE EXECUTE ON FUNCTION public.record_finance_receipt(
  uuid,
  uuid,
  numeric,
  date,
  text
)
FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reverse_finance_receipt(
  uuid,
  uuid,
  date,
  text
)
FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.record_finance_income_payment(
  uuid,
  uuid,
  numeric,
  date,
  text
)
FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.post_finance_income_item(uuid, uuid)
FROM authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.record_finance_receipt(
  uuid,
  uuid,
  numeric,
  date,
  text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.reverse_finance_receipt(
  uuid,
  uuid,
  date,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.enforce_canonical_income_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_canonical boolean;
BEGIN
  v_is_canonical :=
    CASE
      WHEN TG_OP = 'INSERT'
        THEN NEW.settlement_contract_version IS NOT NULL
      WHEN TG_OP = 'DELETE'
        THEN OLD.settlement_contract_version IS NOT NULL
      ELSE
        OLD.settlement_contract_version IS NOT NULL
        OR NEW.settlement_contract_version IS NOT NULL
    END;

  IF TG_OP = 'DELETE' AND v_is_canonical THEN
    RAISE EXCEPTION 'Canonical income settlement is append-only'
      USING ERRCODE = '42501';
  END IF;

  IF v_is_canonical
    AND NOT app_private.has_finance_settlement_context() THEN
    RAISE EXCEPTION
      'Canonical income settlement requires the checked domain workflow'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_settled_income_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.organization_id = OLD.organization_id
      AND allocation.income_item_id = OLD.id
      AND allocation.settlement_contract_version = 'plan05.v1'
  )
    AND (
      OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.property_id IS DISTINCT FROM NEW.property_id
      OR OLD.unit_id IS DISTINCT FROM NEW.unit_id
      OR OLD.lease_id IS DISTINCT FROM NEW.lease_id
      OR OLD.payer_person_id IS DISTINCT FROM NEW.payer_person_id
      OR OLD.payer_label IS DISTINCT FROM NEW.payer_label
      OR OLD.income_type IS DISTINCT FROM NEW.income_type
      OR OLD.due_date IS DISTINCT FROM NEW.due_date
      OR OLD.amount_due IS DISTINCT FROM NEW.amount_due
      OR OLD.amount_received IS DISTINCT FROM NEW.amount_received
      OR OLD.received_date IS DISTINCT FROM NEW.received_date
      OR OLD.currency IS DISTINCT FROM NEW.currency
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.ledger_entry_id IS DISTINCT FROM NEW.ledger_entry_id
      OR OLD.archived_at IS DISTINCT FROM NEW.archived_at
    )
    AND NOT app_private.has_finance_settlement_context() THEN
    RAISE EXCEPTION
      'Settled income material requires the checked settlement workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_canonical_finance_receipts
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_receipts
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_canonical_income_settlement();

CREATE TRIGGER enforce_canonical_finance_receipt_allocations
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_receipt_allocations
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_canonical_income_settlement();

CREATE TRIGGER enforce_settled_finance_income_material
BEFORE UPDATE ON public.finance_income_items
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_settled_income_material();

CREATE OR REPLACE FUNCTION app_private.enforce_allocation_journal_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Receipt allocation journal links are append-only'
      USING ERRCODE = '42501';
  END IF;

  IF NOT app_private.has_finance_settlement_context() THEN
    RAISE EXCEPTION
      'Receipt allocation journal links require the checked settlement workflow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_allocation_journal_append_only
BEFORE INSERT OR UPDATE OR DELETE
ON public.finance_receipt_allocation_journals
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_allocation_journal_append_only();

REVOKE ALL ON FUNCTION
  app_private.enforce_canonical_income_settlement(),
  app_private.enforce_settled_income_material(),
  app_private.enforce_allocation_journal_append_only()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.create_income_settlement_projection(
  p_organization_id uuid,
  p_allocation_id uuid,
  p_book_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_payer_person_id uuid,
  p_income_type text,
  p_effective_date date,
  p_amount numeric,
  p_currency public.currency_code,
  p_description text,
  p_reference text,
  p_actor_id uuid,
  p_is_reversal boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mapping record;
  v_ledger_entry_id uuid;
  v_journal_entry_id uuid;
  v_lines jsonb;
  v_category text;
BEGIN
  SELECT *
  INTO STRICT v_mapping
  FROM app_private.resolve_legacy_accounting_mapping(
    'finance_income',
    'income',
    p_income_type,
    p_income_type,
    NULL,
    NULL
  );

  SELECT book.id
  INTO STRICT p_book_id
  FROM public.accounting_books AS book
  WHERE book.id = p_book_id
    AND book.organization_id = p_organization_id
    AND book.book_type = v_mapping.book_type
    AND book.currency = p_currency
    AND book.is_default
    AND book.archived_at IS NULL
  FOR SHARE;

  v_category := replace(
    pg_catalog.initcap(replace(p_income_type, '_', ' ')),
    '  ',
    ' '
  );

  PERFORM app_private.set_financial_projection_context(true);

  INSERT INTO public.ledger_entries (
    organization_id,
    property_id,
    unit_id,
    transaction_date,
    direction,
    category,
    amount,
    currency,
    description,
    source_type,
    source_id,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_effective_date,
    CASE WHEN p_is_reversal THEN 'expense' ELSE 'income' END,
    CASE WHEN p_is_reversal THEN 'Reversal - ' || v_category ELSE v_category END,
    p_amount,
    p_currency,
    p_description,
    'receipt_allocation',
    p_allocation_id,
    p_actor_id,
    p_actor_id
  )
  RETURNING id INTO v_ledger_entry_id;

  v_lines := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'account_system_code',
          CASE WHEN p_is_reversal
            THEN v_mapping.credit_system_code
            ELSE v_mapping.debit_system_code
          END,
        'description', p_description,
        'debit_amount', p_amount,
        'credit_amount', 0,
        'property_id', p_property_id,
        'unit_id', p_unit_id,
        'lease_id', p_lease_id,
        'tenant_person_id', p_payer_person_id
      )
    ),
    pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'account_system_code',
          CASE WHEN p_is_reversal
            THEN v_mapping.debit_system_code
            ELSE v_mapping.credit_system_code
          END,
        'description', p_description,
        'debit_amount', 0,
        'credit_amount', p_amount,
        'property_id', p_property_id,
        'unit_id', p_unit_id,
        'lease_id', p_lease_id,
        'tenant_person_id', p_payer_person_id
      )
    )
  );

  v_journal_entry_id := app_private.post_accounting_journal_internal(
    p_organization_id,
    p_book_id,
    'receipt_allocation',
    p_allocation_id,
    CASE WHEN p_is_reversal THEN 'reversed' ELSE 'received' END,
    p_effective_date,
    p_currency,
    p_description,
    p_reference,
    v_lines,
    p_actor_id,
    v_ledger_entry_id
  );

  UPDATE public.ledger_entries
  SET accounting_journal_entry_id = v_journal_entry_id,
      updated_by = p_actor_id
  WHERE id = v_ledger_entry_id
    AND organization_id = p_organization_id;

  UPDATE public.finance_receipt_allocations
  SET ledger_entry_id = v_ledger_entry_id
  WHERE id = p_allocation_id
    AND organization_id = p_organization_id;

  INSERT INTO public.finance_receipt_allocation_journals (
    organization_id,
    allocation_id,
    book_id,
    journal_entry_id,
    created_by
  )
  VALUES (
    p_organization_id,
    p_allocation_id,
    p_book_id,
    v_journal_entry_id,
    p_actor_id
  );

  PERFORM app_private.set_financial_projection_context(false);

  RETURN pg_catalog.jsonb_build_object(
    'ledger_entry_id', v_ledger_entry_id,
    'journal_entry_ids', pg_catalog.jsonb_build_array(v_journal_entry_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_income_settlement_projection(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  date,
  numeric,
  public.currency_code,
  text,
  text,
  uuid,
  boolean
)
FROM PUBLIC, anon, authenticated, service_role;

-- Forward contract used by the enabled pre-activation command. The dormant
-- activation-aware body replaces this definition later in the migration.
CREATE OR REPLACE FUNCTION app_private.finance_income_settlement_basis(
  p_organization_id uuid,
  p_income_item_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'pre_cutover_uninvoiced'::text;
$$;

CREATE OR REPLACE FUNCTION public.record_finance_receipt_v2(
  p_organization_id uuid,
  p_income_item_id uuid,
  p_amount numeric,
  p_received_date date,
  p_reconciliation_source_id uuid,
  p_reference text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_preflight public.finance_income_items%ROWTYPE;
  v_target public.finance_income_items%ROWTYPE;
  v_updated_target public.finance_income_items%ROWTYPE;
  v_source public.financial_reconciliation_sources%ROWTYPE;
  v_mapping record;
  v_book record;
  v_book_id uuid;
  v_book_count integer := 0;
  v_period_blocked boolean := false;
  v_payload jsonb;
  v_claim record;
  v_allocated numeric(14, 2);
  v_sequence integer;
  v_balance_after numeric(14, 2);
  v_receipt_id uuid := gen_random_uuid();
  v_allocation_id uuid := gen_random_uuid();
  v_activity_id uuid;
  v_projection jsonb;
  v_result jsonb;
  v_reference text := NULLIF(pg_catalog.btrim(coalesce(p_reference, '')), '');
  v_evidence_payload jsonb;
  v_evidence_hash text;
  v_settlement_basis text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_income_item_id IS NULL
    OR p_received_date IS NULL
    OR p_reconciliation_source_id IS NULL
    OR p_idempotency_key IS NULL
    OR length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Complete receipt settlement details are required'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve scope without a row lock so the Plan 03 period locks remain first.
  SELECT income.*
  INTO v_preflight
  FROM public.finance_income_items AS income
  WHERE income.id = p_income_item_id
    AND income.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
  END IF;

  SELECT *
  INTO STRICT v_mapping
  FROM app_private.resolve_legacy_accounting_mapping(
    'finance_income',
    'income',
    v_preflight.income_type,
    v_preflight.income_type,
    NULL,
    NULL
  );

  PERFORM app_private.lock_property_reporting_period_internal(
    p_organization_id,
    v_preflight.property_id,
    v_preflight.currency,
    p_received_date,
    false
  );

  PERFORM app_private.lock_financial_authority_period_shared(
    p_organization_id,
    v_preflight.currency,
    pg_catalog.date_trunc('month', p_received_date)::date
  );

  SELECT reporting_period.lifecycle_status NOT IN ('open', 'reopened')
  INTO v_period_blocked
  FROM public.property_reporting_periods AS reporting_period
  WHERE reporting_period.organization_id = p_organization_id
    AND reporting_period.property_id = v_preflight.property_id
    AND reporting_period.currency = v_preflight.currency
    AND reporting_period.period_start =
      pg_catalog.date_trunc('month', p_received_date)::date
  FOR SHARE;

  v_period_blocked := coalesce(v_period_blocked, true)
    OR app_private.is_ledger_period_locked(
      p_organization_id,
      pg_catalog.date_trunc('month', p_received_date)::date
    );

  FOR v_book IN
    SELECT book.id
    FROM public.accounting_books AS book
    WHERE book.organization_id = p_organization_id
      AND book.book_type = v_mapping.book_type
      AND book.currency = v_preflight.currency
      AND book.is_default
      AND book.archived_at IS NULL
    ORDER BY book.id
    FOR SHARE
  LOOP
    v_book_count := v_book_count + 1;
    v_book_id := v_book.id;

    IF EXISTS (
      SELECT 1
      FROM public.accounting_periods AS accounting_period
      WHERE accounting_period.organization_id = p_organization_id
        AND accounting_period.book_id = v_book.id
        AND accounting_period.period_start =
          pg_catalog.date_trunc('month', p_received_date)::date
        AND accounting_period.status = 'locked'
    ) THEN
      v_period_blocked := true;
    END IF;
  END LOOP;

  v_payload := pg_catalog.jsonb_build_object(
    'contract_version', 'plan05.v1',
    'organization_id', p_organization_id,
    'income_item_id', p_income_item_id,
    'amount', p_amount::numeric(14, 2),
    'received_date', p_received_date,
    'reconciliation_source_id', p_reconciliation_source_id,
    'reference', v_reference
  );

  SELECT *
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'record_finance_receipt_v2',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  IF v_period_blocked THEN
    RAISE EXCEPTION 'Income settlement period is not open'
      USING ERRCODE = '22023';
  END IF;

  IF v_book_count <> 1 OR v_book_id IS NULL THEN
    RAISE EXCEPTION 'Income settlement requires exactly one mapped accounting book'
      USING ERRCODE = '23503';
  END IF;

  SELECT income.*
  INTO v_target
  FROM public.finance_income_items AS income
  WHERE income.id = p_income_item_id
    AND income.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
  END IF;

  IF v_target.archived_at IS NOT NULL OR v_target.status = 'void' THEN
    RAISE EXCEPTION 'Voided or archived income cannot accept cash'
      USING ERRCODE = '22023';
  END IF;

  IF v_target.income_type IN (
    'security_deposit',
    'owner_contribution',
    'management_fee',
    'leasing_commission',
    'service_fee',
    'maintenance_markup'
  ) THEN
    RAISE EXCEPTION 'income_settlement_class_not_supported'
      USING ERRCODE = '22023';
  END IF;

  IF v_target.property_id IS DISTINCT FROM v_preflight.property_id
    OR v_target.currency IS DISTINCT FROM v_preflight.currency
    OR v_target.income_type IS DISTINCT FROM v_preflight.income_type THEN
    RAISE EXCEPTION 'Income settlement material changed while locking'
      USING ERRCODE = '40001';
  END IF;

  IF v_target.status = 'posted' OR v_target.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Legacy obligation-level posting must be resolved before settlement'
      USING ERRCODE = '55000';
  END IF;

  v_settlement_basis :=
    app_private.finance_income_settlement_basis(
      p_organization_id,
      v_target.id
    );

  IF v_target.unit_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.units AS unit
      WHERE unit.id = v_target.unit_id
        AND unit.organization_id = p_organization_id
        AND unit.property_id = v_target.property_id
        AND unit.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Income unit scope is invalid' USING ERRCODE = '23503';
  END IF;

  IF v_target.lease_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.leases AS lease
      WHERE lease.id = v_target.lease_id
        AND lease.organization_id = p_organization_id
        AND lease.property_id = v_target.property_id
        AND lease.unit_id IS NOT DISTINCT FROM v_target.unit_id
        AND lease.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Income lease scope is invalid' USING ERRCODE = '23503';
  END IF;

  SELECT source.*
  INTO v_source
  FROM public.financial_reconciliation_sources AS source
  WHERE source.id = p_reconciliation_source_id
    AND source.organization_id = p_organization_id
  FOR SHARE;

  IF NOT FOUND
    OR v_source.archived_at IS NOT NULL
    OR v_source.currency IS DISTINCT FROM v_target.currency
    OR (
      v_source.scope_kind = 'property_dedicated'
      AND v_source.property_id IS DISTINCT FROM v_target.property_id
    ) THEN
    RAISE EXCEPTION 'Reconciliation source is not active for this receipt scope'
      USING ERRCODE = '23503';
  END IF;

  SELECT
    coalesce(pg_catalog.sum(
      CASE
        WHEN allocation.settlement_contract_version = 'plan05.v1'
          THEN allocation.signed_amount
        WHEN receipt.reversal_of_id IS NULL
          THEN allocation.amount
        ELSE -allocation.amount
      END
    ), 0)::numeric(14, 2),
    coalesce(pg_catalog.max(allocation.settlement_sequence), 0) + 1
  INTO v_allocated, v_sequence
  FROM public.finance_receipt_allocations AS allocation
  JOIN public.finance_receipts AS receipt
    ON receipt.id = allocation.receipt_id
   AND receipt.organization_id = allocation.organization_id
  WHERE allocation.organization_id = p_organization_id
    AND allocation.income_item_id = v_target.id;

  IF v_allocated < 0
    OR v_allocated + p_amount > v_target.amount_due THEN
    RAISE EXCEPTION 'Receipt allocation exceeds open balance'
      USING ERRCODE = '22023';
  END IF;

  v_balance_after :=
    (v_target.amount_due - v_allocated - p_amount)::numeric(14, 2);

  v_evidence_payload := pg_catalog.jsonb_build_object(
    'contract_version', 'plan05.v1',
    'allocation_id', v_allocation_id,
    'obligation_id', v_target.id,
    'organization_id', p_organization_id,
    'property_id', v_target.property_id,
    'unit_id', v_target.unit_id,
    'lease_id', v_target.lease_id,
    'income_type', v_target.income_type,
    'payer_person_id', v_target.payer_person_id,
    'payer_label', v_target.payer_label,
    'amount', p_amount::numeric(14, 2),
    'currency', v_target.currency,
    'received_date', p_received_date,
    'reconciliation_source_id', p_reconciliation_source_id,
    'settlement_sequence', v_sequence,
    'outstanding_balance_after', v_balance_after,
    'settlement_basis', v_settlement_basis,
    'publication_source_class', 'legacy_cash_non_publishable'
  );
  v_evidence_hash :=
    app_private.canonical_financial_payload_hash(v_evidence_payload);

  PERFORM app_private.set_finance_settlement_context(true);

  INSERT INTO public.finance_receipts (
    id,
    organization_id,
    property_id,
    received_date,
    amount,
    currency,
    payer_label,
    reference,
    reconciliation_source_id,
    settlement_contract_version,
    created_by
  )
  VALUES (
    v_receipt_id,
    p_organization_id,
    v_target.property_id,
    p_received_date,
    p_amount,
    v_target.currency,
    v_target.payer_label,
    v_reference,
    p_reconciliation_source_id,
    'plan05.v1',
    v_actor_id
  );

  INSERT INTO public.finance_receipt_allocations (
    id,
    organization_id,
    receipt_id,
    income_item_id,
    amount,
    property_id,
    unit_id,
    lease_id,
    payer_person_id_snapshot,
    payer_label_snapshot,
    currency,
    received_date,
    reconciliation_source_id,
    external_reference,
    economic_class,
    obligation_type,
    income_type_snapshot,
    signed_amount,
    settlement_sequence,
    outstanding_balance_after,
    source_discriminator,
    settlement_basis,
    publication_source_class,
    classification_evidence_kind,
    classification_evidence_version,
    classification_evidence_hash,
    committed_at,
    settlement_contract_version,
    created_by
  )
  VALUES (
    v_allocation_id,
    p_organization_id,
    v_receipt_id,
    v_target.id,
    p_amount,
    v_target.property_id,
    v_target.unit_id,
    v_target.lease_id,
    v_target.payer_person_id,
    v_target.payer_label,
    v_target.currency,
    p_received_date,
    p_reconciliation_source_id,
    v_reference,
    'operating_income',
    'finance_income_item',
    v_target.income_type,
    p_amount,
    v_sequence,
    v_balance_after,
    'receipt_allocation',
    v_settlement_basis,
    'legacy_cash_non_publishable',
    'plan05_pre_activation_commit',
    1,
    v_evidence_hash,
    pg_catalog.clock_timestamp(),
    'plan05.v1',
    v_actor_id
  );

  PERFORM app_private.refresh_finance_income_compatibility(
    v_target.id,
    v_actor_id
  );

  SELECT income.*
  INTO STRICT v_updated_target
  FROM public.finance_income_items AS income
  WHERE income.id = v_target.id
    AND income.organization_id = p_organization_id;

  v_projection := app_private.create_income_settlement_projection(
    p_organization_id,
    v_allocation_id,
    v_book_id,
    v_target.property_id,
    v_target.unit_id,
    v_target.lease_id,
    v_target.payer_person_id,
    v_target.income_type,
    p_received_date,
    p_amount,
    v_target.currency,
    pg_catalog.concat_ws(
      ' - ',
      v_target.payer_label,
      v_target.description
    ),
    v_reference,
    v_actor_id,
    false
  );

  IF (
    SELECT receipt.amount
    FROM public.finance_receipts AS receipt
    WHERE receipt.id = v_receipt_id
  ) IS DISTINCT FROM (
    SELECT pg_catalog.sum(allocation.amount)
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.receipt_id = v_receipt_id
  ) THEN
    RAISE EXCEPTION 'Receipt header and allocation total do not balance'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'finance_receipt_allocation',
    v_allocation_id,
    'income_settlement_recorded',
    pg_catalog.jsonb_build_object(
      'income_item_id', v_target.id,
      'amount_received', v_target.amount_received,
      'received_date', v_target.received_date,
      'status', v_target.status
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', v_receipt_id,
      'allocation_id', v_allocation_id,
      'income_item_id', v_target.id,
      'amount', p_amount,
      'received_date', p_received_date,
      'reconciliation_source_id', p_reconciliation_source_id,
      'ledger_entry_id', v_projection->>'ledger_entry_id',
      'journal_entry_ids', v_projection->'journal_entry_ids',
      'outstanding_balance_after', v_balance_after,
      'status', v_updated_target.status,
      'classification_evidence_hash', v_evidence_hash
    )
  )
  RETURNING id INTO v_activity_id;

  v_result := pg_catalog.jsonb_build_object(
    'receipt_id', v_receipt_id,
    'allocation_id', v_allocation_id,
    'ledger_entry_id', v_projection->>'ledger_entry_id',
    'journal_entry_ids', v_projection->'journal_entry_ids',
    'activity_id', v_activity_id,
    'outstanding_balance_after', v_balance_after
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );

  PERFORM app_private.set_finance_settlement_context(false);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_finance_receipt_v2(
  uuid,
  uuid,
  numeric,
  date,
  uuid,
  text,
  text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_finance_receipt_v2(
  uuid,
  uuid,
  numeric,
  date,
  uuid,
  text,
  text
)
TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_finance_receipt_v2(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_reversal_date date,
  p_reconciliation_source_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_preflight_receipt public.finance_receipts%ROWTYPE;
  v_receipt public.finance_receipts%ROWTYPE;
  v_original_allocation public.finance_receipt_allocations%ROWTYPE;
  v_preflight_income public.finance_income_items%ROWTYPE;
  v_income public.finance_income_items%ROWTYPE;
  v_updated_income public.finance_income_items%ROWTYPE;
  v_source public.financial_reconciliation_sources%ROWTYPE;
  v_mapping record;
  v_book record;
  v_book_id uuid;
  v_book_count integer := 0;
  v_period_start date;
  v_period_blocked boolean := false;
  v_payload jsonb;
  v_claim record;
  v_allocated numeric(14, 2);
  v_sequence integer;
  v_balance_after numeric(14, 2);
  v_reversal_receipt_id uuid := gen_random_uuid();
  v_reversal_allocation_id uuid := gen_random_uuid();
  v_activity_id uuid;
  v_projection jsonb;
  v_original_journal_id uuid;
  v_reversal_journal_id uuid;
  v_result jsonb;
  v_reason text := NULLIF(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_evidence_hash text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
    OR p_receipt_id IS NULL
    OR p_reversal_date IS NULL
    OR p_reconciliation_source_id IS NULL
    OR v_reason IS NULL
    OR length(v_reason) < 3
    OR p_idempotency_key IS NULL
    OR length(pg_catalog.btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Complete receipt reversal details are required'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve every source and destination scope without locking domain rows.
  SELECT receipt.*
  INTO v_preflight_receipt
  FROM public.finance_receipts AS receipt
  WHERE receipt.id = p_receipt_id
    AND receipt.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance receipt not found' USING ERRCODE = '23503';
  END IF;

  IF p_reversal_date < v_preflight_receipt.received_date THEN
    RAISE EXCEPTION 'Reversal date cannot precede original receipt date'
      USING ERRCODE = '22023';
  END IF;

  SELECT allocation.*
  INTO v_original_allocation
  FROM public.finance_receipt_allocations AS allocation
  WHERE allocation.receipt_id = p_receipt_id
    AND allocation.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt allocation not found' USING ERRCODE = '23503';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.receipt_id = p_receipt_id
      AND allocation.organization_id = p_organization_id
  ) <> 1 THEN
    RAISE EXCEPTION 'Plan 05 reversal requires exactly one receipt allocation'
      USING ERRCODE = '22023';
  END IF;

  SELECT income.*
  INTO v_preflight_income
  FROM public.finance_income_items AS income
  WHERE income.id = v_original_allocation.income_item_id
    AND income.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
  END IF;

  SELECT *
  INTO STRICT v_mapping
  FROM app_private.resolve_legacy_accounting_mapping(
    'finance_income',
    'income',
    coalesce(
      v_original_allocation.income_type_snapshot,
      v_preflight_income.income_type
    ),
    coalesce(
      v_original_allocation.income_type_snapshot,
      v_preflight_income.income_type
    ),
    NULL,
    NULL
  );

  -- Acquire all property-period locks first, in deterministic month order.
  FOR v_period_start IN
    SELECT DISTINCT scope.period_start
    FROM (
      VALUES
        (
          pg_catalog.date_trunc(
            'month',
            v_preflight_receipt.received_date
          )::date
        ),
        (pg_catalog.date_trunc('month', p_reversal_date)::date)
    ) AS scope(period_start)
    ORDER BY scope.period_start
  LOOP
    PERFORM app_private.lock_property_reporting_period_internal(
      p_organization_id,
      v_preflight_receipt.property_id,
      v_preflight_receipt.currency,
      v_period_start,
      false
    );
  END LOOP;

  -- Then acquire the broader authority locks and capture each status.
  FOR v_period_start IN
    SELECT DISTINCT scope.period_start
    FROM (
      VALUES
        (
          pg_catalog.date_trunc(
            'month',
            v_preflight_receipt.received_date
          )::date
        ),
        (pg_catalog.date_trunc('month', p_reversal_date)::date)
    ) AS scope(period_start)
    ORDER BY scope.period_start
  LOOP
    PERFORM app_private.lock_financial_authority_period_shared(
      p_organization_id,
      v_preflight_receipt.currency,
      v_period_start
    );

    IF EXISTS (
      SELECT 1
      FROM public.property_reporting_periods AS reporting_period
      WHERE reporting_period.organization_id = p_organization_id
        AND reporting_period.property_id = v_preflight_receipt.property_id
        AND reporting_period.currency = v_preflight_receipt.currency
        AND reporting_period.period_start = v_period_start
        AND reporting_period.lifecycle_status NOT IN ('open', 'reopened')
    ) OR app_private.is_ledger_period_locked(
      p_organization_id,
      v_period_start
    ) THEN
      v_period_blocked := true;
    END IF;
  END LOOP;

  FOR v_book IN
    SELECT book.id
    FROM public.accounting_books AS book
    WHERE book.organization_id = p_organization_id
      AND book.book_type = v_mapping.book_type
      AND book.currency = v_preflight_receipt.currency
      AND book.is_default
      AND book.archived_at IS NULL
    ORDER BY book.id
    FOR SHARE
  LOOP
    v_book_count := v_book_count + 1;
    v_book_id := v_book.id;

    IF EXISTS (
      SELECT 1
      FROM public.accounting_periods AS accounting_period
      WHERE accounting_period.organization_id = p_organization_id
        AND accounting_period.book_id = v_book.id
        AND accounting_period.period_start IN (
          pg_catalog.date_trunc(
            'month',
            v_preflight_receipt.received_date
          )::date,
          pg_catalog.date_trunc('month', p_reversal_date)::date
        )
        AND accounting_period.status = 'locked'
    ) THEN
      v_period_blocked := true;
    END IF;
  END LOOP;

  v_payload := pg_catalog.jsonb_build_object(
    'contract_version', 'plan05.v1',
    'organization_id', p_organization_id,
    'receipt_id', p_receipt_id,
    'reversal_date', p_reversal_date,
    'reconciliation_source_id', p_reconciliation_source_id,
    'reason', v_reason
  );

  SELECT *
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'reverse_finance_receipt_v2',
    p_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  IF v_period_blocked THEN
    RAISE EXCEPTION 'Income settlement period is not open'
      USING ERRCODE = '22023';
  END IF;

  IF v_book_count <> 1 OR v_book_id IS NULL THEN
    RAISE EXCEPTION 'Income settlement requires exactly one mapped accounting book'
      USING ERRCODE = '23503';
  END IF;

  SELECT receipt.*
  INTO v_receipt
  FROM public.finance_receipts AS receipt
  WHERE receipt.id = p_receipt_id
    AND receipt.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance receipt not found' USING ERRCODE = '23503';
  END IF;

  IF v_receipt.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reversal chains are not allowed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_receipts AS reversal
    WHERE reversal.organization_id = p_organization_id
      AND reversal.reversal_of_id = p_receipt_id
  ) THEN
    RAISE EXCEPTION 'Finance receipt is already reversed'
      USING ERRCODE = '22023';
  END IF;

  SELECT allocation.*
  INTO v_original_allocation
  FROM public.finance_receipt_allocations AS allocation
  WHERE allocation.receipt_id = p_receipt_id
    AND allocation.organization_id = p_organization_id
  FOR UPDATE;

  IF v_original_allocation.settlement_contract_version IS DISTINCT FROM
      'plan05.v1'
    OR v_original_allocation.publication_source_class = 'unclassified'
    OR v_original_allocation.publication_source_class IS NULL THEN
    RAISE EXCEPTION 'allocation_publication_classification_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT income.*
  INTO v_income
  FROM public.finance_income_items AS income
  WHERE income.id = v_original_allocation.income_item_id
    AND income.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
  END IF;

  SELECT source.*
  INTO v_source
  FROM public.financial_reconciliation_sources AS source
  WHERE source.id = p_reconciliation_source_id
    AND source.organization_id = p_organization_id
  FOR SHARE;

  IF NOT FOUND
    OR v_source.archived_at IS NOT NULL
    OR v_source.currency IS DISTINCT FROM v_receipt.currency
    OR (
      v_source.scope_kind = 'property_dedicated'
      AND v_source.property_id IS DISTINCT FROM v_receipt.property_id
    ) THEN
    RAISE EXCEPTION 'Reconciliation source is not active for this reversal scope'
      USING ERRCODE = '23503';
  END IF;

  SELECT
    coalesce(pg_catalog.sum(
      CASE
        WHEN allocation.settlement_contract_version = 'plan05.v1'
          THEN allocation.signed_amount
        WHEN receipt.reversal_of_id IS NULL
          THEN allocation.amount
        ELSE -allocation.amount
      END
    ), 0)::numeric(14, 2),
    coalesce(pg_catalog.max(allocation.settlement_sequence), 0) + 1
  INTO v_allocated, v_sequence
  FROM public.finance_receipt_allocations AS allocation
  JOIN public.finance_receipts AS receipt
    ON receipt.id = allocation.receipt_id
   AND receipt.organization_id = allocation.organization_id
  WHERE allocation.organization_id = p_organization_id
    AND allocation.income_item_id = v_income.id;

  IF v_allocated < v_original_allocation.amount THEN
    RAISE EXCEPTION 'Receipt no longer has an unreversed signed effect'
      USING ERRCODE = '22023';
  END IF;

  v_balance_after :=
    (
      v_income.amount_due
      - (v_allocated - v_original_allocation.amount)
    )::numeric(14, 2);

  v_evidence_hash := app_private.canonical_financial_payload_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'plan05.v1',
      'allocation_id', v_reversal_allocation_id,
      'reversal_of_allocation_id', v_original_allocation.id,
      'classification_evidence_hash',
        v_original_allocation.classification_evidence_hash,
      'settlement_basis', v_original_allocation.settlement_basis,
      'publication_source_class',
        v_original_allocation.publication_source_class
    )
  );

  PERFORM app_private.set_finance_settlement_context(true);

  INSERT INTO public.finance_receipts (
    id,
    organization_id,
    property_id,
    received_date,
    amount,
    currency,
    payer_label,
    reference,
    reversal_of_id,
    reconciliation_source_id,
    settlement_contract_version,
    created_by
  )
  VALUES (
    v_reversal_receipt_id,
    p_organization_id,
    v_receipt.property_id,
    p_reversal_date,
    v_receipt.amount,
    v_receipt.currency,
    v_receipt.payer_label,
    v_reason,
    v_receipt.id,
    p_reconciliation_source_id,
    'plan05.v1',
    v_actor_id
  );

  INSERT INTO public.finance_receipt_allocations (
    id,
    organization_id,
    receipt_id,
    income_item_id,
    amount,
    property_id,
    unit_id,
    lease_id,
    payer_person_id_snapshot,
    payer_label_snapshot,
    currency,
    received_date,
    reconciliation_source_id,
    external_reference,
    economic_class,
    obligation_type,
    income_type_snapshot,
    signed_amount,
    settlement_sequence,
    outstanding_balance_after,
    source_discriminator,
    settlement_basis,
    publication_source_class,
    classification_evidence_kind,
    classification_evidence_version,
    classification_evidence_hash,
    committed_at,
    settlement_contract_version,
    reversal_of_allocation_id,
    created_by
  )
  VALUES (
    v_reversal_allocation_id,
    p_organization_id,
    v_reversal_receipt_id,
    v_original_allocation.income_item_id,
    v_original_allocation.amount,
    v_original_allocation.property_id,
    v_original_allocation.unit_id,
    v_original_allocation.lease_id,
    v_original_allocation.payer_person_id_snapshot,
    v_original_allocation.payer_label_snapshot,
    v_original_allocation.currency,
    p_reversal_date,
    p_reconciliation_source_id,
    v_reason,
    v_original_allocation.economic_class,
    v_original_allocation.obligation_type,
    v_original_allocation.income_type_snapshot,
    -v_original_allocation.amount,
    v_sequence,
    v_balance_after,
    'receipt_allocation',
    v_original_allocation.settlement_basis,
    v_original_allocation.publication_source_class,
    'plan05_reversal_inherited',
    v_original_allocation.classification_evidence_version,
    v_evidence_hash,
    pg_catalog.clock_timestamp(),
    'plan05.v1',
    v_original_allocation.id,
    v_actor_id
  );

  PERFORM app_private.refresh_finance_income_compatibility(
    v_income.id,
    v_actor_id
  );

  SELECT income.*
  INTO STRICT v_updated_income
  FROM public.finance_income_items AS income
  WHERE income.id = v_income.id
    AND income.organization_id = p_organization_id;

  v_projection := app_private.create_income_settlement_projection(
    p_organization_id,
    v_reversal_allocation_id,
    v_book_id,
    v_original_allocation.property_id,
    v_original_allocation.unit_id,
    v_original_allocation.lease_id,
    v_original_allocation.payer_person_id_snapshot,
    v_original_allocation.income_type_snapshot,
    p_reversal_date,
    v_original_allocation.amount,
    v_original_allocation.currency,
    'Reversal - ' || v_original_allocation.payer_label_snapshot,
    v_reason,
    v_actor_id,
    true
  );

  SELECT link.journal_entry_id
  INTO STRICT v_original_journal_id
  FROM public.finance_receipt_allocation_journals AS link
  WHERE link.organization_id = p_organization_id
    AND link.allocation_id = v_original_allocation.id
    AND link.book_id = v_book_id;

  v_reversal_journal_id :=
    (v_projection->'journal_entry_ids'->>0)::uuid;

  PERFORM app_private.set_financial_projection_context(true);
  PERFORM pg_catalog.set_config('app.accounting_reversal', 'on', true);

  UPDATE public.accounting_journal_entries
  SET status = 'reversed',
      reversed_by_id = v_reversal_journal_id,
      updated_at = now()
  WHERE id = v_original_journal_id
    AND organization_id = p_organization_id;

  UPDATE public.accounting_journal_entries
  SET reversal_of_id = v_original_journal_id,
      updated_at = now()
  WHERE id = v_reversal_journal_id
    AND organization_id = p_organization_id;

  PERFORM pg_catalog.set_config('app.accounting_reversal', 'off', true);
  PERFORM app_private.set_financial_projection_context(false);

  IF (
    SELECT receipt.amount
    FROM public.finance_receipts AS receipt
    WHERE receipt.id = v_reversal_receipt_id
  ) IS DISTINCT FROM (
    SELECT pg_catalog.sum(allocation.amount)
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.receipt_id = v_reversal_receipt_id
  ) THEN
    RAISE EXCEPTION 'Reversal header and allocation total do not balance'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    v_actor_id,
    'finance_receipt_allocation',
    v_reversal_allocation_id,
    'income_settlement_reversed',
    pg_catalog.jsonb_build_object(
      'receipt_id', v_receipt.id,
      'allocation_id', v_original_allocation.id,
      'amount_received', v_income.amount_received,
      'status', v_income.status
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', v_reversal_receipt_id,
      'allocation_id', v_reversal_allocation_id,
      'reversal_of_allocation_id', v_original_allocation.id,
      'reason', v_reason,
      'reversal_date', p_reversal_date,
      'ledger_entry_id', v_projection->>'ledger_entry_id',
      'journal_entry_ids', v_projection->'journal_entry_ids',
      'outstanding_balance_after', v_balance_after,
      'status', v_updated_income.status,
      'publication_source_class',
        v_original_allocation.publication_source_class
    )
  )
  RETURNING id INTO v_activity_id;

  v_result := pg_catalog.jsonb_build_object(
    'receipt_id', v_reversal_receipt_id,
    'allocation_id', v_reversal_allocation_id,
    'reversal_of_receipt_id', v_receipt.id,
    'reversal_of_allocation_id', v_original_allocation.id,
    'ledger_entry_id', v_projection->>'ledger_entry_id',
    'journal_entry_ids', v_projection->'journal_entry_ids',
    'activity_id', v_activity_id,
    'outstanding_balance_after', v_balance_after
  );

  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );

  PERFORM app_private.set_finance_settlement_context(false);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_finance_receipt_v2(
  uuid,
  uuid,
  date,
  uuid,
  text,
  text
)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_finance_receipt_v2(
  uuid,
  uuid,
  date,
  uuid,
  text,
  text
)
TO authenticated;

-- Dormant Plan 09 / invoice activation contract. Plan 05 does not expose a
-- policy mutation command and does not create invoice authority.
ALTER TABLE public.finance_income_items
  ADD COLUMN settlement_creation_provenance text,
  ADD COLUMN settlement_creation_version integer,
  ADD COLUMN settlement_creation_hash text,
  ADD COLUMN remaining_balance_disposition text,
  ADD COLUMN remaining_balance_disposition_version integer,
  ADD COLUMN remaining_balance_disposition_hash text;

ALTER TABLE public.finance_income_items
  ADD CONSTRAINT finance_income_items_creation_hash_check
    CHECK (
      settlement_creation_hash IS NULL
      OR settlement_creation_hash ~ '^[0-9a-f]{64}$'
    ),
  ADD CONSTRAINT finance_income_items_remaining_disposition_check
    CHECK (
      remaining_balance_disposition IS NULL
      OR remaining_balance_disposition IN (
        'legacy_obligation_only',
        'migration_invoice_required'
      )
    ),
  ADD CONSTRAINT finance_income_items_remaining_disposition_hash_check
    CHECK (
      remaining_balance_disposition_hash IS NULL
      OR remaining_balance_disposition_hash ~ '^[0-9a-f]{64}$'
    );

ALTER TABLE public.finance_receipt_allocations
  ADD COLUMN charge_occurrence_id uuid,
  ADD COLUMN lease_term_id_snapshot uuid,
  ADD COLUMN lease_term_version_snapshot integer,
  ADD COLUMN calculation_material_hash text,
  ADD COLUMN relationship_evidence_hash text,
  ADD COLUMN invoice_header_id uuid,
  ADD COLUMN invoice_version_id uuid,
  ADD COLUMN invoice_line_id uuid,
  ADD COLUMN settlement_activation_version integer,
  ADD CONSTRAINT finance_receipt_allocations_invoice_snapshot_check
    CHECK (
      (
        settlement_basis = 'invoice_bound'
        AND invoice_header_id IS NOT NULL
        AND invoice_version_id IS NOT NULL
        AND invoice_line_id IS NOT NULL
      )
      OR (
        settlement_basis IS DISTINCT FROM 'invoice_bound'
        AND invoice_header_id IS NULL
        AND invoice_version_id IS NULL
        AND invoice_line_id IS NULL
      )
    ),
  ADD CONSTRAINT finance_receipt_allocations_future_hash_check
    CHECK (
      (
        calculation_material_hash IS NULL
        OR calculation_material_hash ~ '^[0-9a-f]{64}$'
      )
      AND (
        relationship_evidence_hash IS NULL
        OR relationship_evidence_hash ~ '^[0-9a-f]{64}$'
      )
    );

CREATE TABLE app_private.finance_income_settlement_policies (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  activation_state text NOT NULL DEFAULT 'disabled'
    CHECK (activation_state IN ('disabled', 'activated')),
  activation_version integer,
  activation_manifest_hash text,
  activated_at timestamptz,
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT finance_income_settlement_policy_activation_check
    CHECK (
      (
        activation_state = 'disabled'
        AND activation_version IS NULL
        AND activation_manifest_hash IS NULL
        AND activated_at IS NULL
        AND activated_by IS NULL
      )
      OR (
        activation_state = 'activated'
        AND activation_version > 0
        AND activation_manifest_hash ~ '^[0-9a-f]{64}$'
        AND activated_at IS NOT NULL
        AND activated_by IS NOT NULL
      )
    )
);

REVOKE ALL ON TABLE app_private.finance_income_settlement_policies
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_finance_income_creation_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activation_state text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'finance_income_creation_policy_v1',
        NEW.organization_id
      ),
      0
    )
  );

  SELECT policy.activation_state
  INTO v_activation_state
  FROM app_private.finance_income_settlement_policies AS policy
  WHERE policy.organization_id = NEW.organization_id
  FOR SHARE;

  IF NOT app_private.has_finance_settlement_context()
    AND (
      coalesce(NEW.amount_received, 0) <> 0
      OR NEW.received_date IS NOT NULL
      OR NEW.ledger_entry_id IS NOT NULL
      OR NEW.status IS DISTINCT FROM 'open'
      OR NEW.archived_at IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'income_obligation_must_start_unsettled'
      USING ERRCODE = '22023';
  END IF;

  -- Plan 05 cannot authenticate future Plan 09 evidence. Until the joint
  -- activation migration replaces this trigger with an evidence-verifying
  -- creator, every post-activation rent insert fails closed. A caller-supplied
  -- provenance label is never treated as authority.
  IF coalesce(v_activation_state, 'disabled') = 'activated'
    AND NEW.income_type = 'rent' THEN
    RAISE EXCEPTION 'rent_occurrence_generation_required'
      USING ERRCODE = '22023';
  END IF;

  NEW.settlement_creation_provenance := 'manual_pre_activation';
  NEW.settlement_creation_version := 1;
  NEW.settlement_creation_hash :=
    app_private.canonical_financial_payload_hash(
      pg_catalog.jsonb_build_object(
        'income_item_id', NEW.id,
        'organization_id', NEW.organization_id,
        'property_id', NEW.property_id,
        'unit_id', NEW.unit_id,
        'lease_id', NEW.lease_id,
        'income_type', NEW.income_type,
        'amount_due', NEW.amount_due,
        'currency', NEW.currency,
        'due_date', NEW.due_date,
        'provenance', 'manual_pre_activation'
      )
    );
  NEW.remaining_balance_disposition := NULL;
  NEW.remaining_balance_disposition_version := NULL;
  NEW.remaining_balance_disposition_hash := NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.guard_finance_income_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.settlement_creation_provenance IS DISTINCT FROM
      NEW.settlement_creation_provenance
    OR OLD.settlement_creation_version IS DISTINCT FROM
      NEW.settlement_creation_version
    OR OLD.settlement_creation_hash IS DISTINCT FROM
      NEW.settlement_creation_hash
    OR OLD.remaining_balance_disposition IS DISTINCT FROM
      NEW.remaining_balance_disposition
    OR OLD.remaining_balance_disposition_version IS DISTINCT FROM
      NEW.remaining_balance_disposition_version
    OR OLD.remaining_balance_disposition_hash IS DISTINCT FROM
      NEW.remaining_balance_disposition_hash THEN
    RAISE EXCEPTION 'Income settlement provenance is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER block_finance_income_creation_bypass
BEFORE INSERT ON public.finance_income_items
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_finance_income_creation_contract();

CREATE TRIGGER guard_finance_income_provenance
BEFORE UPDATE ON public.finance_income_items
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_finance_income_provenance();

CREATE OR REPLACE FUNCTION app_private.finance_income_settlement_basis(
  p_organization_id uuid,
  p_income_item_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_income public.finance_income_items%ROWTYPE;
  v_activation_state text;
BEGIN
  SELECT income.*
  INTO STRICT v_income
  FROM public.finance_income_items AS income
  WHERE income.id = p_income_item_id
    AND income.organization_id = p_organization_id;

  SELECT policy.activation_state
  INTO v_activation_state
  FROM app_private.finance_income_settlement_policies AS policy
  WHERE policy.organization_id = p_organization_id;

  IF coalesce(v_activation_state, 'disabled') = 'disabled' THEN
    RETURN 'pre_cutover_uninvoiced';
  END IF;

  IF v_income.remaining_balance_disposition =
      'migration_invoice_required' THEN
    RAISE EXCEPTION 'migration_invoice_issuance_required'
      USING ERRCODE = '22023';
  END IF;

  IF v_income.remaining_balance_disposition =
      'legacy_obligation_only' THEN
    RETURN 'grandfathered_obligation_only';
  END IF;

  RAISE EXCEPTION 'current_issued_invoice_required'
    USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION
  app_private.guard_finance_income_creation_contract(),
  app_private.guard_finance_income_provenance(),
  app_private.finance_income_settlement_basis(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

-- Teach the canonical property-cash read model to prefer allocation-owned
-- Plan 05 evidence while preserving the legacy obligation-linked fallback.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_previous text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.get_property_cash_events_v1_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)'::regprocedure
  )
  INTO STRICT v_definition;

  v_patched := v_definition;

  v_previous := v_patched;
  v_patched := replace(
    v_patched,
    E'      receipt.reversal_of_id,\n      original_allocation.id AS original_allocation_id,',
    E'      receipt.reversal_of_id,\n      receipt.reconciliation_source_id,\n      allocation.settlement_contract_version,\n      allocation.publication_source_class,\n      coalesce(allocation.reversal_of_allocation_id, original_allocation.id) AS original_allocation_id,'
  );
  IF v_patched = v_previous THEN
    RAISE EXCEPTION
      'Plan 05 could not patch the cash-event source projection list';
  END IF;

  v_previous := v_patched;
  v_patched := replace(
    v_patched,
    E'      income.ledger_entry_id,\n      ledger.accounting_journal_entry_id,',
    E'      coalesce(allocation.ledger_entry_id, income.ledger_entry_id) AS ledger_entry_id,\n      ledger.accounting_journal_entry_id,'
  );
  IF v_patched = v_previous THEN
    RAISE EXCEPTION
      'Plan 05 could not patch the cash-event Ledger projection';
  END IF;

  v_previous := v_patched;
  v_patched := replace(
    v_patched,
    E'    LEFT JOIN public.ledger_entries AS ledger\n      ON ledger.id = income.ledger_entry_id\n     AND ledger.organization_id = income.organization_id',
    E'    LEFT JOIN public.ledger_entries AS ledger\n      ON ledger.id = coalesce(allocation.ledger_entry_id, income.ledger_entry_id)\n     AND ledger.organization_id = income.organization_id'
  );
  IF v_patched = v_previous THEN
    RAISE EXCEPTION
      'Plan 05 could not patch the cash-event Ledger join';
  END IF;

  v_previous := v_patched;
  v_patched := replace(
    v_patched,
    E'      true AS requires_resolution,\n      pg_catalog.array_remove(\n        ARRAY[\n          CASE WHEN fact.income_type = ''security_deposit''\n            THEN ''deposit_cash_identity_missing'' END,\n          CASE WHEN fact.income_type IN (\n            ''management_fee'', ''leasing_commission'', ''service_fee'',\n            ''maintenance_markup''\n          ) THEN ''management_fee_owner_recognition_unresolved'' END,\n          ''missing_reconciliation_source'',\n          ''mutable_obligation_classification'',\n          CASE WHEN NOT fact.reversal_header_is_exact\n            THEN ''reversal_header_not_exact'' END,\n          CASE WHEN NOT fact.scope_is_exact\n            THEN ''source_scope_invalid'' END\n        ]::text[],\n        NULL::text\n      ) AS resolution_codes,\n      NULL::uuid AS reconciliation_source_id,\n      ''missing_stable_identity''::text AS reconciliation_state,',
    E'      (\n        fact.settlement_contract_version IS NULL\n        OR fact.reconciliation_source_id IS NULL\n        OR fact.ledger_entry_id IS NULL\n        OR fact.accounting_journal_entry_id IS NULL\n        OR NOT fact.scope_is_exact\n        OR NOT fact.reversal_header_is_exact\n      ) AS requires_resolution,\n      pg_catalog.array_remove(\n        ARRAY[\n          CASE WHEN fact.income_type = ''security_deposit''\n            THEN ''deposit_cash_identity_missing'' END,\n          CASE WHEN fact.income_type IN (\n            ''management_fee'', ''leasing_commission'', ''service_fee'',\n            ''maintenance_markup''\n          ) THEN ''management_fee_owner_recognition_unresolved'' END,\n          CASE WHEN fact.reconciliation_source_id IS NULL\n            THEN ''missing_reconciliation_source'' END,\n          CASE WHEN fact.settlement_contract_version IS NULL\n            THEN ''mutable_obligation_classification'' END,\n          CASE WHEN NOT fact.reversal_header_is_exact\n            THEN ''reversal_header_not_exact'' END,\n          CASE WHEN NOT fact.scope_is_exact\n            THEN ''source_scope_invalid'' END\n        ]::text[],\n        NULL::text\n      ) AS resolution_codes,\n      fact.reconciliation_source_id,\n      CASE WHEN fact.reconciliation_source_id IS NULL\n        THEN ''missing_stable_identity''\n        ELSE ''matched''\n      END::text AS reconciliation_state,'
  );
  IF v_patched = v_previous THEN
    RAISE EXCEPTION
      'Plan 05 could not patch the cash-event resolution projection';
  END IF;

  EXECUTE v_patched;
END;
$migration$;

COMMENT ON FUNCTION public.record_finance_receipt_v2(
  uuid,
  uuid,
  numeric,
  date,
  uuid,
  text,
  text
) IS
  'Plan 05 checked income settlement. The allocation is the immutable source for receipt, Ledger, journal, compatibility, audit, and idempotency effects.';

COMMENT ON FUNCTION public.reverse_finance_receipt_v2(
  uuid,
  uuid,
  date,
  uuid,
  text,
  text
) IS
  'Plan 05 append-only checked reversal. It directly links original and reversing allocations and creates exact reversing projections atomically.';

COMMENT ON FUNCTION public.get_finance_income_owner_state_v1(
  uuid,
  text,
  uuid,
  text
) IS
  'Read-only Plan 05 owner adapter. It returns typed state, checked actions, material hash, and deterministic financial scopes without writing preview state.';
