CREATE OR REPLACE FUNCTION app_private.is_reserved_financial_source_type(
  p_source_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT lower(trim(coalesce(p_source_type, ''))) = ANY (ARRAY[
    'receipt_allocation',
    'owner_collection_allocation',
    'payment_allocation',
    'deposit_event',
    'petty_cash_entry',
    'rent_charge_occurrence',
    'maintenance_handoff',
    'management_fee_assessment',
    'owner_cash_event',
    'financial_adjustment'
  ]);
$$;

ALTER TABLE public.owner_collection_confirmation_allocations
  ADD COLUMN property_id uuid,
  ADD COLUMN unit_id uuid,
  ADD COLUMN lease_id uuid,
  ADD COLUMN owner_person_id_snapshot uuid,
  ADD COLUMN tenant_person_id_snapshot uuid,
  ADD COLUMN currency public.currency_code,
  ADD COLUMN confirmed_date date,
  ADD COLUMN income_type_snapshot text,
  ADD COLUMN signed_amount numeric(14, 2),
  ADD COLUMN settlement_contract_version text,
  ADD COLUMN ledger_entry_id uuid;

ALTER TABLE public.owner_collection_confirmation_allocations
  ADD CONSTRAINT owner_collection_allocations_org_id_unique
    UNIQUE (organization_id, id),
  ADD CONSTRAINT owner_collection_allocations_org_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT owner_collection_allocations_org_unit_fkey
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT owner_collection_allocations_org_lease_fkey
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT owner_collection_allocations_owner_fkey
    FOREIGN KEY (organization_id, owner_person_id_snapshot)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT owner_collection_allocations_tenant_fkey
    FOREIGN KEY (organization_id, tenant_person_id_snapshot)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT owner_collection_allocations_ledger_fkey
    FOREIGN KEY (ledger_entry_id)
    REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT owner_collection_allocations_ledger_unique
    UNIQUE (ledger_entry_id),
  ADD CONSTRAINT owner_collection_allocations_operational_check
    CHECK (
      settlement_contract_version IS NULL
      OR (
        settlement_contract_version = 'owner_collection.v1'
        AND property_id IS NOT NULL
        AND owner_person_id_snapshot IS NOT NULL
        AND tenant_person_id_snapshot IS NOT NULL
        AND currency IS NOT NULL
        AND confirmed_date IS NOT NULL
        AND income_type_snapshot IS NOT NULL
        AND signed_amount = amount
        AND signed_amount > 0
        AND ledger_entry_id IS NOT NULL
      )
    );

CREATE INDEX owner_collection_allocations_operational_scope_idx
  ON public.owner_collection_confirmation_allocations (
    organization_id,
    property_id,
    currency,
    confirmed_date,
    id
  )
  WHERE settlement_contract_version = 'owner_collection.v1';

CREATE OR REPLACE FUNCTION public.confirm_owner_collected_rent(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_confirmed_date date,
  p_reference text,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_confirmation_id uuid;
  v_property_id uuid;
  v_currency public.currency_code;
  v_allocation record;
  v_ledger_entry_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT invoice.property_id, invoice.currency
  INTO v_property_id, v_currency
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id;

  IF FOUND AND p_confirmed_date IS NOT NULL THEN
    PERFORM app_private.lock_open_financial_month(
      p_organization_id,
      p_confirmed_date
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat_ws(
          ':',
          'owner_collection_v1',
          p_organization_id,
          p_invoice_id
        ),
        0
      )
    );
  END IF;

  PERFORM app_private.set_tenant_invoice_settlement_context(true);

  BEGIN
    v_confirmation_id :=
      public.confirm_owner_collected_rent_lease_derived_unchecked(
        p_organization_id,
        p_invoice_id,
        p_amount,
        p_confirmed_date,
        p_reference,
        p_allocations,
        p_idempotency_key
      );

    FOR v_allocation IN
      SELECT
        allocation.id,
        allocation.property_id AS stored_property_id,
        allocation.unit_id AS stored_unit_id,
        allocation.lease_id AS stored_lease_id,
        allocation.owner_person_id_snapshot AS stored_owner_person_id,
        allocation.tenant_person_id_snapshot AS stored_tenant_person_id,
        allocation.currency AS stored_currency,
        allocation.confirmed_date AS stored_confirmed_date,
        allocation.income_type_snapshot AS stored_income_type,
        allocation.signed_amount AS stored_signed_amount,
        allocation.settlement_contract_version,
        allocation.ledger_entry_id,
        allocation.amount,
        confirmation.property_id,
        confirmation.unit_id,
        confirmation.lease_id,
        confirmation.owner_person_id,
        confirmation.recipient_person_id AS tenant_person_id,
        confirmation.currency,
        confirmation.confirmed_date,
        confirmation.reference,
        income.income_type
      FROM public.owner_collection_confirmation_allocations AS allocation
      JOIN (
        SELECT
          confirmation.id,
          confirmation.organization_id,
          confirmation.owner_person_id,
          confirmation.currency,
          confirmation.confirmed_date,
          confirmation.reference,
          invoice.property_id,
          invoice.unit_id,
          invoice.lease_id,
          invoice.recipient_person_id
        FROM public.owner_collection_confirmations AS confirmation
        JOIN public.tenant_invoices AS invoice
          ON invoice.organization_id = confirmation.organization_id
         AND invoice.id = confirmation.invoice_id
        WHERE confirmation.organization_id = p_organization_id
          AND confirmation.id = v_confirmation_id
      ) AS confirmation
        ON confirmation.organization_id = allocation.organization_id
       AND confirmation.id = allocation.confirmation_id
      JOIN public.finance_income_items AS income
        ON income.organization_id = allocation.organization_id
       AND income.id = allocation.income_item_id
      WHERE allocation.organization_id = p_organization_id
        AND allocation.confirmation_id = v_confirmation_id
      ORDER BY allocation.allocation_order, allocation.id
      FOR UPDATE OF allocation
    LOOP
      IF v_allocation.settlement_contract_version IS NOT NULL
        AND (
          v_allocation.settlement_contract_version <> 'owner_collection.v1'
          OR v_allocation.stored_property_id <> v_allocation.property_id
          OR v_allocation.stored_unit_id IS DISTINCT FROM v_allocation.unit_id
          OR v_allocation.stored_lease_id IS DISTINCT FROM v_allocation.lease_id
          OR v_allocation.stored_owner_person_id
            <> v_allocation.owner_person_id
          OR v_allocation.stored_tenant_person_id
            <> v_allocation.tenant_person_id
          OR v_allocation.stored_currency <> v_allocation.currency
          OR v_allocation.stored_confirmed_date
            <> v_allocation.confirmed_date
          OR v_allocation.stored_income_type <> v_allocation.income_type
          OR v_allocation.stored_signed_amount <> v_allocation.amount
        ) THEN
        RAISE EXCEPTION 'Owner collection snapshot is invalid'
          USING ERRCODE = '22023';
      END IF;

      v_ledger_entry_id := app_private.create_operational_ledger_event(
        p_organization_id,
        v_allocation.property_id,
        v_allocation.unit_id,
        v_allocation.confirmed_date,
        'income',
        pg_catalog.initcap(
          pg_catalog.replace(v_allocation.income_type, '_', ' ')
        ),
        v_allocation.amount,
        v_allocation.currency,
        pg_catalog.concat_ws(
          ' - ',
          'Owner confirmed collection',
          v_allocation.reference
        ),
        'owner_collection_allocation',
        v_allocation.id,
        v_actor_id,
        NULL
      );

      UPDATE public.owner_collection_confirmation_allocations
      SET
        property_id = v_allocation.property_id,
        unit_id = v_allocation.unit_id,
        lease_id = v_allocation.lease_id,
        owner_person_id_snapshot = v_allocation.owner_person_id,
        tenant_person_id_snapshot = v_allocation.tenant_person_id,
        currency = v_allocation.currency,
        confirmed_date = v_allocation.confirmed_date,
        income_type_snapshot = v_allocation.income_type,
        signed_amount = v_allocation.amount,
        settlement_contract_version = 'owner_collection.v1',
        ledger_entry_id = v_ledger_entry_id
      WHERE organization_id = p_organization_id
        AND id = v_allocation.id;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_tenant_invoice_settlement_context(false);
    RAISE;
  END;

  PERFORM app_private.set_tenant_invoice_settlement_context(false);
  RETURN v_confirmation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent(
  uuid, uuid, numeric, date, text, jsonb, text
)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_owner_collected_rent(
  uuid, uuid, numeric, date, text, jsonb, text
)
TO authenticated;
