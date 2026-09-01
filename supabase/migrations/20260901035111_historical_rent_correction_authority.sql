-- Super Admin historical-rent correction authority.
-- Issued invoice and Lease-term snapshots remain immutable. Signed reversals,
-- positive successors, settlement replay evidence, and tenant credits are the
-- only supported correction path.

ALTER TABLE public.tenant_invoice_corrections
  ADD COLUMN correction_business_date date,
  ADD COLUMN original_rent_amount numeric(14,2),
  ADD COLUMN corrected_rent_amount numeric(14,2),
  ADD COLUMN original_due_day integer,
  ADD COLUMN corrected_due_day integer,
  ADD COLUMN original_due_date date,
  ADD COLUMN corrected_due_date date,
  ADD COLUMN source_billing_term_id uuid,
  ADD COLUMN preview_hash text,
  DROP CONSTRAINT tenant_invoice_corrections_action_check,
  ADD CONSTRAINT tenant_invoice_corrections_action_check CHECK (
    (action = 'void' AND target_invoice_line_id IS NULL)
    OR (action = 'line_correction' AND target_invoice_line_id IS NOT NULL)
    OR (action = 'historical_rent' AND target_invoice_line_id IS NOT NULL)
  ),
  ADD CONSTRAINT tenant_invoice_corrections_historical_rent_check CHECK (
    action <> 'historical_rent'
    OR (
      correction_business_date IS NOT NULL
      AND original_rent_amount > 0
      AND corrected_rent_amount > 0
      AND original_due_day BETWEEN 1 AND 31
      AND corrected_due_day BETWEEN 1 AND 31
      AND original_due_date IS NOT NULL
      AND corrected_due_date IS NOT NULL
      AND source_billing_term_id IS NOT NULL
      AND preview_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  ADD CONSTRAINT tenant_invoice_corrections_source_billing_term_fkey
    FOREIGN KEY (source_billing_term_id)
    REFERENCES public.lease_billing_terms(id)
    ON DELETE RESTRICT;

ALTER TABLE public.tenant_invoice_lines
  ADD COLUMN supersedes_line_id uuid,
  DROP CONSTRAINT tenant_invoice_lines_reversal_evidence_check,
  ADD CONSTRAINT tenant_invoice_lines_reversal_evidence_check CHECK (
    (
      reversal_of_id IS NULL
      AND supersedes_line_id IS NULL
      AND correction_occurrence_id IS NULL
      AND income_item_id IS NOT NULL
    ) OR (
      reversal_of_id IS NOT NULL
      AND supersedes_line_id IS NULL
      AND correction_occurrence_id IS NOT NULL
      AND income_item_id IS NULL
    ) OR (
      reversal_of_id IS NULL
      AND supersedes_line_id IS NOT NULL
      AND correction_occurrence_id IS NOT NULL
      AND income_item_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT tenant_invoice_lines_successor_not_self_check CHECK (
    supersedes_line_id IS NULL OR supersedes_line_id <> id
  ),
  ADD CONSTRAINT tenant_invoice_lines_successor_fkey
    FOREIGN KEY (organization_id, supersedes_line_id)
    REFERENCES public.tenant_invoice_lines(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_invoice_lines_successor_unique
    UNIQUE (supersedes_line_id);

CREATE INDEX tenant_invoice_lines_successor_idx
  ON public.tenant_invoice_lines (organization_id, supersedes_line_id)
  WHERE supersedes_line_id IS NOT NULL;

ALTER TABLE public.finance_income_items
  ADD COLUMN supersedes_income_item_id uuid,
  ADD COLUMN correction_occurrence_id uuid,
  ADD CONSTRAINT finance_income_items_successor_not_self_check CHECK (
    supersedes_income_item_id IS NULL OR supersedes_income_item_id <> id
  ),
  ADD CONSTRAINT finance_income_items_correction_lineage_check CHECK (
    (supersedes_income_item_id IS NULL AND correction_occurrence_id IS NULL)
    OR (supersedes_income_item_id IS NOT NULL AND correction_occurrence_id IS NOT NULL)
  ),
  ADD CONSTRAINT finance_income_items_successor_fkey
    FOREIGN KEY (organization_id, supersedes_income_item_id)
    REFERENCES public.finance_income_items(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_income_items_correction_fkey
    FOREIGN KEY (organization_id, correction_occurrence_id)
    REFERENCES public.tenant_invoice_corrections(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_income_items_successor_unique
    UNIQUE (supersedes_income_item_id);

DROP INDEX public.finance_income_items_org_lease_rent_period_unique;
CREATE UNIQUE INDEX finance_income_items_org_lease_rent_period_root_unique
  ON public.finance_income_items (
    organization_id, lease_id, rent_billing_period_start
  )
  WHERE archived_at IS NULL
    AND lease_id IS NOT NULL
    AND income_type = 'rent'
    AND rent_billing_period_start IS NOT NULL
    AND supersedes_income_item_id IS NULL;
CREATE INDEX finance_income_items_successor_idx
  ON public.finance_income_items (
    organization_id, supersedes_income_item_id
  ) WHERE supersedes_income_item_id IS NOT NULL;
CREATE INDEX finance_income_items_correction_idx
  ON public.finance_income_items (
    organization_id, correction_occurrence_id
  ) WHERE correction_occurrence_id IS NOT NULL;

ALTER TABLE public.management_fee_occurrences
  ADD COLUMN supersedes_occurrence_id uuid,
  DROP CONSTRAINT management_fee_occurrences_reversal_evidence_check,
  ADD CONSTRAINT management_fee_occurrences_reversal_evidence_check CHECK (
    (
      reversal_of_id IS NULL
      AND supersedes_occurrence_id IS NULL
      AND correction_occurrence_id IS NULL
      AND settlement_status <> 'reversed'
    ) OR (
      reversal_of_id IS NOT NULL
      AND supersedes_occurrence_id IS NULL
      AND correction_occurrence_id IS NOT NULL
      AND settlement_status = 'reversed'
    ) OR (
      reversal_of_id IS NULL
      AND supersedes_occurrence_id IS NOT NULL
      AND correction_occurrence_id IS NOT NULL
      AND settlement_status <> 'reversed'
    )
  ),
  ADD CONSTRAINT management_fee_occurrences_successor_not_self_check CHECK (
    supersedes_occurrence_id IS NULL OR supersedes_occurrence_id <> id
  ),
  ADD CONSTRAINT management_fee_occurrences_successor_fkey
    FOREIGN KEY (organization_id, supersedes_occurrence_id)
    REFERENCES public.management_fee_occurrences(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT management_fee_occurrences_successor_unique
    UNIQUE (supersedes_occurrence_id);

DROP INDEX public.management_fee_occurrences_original_invoice_unique;
CREATE UNIQUE INDEX management_fee_occurrences_original_invoice_unique
  ON public.management_fee_occurrences (organization_id, tenant_invoice_id)
  WHERE reversal_of_id IS NULL AND supersedes_occurrence_id IS NULL;
CREATE INDEX management_fee_occurrences_successor_idx
  ON public.management_fee_occurrences (
    organization_id, supersedes_occurrence_id
  ) WHERE supersedes_occurrence_id IS NOT NULL;

ALTER TABLE public.owner_invoice_lines
  ADD COLUMN supersedes_line_id uuid,
  DROP CONSTRAINT owner_invoice_lines_reversal_evidence_check,
  ADD CONSTRAINT owner_invoice_lines_reversal_evidence_check CHECK (
    (
      reversal_of_id IS NULL
      AND supersedes_line_id IS NULL
      AND correction_occurrence_id IS NULL
    ) OR (
      reversal_of_id IS NOT NULL
      AND supersedes_line_id IS NULL
      AND correction_occurrence_id IS NOT NULL
    ) OR (
      reversal_of_id IS NULL
      AND supersedes_line_id IS NOT NULL
      AND correction_occurrence_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT owner_invoice_lines_successor_not_self_check CHECK (
    supersedes_line_id IS NULL OR supersedes_line_id <> id
  ),
  ADD CONSTRAINT owner_invoice_lines_successor_fkey
    FOREIGN KEY (organization_id, supersedes_line_id)
    REFERENCES public.owner_invoice_lines(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_invoice_lines_successor_unique UNIQUE (supersedes_line_id);

CREATE INDEX owner_invoice_lines_successor_idx
  ON public.owner_invoice_lines (organization_id, supersedes_line_id)
  WHERE supersedes_line_id IS NOT NULL;

CREATE TABLE public.historical_rent_settlement_reapplications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  correction_occurrence_id uuid NOT NULL,
  settlement_kind text NOT NULL,
  original_settlement_id uuid NOT NULL,
  reversal_settlement_id uuid NOT NULL,
  replacement_settlement_id uuid,
  original_amount numeric(14,2) NOT NULL,
  reapplied_amount numeric(14,2) NOT NULL,
  credit_amount numeric(14,2) NOT NULL,
  original_allocation_snapshot jsonb NOT NULL,
  replacement_allocation_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  CONSTRAINT historical_rent_settlement_reapplications_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT historical_rent_settlement_reapplications_source_unique
    UNIQUE (organization_id, settlement_kind, original_settlement_id),
  CONSTRAINT historical_rent_settlement_reapplications_kind_check CHECK (
    settlement_kind IN ('ips_payment', 'owner_confirmation')
  ),
  CONSTRAINT historical_rent_settlement_reapplications_amount_check CHECK (
    original_amount > 0
    AND reapplied_amount >= 0
    AND credit_amount >= 0
    AND original_amount = reapplied_amount + credit_amount
    AND (replacement_settlement_id IS NOT NULL OR reapplied_amount = 0)
  ),
  CONSTRAINT historical_rent_settlement_reapplications_snapshot_check CHECK (
    jsonb_typeof(original_allocation_snapshot) = 'array'
    AND jsonb_typeof(replacement_allocation_snapshot) = 'array'
  ),
  CONSTRAINT historical_rent_settlement_reapplications_org_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT historical_rent_settlement_reapplications_correction_fkey
    FOREIGN KEY (organization_id, correction_occurrence_id)
    REFERENCES public.tenant_invoice_corrections(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT historical_rent_settlement_reapplications_actor_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX historical_rent_settlement_reapplications_correction_idx
  ON public.historical_rent_settlement_reapplications (
    organization_id, correction_occurrence_id, created_at, id
  );

CREATE TABLE public.tenant_credit_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  correction_occurrence_id uuid NOT NULL,
  tenant_invoice_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  property_id uuid NOT NULL,
  unit_id uuid,
  tenant_person_id uuid NOT NULL,
  owner_person_id uuid,
  currency public.currency_code NOT NULL,
  occurred_on date NOT NULL,
  amount numeric(14,2) NOT NULL,
  custody_kind text NOT NULL,
  source_settlement_kind text NOT NULL,
  source_settlement_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  CONSTRAINT tenant_credit_occurrences_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT tenant_credit_occurrences_source_unique
    UNIQUE (organization_id, source_settlement_kind, source_settlement_id),
  CONSTRAINT tenant_credit_occurrences_amount_check CHECK (amount > 0),
  CONSTRAINT tenant_credit_occurrences_custody_check CHECK (
    (custody_kind = 'ips_held' AND owner_person_id IS NULL)
    OR (custody_kind = 'owner_held' AND owner_person_id IS NOT NULL)
  ),
  CONSTRAINT tenant_credit_occurrences_source_kind_check CHECK (
    source_settlement_kind IN ('ips_payment', 'owner_confirmation')
  ),
  CONSTRAINT tenant_credit_occurrences_reason_check CHECK (
    length(btrim(reason)) BETWEEN 8 AND 500
  ),
  CONSTRAINT tenant_credit_occurrences_org_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_correction_fkey
    FOREIGN KEY (organization_id, correction_occurrence_id)
    REFERENCES public.tenant_invoice_corrections(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_invoice_fkey
    FOREIGN KEY (organization_id, tenant_invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_lease_fkey
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_unit_fkey
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_tenant_fkey
    FOREIGN KEY (organization_id, tenant_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_owner_fkey
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_credit_occurrences_actor_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX tenant_credit_occurrences_correction_idx
  ON public.tenant_credit_occurrences (
    organization_id, correction_occurrence_id, occurred_on, id
  );
CREATE INDEX tenant_credit_occurrences_tenant_idx
  ON public.tenant_credit_occurrences (
    organization_id, tenant_person_id, currency, occurred_on, id
  );
CREATE INDEX tenant_credit_occurrences_owner_idx
  ON public.tenant_credit_occurrences (
    organization_id, owner_person_id, currency, occurred_on, id
  ) WHERE owner_person_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.guard_historical_rent_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'historical rent correction evidence is immutable'
      USING ERRCODE = '42501';
  END IF;
  IF current_user <> 'postgres'
    OR pg_catalog.current_setting(
      'app.historical_rent_correction_context', true
    ) IS DISTINCT FROM 'checked-historical-rent-v1' THEN
    RAISE EXCEPTION 'historical rent evidence requires the checked authority'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_historical_rent_evidence() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_historical_rent_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_historical_rent_settlement_reapplications
BEFORE INSERT OR UPDATE OR DELETE
ON public.historical_rent_settlement_reapplications
FOR EACH ROW EXECUTE FUNCTION app_private.guard_historical_rent_evidence();

CREATE TRIGGER guard_tenant_credit_occurrences
BEFORE INSERT OR UPDATE OR DELETE
ON public.tenant_credit_occurrences
FOR EACH ROW EXECUTE FUNCTION app_private.guard_historical_rent_evidence();

CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE
ON public.historical_rent_settlement_reapplications
FOR EACH ROW EXECUTE FUNCTION
  app_private.enforce_privileged_email_step_up_on_organization_mutation();

CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE
ON public.tenant_credit_occurrences
FOR EACH ROW EXECUTE FUNCTION
  app_private.enforce_privileged_email_step_up_on_organization_mutation();

ALTER TABLE public.historical_rent_settlement_reapplications
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_rent_settlement_reapplications
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credit_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credit_occurrences FORCE ROW LEVEL SECURITY;

CREATE POLICY historical_rent_settlement_reapplications_super_admin_select
ON public.historical_rent_settlement_reapplications
FOR SELECT TO authenticated
USING (app_private.is_org_admin(organization_id));

CREATE POLICY tenant_credit_occurrences_super_admin_select
ON public.tenant_credit_occurrences
FOR SELECT TO authenticated
USING (app_private.is_org_admin(organization_id));

REVOKE ALL ON TABLE public.historical_rent_settlement_reapplications
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tenant_credit_occurrences
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.historical_rent_settlement_reapplications
  TO authenticated;
GRANT SELECT ON TABLE public.tenant_credit_occurrences TO authenticated;

CREATE OR REPLACE VIEW public.tenant_invoice_balances
WITH (security_invoker = true)
AS
WITH correction_lines AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(line.amount)::numeric(14,2) AS amount
  FROM public.tenant_invoice_lines AS line
  WHERE line.correction_occurrence_id IS NOT NULL
  GROUP BY line.organization_id, line.invoice_id
), latest_rent_correction AS (
  SELECT DISTINCT ON (correction.organization_id, correction.tenant_invoice_id)
    correction.organization_id,
    correction.tenant_invoice_id AS invoice_id,
    correction.corrected_due_date
  FROM public.tenant_invoice_corrections AS correction
  WHERE correction.action = 'historical_rent'
  ORDER BY
    correction.organization_id,
    correction.tenant_invoice_id,
    correction.created_at DESC,
    correction.id DESC
), ips_paid AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(allocation.signed_amount)::numeric(14,2) AS amount
  FROM public.tenant_invoice_lines AS line
  JOIN public.finance_receipt_allocations AS allocation
    ON allocation.organization_id = line.organization_id
   AND allocation.income_item_id = line.income_item_id
  GROUP BY line.organization_id, line.invoice_id
), owner_paid AS (
  SELECT
    allocation.organization_id,
    allocation.invoice_id,
    sum(allocation.signed_amount)::numeric(14,2) AS amount
  FROM public.owner_collection_confirmation_allocations AS allocation
  GROUP BY allocation.organization_id, allocation.invoice_id
), tenant_adjustments AS (
  SELECT
    adjustment.organization_id,
    adjustment.tenant_invoice_id AS invoice_id,
    sum(adjustment.amount)::numeric(14,2) AS amount
  FROM public.expense_customer_adjustments AS adjustment
  WHERE adjustment.responsibility = 'tenant'
  GROUP BY adjustment.organization_id, adjustment.tenant_invoice_id
), totals AS (
  SELECT
    invoice.organization_id,
    invoice.id AS invoice_id,
    (
      invoice.total_amount
      + coalesce(correction_lines.amount, 0)
      + coalesce(tenant_adjustments.amount, 0)
    )::numeric(14,2) AS adjusted_total,
    coalesce(ips_paid.amount, 0)::numeric(14,2) AS paid_through_ips,
    coalesce(owner_paid.amount, 0)::numeric(14,2) AS collected_by_owner
  FROM public.tenant_invoices AS invoice
  LEFT JOIN correction_lines
    ON correction_lines.organization_id = invoice.organization_id
   AND correction_lines.invoice_id = invoice.id
  LEFT JOIN tenant_adjustments
    ON tenant_adjustments.organization_id = invoice.organization_id
   AND tenant_adjustments.invoice_id = invoice.id
  LEFT JOIN ips_paid
    ON ips_paid.organization_id = invoice.organization_id
   AND ips_paid.invoice_id = invoice.id
  LEFT JOIN owner_paid
    ON owner_paid.organization_id = invoice.organization_id
   AND owner_paid.invoice_id = invoice.id
)
SELECT
  invoice.id,
  invoice.organization_id,
  invoice.invoice_number,
  invoice.property_id,
  invoice.unit_id,
  invoice.lease_id,
  invoice.billing_term_id,
  invoice.billing_period_start,
  invoice.billing_period_end,
  invoice.issue_date,
  coalesce(latest_rent_correction.corrected_due_date, invoice.due_date) AS due_date,
  invoice.collection_route,
  invoice.recipient_kind,
  invoice.recipient_person_id,
  invoice.recipient_label,
  invoice.occupant_labels,
  invoice.currency,
  totals.adjusted_total AS total_amount,
  invoice.lifecycle,
  invoice.voided_at,
  invoice.voided_by,
  invoice.created_at,
  invoice.created_by,
  totals.paid_through_ips,
  totals.collected_by_owner,
  greatest(
    totals.adjusted_total - totals.paid_through_ips - totals.collected_by_owner,
    0
  )::numeric(14,2) AS balance_due,
  CASE
    WHEN invoice.lifecycle = 'void' THEN 'voided'
    WHEN totals.adjusted_total <= 0 THEN 'paid'
    WHEN totals.paid_through_ips + totals.collected_by_owner >= totals.adjusted_total THEN 'paid'
    WHEN totals.paid_through_ips + totals.collected_by_owner > 0 THEN 'partly_paid'
    ELSE 'unpaid'
  END AS payment_status,
  invoice.lifecycle = 'issued'
    AND coalesce(latest_rent_correction.corrected_due_date, invoice.due_date) < current_date
    AND totals.paid_through_ips + totals.collected_by_owner < totals.adjusted_total
    AS is_overdue
FROM public.tenant_invoices AS invoice
JOIN totals
  ON totals.organization_id = invoice.organization_id
 AND totals.invoice_id = invoice.id
LEFT JOIN latest_rent_correction
  ON latest_rent_correction.organization_id = invoice.organization_id
 AND latest_rent_correction.invoice_id = invoice.id;

ALTER VIEW public.tenant_invoice_balances OWNER TO postgres;
GRANT SELECT ON public.tenant_invoice_balances TO authenticated;

CREATE OR REPLACE FUNCTION app_private.build_historical_rent_correction_preview(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_corrected_rent_amount numeric,
  p_corrected_due_day integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_business_date date;
  v_invoice public.tenant_invoices%ROWTYPE;
  v_line public.tenant_invoice_lines%ROWTYPE;
  v_income public.finance_income_items%ROWTYPE;
  v_fee public.management_fee_occurrences%ROWTYPE;
  v_original_due_day integer;
  v_corrected_due_date date;
  v_days_in_month integer;
  v_ips_rent_settled numeric(14,2) := 0;
  v_owner_rent_settled numeric(14,2) := 0;
  v_replacement_fee numeric(14,2) := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_preview jsonb;
  v_preview_hash text;
BEGIN
  IF p_organization_id IS NULL
    OR p_invoice_id IS NULL
    OR p_corrected_rent_amount IS NULL
    OR p_corrected_rent_amount <= 0
    OR p_corrected_rent_amount IS DISTINCT FROM pg_catalog.round(
      p_corrected_rent_amount, 2
    )
    OR p_corrected_due_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'historical_rent_correction_inputs_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_business_date := app_private.rent_business_date(p_organization_id);

  SELECT invoice.* INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id;
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF v_invoice.lifecycle <> 'issued'
    OR v_invoice.generation_source <> 'lease_rules_v1'
    OR v_invoice.lease_id IS NULL
    OR v_invoice.billing_term_id IS NULL
    OR v_invoice.billing_period_end >= v_business_date THEN
    RAISE EXCEPTION 'historical_rent_invoice_not_eligible'
      USING ERRCODE = '23514';
  END IF;

  SELECT line.* INTO v_line
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.invoice_id = p_invoice_id
    AND line.line_type = 'rent'
    AND line.reversal_of_id IS NULL
    AND line.supersedes_line_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_invoice_lines AS reversal
      WHERE reversal.organization_id = line.organization_id
        AND reversal.reversal_of_id = line.id
    );
  IF v_line.id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenant_invoice_corrections AS correction
      WHERE correction.organization_id = p_organization_id
        AND correction.tenant_invoice_id = p_invoice_id
        AND correction.action = 'historical_rent'
    ) THEN
      RAISE EXCEPTION 'historical_rent_already_corrected'
        USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'historical_rent_lineage_unsupported'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tenant_invoice_lines AS other_line
    WHERE other_line.organization_id = p_organization_id
      AND other_line.invoice_id = p_invoice_id
      AND other_line.line_type = 'rent'
      AND other_line.id <> v_line.id
      AND other_line.reversal_of_id IS NULL
      AND other_line.supersedes_line_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_invoice_lines AS other_reversal
        WHERE other_reversal.organization_id = other_line.organization_id
          AND other_reversal.reversal_of_id = other_line.id
      )
  ) THEN
    RAISE EXCEPTION 'historical_rent_lineage_unsupported'
      USING ERRCODE = '23514';
  END IF;

  SELECT income.* INTO STRICT v_income
  FROM public.finance_income_items AS income
  WHERE income.organization_id = p_organization_id
    AND income.id = v_line.income_item_id
    AND income.lease_id = v_invoice.lease_id
    AND income.income_type = 'rent'
    AND income.rent_billing_period_start = v_invoice.billing_period_start
    AND income.supersedes_income_item_id IS NULL;

  SELECT fee.* INTO v_fee
  FROM public.management_fee_occurrences AS fee
  WHERE fee.organization_id = p_organization_id
    AND fee.tenant_invoice_id = p_invoice_id
    AND fee.reversal_of_id IS NULL
    AND fee.supersedes_occurrence_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.management_fee_occurrences AS reversal
      WHERE reversal.organization_id = fee.organization_id
        AND reversal.reversal_of_id = fee.id
    );

  v_days_in_month := extract(
    day FROM (
      pg_catalog.date_trunc('month', v_invoice.billing_period_start)
      + interval '1 month - 1 day'
    )
  )::integer;
  v_corrected_due_date := greatest(
    pg_catalog.make_date(
      extract(year FROM v_invoice.billing_period_start)::integer,
      extract(month FROM v_invoice.billing_period_start)::integer,
      least(p_corrected_due_day, v_days_in_month)
    ),
    v_invoice.issue_date
  );
  v_original_due_day := extract(day FROM v_invoice.due_date)::integer;

  SELECT coalesce(sum(allocation.amount), 0)::numeric(14,2)
  INTO v_ips_rent_settled
  FROM public.tenant_invoice_payment_allocations AS allocation
  JOIN public.tenant_invoice_payments AS payment
    ON payment.organization_id = allocation.organization_id
   AND payment.id = allocation.payment_id
  WHERE allocation.organization_id = p_organization_id
    AND allocation.invoice_line_id = v_line.id
    AND allocation.reversal_of_allocation_id IS NULL
    AND payment.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_invoice_payments AS payment_reversal
      WHERE payment_reversal.organization_id = payment.organization_id
        AND payment_reversal.reversal_of_id = payment.id
    );

  SELECT coalesce(sum(allocation.amount), 0)::numeric(14,2)
  INTO v_owner_rent_settled
  FROM public.owner_collection_confirmation_allocations AS allocation
  JOIN public.owner_collection_confirmations AS confirmation
    ON confirmation.organization_id = allocation.organization_id
   AND confirmation.id = allocation.confirmation_id
  WHERE allocation.organization_id = p_organization_id
    AND allocation.invoice_line_id = v_line.id
    AND allocation.reversal_of_allocation_id IS NULL
    AND confirmation.reversal_of_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.owner_collection_confirmations AS confirmation_reversal
      WHERE confirmation_reversal.organization_id = confirmation.organization_id
        AND confirmation_reversal.reversal_of_id = confirmation.id
    );

  IF v_fee.id IS NOT NULL THEN
    v_replacement_fee := CASE v_fee.fee_mode
      WHEN 'percentage' THEN pg_catalog.round(
        p_corrected_rent_amount * v_fee.fee_value / 100, 2
      )
      ELSE pg_catalog.round(v_fee.fee_value, 2)
    END;
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', blocker.code,
        'detail', blocker.detail
      ) ORDER BY blocker.code, blocker.detail::text
    ),
    '[]'::jsonb
  ) INTO v_blockers
  FROM (
    SELECT
      'financial_month_locked'::text AS code,
      pg_catalog.jsonb_build_object(
        'monthStart', pg_catalog.date_trunc('month', v_business_date)::date
      ) AS detail
    WHERE app_private.is_financial_month_locked(
      p_organization_id, v_invoice.property_id, v_business_date
    )

    UNION ALL

    SELECT DISTINCT
      'historical_rent_owner_close_reopen_required'::text,
      pg_catalog.jsonb_build_object(
        'ownerPersonId', series.owner_person_id,
        'monthStart', series.month_start,
        'state', series.state
      )
    FROM public.owner_close_series AS series
    WHERE series.organization_id = p_organization_id
      AND series.property_id = v_invoice.property_id
      AND series.currency = v_invoice.currency
      AND series.current_closed_revision_id IS NOT NULL
      AND series.state IN ('closed', 'stale')
      AND series.month_start >= pg_catalog.date_trunc(
        'month', v_line.recognized_on
      )::date
      AND series.owner_person_id IN (
        SELECT roster.owner_person_id
        FROM app_private.validate_owner_roster_on_date(
          p_organization_id, v_invoice.property_id, v_line.recognized_on
        ) AS roster
      )

    UNION ALL

    SELECT
      'owner_invoice_settlement_active'::text,
      pg_catalog.jsonb_build_object('ownerInvoiceLineId', owner_line.id)
    FROM public.owner_invoice_lines AS owner_line
    WHERE v_fee.id IS NOT NULL
      AND owner_line.organization_id = p_organization_id
      AND owner_line.source_type = 'management_fee'
      AND owner_line.source_id = v_fee.id
      AND owner_line.reversal_of_id IS NULL
      AND EXISTS (
          SELECT 1
          FROM public.owner_payment_allocations AS allocation
          WHERE allocation.organization_id = owner_line.organization_id
            AND allocation.owner_invoice_line_id = owner_line.id
            AND allocation.reversal_of_allocation_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.owner_payment_allocations AS reversal
              WHERE reversal.organization_id = allocation.organization_id
                AND reversal.reversal_of_allocation_id = allocation.id
            )
        )

    UNION ALL

    SELECT DISTINCT
      'historical_rent_owner_custody_changed'::text,
      pg_catalog.jsonb_build_object(
        'originalOwnerPersonId', confirmation.owner_person_id,
        'correctionBusinessDate', v_business_date
      )
    FROM public.owner_collection_confirmations AS confirmation
    WHERE confirmation.organization_id = p_organization_id
      AND confirmation.invoice_id = p_invoice_id
      AND confirmation.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_collection_confirmations AS reversal
        WHERE reversal.organization_id = confirmation.organization_id
          AND reversal.reversal_of_id = confirmation.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.property_owners AS owner_link
        WHERE owner_link.organization_id = confirmation.organization_id
          AND owner_link.property_id = v_invoice.property_id
          AND owner_link.person_id = confirmation.owner_person_id
          AND owner_link.is_primary
          AND owner_link.archived_at IS NULL
          AND (
            owner_link.started_on IS NULL
            OR owner_link.started_on <= v_business_date
          )
          AND (
            owner_link.ended_on IS NULL
            OR owner_link.ended_on >= v_business_date
          )
      )

    UNION ALL

    SELECT DISTINCT
      'historical_rent_settlement_owner_effect_missing'::text,
      pg_catalog.jsonb_build_object(
        'settlementKind', source.settlement_kind,
        'allocationId', source.allocation_id
      )
    FROM (
      SELECT
        'ips_payment'::text AS settlement_kind,
        allocation.id AS allocation_id,
        'tenant_rent_receipt'::text AS owner_source_type
      FROM public.tenant_invoice_payment_allocations AS allocation
      JOIN public.tenant_invoice_payments AS payment
        ON payment.organization_id = allocation.organization_id
       AND payment.id = allocation.payment_id
      WHERE allocation.organization_id = p_organization_id
        AND allocation.invoice_id = p_invoice_id
        AND allocation.reversal_of_allocation_id IS NULL
        AND payment.reversal_of_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_invoice_payments AS reversal
          WHERE reversal.organization_id = payment.organization_id
            AND reversal.reversal_of_id = payment.id
        )
      UNION ALL
      SELECT
        'owner_confirmation'::text,
        allocation.id,
        'owner_direct_rent_receipt'::text
      FROM public.owner_collection_confirmation_allocations AS allocation
      JOIN public.owner_collection_confirmations AS confirmation
        ON confirmation.organization_id = allocation.organization_id
       AND confirmation.id = allocation.confirmation_id
      WHERE allocation.organization_id = p_organization_id
        AND allocation.invoice_id = p_invoice_id
        AND allocation.reversal_of_allocation_id IS NULL
        AND confirmation.reversal_of_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_collection_confirmations AS reversal
          WHERE reversal.organization_id = confirmation.organization_id
            AND reversal.reversal_of_id = confirmation.id
        )
    ) AS source
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.owner_event_allocation_sets AS allocation_set
      WHERE allocation_set.organization_id = p_organization_id
        AND allocation_set.source_type = source.owner_source_type
        AND allocation_set.source_line_id = source.allocation_id
    )
  ) AS blocker;

  v_preview := pg_catalog.jsonb_build_object(
    'contractVersion', 'historical_rent_correction.v1',
    'organizationId', p_organization_id,
    'invoiceId', v_invoice.id,
    'invoiceNumber', v_invoice.invoice_number,
    'leaseId', v_invoice.lease_id,
    'propertyId', v_invoice.property_id,
    'unitId', v_invoice.unit_id,
    'billingTermId', v_invoice.billing_term_id,
    'sourceRentLineId', v_line.id,
    'sourceIncomeItemId', v_income.id,
    'billingPeriodStart', v_invoice.billing_period_start,
    'billingPeriodEnd', v_invoice.billing_period_end,
    'correctionBusinessDate', v_business_date,
    'currency', v_invoice.currency,
    'collectionRoute', v_invoice.collection_route,
    'originalRentAmount', v_line.amount,
    'correctedRentAmount', p_corrected_rent_amount,
    'rentDelta', (p_corrected_rent_amount - v_line.amount)::numeric(14,2),
    'originalDueDay', v_original_due_day,
    'correctedDueDay', p_corrected_due_day,
    'originalDueDate', v_invoice.due_date,
    'correctedDueDate', v_corrected_due_date,
    'ipsRentSettledAmount', v_ips_rent_settled,
    'ownerRentSettledAmount', v_owner_rent_settled,
    'projectedTenantCreditAmount', greatest(
      v_ips_rent_settled + v_owner_rent_settled - p_corrected_rent_amount,
      0
    )::numeric(14,2),
    'originalManagementFeeAmount', coalesce(v_fee.amount, 0)::numeric(14,2),
    'replacementManagementFeeAmount', v_replacement_fee,
    'managementFeeDelta', (v_replacement_fee - coalesce(v_fee.amount, 0))::numeric(14,2),
    'blockers', v_blockers,
    'immutableEvidence', pg_catalog.jsonb_build_object(
      'invoiceHeaderRetained', true,
      'leaseTermsRetained', true,
      'receiptsRetained', true,
      'ledgerEntriesRetained', true,
      'ownerStatementsRetained', true
    )
  );
  v_preview_hash := app_private.canonical_financial_payload_hash(v_preview);
  RETURN v_preview || pg_catalog.jsonb_build_object(
    'previewHash', v_preview_hash,
    'canApply', pg_catalog.jsonb_array_length(v_blockers) = 0
  );
