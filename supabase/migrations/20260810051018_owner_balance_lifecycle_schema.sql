-- Track 3 authoritative owner-balance storage. Public command signatures are
-- installed fail-closed in this migration and implemented only after their
-- focused behavioral contracts are red.

ALTER TABLE public.property_owners
  ADD CONSTRAINT property_owners_org_identity_owner_balance_unique
    UNIQUE (organization_id, id);

CREATE TABLE public.owner_event_allocation_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  event_date date NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_line_id uuid NOT NULL,
  gross_signed_amount numeric(14,2) NOT NULL,
  source_fingerprint text NOT NULL,
  allocation_basis text NOT NULL,
  explicit_owner_person_id uuid,
  reversal_of_allocation_set_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_event_allocation_sets_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT owner_event_allocation_sets_source_unique
    UNIQUE (organization_id, source_type, source_line_id),
  CONSTRAINT owner_event_allocation_sets_reversal_unique
    UNIQUE (reversal_of_allocation_set_id),
  CONSTRAINT owner_event_allocation_sets_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_event_allocation_sets_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_event_allocation_sets_explicit_owner_fk
    FOREIGN KEY (organization_id, explicit_owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_event_allocation_sets_reversal_fk
    FOREIGN KEY (organization_id, reversal_of_allocation_set_id)
    REFERENCES public.owner_event_allocation_sets (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_event_allocation_sets_source_type_check CHECK (
    source_type IN (
      'tenant_rent_receipt',
      'owner_direct_rent_receipt',
      'management_fee_occurrence',
      'owner_paid_cost',
      'owner_invoice_payment',
      'owner_contribution',
      'owner_reimbursement',
      'owner_distribution',
      'security_deposit_receipt',
      'security_deposit_refund',
      'owner_component_transfer',
      'reversal'
    )
  ),
  CONSTRAINT owner_event_allocation_sets_amount_check CHECK (
    gross_signed_amount <> 0
    AND gross_signed_amount = pg_catalog.round(gross_signed_amount, 2)
  ),
  CONSTRAINT owner_event_allocation_sets_fingerprint_check CHECK (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_event_allocation_sets_basis_check CHECK (
    allocation_basis IN ('effective_roster', 'explicit_owner')
  ),
  CONSTRAINT owner_event_allocation_sets_explicit_owner_check CHECK (
    (allocation_basis = 'effective_roster' AND explicit_owner_person_id IS NULL)
    OR
    (allocation_basis = 'explicit_owner' AND explicit_owner_person_id IS NOT NULL)
  ),
  CONSTRAINT owner_event_allocation_sets_not_self_reversal_check CHECK (
    reversal_of_allocation_set_id IS NULL
    OR reversal_of_allocation_set_id <> id
  )
);

CREATE TABLE public.owner_event_owner_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_set_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  property_owner_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  ownership_percent_snapshot numeric(6,3) NOT NULL,
  ownership_started_on_snapshot date NOT NULL,
  ownership_ended_on_snapshot date,
  ownership_roster_hash text NOT NULL,
  allocated_gross_signed_amount numeric(14,2) NOT NULL,
  allocation_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_event_owner_allocations_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT owner_event_owner_allocations_owner_unique
    UNIQUE (allocation_set_id, owner_person_id),
  CONSTRAINT owner_event_owner_allocations_order_unique
    UNIQUE (allocation_set_id, allocation_order),
  CONSTRAINT owner_event_owner_allocations_set_fk
    FOREIGN KEY (organization_id, allocation_set_id)
    REFERENCES public.owner_event_allocation_sets (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_event_owner_allocations_property_owner_fk
    FOREIGN KEY (organization_id, property_owner_id)
    REFERENCES public.property_owners (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_event_owner_allocations_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_event_owner_allocations_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_event_owner_allocations_percent_check CHECK (
    ownership_percent_snapshot > 0.000
    AND ownership_percent_snapshot <= 100.000
  ),
  CONSTRAINT owner_event_owner_allocations_interval_check CHECK (
    ownership_ended_on_snapshot IS NULL
    OR ownership_ended_on_snapshot > ownership_started_on_snapshot
  ),
  CONSTRAINT owner_event_owner_allocations_hash_check CHECK (
    ownership_roster_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_event_owner_allocations_amount_check CHECK (
    allocated_gross_signed_amount <> 0
    AND allocated_gross_signed_amount =
      pg_catalog.round(allocated_gross_signed_amount, 2)
  ),
  CONSTRAINT owner_event_owner_allocations_order_check CHECK (
    allocation_order > 0
  )
);

CREATE TABLE public.owner_component_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_event_owner_allocation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  event_date date NOT NULL,
  month_start date NOT NULL,
  component public.owner_balance_component NOT NULL,
  signed_amount numeric(14,2) NOT NULL,
  movement_order integer NOT NULL,
  reversal_of_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_component_movements_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT owner_component_movements_identity_unique
    UNIQUE (owner_event_owner_allocation_id, component, movement_order),
  CONSTRAINT owner_component_movements_reversal_unique
    UNIQUE (reversal_of_movement_id),
  CONSTRAINT owner_component_movements_allocation_fk
    FOREIGN KEY (organization_id, owner_event_owner_allocation_id)
    REFERENCES public.owner_event_owner_allocations (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_component_movements_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_movements_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_movements_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_movements_reversal_fk
    FOREIGN KEY (organization_id, reversal_of_movement_id)
    REFERENCES public.owner_component_movements (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_component_movements_month_check CHECK (
    month_start = pg_catalog.date_trunc('month', event_date)::date
  ),
  CONSTRAINT owner_component_movements_amount_check CHECK (
    signed_amount <> 0
    AND signed_amount = pg_catalog.round(signed_amount, 2)
  ),
  CONSTRAINT owner_component_movements_order_check CHECK (movement_order > 0),
  CONSTRAINT owner_component_movements_not_self_reversal_check CHECK (
    reversal_of_movement_id IS NULL OR reversal_of_movement_id <> id
  )
);

CREATE TABLE public.owner_cash_source_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_movement_id uuid NOT NULL,
  consumer_movement_id uuid NOT NULL,
  consumed_amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_cash_source_consumptions_pair_unique
    UNIQUE (source_movement_id, consumer_movement_id),
  CONSTRAINT owner_cash_source_consumptions_source_fk
    FOREIGN KEY (organization_id, source_movement_id)
    REFERENCES public.owner_component_movements (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_cash_source_consumptions_consumer_fk
    FOREIGN KEY (organization_id, consumer_movement_id)
    REFERENCES public.owner_component_movements (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_cash_source_consumptions_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_cash_source_consumptions_amount_check CHECK (
    consumed_amount > 0
    AND consumed_amount = pg_catalog.round(consumed_amount, 2)
  ),
  CONSTRAINT owner_cash_source_consumptions_not_self_check CHECK (
    source_movement_id <> consumer_movement_id
  )
);

CREATE TABLE public.owner_cash_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  event_type text NOT NULL,
  event_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  reason text NOT NULL,
  reference text,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_cash_events_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_cash_events_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT owner_cash_events_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_cash_events_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_cash_events_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_cash_events_type_check CHECK (
    event_type IN ('owner_contribution', 'owner_reimbursement')
  ),
  CONSTRAINT owner_cash_events_amount_check CHECK (
    amount > 0 AND amount = pg_catalog.round(amount, 2)
  ),
  CONSTRAINT owner_cash_events_reason_check CHECK (
    pg_catalog.length(pg_catalog.btrim(reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT owner_cash_events_reference_check CHECK (
    reference IS NULL
    OR pg_catalog.length(pg_catalog.btrim(reference)) BETWEEN 1 AND 240
  ),
  CONSTRAINT owner_cash_events_idempotency_check CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 8 AND 160
  ),
  CONSTRAINT owner_cash_events_payload_hash_check CHECK (
    payload_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE public.owner_component_transfer_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  from_owner_person_id uuid NOT NULL,
  to_owner_person_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  effective_date date NOT NULL,
  component public.owner_balance_component NOT NULL,
  amount numeric(14,2) NOT NULL,
  reason text NOT NULL,
  evidence_reference text NOT NULL,
  evidence_sha256 text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_component_transfer_instructions_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT owner_component_transfer_instructions_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT owner_component_transfer_instructions_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_transfer_instructions_from_owner_fk
    FOREIGN KEY (organization_id, from_owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_transfer_instructions_to_owner_fk
    FOREIGN KEY (organization_id, to_owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_transfer_instructions_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_transfer_instructions_owner_check CHECK (
    from_owner_person_id <> to_owner_person_id
  ),
  CONSTRAINT owner_component_transfer_instructions_amount_check CHECK (
    amount > 0 AND amount = pg_catalog.round(amount, 2)
  ),
  CONSTRAINT owner_component_transfer_instructions_reason_check CHECK (
    pg_catalog.length(pg_catalog.btrim(reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT owner_component_transfer_instructions_evidence_reference_check CHECK (
    pg_catalog.length(pg_catalog.btrim(evidence_reference)) BETWEEN 3 AND 240
  ),
  CONSTRAINT owner_component_transfer_instructions_evidence_hash_check CHECK (
    evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_component_transfer_instructions_idempotency_check CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 8 AND 160
  ),
  CONSTRAINT owner_component_transfer_instructions_payload_hash_check CHECK (
    payload_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE public.owner_component_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  transfer_instruction_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  line_direction text NOT NULL,
  signed_amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_component_transfer_lines_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT owner_component_transfer_lines_direction_unique
    UNIQUE (transfer_instruction_id, line_direction),
  CONSTRAINT owner_component_transfer_lines_instruction_fk
    FOREIGN KEY (organization_id, transfer_instruction_id)
    REFERENCES public.owner_component_transfer_instructions (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_component_transfer_lines_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_transfer_lines_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_component_transfer_lines_direction_check CHECK (
    line_direction IN ('from_owner', 'to_owner')
  ),
  CONSTRAINT owner_component_transfer_lines_amount_check CHECK (
    signed_amount <> 0
    AND signed_amount = pg_catalog.round(signed_amount, 2)
    AND (
      (line_direction = 'from_owner' AND signed_amount < 0)
      OR (line_direction = 'to_owner' AND signed_amount > 0)
    )
  )
);

CREATE TABLE public.owner_balance_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  month_start date NOT NULL,
  status text NOT NULL,
  input_watermark text NOT NULL,
  input_hash text NOT NULL,
  blocked_reason_code text,
  blocked_reason_detail jsonb,
  generated_at timestamptz NOT NULL,
  generated_by uuid NOT NULL,
  stale_at timestamptz,
  stale_reason text,
  closed_revision_id uuid,
  CONSTRAINT owner_balance_periods_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_balance_periods_key_unique UNIQUE (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    month_start
  ),
  CONSTRAINT owner_balance_periods_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_balance_periods_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_balance_periods_actor_fk
    FOREIGN KEY (generated_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_balance_periods_month_check CHECK (
    month_start = pg_catalog.date_trunc('month', month_start)::date
  ),
  CONSTRAINT owner_balance_periods_status_check CHECK (
    status IN ('blocked', 'ready', 'stale', 'closed')
  ),
  CONSTRAINT owner_balance_periods_hash_check CHECK (
    input_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_balance_periods_blocked_pair_check CHECK (
    (status = 'blocked' AND blocked_reason_code IS NOT NULL
      AND blocked_reason_detail IS NOT NULL)
    OR
    (status <> 'blocked' AND blocked_reason_code IS NULL
      AND blocked_reason_detail IS NULL)
  ),
  CONSTRAINT owner_balance_periods_stale_pair_check CHECK (
    (status = 'stale' AND stale_at IS NOT NULL AND stale_reason IS NOT NULL)
    OR
    (status <> 'stale' AND stale_at IS NULL AND stale_reason IS NULL)
  ),
  CONSTRAINT owner_balance_periods_closed_pair_check CHECK (
    (status = 'closed' AND closed_revision_id IS NOT NULL)
    OR
    (status <> 'closed' AND closed_revision_id IS NULL)
  )
);

CREATE TABLE public.owner_balance_period_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_balance_period_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  component public.owner_balance_component NOT NULL,
  opening_amount numeric(14,2) NOT NULL,
  movement_amount numeric(14,2) NOT NULL,
  closing_amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_balance_period_components_identity_unique
    UNIQUE (owner_balance_period_id, component),
  CONSTRAINT owner_balance_period_components_period_fk
    FOREIGN KEY (organization_id, owner_balance_period_id)
    REFERENCES public.owner_balance_periods (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_balance_period_components_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_balance_period_components_equation_check CHECK (
    closing_amount = opening_amount + movement_amount
  )
);

ALTER TABLE public.owner_payments
  ADD COLUMN reversal_of_id uuid,
  ADD COLUMN reversal_reason text,
  ADD CONSTRAINT owner_payments_reversal_fk
    FOREIGN KEY (organization_id, reversal_of_id)
    REFERENCES public.owner_payments (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT owner_payments_not_self_reversal_check CHECK (
    reversal_of_id IS NULL OR reversal_of_id <> id
  ),
  ADD CONSTRAINT owner_payments_reversal_reason_check CHECK (
    (reversal_of_id IS NULL AND reversal_reason IS NULL)
    OR
    (reversal_of_id IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(reversal_reason)) BETWEEN 3 AND 500)
  );

CREATE UNIQUE INDEX owner_payments_reversal_unique
  ON public.owner_payments (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

ALTER TABLE public.owner_payment_allocations
  ADD COLUMN reversal_of_allocation_id uuid,
  ADD CONSTRAINT owner_payment_allocations_reversal_fk
    FOREIGN KEY (organization_id, reversal_of_allocation_id)
    REFERENCES public.owner_payment_allocations (organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_payment_allocations_not_self_reversal_check CHECK (
    reversal_of_allocation_id IS NULL OR reversal_of_allocation_id <> id
  );

CREATE UNIQUE INDEX owner_payment_allocations_reversal_unique
  ON public.owner_payment_allocations (reversal_of_allocation_id)
  WHERE reversal_of_allocation_id IS NOT NULL;

ALTER TABLE public.property_withdrawals
  ADD COLUMN reversal_of_id uuid,
  ADD COLUMN reversal_reason text,
  ADD CONSTRAINT property_withdrawals_reversal_fk
    FOREIGN KEY (organization_id, reversal_of_id)
    REFERENCES public.property_withdrawals (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT property_withdrawals_not_self_reversal_check CHECK (
    reversal_of_id IS NULL OR reversal_of_id <> id
  ),
  ADD CONSTRAINT property_withdrawals_reversal_reason_check CHECK (
    (reversal_of_id IS NULL AND reversal_reason IS NULL)
    OR
    (reversal_of_id IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(reversal_reason)) BETWEEN 3 AND 500)
  );

CREATE UNIQUE INDEX property_withdrawals_reversal_unique
  ON public.property_withdrawals (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.guard_owner_balance_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'authoritative owner balance history is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF current_user <> 'postgres'
    OR pg_catalog.current_setting('app.owner_balance_write_context', true)
      IS DISTINCT FROM 'checked-owner-balance-v1' THEN
    RAISE EXCEPTION 'authoritative owner balance writes require a checked path'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_balance_append_only() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_balance_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_owner_balance_period_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF current_user <> 'postgres'
    OR pg_catalog.current_setting('app.owner_balance_period_write_context', true)
      IS DISTINCT FROM 'checked-rollforward-v1' THEN
    RAISE EXCEPTION 'owner balance periods require the checked roll-forward path'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

ALTER FUNCTION app_private.guard_owner_balance_period_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_balance_period_write()
  FROM PUBLIC, anon, authenticated, service_role;

DO $owner_balance_append_only_triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'owner_event_allocation_sets',
    'owner_event_owner_allocations',
    'owner_component_movements',
    'owner_cash_source_consumptions',
    'owner_cash_events',
    'owner_component_transfer_instructions',
    'owner_component_transfer_lines'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER guard_%I_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_balance_append_only()',
      v_table,
      v_table
    );
  END LOOP;
END;
$owner_balance_append_only_triggers$;

CREATE TRIGGER guard_owner_balance_periods_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_balance_periods
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_balance_period_write();

CREATE TRIGGER guard_owner_balance_period_components_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_balance_period_components
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_balance_period_write();

DO $owner_balance_rls_and_grants$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'owner_event_allocation_sets',
    'owner_event_owner_allocations',
    'owner_component_movements',
    'owner_cash_source_consumptions',
    'owner_cash_events',
    'owner_component_transfer_instructions',
    'owner_component_transfer_lines',
    'owner_balance_periods',
    'owner_balance_period_components'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      v_table
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      v_table
    );
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT app_private.can_read_finance(organization_id)))',
      'Finance roles can read ' || v_table,
      v_table
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      v_table
    );
    EXECUTE pg_catalog.format(
      'GRANT SELECT ON TABLE public.%I TO authenticated',
      v_table
    );
  END LOOP;
END;
$owner_balance_rls_and_grants$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.owner_payments, public.owner_payment_allocations,
    public.property_withdrawals
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.allocate_owner_event(
  p_organization_id uuid,
  p_source_type text,
  p_source_line_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Track 3 owner allocation is not installed'
    USING ERRCODE = '55000';
END;
$$;

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
  RAISE EXCEPTION 'Track 3 owner cash events are not installed'
    USING ERRCODE = '55000';
END;
$$;

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
BEGIN
  RAISE EXCEPTION 'Track 3 owner component transfers are not installed'
    USING ERRCODE = '55000';
END;
$$;

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
  RAISE EXCEPTION 'Track 3 owner allocation queue is not installed'
    USING ERRCODE = '55000';
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
  RAISE EXCEPTION 'Track 3 owner payment reversal is not installed'
    USING ERRCODE = '55000';
END;
$$;

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
  RAISE EXCEPTION 'Track 3 property withdrawal reversal is not installed'
    USING ERRCODE = '55000';
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
  RAISE EXCEPTION 'Track 3 owner distribution is not installed'
    USING ERRCODE = '55000';
END;
$$;

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
BEGIN
  RAISE EXCEPTION 'Track 3 withdrawal capacity is not installed'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_owner_balance_period(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Track 3 owner balance roll-forward is not installed'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_balance_ledger(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_period_start date,
  p_period_end date
) RETURNS TABLE (
  period_id uuid,
  month_start date,
  period_status text,
  component public.owner_balance_component,
  opening_amount text,
  movement_amount text,
  closing_amount text,
  available_withdrawal text,
  input_watermark text,
  input_hash text,
  blocked_reason_code text,
  blocked_reason_detail jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Track 3 owner balance ledger is not installed'
    USING ERRCODE = '55000';
END;
$$;

DO $owner_balance_stub_acl$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.allocate_owner_event(uuid,text,uuid,text)'::regprocedure,
    'public.record_owner_cash_event(uuid,uuid,uuid,public.currency_code,text,date,numeric,text,text)'::regprocedure,
    'public.transfer_owner_balance_component(uuid,uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,text,text)'::regprocedure,
    'public.get_owner_event_allocation_queue(uuid,uuid,public.currency_code,date,date)'::regprocedure,
    'public.reverse_owner_invoice_payment(uuid,uuid,date,text,text)'::regprocedure,
    'public.reverse_property_withdrawal(uuid,uuid,date,text,text)'::regprocedure,
    'public.record_owner_distribution(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)'::regprocedure,
    'public.get_owner_available_withdrawal(uuid,uuid,uuid,public.currency_code,date)'::regprocedure,
    'public.generate_owner_balance_period(uuid,uuid,uuid,public.currency_code,date,text)'::regprocedure,
    'public.get_owner_balance_ledger(uuid,uuid,uuid,public.currency_code,date,date)'::regprocedure
  ]
  LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO postgres', v_signature);
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_signature
    );
  END LOOP;
END;
$owner_balance_stub_acl$;
