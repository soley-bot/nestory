-- Canonical tenant-invoice correction and owner-charge reversal authority.
-- All correction evidence is append-only. The issued invoice header is retained
-- as source evidence while signed reversal rows drive balances and recognition.

ALTER TABLE public.tenant_invoice_lines
  ADD COLUMN property_id uuid,
  ADD COLUMN unit_id uuid,
  ADD COLUMN currency public.currency_code,
  ADD COLUMN recognized_on date,
  ADD COLUMN reversal_of_id uuid,
  ADD COLUMN correction_occurrence_id uuid;

UPDATE public.tenant_invoice_lines AS line
SET
  property_id = invoice.property_id,
  unit_id = invoice.unit_id,
  currency = invoice.currency,
  recognized_on = invoice.issue_date
FROM public.tenant_invoices AS invoice
WHERE invoice.organization_id = line.organization_id
  AND invoice.id = line.invoice_id;

ALTER TABLE public.tenant_invoice_lines
  ALTER COLUMN property_id SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN recognized_on SET NOT NULL,
  ALTER COLUMN income_item_id DROP NOT NULL,
  DROP CONSTRAINT tenant_invoice_lines_amount_check,
  DROP CONSTRAINT tenant_invoice_lines_internal_split_check,
  ADD CONSTRAINT tenant_invoice_lines_amount_check CHECK (
    (reversal_of_id IS NULL AND amount > 0)
    OR (reversal_of_id IS NOT NULL AND amount < 0)
  ),
  ADD CONSTRAINT tenant_invoice_lines_internal_split_check CHECK ((
    (
      reversal_of_id IS NULL
      AND internal_markup_amount >= 0
      AND (internal_cost_amount IS NULL OR internal_cost_amount >= 0)
    ) OR (
      reversal_of_id IS NOT NULL
      AND internal_markup_amount <= 0
      AND (internal_cost_amount IS NULL OR internal_cost_amount <= 0)
    )
  ) AND (
    internal_cost_amount IS NULL
    OR amount = internal_cost_amount + internal_markup_amount
  )),
  ADD CONSTRAINT tenant_invoice_lines_reversal_evidence_check CHECK (
    (reversal_of_id IS NULL AND correction_occurrence_id IS NULL AND income_item_id IS NOT NULL)
    OR (reversal_of_id IS NOT NULL AND correction_occurrence_id IS NOT NULL AND income_item_id IS NULL)
  ),
  ADD CONSTRAINT tenant_invoice_lines_not_self_reversal_check CHECK (
    reversal_of_id IS NULL OR reversal_of_id <> id
  ),
  ADD CONSTRAINT tenant_invoice_lines_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_invoice_lines_unit_fkey
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_invoice_lines_reversal_fkey
    FOREIGN KEY (organization_id, reversal_of_id)
    REFERENCES public.tenant_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_invoice_lines_reversal_unique UNIQUE (reversal_of_id);

CREATE INDEX tenant_invoice_lines_recognition_idx
  ON public.tenant_invoice_lines (
    organization_id, property_id, currency, recognized_on, id
  );
CREATE INDEX tenant_invoice_lines_correction_idx
  ON public.tenant_invoice_lines (organization_id, correction_occurrence_id)
  WHERE correction_occurrence_id IS NOT NULL;