END;
$$;

ALTER FUNCTION app_private.build_historical_rent_correction_preview(
  uuid, uuid, numeric, integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.build_historical_rent_correction_preview(
  uuid, uuid, numeric, integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_historical_rent_correction(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_corrected_rent_amount numeric,
  p_corrected_due_day integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN app_private.build_historical_rent_correction_preview(
    p_organization_id,
    p_invoice_id,
    p_corrected_rent_amount,
    p_corrected_due_day
  );
END;
$$;

ALTER FUNCTION public.preview_historical_rent_correction(
  uuid, uuid, numeric, integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.preview_historical_rent_correction(
  uuid, uuid, numeric, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_historical_rent_correction(
  uuid, uuid, numeric, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.create_management_fee_owner_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_invoice public.tenant_invoices%ROWTYPE;
  v_original public.management_fee_occurrences%ROWTYPE;
  v_owner_person_id uuid;
BEGIN
  SELECT invoice.* INTO STRICT v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = NEW.organization_id
    AND invoice.id = NEW.tenant_invoice_id
  FOR KEY SHARE;

  IF NEW.reversal_of_id IS NOT NULL THEN
    IF current_user <> 'postgres'
      OR pg_catalog.current_setting(
        'app.tenant_invoice_correction_context', true
      ) IS DISTINCT FROM 'checked-invoice-correction-v1' THEN
      RAISE EXCEPTION 'management fee reversals require the checked authority'
        USING ERRCODE = '42501';
    END IF;
    SELECT original.* INTO STRICT v_original
    FROM public.management_fee_occurrences AS original
    WHERE original.organization_id = NEW.organization_id
      AND original.id = NEW.reversal_of_id
      AND original.tenant_invoice_id = NEW.tenant_invoice_id
      AND original.reversal_of_id IS NULL
    FOR KEY SHARE;
    NEW.property_id := v_original.property_id;
    NEW.lease_id := v_original.lease_id;
    NEW.billing_term_id := v_original.billing_term_id;
    NEW.fee_date := v_original.fee_date;
    NEW.currency := v_original.currency;
    NEW.fee_mode := v_original.fee_mode;
    NEW.fee_value := v_original.fee_value;
    NEW.settlement_status := 'reversed';
    RETURN NEW;
  END IF;

  IF NEW.supersedes_occurrence_id IS NOT NULL THEN
    IF current_user <> 'postgres'
      OR pg_catalog.current_setting(
        'app.historical_rent_correction_context', true
      ) IS DISTINCT FROM 'checked-historical-rent-v1' THEN
      RAISE EXCEPTION 'management fee successors require the checked authority'
        USING ERRCODE = '42501';
    END IF;
    SELECT original.* INTO STRICT v_original
    FROM public.management_fee_occurrences AS original
    WHERE original.organization_id = NEW.organization_id
      AND original.id = NEW.supersedes_occurrence_id
      AND original.tenant_invoice_id = NEW.tenant_invoice_id
      AND original.reversal_of_id IS NULL
      AND original.supersedes_occurrence_id IS NULL
    FOR KEY SHARE;
    NEW.property_id := v_original.property_id;
    NEW.lease_id := v_original.lease_id;
    NEW.billing_term_id := v_original.billing_term_id;
    NEW.fee_date := v_original.fee_date;
    NEW.currency := v_original.currency;
    NEW.fee_mode := v_original.fee_mode;
    NEW.fee_value := v_original.fee_value;
    NEW.settlement_status := 'owner_due';
    RETURN NEW;
  END IF;

  IF v_invoice.generation_source = 'lease_rules_v1' THEN
    NEW.fee_date := v_invoice.issue_date;
  END IF;
  v_owner_person_id := app_private.resolve_property_owner(
    NEW.organization_id,
    NEW.property_id,
    NEW.fee_date
  );
  PERFORM app_private.create_owner_invoice_line(
    NEW.organization_id,
    NEW.property_id,
    v_owner_person_id,
    NEW.fee_date,
    'management_fee',
    NEW.id,
    'Management fee',
    NULL,
    NEW.amount,
    NEW.created_by
  );
  NEW.settlement_status := 'owner_due';
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.create_management_fee_owner_charge() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.create_management_fee_owner_charge()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.correct_historical_rent(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_corrected_rent_amount numeric,
  p_corrected_due_day integer,
  p_reason text,
  p_preview_hash text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_preview_hash text := pg_catalog.lower(pg_catalog.btrim(
    coalesce(p_preview_hash, '')
  ));
  v_idempotency_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_preview jsonb;
  v_payload jsonb;
  v_claim record;
  v_replay jsonb;
  v_result jsonb;
  v_invoice public.tenant_invoices%ROWTYPE;
  v_original_line public.tenant_invoice_lines%ROWTYPE;
  v_original_income public.finance_income_items%ROWTYPE;
  v_original_fee public.management_fee_occurrences%ROWTYPE;
  v_original_owner_line public.owner_invoice_lines%ROWTYPE;
  v_correction_id uuid := gen_random_uuid();
  v_reversal_line_id uuid := gen_random_uuid();
  v_replacement_line_id uuid := gen_random_uuid();
  v_replacement_income_id uuid := gen_random_uuid();
  v_reversal_fee_id uuid := gen_random_uuid();
  v_replacement_fee_id uuid := gen_random_uuid();
  v_reversal_owner_line_id uuid := gen_random_uuid();
  v_replacement_owner_line_id uuid := gen_random_uuid();
  v_business_date date;
  v_replacement_fee_amount numeric(14,2);
  v_payment record;
  v_confirmation record;
  v_reversal_settlement_id uuid;
  v_replacement_settlement_id uuid;
  v_original_allocations jsonb;
  v_replacement_allocations jsonb;
  v_other_target_settled numeric(14,2);
  v_reapplied_target numeric(14,2) := 0;
  v_target_capacity numeric(14,2);
  v_reapplied_amount numeric(14,2);
  v_credit_amount numeric(14,2);
  v_tenant_credit_total numeric(14,2) := 0;
  v_settlement_count integer := 0;
  v_new_allocation record;
  v_held_allocation record;
  v_held_reversal_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 8 AND 500
    OR pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160
    OR v_preview_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'historical_rent_correction_inputs_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organizationId', p_organization_id,
    'invoiceId', p_invoice_id,
    'correctedRentAmount', p_corrected_rent_amount,
    'correctedDueDay', p_corrected_due_day,
    'reason', v_reason,
    'previewHash', v_preview_hash
  );
  v_replay := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'correct_historical_rent',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'historical_rent_correction_v1',
        p_organization_id::text,
        p_invoice_id::text
      ),
      0
    )
  );

  SELECT invoice.* INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id
  FOR UPDATE;
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;

  v_preview := app_private.build_historical_rent_correction_preview(
    p_organization_id,
    p_invoice_id,
    p_corrected_rent_amount,
    p_corrected_due_day
  );
  IF v_preview->>'previewHash' IS DISTINCT FROM v_preview_hash THEN
    RAISE EXCEPTION 'historical_rent_preview_stale'
      USING ERRCODE = '40001';
  END IF;
  IF NOT coalesce((v_preview->>'canApply')::boolean, false) THEN
    RAISE EXCEPTION 'historical_rent_correction_blocked'
      USING
        ERRCODE = '55000',
        DETAIL = (v_preview->'blockers')::text;
  END IF;

  v_business_date := (v_preview->>'correctionBusinessDate')::date;
  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,
    v_invoice.property_id,
    v_invoice.currency,
    v_business_date
  );

  SELECT claim.* INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'correct_historical_rent',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  SELECT line.* INTO STRICT v_original_line
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.id = (v_preview->>'sourceRentLineId')::uuid
  FOR UPDATE;
  SELECT income.* INTO STRICT v_original_income
  FROM public.finance_income_items AS income
  WHERE income.organization_id = p_organization_id
    AND income.id = (v_preview->>'sourceIncomeItemId')::uuid
  FOR UPDATE;

  SELECT fee.* INTO v_original_fee
  FROM public.management_fee_occurrences AS fee
  WHERE fee.organization_id = p_organization_id
    AND fee.tenant_invoice_id = p_invoice_id
    AND fee.reversal_of_id IS NULL
    AND fee.supersedes_occurrence_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.management_fee_occurrences AS reversal
      WHERE reversal.organization_id = fee.organization_id
        AND reversal.reversal_of_id = fee.id
    )
  FOR UPDATE;
  IF v_original_fee.id IS NOT NULL THEN
    SELECT owner_line.* INTO STRICT v_original_owner_line
    FROM public.owner_invoice_lines AS owner_line
    WHERE owner_line.organization_id = p_organization_id
      AND owner_line.source_type = 'management_fee'
      AND owner_line.source_id = v_original_fee.id
      AND owner_line.reversal_of_id IS NULL
      AND owner_line.supersedes_line_id IS NULL
    FOR UPDATE;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context',
    'checked-invoice-correction-v1',
    true
  );
  PERFORM pg_catalog.set_config(
    'app.historical_rent_correction_context',
    'checked-historical-rent-v1',
    true
  );

  INSERT INTO public.tenant_invoice_corrections (
    id,
    organization_id,
    tenant_invoice_id,
    action,
    target_invoice_line_id,
    property_id,
    unit_id,
    currency,
    evidence_recognized_on,
    affected_line_count,
    reason,
    idempotency_key,
    payload_hash,
    source_identity,
    correction_business_date,
    original_rent_amount,
    corrected_rent_amount,
    original_due_day,
    corrected_due_day,
    original_due_date,
    corrected_due_date,
    source_billing_term_id,
    preview_hash,
    created_by
  ) VALUES (
    v_correction_id,
    p_organization_id,
    p_invoice_id,
    'historical_rent',
    v_original_line.id,
    v_invoice.property_id,
    v_invoice.unit_id,
    v_invoice.currency,
    v_original_line.recognized_on,
    1,
    v_reason,
    v_idempotency_key,
    app_private.canonical_financial_payload_hash(v_payload),
    pg_catalog.jsonb_build_object(
      'tenantInvoiceId', p_invoice_id,
      'invoiceNumber', v_invoice.invoice_number,
      'sourceRentLineId', v_original_line.id,
      'sourceIncomeItemId', v_original_income.id,
      'leaseId', v_invoice.lease_id,
      'leaseTermId', v_invoice.lease_term_id,
      'billingTermId', v_invoice.billing_term_id,
      'billingPeriodStart', v_invoice.billing_period_start,
      'billingPeriodEnd', v_invoice.billing_period_end,
      'issuedTotalAmount', v_invoice.total_amount,
      'issuedDueDate', v_invoice.due_date
    ),
    v_business_date,
    v_original_line.amount,
    p_corrected_rent_amount,
    (v_preview->>'originalDueDay')::integer,
    p_corrected_due_day,
    v_invoice.due_date,
    (v_preview->>'correctedDueDate')::date,
    v_invoice.billing_term_id,
    v_preview_hash,
    v_actor_id
  );

  PERFORM pg_catalog.set_config(
    'app.rent_generation_context', 'lease-derived-v1', true
  );
  INSERT INTO public.finance_income_items (
    id,
    organization_id,
    property_id,
    unit_id,
    lease_id,
    income_type,
    payer_person_id,
    payer_label,
    rent_billing_period_start,
    due_date,
    amount_due,
    amount_received,
    currency,
    status,
    description,
    reference,
    created_by,
    updated_by,
    supersedes_income_item_id,
    correction_occurrence_id
  ) VALUES (
    v_replacement_income_id,
    v_original_income.organization_id,
    v_original_income.property_id,
    v_original_income.unit_id,
    v_original_income.lease_id,
    'rent',
    v_original_income.payer_person_id,
    v_original_income.payer_label,
    v_original_income.rent_billing_period_start,
    (v_preview->>'correctedDueDate')::date,
    p_corrected_rent_amount,
    0,
    v_original_income.currency,
    'open',
    'Corrected historical rent',
    v_original_income.reference,
    v_actor_id,
    v_actor_id,
    v_original_income.id,
    v_correction_id
  );

  INSERT INTO public.tenant_invoice_lines (
    id,
    organization_id,
    invoice_id,
    income_item_id,
    line_type,
    customer_label,
    description,
    amount,
    internal_cost_amount,
    internal_markup_amount,
    sort_order,
    created_by,
    property_id,
    unit_id,
    currency,
    recognized_on,
    reversal_of_id,
    correction_occurrence_id
  ) VALUES (
    v_reversal_line_id,
    p_organization_id,
    p_invoice_id,
    NULL,
    'rent',
    v_original_line.customer_label,
    'Historical rent correction: ' || v_reason,
    -v_original_line.amount,
    NULL,
    0,
    (
      SELECT coalesce(max(line.sort_order), 0) + 1
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
    ),
    v_actor_id,
    v_original_line.property_id,
    v_original_line.unit_id,
    v_original_line.currency,
    v_original_line.recognized_on,
    v_original_line.id,
    v_correction_id
  );

  INSERT INTO public.tenant_invoice_lines (
    id,
    organization_id,
    invoice_id,
    income_item_id,
    line_type,
    customer_label,
    description,
    amount,
    internal_cost_amount,
    internal_markup_amount,
    sort_order,
    created_by,
    property_id,
    unit_id,
    currency,
    recognized_on,
    supersedes_line_id,
    correction_occurrence_id
  ) VALUES (
    v_replacement_line_id,
    p_organization_id,
    p_invoice_id,
    v_replacement_income_id,
    'rent',
    v_original_line.customer_label,
    'Corrected historical rent: ' || v_reason,
    p_corrected_rent_amount,
    NULL,
    0,
    (
      SELECT coalesce(max(line.sort_order), 0) + 1
      FROM public.tenant_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.invoice_id = p_invoice_id
    ),
    v_actor_id,
    v_original_line.property_id,
    v_original_line.unit_id,
    v_original_line.currency,
    v_original_line.recognized_on,
    v_original_line.id,
    v_correction_id
  );

  IF v_original_fee.id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.owner_event_allocation_sets AS allocation_set
      WHERE allocation_set.organization_id = p_organization_id
        AND allocation_set.source_type = 'management_fee_occurrence'
        AND allocation_set.source_line_id = v_original_fee.id
    ) THEN
      PERFORM public.allocate_owner_event(
        p_organization_id,
        'management_fee_occurrence',
        v_original_fee.id,
        'historical-rent-fee-original-' ||
          replace(v_original_fee.id::text, '-', '')
      );
    END IF;

    FOR v_held_allocation IN
      SELECT allocation.*
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.owner_invoice_line_id = v_original_owner_line.id
        AND allocation.reversal_of_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_charge_cash_allocations AS reversal
          WHERE reversal.organization_id = allocation.organization_id
            AND reversal.reversal_of_id = allocation.id
        )
      ORDER BY allocation.allocation_date, allocation.created_at, allocation.id
      FOR UPDATE
    LOOP
      PERFORM public.allocate_owner_event(
        p_organization_id,
        'owner_invoice_payment',
        v_held_allocation.id,
        'historical-rent-owner-cash-original-' ||
          replace(v_held_allocation.id::text, '-', '')
      );
      INSERT INTO public.owner_charge_cash_allocations (
        organization_id,
        property_id,
        owner_invoice_line_id,
        allocation_date,
        amount,
        reversal_of_id,
        created_by
      ) VALUES (
        p_organization_id,
        v_held_allocation.property_id,
        v_held_allocation.owner_invoice_line_id,
        v_business_date,
        -v_held_allocation.amount,
        v_held_allocation.id,
        v_actor_id
      ) RETURNING id INTO v_held_reversal_id;
      PERFORM public.allocate_owner_event(
        p_organization_id,
        'reversal',
        v_held_reversal_id,
        'historical-rent-owner-cash-reversal-' ||
          replace(v_held_reversal_id::text, '-', '')
      );
    END LOOP;

    INSERT INTO public.management_fee_occurrences (
      id,
      organization_id,
      property_id,
      lease_id,
      tenant_invoice_id,
      billing_term_id,
      fee_date,
      amount,
      currency,
      fee_mode,
      fee_value,
      settlement_status,
      created_by,
      reversal_of_id,
      correction_occurrence_id
    ) VALUES (
      v_reversal_fee_id,
      v_original_fee.organization_id,
      v_original_fee.property_id,
      v_original_fee.lease_id,
      v_original_fee.tenant_invoice_id,
      v_original_fee.billing_term_id,
      v_original_fee.fee_date,
      -v_original_fee.amount,
      v_original_fee.currency,
      v_original_fee.fee_mode,
      v_original_fee.fee_value,
      'reversed',
      v_actor_id,
      v_original_fee.id,
      v_correction_id
    );

    INSERT INTO public.owner_invoice_lines (
      id,
      organization_id,
      invoice_id,
      property_id,
      source_type,
      source_id,
      customer_label,
      description,
      amount,
      sort_order,
      created_by,
      recognized_on,
      reversal_of_id,
      correction_occurrence_id
    ) VALUES (
      v_reversal_owner_line_id,
      v_original_owner_line.organization_id,
      v_original_owner_line.invoice_id,
      v_original_owner_line.property_id,
      'management_fee',
      v_reversal_fee_id,
      v_original_owner_line.customer_label,
      'Historical rent correction: ' || v_reason,
      -v_original_owner_line.amount,
      (
        SELECT coalesce(max(line.sort_order), 0) + 1
        FROM public.owner_invoice_lines AS line
        WHERE line.organization_id = v_original_owner_line.organization_id
          AND line.invoice_id = v_original_owner_line.invoice_id
      ),
      v_actor_id,
      v_original_owner_line.recognized_on,
      v_original_owner_line.id,
      v_correction_id
    );

    PERFORM app_private.append_management_fee_owner_effect_reversal(
      v_original_fee.id,
      v_reversal_fee_id,
      v_correction_id,
      v_actor_id
    );

    v_replacement_fee_amount := (
      v_preview->>'replacementManagementFeeAmount'
    )::numeric(14,2);
    IF v_replacement_fee_amount > 0 THEN
      INSERT INTO public.management_fee_occurrences (
        id,
        organization_id,
        property_id,
        lease_id,
        tenant_invoice_id,
        billing_term_id,
        fee_date,
        amount,
        currency,
        fee_mode,
        fee_value,
        settlement_status,
        created_by,
        correction_occurrence_id,
        supersedes_occurrence_id
      ) VALUES (
        v_replacement_fee_id,
        v_original_fee.organization_id,
        v_original_fee.property_id,
        v_original_fee.lease_id,
        v_original_fee.tenant_invoice_id,
        v_original_fee.billing_term_id,
        v_original_fee.fee_date,
        v_replacement_fee_amount,
        v_original_fee.currency,
        v_original_fee.fee_mode,
        v_original_fee.fee_value,
        'owner_due',
        v_actor_id,
        v_correction_id,
        v_original_fee.id
      );

      INSERT INTO public.owner_invoice_lines (
        id,
        organization_id,
        invoice_id,
        property_id,
        source_type,
        source_id,
        customer_label,
        description,
        amount,
        sort_order,
        created_by,
        recognized_on,
        supersedes_line_id,
        correction_occurrence_id
      ) VALUES (
        v_replacement_owner_line_id,
        v_original_owner_line.organization_id,
        v_original_owner_line.invoice_id,
        v_original_owner_line.property_id,
        'management_fee',
        v_replacement_fee_id,
        v_original_owner_line.customer_label,
        'Corrected historical management fee: ' || v_reason,
        v_replacement_fee_amount,
        (
          SELECT coalesce(max(line.sort_order), 0) + 1
          FROM public.owner_invoice_lines AS line
          WHERE line.organization_id = v_original_owner_line.organization_id
            AND line.invoice_id = v_original_owner_line.invoice_id
        ),
        v_actor_id,
        v_original_owner_line.recognized_on,
        v_original_owner_line.id,
        v_correction_id
      );

      PERFORM public.allocate_owner_event(
        p_organization_id,
        'management_fee_occurrence',
        v_replacement_fee_id,
        'historical-rent-fee-' || replace(v_correction_id::text, '-', '')
      );
    END IF;
  END IF;

  -- Replay IPS settlements in stable receipt order. The still-active original
  -- target allocations reserve capacity until their own reversal, ensuring a
  -- deterministic credit choice when several receipts exceed corrected rent.
  FOR v_payment IN
    SELECT payment.*
    FROM public.tenant_invoice_payments AS payment
    WHERE payment.organization_id = p_organization_id
      AND payment.invoice_id = p_invoice_id
      AND payment.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_invoice_payments AS reversal
        WHERE reversal.organization_id = payment.organization_id
          AND reversal.reversal_of_id = payment.id
      )
    ORDER BY payment.received_date, payment.created_at, payment.id
    FOR UPDATE
  LOOP
    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'lineId', allocation.invoice_line_id,
          'amount', allocation.amount
        ) ORDER BY allocation.allocation_order, allocation.id
      ),
      '[]'::jsonb
    ) INTO v_original_allocations
    FROM public.tenant_invoice_payment_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.payment_id = v_payment.id
      AND allocation.reversal_of_allocation_id IS NULL;

    v_reversal_settlement_id := public.reverse_tenant_invoice_payment(
      p_organization_id,
      v_payment.id,
      v_business_date,
      'Historical rent correction: ' || v_reason,
      'historical-rent-reverse-' || replace(v_payment.id::text, '-', '')
    );

    SELECT coalesce(sum(allocation.amount), 0)::numeric(14,2)
    INTO v_other_target_settled
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_payments AS payment
      ON payment.organization_id = allocation.organization_id
     AND payment.id = allocation.payment_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.invoice_line_id = v_original_line.id
      AND allocation.reversal_of_allocation_id IS NULL
      AND payment.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_invoice_payments AS reversal
        WHERE reversal.organization_id = payment.organization_id
          AND reversal.reversal_of_id = payment.id
      );
    v_target_capacity := greatest(
      p_corrected_rent_amount - v_reapplied_target - v_other_target_settled,
      0
    )::numeric(14,2);

    WITH source AS (
      SELECT
        allocation.*,
        CASE
          WHEN allocation.invoice_line_id = v_original_line.id
            THEN least(allocation.amount, v_target_capacity)
          ELSE allocation.amount
        END::numeric(14,2) AS replacement_amount
      FROM public.tenant_invoice_payment_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.payment_id = v_payment.id
        AND allocation.reversal_of_allocation_id IS NULL
    )
    SELECT
      coalesce(sum(source.replacement_amount), 0)::numeric(14,2),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'lineId', CASE
              WHEN source.invoice_line_id = v_original_line.id
                THEN v_replacement_line_id
              ELSE source.invoice_line_id
            END,
            'amount', source.replacement_amount
          ) ORDER BY source.allocation_order, source.id
        ) FILTER (WHERE source.replacement_amount > 0),
        '[]'::jsonb
      ),
      coalesce(sum(source.replacement_amount) FILTER (
        WHERE source.invoice_line_id = v_original_line.id
      ), 0)::numeric(14,2)
    INTO v_reapplied_amount, v_replacement_allocations, v_target_capacity
    FROM source;

    v_credit_amount := (v_payment.amount - v_reapplied_amount)::numeric(14,2);
    v_replacement_settlement_id := NULL;
    IF v_reapplied_amount > 0 THEN
      v_replacement_settlement_id := public.record_tenant_invoice_payment(
        p_organization_id,
        p_invoice_id,
        v_reapplied_amount,
        v_business_date,
        v_payment.reconciliation_source_id,
        pg_catalog.concat_ws(
          ' · ', NULLIF(v_payment.reference, ''), 'Historical rent correction'
        ),
        v_replacement_allocations,
        'historical-rent-reapply-' || replace(v_payment.id::text, '-', '')
      );
      FOR v_new_allocation IN
        SELECT allocation.id
        FROM public.tenant_invoice_payment_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.payment_id = v_replacement_settlement_id
        ORDER BY allocation.allocation_order, allocation.id
      LOOP
        PERFORM public.allocate_owner_event(
          p_organization_id,
          'tenant_rent_receipt',
          v_new_allocation.id,
          'historical-rent-owner-' || replace(v_new_allocation.id::text, '-', '')
        );
      END LOOP;
    END IF;

    INSERT INTO public.historical_rent_settlement_reapplications (
      organization_id,
      correction_occurrence_id,
      settlement_kind,
      original_settlement_id,
      reversal_settlement_id,
      replacement_settlement_id,
      original_amount,
      reapplied_amount,
      credit_amount,
      original_allocation_snapshot,
      replacement_allocation_snapshot,
      created_by
    ) VALUES (
      p_organization_id,
      v_correction_id,
      'ips_payment',
      v_payment.id,
      v_reversal_settlement_id,
      v_replacement_settlement_id,
      v_payment.amount,
      v_reapplied_amount,
      v_credit_amount,
      v_original_allocations,
      v_replacement_allocations,
      v_actor_id
    );

    IF v_credit_amount > 0 THEN
      INSERT INTO public.tenant_credit_occurrences (
        organization_id,
        correction_occurrence_id,
        tenant_invoice_id,
        lease_id,
        property_id,
        unit_id,
        tenant_person_id,
        currency,
        occurred_on,
        amount,
        custody_kind,
        source_settlement_kind,
        source_settlement_id,
        reason,
        created_by
      ) VALUES (
        p_organization_id,
        v_correction_id,
        p_invoice_id,
        v_invoice.lease_id,
        v_invoice.property_id,
        v_invoice.unit_id,
        v_invoice.recipient_person_id,
        v_invoice.currency,
        v_business_date,
        v_credit_amount,
        'ips_held',
        'ips_payment',
        v_payment.id,
        v_reason,
        v_actor_id
      );
    END IF;
    v_reapplied_target := (v_reapplied_target + v_target_capacity)::numeric(14,2);
    v_tenant_credit_total := (
      v_tenant_credit_total + v_credit_amount
    )::numeric(14,2);
    v_settlement_count := v_settlement_count + 1;
  END LOOP;

  -- Direct-to-owner evidence follows the same reversal/reapplication chain.
  FOR v_confirmation IN
    SELECT confirmation.*
    FROM public.owner_collection_confirmations AS confirmation
    WHERE confirmation.organization_id = p_organization_id
      AND confirmation.invoice_id = p_invoice_id
      AND confirmation.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_collection_confirmations AS reversal
        WHERE reversal.organization_id = confirmation.organization_id
          AND reversal.reversal_of_id = confirmation.id
      )
    ORDER BY confirmation.confirmed_date, confirmation.created_at, confirmation.id
    FOR UPDATE
  LOOP
    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'lineId', allocation.invoice_line_id,
          'amount', allocation.amount
        ) ORDER BY allocation.allocation_order, allocation.id
      ),
      '[]'::jsonb
    ) INTO v_original_allocations
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.confirmation_id = v_confirmation.id
      AND allocation.reversal_of_allocation_id IS NULL;

    v_reversal_settlement_id := public.reverse_owner_collection_confirmation(
      p_organization_id,
      v_confirmation.id,
      v_business_date,
      'Historical rent correction: ' || v_reason,
      'historical-rent-reverse-' || replace(v_confirmation.id::text, '-', '')
    );

    SELECT coalesce(sum(allocation.amount), 0)::numeric(14,2)
    INTO v_other_target_settled
    FROM public.owner_collection_confirmation_allocations AS allocation
    JOIN public.owner_collection_confirmations AS confirmation
      ON confirmation.organization_id = allocation.organization_id
     AND confirmation.id = allocation.confirmation_id
    WHERE allocation.organization_id = p_organization_id
      AND allocation.invoice_line_id = v_original_line.id
      AND allocation.reversal_of_allocation_id IS NULL
      AND confirmation.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_collection_confirmations AS reversal
        WHERE reversal.organization_id = confirmation.organization_id
          AND reversal.reversal_of_id = confirmation.id
      );
    v_target_capacity := greatest(
      p_corrected_rent_amount - v_reapplied_target - v_other_target_settled,
      0
    )::numeric(14,2);

    WITH source AS (
      SELECT
        allocation.*,
        CASE
          WHEN allocation.invoice_line_id = v_original_line.id
            THEN least(allocation.amount, v_target_capacity)
          ELSE allocation.amount
        END::numeric(14,2) AS replacement_amount
      FROM public.owner_collection_confirmation_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.confirmation_id = v_confirmation.id
        AND allocation.reversal_of_allocation_id IS NULL
    )
    SELECT
      coalesce(sum(source.replacement_amount), 0)::numeric(14,2),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'lineId', CASE
              WHEN source.invoice_line_id = v_original_line.id
                THEN v_replacement_line_id
              ELSE source.invoice_line_id
            END,
            'amount', source.replacement_amount
          ) ORDER BY source.allocation_order, source.id
        ) FILTER (WHERE source.replacement_amount > 0),
        '[]'::jsonb
      ),
      coalesce(sum(source.replacement_amount) FILTER (
        WHERE source.invoice_line_id = v_original_line.id
      ), 0)::numeric(14,2)
    INTO v_reapplied_amount, v_replacement_allocations, v_target_capacity
    FROM source;

    v_credit_amount := (
      v_confirmation.amount - v_reapplied_amount
    )::numeric(14,2);
    v_replacement_settlement_id := NULL;
    IF v_reapplied_amount > 0 THEN
      v_replacement_settlement_id := public.confirm_owner_collected_rent(
        p_organization_id,
        p_invoice_id,
        v_reapplied_amount,
        v_business_date,
        pg_catalog.concat_ws(
          ' · ',
          NULLIF(v_confirmation.reference, ''),
          'Historical rent correction'
        ),
        v_replacement_allocations,
        'historical-rent-reapply-' || replace(v_confirmation.id::text, '-', '')
      );
      FOR v_new_allocation IN
        SELECT allocation.id
        FROM public.owner_collection_confirmation_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.confirmation_id = v_replacement_settlement_id
        ORDER BY allocation.allocation_order, allocation.id
      LOOP
        PERFORM public.allocate_owner_event(
          p_organization_id,
          'owner_direct_rent_receipt',
          v_new_allocation.id,
          'historical-rent-owner-' || replace(v_new_allocation.id::text, '-', '')
        );
      END LOOP;
    END IF;

    INSERT INTO public.historical_rent_settlement_reapplications (
      organization_id,
      correction_occurrence_id,
      settlement_kind,
      original_settlement_id,
      reversal_settlement_id,
      replacement_settlement_id,
      original_amount,
      reapplied_amount,
      credit_amount,
      original_allocation_snapshot,
      replacement_allocation_snapshot,
      created_by
    ) VALUES (
      p_organization_id,
      v_correction_id,
      'owner_confirmation',
      v_confirmation.id,
      v_reversal_settlement_id,
      v_replacement_settlement_id,
      v_confirmation.amount,
      v_reapplied_amount,
      v_credit_amount,
      v_original_allocations,
      v_replacement_allocations,
      v_actor_id
    );

    IF v_credit_amount > 0 THEN
      INSERT INTO public.tenant_credit_occurrences (
        organization_id,
        correction_occurrence_id,
        tenant_invoice_id,
        lease_id,
        property_id,
        unit_id,
        tenant_person_id,
        owner_person_id,
        currency,
        occurred_on,
        amount,
        custody_kind,
        source_settlement_kind,
        source_settlement_id,
        reason,
        created_by
      ) VALUES (
        p_organization_id,
        v_correction_id,
        p_invoice_id,
        v_invoice.lease_id,
        v_invoice.property_id,
        v_invoice.unit_id,
        v_invoice.recipient_person_id,
        v_confirmation.owner_person_id,
        v_invoice.currency,
        v_business_date,
        v_credit_amount,
        'owner_held',
        'owner_confirmation',
        v_confirmation.id,
        v_reason,
        v_actor_id
      );
    END IF;
    v_reapplied_target := (v_reapplied_target + v_target_capacity)::numeric(14,2);
    v_tenant_credit_total := (
      v_tenant_credit_total + v_credit_amount
    )::numeric(14,2);
    v_settlement_count := v_settlement_count + 1;
  END LOOP;

  IF v_original_fee.id IS NOT NULL AND v_replacement_fee_amount > 0 THEN
    PERFORM app_private.apply_available_owner_cash(
      p_organization_id,
      v_invoice.property_id,
      v_business_date,
      v_actor_id
    );
    FOR v_new_allocation IN
      SELECT allocation.id
      FROM public.owner_charge_cash_allocations AS allocation
      WHERE allocation.organization_id = p_organization_id
        AND allocation.owner_invoice_line_id = v_replacement_owner_line_id
        AND allocation.reversal_of_id IS NULL
      ORDER BY allocation.allocation_date, allocation.created_at, allocation.id
    LOOP
      PERFORM public.allocate_owner_event(
        p_organization_id,
        'owner_invoice_payment',
        v_new_allocation.id,
        'historical-rent-owner-cash-reapply-' ||
          replace(v_new_allocation.id::text, '-', '')
      );
    END LOOP;
  END IF;

  PERFORM app_private.mark_tenant_rent_owner_periods_stale(
    p_organization_id,
    v_invoice.property_id,
    v_invoice.currency,
    ARRAY[v_original_line.id],
    v_correction_id,
    v_actor_id
  );

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
    'tenant_invoice',
    p_invoice_id,
    'historical_rent_corrected',
    v_payload || pg_catalog.jsonb_build_object(
      'correctionId', v_correction_id,
      'replacementRentLineId', v_replacement_line_id,
      'replacementIncomeItemId', v_replacement_income_id,
      'settlementReplayCount', v_settlement_count,
      'tenantCreditAmount', v_tenant_credit_total
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'correctionId', v_correction_id,
    'invoiceId', p_invoice_id,
    'replacementRentLineId', v_replacement_line_id,
    'replacementIncomeItemId', v_replacement_income_id,
    'settlementReplayCount', v_settlement_count,
    'tenantCreditAmount', v_tenant_credit_total,
    'correctedRentAmount', p_corrected_rent_amount,
    'correctedDueDate', v_preview->>'correctedDueDate'
  );
  v_result := app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );

  PERFORM pg_catalog.set_config(
    'app.historical_rent_correction_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context', '', true
  );
  PERFORM pg_catalog.set_config('app.rent_generation_context', '', true);
  PERFORM pg_catalog.set_config('app.owner_balance_write_context', '', true);
  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', '', true
  );
  PERFORM pg_catalog.set_config('app.owner_close_write_context', '', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config(
    'app.historical_rent_correction_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context', '', true
  );
  PERFORM pg_catalog.set_config('app.rent_generation_context', '', true);
  PERFORM pg_catalog.set_config('app.owner_balance_write_context', '', true);
  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', '', true
  );
  PERFORM pg_catalog.set_config('app.owner_close_write_context', '', true);
  RAISE;
END;
$$;

ALTER FUNCTION public.correct_historical_rent(
  uuid, uuid, numeric, integer, text, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.correct_historical_rent(
  uuid, uuid, numeric, integer, text, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.correct_historical_rent(
  uuid, uuid, numeric, integer, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.preview_historical_rent_correction(
  uuid, uuid, numeric, integer
) IS
  'Super Admin preview of one append-only issued historical-rent correction, including settlement, fee, credit, and Owner Close blockers.';
COMMENT ON FUNCTION public.correct_historical_rent(
  uuid, uuid, numeric, integer, text, text, text
) IS
  'Super Admin append-only replacement of one issued historical rent obligation with checked settlement replay and immutable owner evidence.';
COMMENT ON TABLE public.historical_rent_settlement_reapplications IS
  'Immutable links from original receipt or owner-confirmation evidence to its checked reversal and replacement after a historical-rent correction.';
COMMENT ON TABLE public.tenant_credit_occurrences IS
  'Immutable tenant cash-liability evidence created when corrected historical rent is lower than already allocated settlement.';
