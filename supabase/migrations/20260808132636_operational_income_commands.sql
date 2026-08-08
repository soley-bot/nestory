CREATE OR REPLACE FUNCTION public.record_finance_receipt_v2_expense_approval_unchecked(
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
  v_reference text := nullif(pg_catalog.btrim(coalesce(p_reference, '')), '');
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

  IF p_amount IS DISTINCT FROM pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'Receipt amount must use currency precision'
      USING ERRCODE = '22023';
  END IF;

  SELECT income.*
  INTO v_preflight
  FROM public.finance_income_items AS income
  WHERE income.id = p_income_item_id
    AND income.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income item not found' USING ERRCODE = '23503';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'contract_version', 'operational-ledger.v1',
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

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_received_date
  );

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
      'Obligation-level posting must be resolved before settlement'
      USING ERRCODE = '55000';
  END IF;

  v_settlement_basis := app_private.finance_income_settlement_basis(
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

  IF v_allocated < 0 OR v_allocated + p_amount > v_target.amount_due THEN
    RAISE EXCEPTION 'Receipt allocation exceeds open balance'
      USING ERRCODE = '22023';
  END IF;

  v_balance_after :=
    (v_target.amount_due - v_allocated - p_amount)::numeric(14, 2);

  v_evidence_payload := pg_catalog.jsonb_build_object(
    'contract_version', 'operational-ledger.v1',
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
    'operational_income_commit',
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
    NULL,
    v_target.property_id,
    v_target.unit_id,
    v_target.lease_id,
    v_target.payer_person_id,
    v_target.income_type,
    p_received_date,
    p_amount,
    v_target.currency,
    pg_catalog.concat_ws(' - ', v_target.payer_label, v_target.description),
    v_reference,
    v_actor_id,
    false
  );

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

REVOKE ALL ON FUNCTION public.record_finance_receipt_v2_expense_approval_unchecked(
  uuid, uuid, numeric, date, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_finance_receipt_v2_expense_approval_unchecked(
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
  v_payload jsonb;
  v_claim record;
  v_allocated numeric(14, 2);
  v_sequence integer;
  v_balance_after numeric(14, 2);
  v_reversal_receipt_id uuid := gen_random_uuid();
  v_reversal_allocation_id uuid := gen_random_uuid();
  v_activity_id uuid;
  v_projection jsonb;
  v_result jsonb;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
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
    RAISE EXCEPTION 'Receipt reversal requires exactly one allocation'
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

  v_payload := pg_catalog.jsonb_build_object(
    'contract_version', 'operational-ledger.v1',
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

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,
    p_reversal_date
  );

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
    OR v_original_allocation.publication_source_class IS NULL
    OR v_original_allocation.ledger_entry_id IS NULL THEN
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
    (v_income.amount_due - (v_allocated - v_original_allocation.amount))
      ::numeric(14, 2);

  v_evidence_hash := app_private.canonical_financial_payload_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'operational-ledger.v1',
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
    charge_occurrence_id,
    lease_term_id_snapshot,
    lease_term_version_snapshot,
    calculation_material_hash,
    relationship_evidence_hash,
    invoice_header_id,
    invoice_version_id,
    invoice_line_id,
    settlement_activation_version,
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
    'operational_reversal_inherited',
    v_original_allocation.classification_evidence_version,
    v_evidence_hash,
    pg_catalog.clock_timestamp(),
    'plan05.v1',
    v_original_allocation.id,
    v_original_allocation.charge_occurrence_id,
    v_original_allocation.lease_term_id_snapshot,
    v_original_allocation.lease_term_version_snapshot,
    v_original_allocation.calculation_material_hash,
    v_original_allocation.relationship_evidence_hash,
    v_original_allocation.invoice_header_id,
    v_original_allocation.invoice_version_id,
    v_original_allocation.invoice_line_id,
    v_original_allocation.settlement_activation_version,
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
    NULL,
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

REVOKE ALL ON FUNCTION public.reverse_finance_receipt_v2_expense_approval_unchecked(
  uuid, uuid, date, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