CREATE INDEX tenant_invoice_lines_reversal_idx
  ON public.tenant_invoice_lines (organization_id, reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;
CREATE INDEX tenant_invoice_lines_unit_idx
  ON public.tenant_invoice_lines (organization_id, unit_id)
  WHERE unit_id IS NOT NULL;

CREATE TABLE public.tenant_invoice_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  tenant_invoice_id uuid NOT NULL,
  action text NOT NULL,
  target_invoice_line_id uuid,
  property_id uuid NOT NULL,
  unit_id uuid,
  currency public.currency_code NOT NULL,
  evidence_recognized_on date NOT NULL,
  affected_line_count integer NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  source_identity jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  CONSTRAINT tenant_invoice_corrections_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT tenant_invoice_corrections_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT tenant_invoice_corrections_action_check CHECK (
    (action = 'void' AND target_invoice_line_id IS NULL)
    OR (action = 'line_correction' AND target_invoice_line_id IS NOT NULL)
  ),
  CONSTRAINT tenant_invoice_corrections_line_count_check CHECK (
    affected_line_count > 0
  ),
  CONSTRAINT tenant_invoice_corrections_reason_check CHECK (
    length(btrim(reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT tenant_invoice_corrections_idempotency_check CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 160
  ),
  CONSTRAINT tenant_invoice_corrections_payload_hash_check CHECK (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT tenant_invoice_corrections_source_identity_check CHECK (
    jsonb_typeof(source_identity) = 'object'
    AND source_identity <> '{}'::jsonb
  ),
  CONSTRAINT tenant_invoice_corrections_organization_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_corrections_invoice_fkey
    FOREIGN KEY (organization_id, tenant_invoice_id)
    REFERENCES public.tenant_invoices(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_corrections_target_line_fkey
    FOREIGN KEY (organization_id, target_invoice_line_id)
    REFERENCES public.tenant_invoice_lines(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_corrections_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_corrections_unit_fkey
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_corrections_actor_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX tenant_invoice_corrections_invoice_idx
  ON public.tenant_invoice_corrections (
    organization_id, tenant_invoice_id, created_at, id
  );
CREATE INDEX tenant_invoice_corrections_property_idx
  ON public.tenant_invoice_corrections (
    organization_id, property_id, created_at, id
  );
CREATE INDEX tenant_invoice_corrections_target_line_idx
  ON public.tenant_invoice_corrections (
    organization_id, target_invoice_line_id
  ) WHERE target_invoice_line_id IS NOT NULL;
CREATE INDEX tenant_invoice_corrections_unit_idx
  ON public.tenant_invoice_corrections (organization_id, unit_id)
  WHERE unit_id IS NOT NULL;
CREATE INDEX tenant_invoice_corrections_actor_idx
  ON public.tenant_invoice_corrections (created_by);

ALTER TABLE public.tenant_invoice_lines
  ADD CONSTRAINT tenant_invoice_lines_correction_fkey
  FOREIGN KEY (organization_id, correction_occurrence_id)
  REFERENCES public.tenant_invoice_corrections(organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.management_fee_occurrences
  ADD COLUMN reversal_of_id uuid,
  ADD COLUMN correction_occurrence_id uuid,
  DROP CONSTRAINT management_fee_occurrences_invoice_unique,
  DROP CONSTRAINT management_fee_occurrences_amount_check,
  DROP CONSTRAINT management_fee_occurrences_status_check,
  ADD CONSTRAINT management_fee_occurrences_amount_check CHECK (
    (reversal_of_id IS NULL AND amount > 0)
    OR (reversal_of_id IS NOT NULL AND amount < 0)
  ),
  ADD CONSTRAINT management_fee_occurrences_status_check CHECK (
    settlement_status IN (
      'unsettled', 'held_cash', 'owner_due', 'split', 'settled', 'reversed'
    )
  ),
  ADD CONSTRAINT management_fee_occurrences_reversal_evidence_check CHECK (
    (reversal_of_id IS NULL AND correction_occurrence_id IS NULL AND settlement_status <> 'reversed')
    OR (reversal_of_id IS NOT NULL AND correction_occurrence_id IS NOT NULL AND settlement_status = 'reversed')
  ),
  ADD CONSTRAINT management_fee_occurrences_not_self_reversal_check CHECK (
    reversal_of_id IS NULL OR reversal_of_id <> id
  ),
  ADD CONSTRAINT management_fee_occurrences_reversal_fkey
    FOREIGN KEY (organization_id, reversal_of_id)
    REFERENCES public.management_fee_occurrences(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT management_fee_occurrences_correction_fkey
    FOREIGN KEY (organization_id, correction_occurrence_id)
    REFERENCES public.tenant_invoice_corrections(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT management_fee_occurrences_reversal_unique
    UNIQUE (reversal_of_id);

CREATE UNIQUE INDEX management_fee_occurrences_original_invoice_unique
  ON public.management_fee_occurrences (organization_id, tenant_invoice_id)
  WHERE reversal_of_id IS NULL;
CREATE INDEX management_fee_occurrences_correction_idx
  ON public.management_fee_occurrences (
    organization_id, correction_occurrence_id
  ) WHERE correction_occurrence_id IS NOT NULL;
CREATE INDEX management_fee_occurrences_reversal_idx
  ON public.management_fee_occurrences (organization_id, reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

ALTER TABLE public.owner_invoice_lines
  ADD COLUMN recognized_on date;

UPDATE public.owner_invoice_lines AS line
SET recognized_on = invoice.issue_date
FROM public.owner_invoices AS invoice
WHERE invoice.organization_id = line.organization_id
  AND invoice.id = line.invoice_id;

ALTER TABLE public.owner_invoice_lines
  ADD COLUMN reversal_of_id uuid,
  ADD COLUMN correction_occurrence_id uuid,
  ALTER COLUMN recognized_on SET NOT NULL,
  DROP CONSTRAINT owner_invoice_lines_amount_check,
  ADD CONSTRAINT owner_invoice_lines_amount_check CHECK (
    (reversal_of_id IS NULL AND amount > 0)
    OR (reversal_of_id IS NOT NULL AND amount < 0)
  ),
  ADD CONSTRAINT owner_invoice_lines_reversal_evidence_check CHECK (
    (reversal_of_id IS NULL AND correction_occurrence_id IS NULL)
    OR (reversal_of_id IS NOT NULL AND correction_occurrence_id IS NOT NULL)
  ),
  ADD CONSTRAINT owner_invoice_lines_not_self_reversal_check CHECK (
    reversal_of_id IS NULL OR reversal_of_id <> id
  ),
  ADD CONSTRAINT owner_invoice_lines_reversal_fkey
    FOREIGN KEY (organization_id, reversal_of_id)
    REFERENCES public.owner_invoice_lines(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_invoice_lines_correction_fkey
    FOREIGN KEY (organization_id, correction_occurrence_id)
    REFERENCES public.tenant_invoice_corrections(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_invoice_lines_reversal_unique UNIQUE (reversal_of_id);

CREATE INDEX owner_invoice_lines_recognition_idx
  ON public.owner_invoice_lines (
    organization_id, property_id, recognized_on, id
  );
CREATE INDEX owner_invoice_lines_correction_idx
  ON public.owner_invoice_lines (organization_id, correction_occurrence_id)
  WHERE correction_occurrence_id IS NOT NULL;
CREATE INDEX owner_invoice_lines_reversal_idx
  ON public.owner_invoice_lines (organization_id, reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.guard_tenant_invoice_correction_occurrence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'tenant invoice correction occurrences are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF current_user <> 'postgres'
    OR pg_catalog.current_setting(
      'app.tenant_invoice_correction_context', true
    ) IS DISTINCT FROM 'checked-invoice-correction-v1' THEN
    RAISE EXCEPTION 'tenant invoice corrections require the checked authority'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_tenant_invoice_correction_occurrence()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_tenant_invoice_correction_occurrence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_tenant_invoice_corrections_append_only
BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_invoice_corrections
FOR EACH ROW EXECUTE FUNCTION app_private.guard_tenant_invoice_correction_occurrence();

CREATE OR REPLACE FUNCTION app_private.prepare_tenant_invoice_line_recognition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_invoice public.tenant_invoices%ROWTYPE;
  v_original public.tenant_invoice_lines%ROWTYPE;
BEGIN
  SELECT invoice.* INTO STRICT v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = NEW.organization_id
    AND invoice.id = NEW.invoice_id
  FOR KEY SHARE;

  IF NEW.reversal_of_id IS NOT NULL THEN
    IF current_user <> 'postgres'
      OR pg_catalog.current_setting(
        'app.tenant_invoice_correction_context', true
      ) IS DISTINCT FROM 'checked-invoice-correction-v1' THEN
      RAISE EXCEPTION 'tenant invoice reversals require the checked authority'
        USING ERRCODE = '42501';
    END IF;
    SELECT original.* INTO STRICT v_original
    FROM public.tenant_invoice_lines AS original
    WHERE original.organization_id = NEW.organization_id
      AND original.id = NEW.reversal_of_id
      AND original.invoice_id = NEW.invoice_id
      AND original.reversal_of_id IS NULL
    FOR KEY SHARE;
    NEW.property_id := v_original.property_id;
    NEW.unit_id := v_original.unit_id;
    NEW.currency := v_original.currency;
    NEW.recognized_on := v_original.recognized_on;
  ELSE
    NEW.property_id := v_invoice.property_id;
    NEW.unit_id := v_invoice.unit_id;
    NEW.currency := v_invoice.currency;
    IF NEW.recognized_on IS NULL THEN
      NEW.recognized_on := CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.tenant_invoice_lines AS existing
          WHERE existing.organization_id = NEW.organization_id
            AND existing.invoice_id = NEW.invoice_id
        ) THEN current_date
        ELSE v_invoice.issue_date
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.prepare_tenant_invoice_line_recognition()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.prepare_tenant_invoice_line_recognition()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER prepare_tenant_invoice_line_recognition
BEFORE INSERT ON public.tenant_invoice_lines
FOR EACH ROW EXECUTE FUNCTION app_private.prepare_tenant_invoice_line_recognition();

CREATE OR REPLACE FUNCTION app_private.prepare_owner_invoice_line_recognition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_original public.owner_invoice_lines%ROWTYPE;
BEGIN
  IF NEW.reversal_of_id IS NOT NULL THEN
    IF current_user <> 'postgres'
      OR pg_catalog.current_setting(
        'app.tenant_invoice_correction_context', true
      ) IS DISTINCT FROM 'checked-invoice-correction-v1' THEN
      RAISE EXCEPTION 'owner invoice reversals require the checked authority'
        USING ERRCODE = '42501';
    END IF;
    SELECT original.* INTO STRICT v_original
    FROM public.owner_invoice_lines AS original
    WHERE original.organization_id = NEW.organization_id
      AND original.id = NEW.reversal_of_id
      AND original.reversal_of_id IS NULL
    FOR KEY SHARE;
    NEW.recognized_on := v_original.recognized_on;
    NEW.property_id := v_original.property_id;
  ELSIF NEW.recognized_on IS NULL THEN
    SELECT invoice.issue_date INTO STRICT NEW.recognized_on
    FROM public.owner_invoices AS invoice
    WHERE invoice.organization_id = NEW.organization_id
      AND invoice.id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.prepare_owner_invoice_line_recognition()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.prepare_owner_invoice_line_recognition()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER prepare_owner_invoice_line_recognition
BEFORE INSERT ON public.owner_invoice_lines
FOR EACH ROW EXECUTE FUNCTION app_private.prepare_owner_invoice_line_recognition();

CREATE OR REPLACE FUNCTION app_private.create_owner_invoice_line(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_issue_date date,
  p_source_type text,
  p_source_id uuid,
  p_customer_label text,
  p_description text,
  p_amount numeric,
  p_actor_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_invoice_id uuid;
  v_line_id uuid;
  v_sort_order integer;
BEGIN
  SELECT line.id INTO v_line_id
  FROM public.owner_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.source_type = p_source_type
    AND line.source_id = p_source_id;
  IF FOUND THEN
    RETURN v_line_id;
  END IF;

  v_invoice_id := app_private.get_or_create_owner_invoice(
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    p_issue_date,
    p_actor_id
  );
  SELECT coalesce(max(line.sort_order), 0) + 1 INTO v_sort_order
  FROM public.owner_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.invoice_id = v_invoice_id;

  INSERT INTO public.owner_invoice_lines (
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
    recognized_on
  ) VALUES (
    p_organization_id,
    v_invoice_id,
    p_property_id,
    p_source_type,
    p_source_id,
    trim(p_customer_label),
    NULLIF(trim(coalesce(p_description, '')), ''),
    p_amount,
    v_sort_order,
    p_actor_id,
    p_issue_date
  )
  RETURNING id INTO v_line_id;
  RETURN v_line_id;
END;
$$;

ALTER FUNCTION app_private.create_owner_invoice_line(
  uuid, uuid, uuid, date, text, uuid, text, text, numeric, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.create_owner_invoice_line(
  uuid, uuid, uuid, date, text, uuid, text, text, numeric, uuid
) FROM PUBLIC, anon, authenticated, service_role;

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

  -- The lease-rules generator is the forward authority in this lane. Preserve
  -- legacy insertion semantics while aligning every new lease-rules fee with
  -- the issued invoice's recognition date.
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

CREATE OR REPLACE FUNCTION app_private.tenant_invoice_line_outstanding(
  p_organization_id uuid,
  p_invoice_line_id uuid
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN line.reversal_of_id IS NOT NULL OR EXISTS (
      SELECT 1
      FROM public.tenant_invoice_lines AS reversal
      WHERE reversal.organization_id = line.organization_id
        AND reversal.reversal_of_id = line.id
    ) THEN 0::numeric(14,2)
    ELSE greatest(
      line.amount
        + coalesce((
          SELECT sum(adjustment.amount)
          FROM public.expense_customer_adjustments AS adjustment
          WHERE adjustment.organization_id = p_organization_id
            AND adjustment.responsibility = 'tenant'
            AND adjustment.tenant_income_item_id = line.income_item_id
        ), 0)
        - coalesce((
          SELECT sum(allocation.signed_amount)
          FROM public.finance_receipt_allocations AS allocation
          WHERE allocation.organization_id = p_organization_id
            AND allocation.income_item_id = line.income_item_id
        ), 0)
        - coalesce((
          SELECT sum(allocation.signed_amount)
          FROM public.owner_collection_confirmation_allocations AS allocation
          WHERE allocation.organization_id = p_organization_id
            AND allocation.invoice_line_id = p_invoice_line_id
            AND allocation.settlement_contract_version = 'owner_collection.v1'
        ), 0),
      0
    )::numeric(14,2)
  END
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.id = p_invoice_line_id;
$$;

CREATE OR REPLACE FUNCTION app_private.owner_invoice_line_outstanding(
  p_organization_id uuid,
  p_owner_invoice_line_id uuid
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN line.reversal_of_id IS NOT NULL OR EXISTS (
      SELECT 1
      FROM public.owner_invoice_lines AS reversal
      WHERE reversal.organization_id = line.organization_id
        AND reversal.reversal_of_id = line.id
    ) THEN 0::numeric(14,2)
    ELSE greatest(
      line.amount
        + coalesce((
          SELECT sum(adjustment.amount)
          FROM public.expense_customer_adjustments AS adjustment
          WHERE adjustment.organization_id = line.organization_id
            AND adjustment.responsibility = 'owner'
            AND adjustment.responsibility_id = line.source_id
        ), 0)
        - coalesce((
          SELECT sum(allocation.amount)
          FROM public.owner_charge_cash_allocations AS allocation
          WHERE allocation.organization_id = line.organization_id
            AND allocation.owner_invoice_line_id = line.id
        ), 0)
        - coalesce((
          SELECT sum(allocation.amount)
          FROM public.owner_payment_allocations AS allocation
          WHERE allocation.organization_id = line.organization_id
            AND allocation.owner_invoice_line_id = line.id
        ), 0),
      0
    )::numeric(14,2)
  END
  FROM public.owner_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.id = p_owner_invoice_line_id;
$$;

CREATE OR REPLACE VIEW public.tenant_invoice_balances
WITH (security_invoker = true)
AS
WITH line_reversals AS (
  SELECT
    line.organization_id,
    line.invoice_id,
    sum(line.amount)::numeric(14,2) AS amount
  FROM public.tenant_invoice_lines AS line
  WHERE line.reversal_of_id IS NOT NULL
  GROUP BY line.organization_id, line.invoice_id
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
      + coalesce(line_reversals.amount, 0)
      + coalesce(tenant_adjustments.amount, 0)
    )::numeric(14,2) AS adjusted_total,
    coalesce(ips_paid.amount, 0)::numeric(14,2) AS paid_through_ips,
    coalesce(owner_paid.amount, 0)::numeric(14,2) AS collected_by_owner
  FROM public.tenant_invoices AS invoice
  LEFT JOIN line_reversals
    ON line_reversals.organization_id = invoice.organization_id
   AND line_reversals.invoice_id = invoice.id
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
  invoice.due_date,
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
    AND invoice.due_date < current_date
    AND totals.paid_through_ips + totals.collected_by_owner < totals.adjusted_total
    AS is_overdue
FROM public.tenant_invoices AS invoice
JOIN totals
  ON totals.organization_id = invoice.organization_id
 AND totals.invoice_id = invoice.id;

ALTER VIEW public.tenant_invoice_balances OWNER TO postgres;
GRANT SELECT ON public.tenant_invoice_balances TO authenticated;

CREATE OR REPLACE FUNCTION app_private.append_management_fee_owner_effect_reversal(
  p_original_fee_id uuid,
  p_reversal_fee_id uuid,
  p_correction_id uuid,
  p_actor_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_original_fee public.management_fee_occurrences%ROWTYPE;
  v_reversal_fee public.management_fee_occurrences%ROWTYPE;
  v_original_set public.owner_event_allocation_sets%ROWTYPE;
  v_reversal_set_id uuid;
  v_original_owner record;
  v_original_movement record;
  v_roster record;
  v_owner_allocation_id uuid;
  v_original_fingerprint text;
  v_reversal_fingerprint text;
BEGIN
  SELECT fee.* INTO STRICT v_original_fee
  FROM public.management_fee_occurrences AS fee
  WHERE fee.id = p_original_fee_id
    AND fee.reversal_of_id IS NULL
  FOR KEY SHARE;

  SELECT fee.* INTO STRICT v_reversal_fee
  FROM public.management_fee_occurrences AS fee
  WHERE fee.organization_id = v_original_fee.organization_id
    AND fee.id = p_reversal_fee_id
    AND fee.reversal_of_id = v_original_fee.id
  FOR KEY SHARE;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'invoice_correction_management_fee_owner_effect_v1',
        v_original_fee.organization_id::text,
        v_original_fee.id::text
      ),
      0
    )
  );

  v_original_fingerprint := app_private.canonical_financial_payload_hash(
    pg_catalog.jsonb_build_object(
      'source_type', 'management_fee_occurrence',
      'source_line_id', v_original_fee.id::text,
      'tenant_invoice_id', v_original_fee.tenant_invoice_id::text,
      'property_id', v_original_fee.property_id::text,
      'currency', v_original_fee.currency::text,
      'event_date', v_original_fee.fee_date::text,
      'amount', pg_catalog.to_char(v_original_fee.amount, 'FM999999999990.00'),
      'fee_mode', v_original_fee.fee_mode,
      'fee_value', v_original_fee.fee_value::text
    )
  );

  SELECT allocation_set.* INTO v_original_set
  FROM public.owner_event_allocation_sets AS allocation_set
  WHERE allocation_set.organization_id = v_original_fee.organization_id
    AND allocation_set.source_type = 'management_fee_occurrence'
    AND allocation_set.source_line_id = v_original_fee.id
  FOR UPDATE;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context',
    'checked-owner-balance-v1',
    true
  );

  IF v_original_set.id IS NULL THEN
    INSERT INTO public.owner_event_allocation_sets (
      organization_id,
      property_id,
      currency,
      event_date,
      source_type,
      source_id,
      source_line_id,
      gross_signed_amount,
      source_fingerprint,
      allocation_basis,
      explicit_owner_person_id,
      reversal_of_allocation_set_id,
      idempotency_key,
      command_payload_hash,
      created_by
    ) VALUES (
      v_original_fee.organization_id,
      v_original_fee.property_id,
      v_original_fee.currency,
      v_original_fee.fee_date,
      'management_fee_occurrence',
      v_original_fee.id,
      v_original_fee.id,
      v_original_fee.amount,
      v_original_fingerprint,
      'effective_roster',
      NULL,
      NULL,
      'invoice-correction-owner-original-' || replace(v_original_fee.id::text, '-', ''),
      app_private.canonical_financial_payload_hash(
        pg_catalog.jsonb_build_object(
          'operation', 'invoice_correction_ensure_original_owner_effect',
          'correction_id', p_correction_id::text,
          'management_fee_id', v_original_fee.id::text
        )
      ),
      p_actor_id
    )
    RETURNING * INTO v_original_set;

    FOR v_roster IN
      SELECT allocation.*
      FROM app_private.allocate_owner_roster_amount(
        v_original_fee.organization_id,
        v_original_fee.property_id,
        v_original_fee.fee_date,
        v_original_fee.amount
      ) AS allocation
      ORDER BY allocation.allocation_order
    LOOP
      INSERT INTO public.owner_event_owner_allocations (
        allocation_set_id,
        organization_id,
        property_owner_id,
        owner_person_id,
        ownership_percent_snapshot,
        ownership_started_on_snapshot,
        ownership_ended_on_snapshot,
        ownership_roster_hash,
        allocated_gross_signed_amount,
        allocation_order,
        created_by
      ) VALUES (
        v_original_set.id,
        v_original_fee.organization_id,
        v_roster.property_owner_id,
        v_roster.owner_person_id,
        v_roster.ownership_percent,
        v_roster.started_on,
        v_roster.ended_on,
        v_roster.ownership_roster_hash,
        v_roster.allocated_amount,
        v_roster.allocation_order,
        p_actor_id
      )
      RETURNING id INTO v_owner_allocation_id;

      INSERT INTO public.owner_component_movements (
        organization_id,
        owner_event_owner_allocation_id,
        property_id,
        owner_person_id,
        currency,
        event_date,
        month_start,
        component,
        signed_amount,
        movement_order,
        created_by
      ) VALUES (
        v_original_fee.organization_id,
        v_owner_allocation_id,
        v_original_fee.property_id,
        v_roster.owner_person_id,
        v_original_fee.currency,
        v_original_fee.fee_date,
        pg_catalog.date_trunc('month', v_original_fee.fee_date)::date,
        'owner_due_to_ips',
        v_roster.allocated_amount,
        1,
        p_actor_id
      );
    END LOOP;
  ELSIF v_original_set.source_fingerprint IS DISTINCT FROM v_original_fingerprint THEN
    RAISE EXCEPTION 'source_fingerprint_drift' USING ERRCODE = '23514';
  END IF;

  SELECT allocation_set.id INTO v_reversal_set_id
  FROM public.owner_event_allocation_sets AS allocation_set
  WHERE allocation_set.organization_id = v_original_fee.organization_id
    AND allocation_set.reversal_of_allocation_set_id = v_original_set.id;
  IF v_reversal_set_id IS NOT NULL THEN
    RETURN v_reversal_set_id;
  END IF;

  v_reversal_fingerprint := app_private.canonical_financial_payload_hash(
    pg_catalog.jsonb_build_object(
      'source_type', 'management_fee_occurrence',
      'source_line_id', v_reversal_fee.id::text,
      'tenant_invoice_id', v_reversal_fee.tenant_invoice_id::text,
      'property_id', v_reversal_fee.property_id::text,
      'currency', v_reversal_fee.currency::text,
      'event_date', v_reversal_fee.fee_date::text,
      'amount', pg_catalog.to_char(v_reversal_fee.amount, 'FM999999999990.00'),
      'fee_mode', v_reversal_fee.fee_mode,
      'fee_value', v_reversal_fee.fee_value::text
    )
  );

  INSERT INTO public.owner_event_allocation_sets (
    organization_id,
    property_id,
    currency,
    event_date,
    source_type,
    source_id,
    source_line_id,
    gross_signed_amount,
    source_fingerprint,
    allocation_basis,
    explicit_owner_person_id,
    reversal_of_allocation_set_id,
    idempotency_key,
    command_payload_hash,
    created_by
  ) VALUES (
    v_reversal_fee.organization_id,
    v_original_set.property_id,
    v_original_set.currency,
    v_reversal_fee.fee_date,
    'management_fee_occurrence',
    v_reversal_fee.id,
    v_reversal_fee.id,
    -v_original_set.gross_signed_amount,
    v_reversal_fingerprint,
    v_original_set.allocation_basis,
    v_original_set.explicit_owner_person_id,
    v_original_set.id,
    'invoice-correction-owner-reversal-' || replace(v_reversal_fee.id::text, '-', ''),
    app_private.canonical_financial_payload_hash(
      pg_catalog.jsonb_build_object(
        'operation', 'invoice_correction_reverse_owner_effect',
        'correction_id', p_correction_id::text,
        'management_fee_reversal_id', v_reversal_fee.id::text,
        'reversal_of_allocation_set_id', v_original_set.id::text
      )
    ),
    p_actor_id
  )
  RETURNING id INTO v_reversal_set_id;

  FOR v_original_owner IN
    SELECT owner_allocation.*
    FROM public.owner_event_owner_allocations AS owner_allocation
    WHERE owner_allocation.organization_id = v_original_fee.organization_id
      AND owner_allocation.allocation_set_id = v_original_set.id
    ORDER BY owner_allocation.allocation_order
  LOOP
    INSERT INTO public.owner_event_owner_allocations (
      allocation_set_id,
      organization_id,
      property_owner_id,
      owner_person_id,
      ownership_percent_snapshot,
      ownership_started_on_snapshot,
      ownership_ended_on_snapshot,
      ownership_roster_hash,
      allocated_gross_signed_amount,
      allocation_order,
      created_by
    ) VALUES (
      v_reversal_set_id,
      v_original_fee.organization_id,
      v_original_owner.property_owner_id,
      v_original_owner.owner_person_id,
      v_original_owner.ownership_percent_snapshot,
      v_original_owner.ownership_started_on_snapshot,
      v_original_owner.ownership_ended_on_snapshot,
      v_original_owner.ownership_roster_hash,
      -v_original_owner.allocated_gross_signed_amount,
      v_original_owner.allocation_order,
      p_actor_id
    )
    RETURNING id INTO v_owner_allocation_id;

    FOR v_original_movement IN
      SELECT movement.*
      FROM public.owner_component_movements AS movement
      WHERE movement.organization_id = v_original_fee.organization_id
        AND movement.owner_event_owner_allocation_id = v_original_owner.id
      ORDER BY movement.movement_order
    LOOP
      INSERT INTO public.owner_component_movements (
        organization_id,
        owner_event_owner_allocation_id,
        property_id,
        owner_person_id,
        currency,
        event_date,
        month_start,
        component,
        signed_amount,
        movement_order,
        reversal_of_movement_id,
        created_by
      ) VALUES (
        v_original_fee.organization_id,
        v_owner_allocation_id,
        v_original_movement.property_id,
        v_original_movement.owner_person_id,
        v_original_movement.currency,
        v_reversal_fee.fee_date,
        pg_catalog.date_trunc('month', v_reversal_fee.fee_date)::date,
        v_original_movement.component,
        -v_original_movement.signed_amount,
        v_original_movement.movement_order,
        v_original_movement.id,
        p_actor_id
      );
    END LOOP;
  END LOOP;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context',
    'checked-rollforward-v1',
    true
  );
  UPDATE public.owner_balance_periods AS period
  SET
    status = 'stale',
    closed_revision_id = NULL,
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = 'tenant_invoice_correction:' || p_correction_id::text
  WHERE period.organization_id = v_original_fee.organization_id
    AND period.property_id = v_original_fee.property_id
    AND period.currency = v_original_fee.currency
    AND period.owner_person_id IN (
      SELECT owner_allocation.owner_person_id
      FROM public.owner_event_owner_allocations AS owner_allocation
      WHERE owner_allocation.organization_id = v_original_fee.organization_id
        AND owner_allocation.allocation_set_id = v_original_set.id
    )
    AND period.month_start >= pg_catalog.date_trunc(
      'month', v_original_fee.fee_date
    )::date
    AND period.status IN ('blocked', 'ready', 'stale', 'closed');

  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context',
    'checked-owner-close-v1',
    true
  );
  UPDATE public.owner_close_series AS series
  SET
    state = 'stale',
    active_revision_id = series.current_closed_revision_id,
    state_changed_at = pg_catalog.now(),
    state_changed_by = p_actor_id
  WHERE series.organization_id = v_original_fee.organization_id
    AND series.property_id = v_original_fee.property_id
    AND series.currency = v_original_fee.currency
    AND series.owner_person_id IN (
      SELECT owner_allocation.owner_person_id
      FROM public.owner_event_owner_allocations AS owner_allocation
      WHERE owner_allocation.organization_id = v_original_fee.organization_id
        AND owner_allocation.allocation_set_id = v_original_set.id
    )
    AND series.month_start >= pg_catalog.date_trunc(
      'month', v_original_fee.fee_date
    )::date
    AND series.current_closed_revision_id IS NOT NULL
    AND series.state = 'closed';

  RETURN v_reversal_set_id;
END;
$$;

ALTER FUNCTION app_private.append_management_fee_owner_effect_reversal(
  uuid, uuid, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.append_management_fee_owner_effect_reversal(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.mark_tenant_rent_owner_periods_stale(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_target_line_ids uuid[],
  p_correction_id uuid,
  p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF current_user <> 'postgres'
    OR pg_catalog.current_setting(
      'app.tenant_invoice_correction_context', true
    ) IS DISTINCT FROM 'checked-invoice-correction-v1' THEN
    RAISE EXCEPTION 'owner periods require the checked invoice correction authority'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context',
    'checked-rollforward-v1',
    true
  );
  UPDATE public.owner_balance_periods AS period
  SET
    status = 'stale',
    closed_revision_id = NULL,
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = 'tenant_invoice_correction:' || p_correction_id::text
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.currency = p_currency
    AND period.status IN ('blocked', 'ready', 'stale', 'closed')
    AND EXISTS (
      SELECT 1
      FROM public.tenant_invoice_lines AS line
      CROSS JOIN LATERAL app_private.validate_owner_roster_on_date(
        p_organization_id,
        p_property_id,
        line.recognized_on
      ) AS roster
      WHERE line.organization_id = p_organization_id
        AND line.id = ANY(p_target_line_ids)
        AND line.line_type = 'rent'
        AND roster.owner_person_id = period.owner_person_id
        AND period.month_start >= pg_catalog.date_trunc(
          'month', line.recognized_on
        )::date
    );

  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context',
    'checked-owner-close-v1',
    true
  );
  UPDATE public.owner_close_series AS series
  SET
    state = 'stale',
    active_revision_id = series.current_closed_revision_id,
    state_changed_at = pg_catalog.now(),
    state_changed_by = p_actor_id
  WHERE series.organization_id = p_organization_id
    AND series.property_id = p_property_id
    AND series.currency = p_currency
    AND series.current_closed_revision_id IS NOT NULL
    AND series.state = 'closed'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_invoice_lines AS line
      CROSS JOIN LATERAL app_private.validate_owner_roster_on_date(
        p_organization_id,
        p_property_id,
        line.recognized_on
      ) AS roster
      WHERE line.organization_id = p_organization_id
        AND line.id = ANY(p_target_line_ids)
        AND line.line_type = 'rent'
        AND roster.owner_person_id = series.owner_person_id
        AND series.month_start >= pg_catalog.date_trunc(
          'month', line.recognized_on
        )::date
    );
END;
$$;

ALTER FUNCTION app_private.mark_tenant_rent_owner_periods_stale(
  uuid, uuid, public.currency_code, uuid[], uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.mark_tenant_rent_owner_periods_stale(
  uuid, uuid, public.currency_code, uuid[], uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.correct_tenant_invoice(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_action text,
  p_target_invoice_line_id uuid,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_action text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_idempotency_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_invoice public.tenant_invoices%ROWTYPE;
  v_fee public.management_fee_occurrences%ROWTYPE;
  v_owner_line public.owner_invoice_lines%ROWTYPE;
  v_claim record;
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_result jsonb;
  v_correction_id uuid := gen_random_uuid();
  v_reversal_fee_id uuid := gen_random_uuid();
  v_target_line_ids uuid[];
  v_target_count integer;
  v_min_recognized_on date;
  v_has_owner_effect boolean;
  v_line_reversal_count integer := 0;
  v_fee_reversal_count integer := 0;
  v_owner_line_reversal_count integer := 0;
  v_owner_allocation_reversal_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'tenant_invoice_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT invoice.* INTO v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id;
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'tenant_invoice_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    PERFORM app_private.begin_finance_property_authority(
      p_organization_id,
      v_invoice.property_id,
      'finance.correct_records'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'tenant_invoice_correction_forbidden'
      USING ERRCODE = '42501';
  END;

  IF v_action NOT IN ('void', 'line_correction')
    OR (v_action = 'void' AND p_target_invoice_line_id IS NOT NULL)
    OR (v_action = 'line_correction' AND p_target_invoice_line_id IS NULL) THEN
    RAISE EXCEPTION 'tenant_invoice_correction_action_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'tenant_invoice_correction_reason_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'tenant_invoice_correction_idempotency_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'invoice_id', p_invoice_id::text,
    'action', v_action,
    'target_invoice_line_id', p_target_invoice_line_id::text,
    'reason', v_reason
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);
  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'correct_tenant_invoice',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id, NULL, 'finance.correct_records', false
    );
    RETURN v_replay_result;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'tenant_invoice_correction_v1',
        p_organization_id::text, p_invoice_id::text
      ),
      0
    )
  );
  SELECT invoice.* INTO STRICT v_invoice
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.id = p_invoice_id
  FOR UPDATE;

  SELECT claim.* INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'correct_tenant_invoice',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id, NULL, 'finance.correct_records', false
    );
    RETURN v_claim.result_ids;
  END IF;

  IF v_invoice.lifecycle <> 'issued' THEN
    RAISE EXCEPTION 'tenant_invoice_not_issued' USING ERRCODE = '22023';
  END IF;

  SELECT
    pg_catalog.array_agg(line.id ORDER BY line.sort_order, line.id),
    pg_catalog.count(*)::integer,
    pg_catalog.min(line.recognized_on),
    pg_catalog.bool_or(line.line_type = 'rent')
  INTO
    v_target_line_ids,
    v_target_count,
    v_min_recognized_on,
    v_has_owner_effect
  FROM public.tenant_invoice_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.invoice_id = p_invoice_id
    AND line.reversal_of_id IS NULL
    AND (v_action = 'void' OR line.id = p_target_invoice_line_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_invoice_lines AS reversal
      WHERE reversal.organization_id = line.organization_id
        AND reversal.reversal_of_id = line.id
    );
  IF v_target_count = 0 THEN
    RAISE EXCEPTION 'tenant_invoice_correction_target_missing'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
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
  ) OR EXISTS (
    SELECT 1
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
  ) OR EXISTS (
    SELECT 1
    FROM public.finance_receipt_allocations AS allocation
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id
     AND line.income_item_id = allocation.income_item_id
    WHERE allocation.organization_id = p_organization_id
      AND line.invoice_id = p_invoice_id
    GROUP BY allocation.organization_id, allocation.income_item_id
    HAVING pg_catalog.sum(allocation.signed_amount) <> 0
  ) OR EXISTS (
    SELECT 1
    FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = p_organization_id
      AND allocation.invoice_id = p_invoice_id
    GROUP BY allocation.organization_id, allocation.invoice_line_id
    HAVING pg_catalog.sum(allocation.signed_amount) <> 0
  ) THEN
    RAISE EXCEPTION 'tenant_invoice_settlement_active'
      USING ERRCODE = '23514';
  END IF;

  IF v_has_owner_effect THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenant_invoice_lines AS line
      CROSS JOIN LATERAL app_private.validate_owner_roster_on_date(
        p_organization_id,
        v_invoice.property_id,
        line.recognized_on
      ) AS roster
      JOIN public.owner_close_series AS series
        ON series.organization_id = p_organization_id
       AND series.property_id = v_invoice.property_id
       AND series.owner_person_id = roster.owner_person_id
       AND series.currency = v_invoice.currency
       AND series.month_start = pg_catalog.date_trunc(
         'month', line.recognized_on
       )::date
      WHERE line.organization_id = p_organization_id
        AND line.id = ANY(v_target_line_ids)
        AND line.line_type = 'rent'
        AND series.state IN ('closed', 'stale')
        AND series.current_closed_revision_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'owner_close_period_closed' USING ERRCODE = '55000';
    END IF;

    SELECT fee.* INTO v_fee
    FROM public.management_fee_occurrences AS fee
    WHERE fee.organization_id = p_organization_id
      AND fee.tenant_invoice_id = p_invoice_id
      AND fee.reversal_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.management_fee_occurrences AS reversal
        WHERE reversal.organization_id = fee.organization_id
          AND reversal.reversal_of_id = fee.id
      )
    FOR UPDATE;

    IF v_fee.id IS NOT NULL THEN
      SELECT line.* INTO v_owner_line
      FROM public.owner_invoice_lines AS line
      WHERE line.organization_id = p_organization_id
        AND line.source_type = 'management_fee'
        AND line.source_id = v_fee.id
        AND line.reversal_of_id IS NULL
      FOR UPDATE;

      IF v_owner_line.id IS NOT NULL AND (
        EXISTS (
          SELECT 1
          FROM public.owner_charge_cash_allocations AS allocation
          WHERE allocation.organization_id = p_organization_id
            AND allocation.owner_invoice_line_id = v_owner_line.id
            AND allocation.reversal_of_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.owner_charge_cash_allocations AS reversal
              WHERE reversal.organization_id = allocation.organization_id
                AND reversal.reversal_of_id = allocation.id
            )
        ) OR EXISTS (
          SELECT 1
          FROM public.owner_payment_allocations AS allocation
          WHERE allocation.organization_id = p_organization_id
            AND allocation.owner_invoice_line_id = v_owner_line.id
            AND allocation.reversal_of_allocation_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.owner_payment_allocations AS reversal
              WHERE reversal.organization_id = allocation.organization_id
                AND reversal.reversal_of_allocation_id = allocation.id
            )
        )
      ) THEN
        RAISE EXCEPTION 'owner_invoice_settlement_active'
          USING ERRCODE = '23514';
      END IF;

      IF EXISTS (
        WITH original_set AS (
          SELECT allocation_set.id
          FROM public.owner_event_allocation_sets AS allocation_set
          WHERE allocation_set.organization_id = p_organization_id
            AND allocation_set.source_type = 'management_fee_occurrence'
            AND allocation_set.source_line_id = v_fee.id
        ), affected_owners AS (
          SELECT owner_allocation.owner_person_id
          FROM original_set
          JOIN public.owner_event_owner_allocations AS owner_allocation
            ON owner_allocation.organization_id = p_organization_id
           AND owner_allocation.allocation_set_id = original_set.id
          UNION
          SELECT roster.owner_person_id
          FROM app_private.validate_owner_roster_on_date(
            p_organization_id,
            v_fee.property_id,
            v_fee.fee_date
          ) AS roster
          WHERE NOT EXISTS (SELECT 1 FROM original_set)
        )
        SELECT 1
        FROM affected_owners AS owner
        JOIN public.owner_close_series AS series
          ON series.organization_id = p_organization_id
         AND series.property_id = v_fee.property_id
         AND series.owner_person_id = owner.owner_person_id
         AND series.currency = v_fee.currency
         AND series.month_start = pg_catalog.date_trunc(
           'month', v_fee.fee_date
         )::date
        WHERE series.state IN ('closed', 'stale')
          AND series.current_closed_revision_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'owner_close_period_closed' USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context',
    'checked-invoice-correction-v1',
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
    created_by
  ) VALUES (
    v_correction_id,
    p_organization_id,
    p_invoice_id,
    v_action,
    p_target_invoice_line_id,
    v_invoice.property_id,
    v_invoice.unit_id,
    v_invoice.currency,
    v_min_recognized_on,
    v_target_count,
    v_reason,
    v_idempotency_key,
    v_payload_hash,
    pg_catalog.jsonb_build_object(
      'tenant_invoice_id', p_invoice_id::text,
      'invoice_number', v_invoice.invoice_number,
      'target_invoice_line_ids', to_jsonb(v_target_line_ids),
      'issue_date', v_invoice.issue_date::text,
      'property_id', v_invoice.property_id::text,
      'unit_id', v_invoice.unit_id::text,
      'currency', v_invoice.currency::text
    ),
    v_actor_id
  );

  INSERT INTO public.tenant_invoice_lines (
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
  )
  SELECT
    original.organization_id,
    original.invoice_id,
    NULL,
    original.line_type,
    original.customer_label,
    'Correction: ' || v_reason,
    -original.amount,
    CASE
      WHEN original.internal_cost_amount IS NULL THEN NULL
      ELSE -original.internal_cost_amount
    END,
    -original.internal_markup_amount,
    (
      SELECT coalesce(pg_catalog.max(existing.sort_order), 0)
      FROM public.tenant_invoice_lines AS existing
      WHERE existing.organization_id = p_organization_id
        AND existing.invoice_id = p_invoice_id
    ) + pg_catalog.row_number() OVER (
      ORDER BY original.sort_order, original.id
    ),
    v_actor_id,
    original.property_id,
    original.unit_id,
    original.currency,
    original.recognized_on,
    original.id,
    v_correction_id
  FROM public.tenant_invoice_lines AS original
  WHERE original.organization_id = p_organization_id
    AND original.id = ANY(v_target_line_ids);
  GET DIAGNOSTICS v_line_reversal_count = ROW_COUNT;

  IF v_fee.id IS NOT NULL THEN
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
      v_fee.organization_id,
      v_fee.property_id,
      v_fee.lease_id,
      v_fee.tenant_invoice_id,
      v_fee.billing_term_id,
      v_fee.fee_date,
      -v_fee.amount,
      v_fee.currency,
      v_fee.fee_mode,
      v_fee.fee_value,
      'reversed',
      v_actor_id,
      v_fee.id,
      v_correction_id
    );
    v_fee_reversal_count := 1;

    IF v_owner_line.id IS NOT NULL THEN
      INSERT INTO public.owner_invoice_lines (
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
        v_owner_line.organization_id,
        v_owner_line.invoice_id,
        v_owner_line.property_id,
        'management_fee',
        v_reversal_fee_id,
        v_owner_line.customer_label,
        'Correction: ' || v_reason,
        -v_owner_line.amount,
        (
          SELECT coalesce(pg_catalog.max(line.sort_order), 0) + 1
          FROM public.owner_invoice_lines AS line
          WHERE line.organization_id = v_owner_line.organization_id
            AND line.invoice_id = v_owner_line.invoice_id
        ),
        v_actor_id,
        v_owner_line.recognized_on,
        v_owner_line.id,
        v_correction_id
      );
      v_owner_line_reversal_count := 1;
    END IF;

    PERFORM app_private.append_management_fee_owner_effect_reversal(
      v_fee.id,
      v_reversal_fee_id,
      v_correction_id,
      v_actor_id
    );
    v_owner_allocation_reversal_count := 1;
  END IF;

  IF v_has_owner_effect THEN
    PERFORM app_private.mark_tenant_rent_owner_periods_stale(
      p_organization_id,
      v_invoice.property_id,
      v_invoice.currency,
      v_target_line_ids,
      v_correction_id,
      v_actor_id
    );
  END IF;

  IF v_action = 'void' THEN
    UPDATE public.tenant_invoices AS invoice
    SET
      lifecycle = 'void',
      voided_at = pg_catalog.now(),
      voided_by = v_actor_id
    WHERE invoice.organization_id = p_organization_id
      AND invoice.id = p_invoice_id;
  END IF;

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
    'tenant_invoice_' || v_action,
    v_payload || pg_catalog.jsonb_build_object(
      'correction_id', v_correction_id::text,
      'affected_line_ids', to_jsonb(v_target_line_ids),
      'payload_hash', v_payload_hash
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'correction_id', v_correction_id::text,
    'invoice_id', p_invoice_id::text,
    'action', v_action,
    'tenant_line_reversal_count', v_line_reversal_count,
    'management_fee_reversal_count', v_fee_reversal_count,
    'owner_invoice_line_reversal_count', v_owner_line_reversal_count,
    'owner_allocation_reversal_count', v_owner_allocation_reversal_count
  );
  v_result := app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context', '', true
  );
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id, NULL, 'finance.correct_records', false
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config(
    'app.tenant_invoice_correction_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', '', true
  );
  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context', '', true
  );
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id, NULL, 'finance.correct_records', false
  );
  RAISE;
END;
$$;

ALTER FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) TO authenticated;

ALTER TABLE public.tenant_invoice_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invoice_corrections FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_invoice_corrections_branch_select
ON public.tenant_invoice_corrections
FOR SELECT
TO authenticated
USING (
  app_private.can_read_finance_property(organization_id, property_id)
);

REVOKE ALL ON TABLE public.tenant_invoice_corrections
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_invoice_corrections TO authenticated;

COMMENT ON TABLE public.tenant_invoice_corrections IS
  'Immutable checked occurrences for tenant-invoice voids and line corrections.';
COMMENT ON COLUMN public.tenant_invoice_lines.recognized_on IS
  'Invoice issue date for the first line; current date explicitly stamped for later appended lines; reversals preserve the original date.';
COMMENT ON FUNCTION public.correct_tenant_invoice(
  uuid, uuid, text, uuid, text, text
) IS
  'Atomically appends tenant, management-fee, owner-charge, and owner-balance reversals after settlement and Owner Close guards.';
