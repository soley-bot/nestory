CREATE TABLE public.tenant_invoice_rent_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  lease_term_id uuid NOT NULL,
  segment_order integer NOT NULL,
  segment_start date NOT NULL,
  segment_end date NOT NULL,
  full_period_amount numeric(14,2) NOT NULL,
  amount numeric(14,2) NOT NULL,
  proration_rule text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT tenant_invoice_rent_segments_org_id_unique
    UNIQUE (organization_id, id),
  CONSTRAINT tenant_invoice_rent_segments_invoice_order_unique
    UNIQUE (invoice_id, segment_order),
  CONSTRAINT tenant_invoice_rent_segments_invoice_term_unique
    UNIQUE (invoice_id, lease_term_id),
  CONSTRAINT tenant_invoice_rent_segments_order_check
    CHECK (segment_order > 0),
  CONSTRAINT tenant_invoice_rent_segments_dates_check
    CHECK (segment_end >= segment_start),
  CONSTRAINT tenant_invoice_rent_segments_amount_check
    CHECK (
      full_period_amount > 0
      AND full_period_amount = pg_catalog.round(full_period_amount, 2)
      AND amount >= 0
      AND amount = pg_catalog.round(amount, 2)
    ),
  CONSTRAINT tenant_invoice_rent_segments_rule_check
    CHECK (proration_rule IN (
      'full_period',
      'billing_override',
      'prorate_actual_days',
      'prorate_thirty_day',
      'next_full_period',
      'legacy_snapshot'
    )),
  CONSTRAINT tenant_invoice_rent_segments_invoice_fk
    FOREIGN KEY (organization_id, invoice_id)
    REFERENCES public.tenant_invoices (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_rent_segments_term_fk
    FOREIGN KEY (organization_id, lease_id, lease_term_id)
    REFERENCES public.lease_terms (organization_id, lease_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_invoice_rent_segments_actor_fk
    FOREIGN KEY (created_by)
    REFERENCES auth.users (id)
    ON DELETE RESTRICT
);

ALTER TABLE public.tenant_invoice_rent_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invoice_rent_segments FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read tenant rent segments"
ON public.tenant_invoice_rent_segments
FOR SELECT TO authenticated
USING (
  (SELECT app_private.can_read_finance(
    tenant_invoice_rent_segments.organization_id
  ))
);

REVOKE ALL ON TABLE public.tenant_invoice_rent_segments
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_invoice_rent_segments TO authenticated;

INSERT INTO public.tenant_invoice_rent_segments (
  organization_id,
  invoice_id,
  lease_id,
  lease_term_id,
  segment_order,
  segment_start,
  segment_end,
  full_period_amount,
  amount,
  proration_rule,
  created_by
)
SELECT
  invoice.organization_id,
  invoice.id,
  invoice.lease_id,
  invoice.lease_term_id,
  1,
  greatest(invoice.billing_period_start, term.start_date),
  least(invoice.billing_period_end, term.end_date),
  invoice.base_rent_amount,
  invoice.total_amount,
  'legacy_snapshot',
  invoice.created_by
FROM public.tenant_invoices AS invoice
JOIN public.lease_terms AS term
  ON term.organization_id = invoice.organization_id
 AND term.lease_id = invoice.lease_id
 AND term.id = invoice.lease_term_id;

CREATE OR REPLACE FUNCTION app_private.guard_tenant_invoice_rent_segments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $guard$
BEGIN
  IF TG_OP = 'INSERT'
    AND pg_catalog.current_setting(
      'app.rent_generation_context',
      true
    ) = 'lease-derived-v1' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'tenant_invoice_rent_segments_immutable'
    USING ERRCODE = '55000';
END;
$guard$;

ALTER FUNCTION app_private.guard_tenant_invoice_rent_segments() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_tenant_invoice_rent_segments()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_tenant_invoice_rent_segments
BEFORE INSERT OR UPDATE OR DELETE
ON public.tenant_invoice_rent_segments
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_tenant_invoice_rent_segments();

CREATE OR REPLACE FUNCTION app_private.generate_lease_rent_invoice(p_organization_id uuid, p_lease_id uuid, p_billing_period_start date, p_issue_date date, p_generation_source text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lease record;
  v_term public.lease_terms%ROWTYPE;
  v_billing public.lease_billing_terms%ROWTYPE;
  v_policy public.rent_policy_versions%ROWTYPE;
  v_recipient public.people%ROWTYPE;
  v_existing_income public.finance_income_items%ROWTYPE;
  v_term_count integer;
  v_period_end date;
  v_effective_date date;
  v_due_day integer;
  v_days_in_month integer;
  v_due_date date;
  v_next_month date;
  v_next_month_days integer;
  v_rent_amount numeric(14, 2);
  v_fee_base numeric(14, 2);
  v_fee_amount numeric(14, 2) := 0;
  v_is_prorated boolean := false;
  v_invoice_id uuid;
  v_income_item_id uuid;
  v_line_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_occupant_labels text[];
BEGIN
  IF p_organization_id IS NULL
    OR p_lease_id IS NULL
    OR p_billing_period_start IS NULL
    OR p_issue_date IS NULL
    OR p_generation_source NOT IN (
      'scheduled',
      'activation_catch_up',
      'manual_recovery'
    )
    OR p_billing_period_start IS DISTINCT FROM
      date_trunc('month', p_billing_period_start)::date THEN
    RAISE EXCEPTION 'A lease, monthly billing period, issue date, and generation source are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_id IS NULL
    OR NOT (
      EXISTS (
        SELECT 1
        FROM public.organization_members AS membership
        WHERE membership.organization_id = p_organization_id
          AND membership.user_id = p_actor_id
          AND membership.role = 'super_admin'
      )
      OR app_private.is_checked_current_rent_retry_generation(
        p_organization_id,
        p_lease_id,
        p_billing_period_start,
        p_issue_date,
        p_generation_source,
        p_actor_id
      )
    ) THEN
    RAISE EXCEPTION 'A Super Admin is required for automatic rent generation'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'lease_derived_rent_v1',
        p_organization_id,
        p_lease_id,
        p_billing_period_start
      ),
      0
    )
  );

  SELECT invoice.id
  INTO v_invoice_id
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id = p_organization_id
    AND invoice.lease_id = p_lease_id
    AND invoice.billing_period_start = p_billing_period_start;

  IF FOUND THEN
    RETURN v_invoice_id;
  END IF;

  v_invoice_id := gen_random_uuid();

  SELECT lease.*, person.display_name AS tenant_name
  INTO v_lease
  FROM public.leases AS lease
  JOIN public.people AS person
    ON person.organization_id = lease.organization_id
    AND person.id = lease.primary_tenant_person_id
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
    AND lease.archived_at IS NULL
  FOR SHARE OF lease, person;

  IF NOT FOUND OR (
    p_generation_source = 'manual_recovery'
    AND v_lease.status NOT IN (
      'active',
      'notice_given',
      'ended',
      'terminated'
    )
  ) OR (
    p_generation_source <> 'manual_recovery'
    AND v_lease.status NOT IN ('active', 'notice_given')
  ) THEN
    RAISE EXCEPTION 'The lease is not eligible for this rent month'
      USING ERRCODE = '23514';
  END IF;

  v_period_end := (
    p_billing_period_start + interval '1 month - 1 day'
  )::date;

  IF app_private.is_financial_month_locked(
    p_organization_id,
    p_billing_period_start
  ) THEN
    RAISE EXCEPTION 'This month is locked; unlock it before generating rent'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*)::integer
  INTO v_term_count
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start;

  IF v_term_count < 1 THEN
    RAISE EXCEPTION 'Confirm one authoritative lease term for this month'
      USING ERRCODE = '23514';
  END IF;

  SELECT term.*
  INTO STRICT v_term
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY term.start_date, term.term_sequence, term.id
  LIMIT 1;

  v_effective_date := greatest(
    p_billing_period_start,
    v_term.start_date
  );

  IF EXISTS (
    SELECT 1
    FROM public.lease_terms AS term
    WHERE term.organization_id = p_organization_id
      AND term.lease_id = p_lease_id
      AND term.authority_kind = 'authoritative'
      AND (
        (
          p_generation_source = 'manual_recovery'
          AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
        )
        OR (
          p_generation_source <> 'manual_recovery'
          AND term.status IN ('active', 'upcoming')
        )
      )
      AND term.archived_at IS NULL
      AND term.start_date <= v_period_end
      AND term.end_date >= p_billing_period_start
      AND (
        term.payment_frequency IS DISTINCT FROM 'monthly'
        OR term.rent_currency IS DISTINCT FROM v_term.rent_currency
      )
  ) THEN
    RAISE EXCEPTION 'Automatic rent requires monthly terms in one currency'
      USING ERRCODE = '0A000';
  END IF;

  PERFORM app_private.lock_open_property_financial_month(
    p_organization_id,
    v_lease.property_id,
    v_term.rent_currency,
    p_billing_period_start
  );

  SELECT policy.*
  INTO v_policy
  FROM public.rent_policy_versions AS policy
  WHERE policy.organization_id = p_organization_id
    AND policy.lifecycle IN ('approved', 'superseded')
    AND policy.effective_from <= v_effective_date
  ORDER BY policy.effective_from DESC, policy.version_number DESC, policy.id DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_policy.rent_calculation_timezone IS NULL
    OR NOT ('monthly' = ANY(v_policy.supported_frequencies)) THEN
    RAISE EXCEPTION 'Approve a complete monthly rent policy before generating rent'
      USING ERRCODE = '23514';
  END IF;

  SELECT billing.*
  INTO v_billing
  FROM public.lease_billing_terms AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.lease_id = p_lease_id
    AND billing.archived_at IS NULL
    AND v_effective_date BETWEEN billing.effective_from AND billing.effective_to
  ORDER BY billing.effective_from DESC, billing.created_at DESC, billing.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complete lease billing setup before generating rent'
      USING ERRCODE = '23514';
  END IF;

  SELECT people.*
  INTO v_recipient
  FROM public.people AS people
  WHERE people.organization_id = p_organization_id
    AND people.id = v_billing.billing_recipient_person_id
    AND (
      p_generation_source = 'manual_recovery'
      OR people.archived_at IS NULL
    );

  IF NOT FOUND
    OR v_recipient.party_type IS DISTINCT FROM v_billing.billing_recipient_kind THEN
    RAISE EXCEPTION 'The lease billing recipient is no longer valid'
      USING ERRCODE = '23503';
  END IF;

  v_due_day := CASE v_policy.due_day_source
    WHEN 'term' THEN v_term.rent_due_day
    WHEN 'policy_default' THEN v_policy.policy_default_due_day
    ELSE NULL
  END;

  IF v_due_day IS NULL OR v_due_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'Complete the rent due-day configuration before generating rent'
      USING ERRCODE = '23514';
  END IF;

  v_days_in_month := extract(day FROM v_period_end)::integer;

  IF v_due_day <= v_days_in_month
    OR v_policy.short_month_due_day_rule = 'last_calendar_day' THEN
    v_due_date := pg_catalog.make_date(
      extract(year FROM p_billing_period_start)::integer,
      extract(month FROM p_billing_period_start)::integer,
      least(v_due_day, v_days_in_month)
    );
  ELSE
    v_next_month := (p_billing_period_start + interval '1 month')::date;
    v_next_month_days := extract(
      day FROM (v_next_month + interval '1 month - 1 day')::date
    )::integer;
    v_due_date := pg_catalog.make_date(
      extract(year FROM v_next_month)::integer,
      extract(month FROM v_next_month)::integer,
      least(v_due_day, v_next_month_days)
    );
  END IF;

  v_rent_amount := v_term.rent_amount::numeric(14, 2);

  IF v_term_count > 1 THEN
    IF v_policy.mid_period_rent_change_rule IS NULL THEN
      RAISE EXCEPTION 'Complete the mid-period rent-change policy before generating rent'
        USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(pg_catalog.sum(segment.segment_amount), 0)
    INTO v_rent_amount
    FROM (
      SELECT CASE v_policy.mid_period_rent_change_rule
        WHEN 'prorate_actual_days' THEN pg_catalog.round(
          term.rent_amount
          * (
            least(term.end_date, v_period_end)
            - greatest(term.start_date, p_billing_period_start)
            + 1
          )
          / v_days_in_month,
          2
        )
        WHEN 'prorate_thirty_day' THEN pg_catalog.round(
          term.rent_amount
          * (
            least(term.end_date, v_period_end)
            - greatest(term.start_date, p_billing_period_start)
            + 1
          )
          / 30,
          2
        )
        WHEN 'next_full_period' THEN CASE
          WHEN term.start_date <= p_billing_period_start
            THEN term.rent_amount::numeric(14, 2)
          ELSE 0::numeric(14, 2)
        END
        ELSE NULL::numeric(14, 2)
      END AS segment_amount
      FROM public.lease_terms AS term
      WHERE term.organization_id = p_organization_id
        AND term.lease_id = p_lease_id
        AND term.authority_kind = 'authoritative'
        AND (
          (
            p_generation_source = 'manual_recovery'
            AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
          )
          OR (
            p_generation_source <> 'manual_recovery'
            AND term.status IN ('active', 'upcoming')
          )
        )
        AND term.archived_at IS NULL
        AND term.start_date <= v_period_end
        AND term.end_date >= p_billing_period_start
    ) AS segment
    WHERE segment.segment_amount IS NOT NULL;

    v_is_prorated :=
      v_policy.mid_period_rent_change_rule <> 'next_full_period';
  ELSIF date_trunc('month', v_term.start_date)::date =
      p_billing_period_start
    AND v_billing.first_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.first_period_prorated_amount;
    v_is_prorated := true;
  ELSIF date_trunc('month', v_term.end_date)::date =
      p_billing_period_start
    AND v_billing.final_period_prorated_amount IS NOT NULL THEN
    v_rent_amount := v_billing.final_period_prorated_amount;
    v_is_prorated := true;
  END IF;

  IF v_rent_amount <= 0 THEN
    RAISE EXCEPTION 'The lease rent amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF v_billing.charge_management_fee_when_active THEN
    v_fee_base := CASE
      WHEN v_is_prorated AND NOT v_billing.full_management_fee_during_proration
        THEN v_rent_amount
      ELSE v_term.rent_amount::numeric(14, 2)
    END;
    v_fee_amount := CASE
      WHEN v_billing.management_fee_mode = 'percentage'
        THEN round(v_fee_base * v_billing.management_fee_value / 100, 2)
      ELSE round(v_billing.management_fee_value, 2)
    END;
  END IF;

  SELECT coalesce(
    array_agg(
      people.display_name
      ORDER BY party.is_primary DESC, people.display_name
    ),
    ARRAY[v_lease.tenant_name]::text[]
  )
  INTO v_occupant_labels
  FROM public.lease_parties AS party
  JOIN public.people AS people
    ON people.organization_id = party.organization_id
   AND people.id = party.person_id
  WHERE party.organization_id = p_organization_id
    AND party.lease_id = p_lease_id
    AND party.archived_at IS NULL
    AND party.party_role IN (
      'primary_tenant',
      'co_tenant',
      'authorized_occupant'
    )
    AND (party.started_on IS NULL OR party.started_on <= v_period_end)
    AND (party.ended_on IS NULL OR party.ended_on >= p_billing_period_start)
    AND people.archived_at IS NULL;

  v_invoice_number := pg_catalog.concat(
    'INV-',
    pg_catalog.to_char(p_billing_period_start, 'YYYYMM'),
    '-',
    pg_catalog.upper(
      pg_catalog.substr(
        pg_catalog.replace(v_invoice_id::text, '-', ''),
        1,
        8
      )
    )
  );

  SELECT income.*
  INTO v_existing_income
  FROM public.finance_income_items AS income
  WHERE income.organization_id = p_organization_id
    AND income.lease_id = p_lease_id
    AND income.income_type = 'rent'
    AND income.archived_at IS NULL
    AND (
      income.rent_billing_period_start = p_billing_period_start
      OR (
        income.rent_billing_period_start IS NULL
        AND income.due_date = p_billing_period_start
        AND income.reference = pg_catalog.to_char(
          p_billing_period_start,
          'YYYY-MM'
        )
        AND lower(trim(income.description)) = 'monthly rent'
      )
    )
  ORDER BY
    (income.rent_billing_period_start = p_billing_period_start) DESC,
    income.created_at,
    income.id
  LIMIT 1
  FOR SHARE;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.finance_income_items AS duplicate
      WHERE duplicate.organization_id = p_organization_id
        AND duplicate.lease_id = p_lease_id
        AND duplicate.income_type = 'rent'
        AND duplicate.archived_at IS NULL
        AND duplicate.id <> v_existing_income.id
        AND (
          duplicate.rent_billing_period_start = p_billing_period_start
          OR (
            duplicate.rent_billing_period_start IS NULL
            AND duplicate.due_date = p_billing_period_start
            AND duplicate.reference = pg_catalog.to_char(
              p_billing_period_start,
              'YYYY-MM'
            )
            AND lower(trim(duplicate.description)) = 'monthly rent'
          )
        )
    )
      OR v_existing_income.amount_due IS DISTINCT FROM v_rent_amount
      OR v_existing_income.currency IS DISTINCT FROM v_term.rent_currency
      OR v_existing_income.status = 'void'
      OR v_existing_income.property_id IS DISTINCT FROM v_lease.property_id
      OR v_existing_income.unit_id IS DISTINCT FROM v_lease.unit_id
      OR (
        v_existing_income.payer_person_id IS NOT NULL
        AND v_existing_income.payer_person_id IS DISTINCT FROM v_recipient.id
      )
      OR (
        v_existing_income.payer_person_id IS NULL
        AND trim(v_existing_income.payer_label) NOT IN (
          v_recipient.display_name,
          v_lease.tenant_name
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.tenant_invoice_lines AS existing_line
        WHERE existing_line.organization_id = p_organization_id
          AND existing_line.income_item_id = v_existing_income.id
      ) THEN
      RAISE EXCEPTION 'Existing rent activity conflicts with this lease month'
        USING ERRCODE = '23514';
    END IF;

    IF v_billing.collection_route = 'direct_to_owner'
      AND EXISTS (
        SELECT 1
        FROM public.finance_receipt_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.income_item_id = v_existing_income.id
      ) THEN
      RAISE EXCEPTION 'Existing rent activity conflicts with this lease month'
        USING ERRCODE = '23514';
    END IF;

    IF v_billing.collection_route = 'through_ips'
      AND EXISTS (
        SELECT 1
        FROM public.owner_collection_confirmation_allocations AS allocation
        WHERE allocation.organization_id = p_organization_id
          AND allocation.income_item_id = v_existing_income.id
      ) THEN
      RAISE EXCEPTION 'Existing rent activity conflicts with this lease month'
        USING ERRCODE = '23514';
    END IF;

    PERFORM set_config(
      'app.rent_generation_context',
      'lease-derived-v1',
      true
    );

    UPDATE public.finance_income_items
    SET rent_billing_period_start = p_billing_period_start,
        due_date = v_due_date,
        payer_person_id = v_recipient.id,
        payer_label = v_recipient.display_name,
        description = 'Rent',
        reference = v_invoice_number,
        updated_by = p_actor_id
    WHERE organization_id = p_organization_id
      AND id = v_existing_income.id;

    v_income_item_id := v_existing_income.id;
  ELSE
    v_income_item_id := gen_random_uuid();
    PERFORM set_config(
      'app.rent_generation_context',
      'lease-derived-v1',
      true
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
      updated_by
    )
    VALUES (
      v_income_item_id,
      p_organization_id,
      v_lease.property_id,
      v_lease.unit_id,
      p_lease_id,
      'rent',
      v_recipient.id,
      v_recipient.display_name,
      p_billing_period_start,
      v_due_date,
      v_rent_amount,
      0,
      v_term.rent_currency,
      'open',
      'Rent',
      v_invoice_number,
      p_actor_id,
      p_actor_id
    );
  END IF;

  INSERT INTO public.tenant_invoices (
    id,
    organization_id,
    invoice_number,
    property_id,
    unit_id,
    lease_id,
    billing_term_id,
    billing_period_start,
    billing_period_end,
    issue_date,
    due_date,
    collection_route,
    recipient_kind,
    recipient_person_id,
    recipient_label,
    occupant_labels,
    currency,
    total_amount,
    lease_term_id,
    rent_policy_version_id,
    generation_source,
    generated_at,
    base_rent_amount,
    is_prorated,
    management_fee_mode,
    management_fee_value,
    management_fee_amount,
    created_by
  )
  VALUES (
    v_invoice_id,
    p_organization_id,
    v_invoice_number,
    v_lease.property_id,
    v_lease.unit_id,
    p_lease_id,
    v_billing.id,
    p_billing_period_start,
    v_period_end,
    p_issue_date,
    v_due_date,
    v_billing.collection_route,
    v_billing.billing_recipient_kind,
    v_recipient.id,
    v_recipient.display_name,
    v_occupant_labels,
    v_term.rent_currency,
    v_rent_amount,
    v_term.id,
    v_policy.id,
    p_generation_source,
    now(),
    v_term.rent_amount,
    v_is_prorated,
    v_billing.management_fee_mode,
    v_billing.management_fee_value,
    v_fee_amount,
    p_actor_id
  );

  INSERT INTO public.tenant_invoice_rent_segments (
    organization_id,
    invoice_id,
    lease_id,
    lease_term_id,
    segment_order,
    segment_start,
    segment_end,
    full_period_amount,
    amount,
    proration_rule,
    created_by
  )
  SELECT
    p_organization_id,
    v_invoice_id,
    p_lease_id,
    term.id,
    pg_catalog.row_number() OVER (
      ORDER BY term.start_date, term.term_sequence, term.id
    )::integer,
    greatest(term.start_date, p_billing_period_start),
    least(term.end_date, v_period_end),
    term.rent_amount,
    CASE
      WHEN v_term_count = 1 THEN v_rent_amount
      WHEN v_policy.mid_period_rent_change_rule = 'prorate_actual_days'
        THEN pg_catalog.round(
          term.rent_amount
          * (
            least(term.end_date, v_period_end)
            - greatest(term.start_date, p_billing_period_start)
            + 1
          )
          / v_days_in_month,
          2
        )
      WHEN v_policy.mid_period_rent_change_rule = 'prorate_thirty_day'
        THEN pg_catalog.round(
          term.rent_amount
          * (
            least(term.end_date, v_period_end)
            - greatest(term.start_date, p_billing_period_start)
            + 1
          )
          / 30,
          2
        )
      WHEN v_policy.mid_period_rent_change_rule = 'next_full_period'
        THEN CASE
          WHEN term.start_date <= p_billing_period_start
            THEN term.rent_amount::numeric(14, 2)
          ELSE 0::numeric(14, 2)
        END
      ELSE v_rent_amount
    END,
    CASE
      WHEN v_term_count > 1 THEN v_policy.mid_period_rent_change_rule
      WHEN v_is_prorated THEN 'billing_override'
      ELSE 'full_period'
    END,
    p_actor_id
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND (
      (
        p_generation_source = 'manual_recovery'
        AND term.status IN ('active', 'upcoming', 'expired', 'terminated')
      )
      OR (
        p_generation_source <> 'manual_recovery'
        AND term.status IN ('active', 'upcoming')
      )
    )
    AND term.archived_at IS NULL
    AND term.start_date <= v_period_end
    AND term.end_date >= p_billing_period_start
  ORDER BY term.start_date, term.term_sequence, term.id;

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
    created_by
  )
  VALUES (
    v_line_id,
    p_organization_id,
    v_invoice_id,
    v_income_item_id,
    'rent',
    'Rent',
    pg_catalog.concat(
      pg_catalog.to_char(p_billing_period_start, 'Mon YYYY'),
      CASE WHEN v_is_prorated THEN ' - prorated' ELSE '' END
    ),
    v_rent_amount,
    NULL,
    0,
    1,
    p_actor_id
  );

  IF v_fee_amount > 0 THEN
    INSERT INTO public.management_fee_occurrences (
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
      created_by
    )
    VALUES (
      p_organization_id,
      v_lease.property_id,
      p_lease_id,
      v_invoice_id,
      v_billing.id,
      p_billing_period_start,
      v_fee_amount,
      v_term.rent_currency,
      v_billing.management_fee_mode,
      v_billing.management_fee_value,
      p_actor_id
    );
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    p_actor_id,
    'tenant_invoice',
    v_invoice_id,
    'lease_rent_generated',
    jsonb_build_object(
      'leaseId', p_lease_id,
      'billingPeriodStart', p_billing_period_start,
      'leaseTermId', v_term.id,
      'rentPolicyVersionId', v_policy.id,
      'generationSource', p_generation_source,
      'amount', v_rent_amount,
      'managementFeeAmount', v_fee_amount
    )
  );

  UPDATE public.rent_generation_exceptions AS exception
  SET
    resolved_at = now(),
    resolved_invoice_id = v_invoice_id,
    last_attempt_at = now(),
    last_attempted_by = p_actor_id
  WHERE exception.organization_id = p_organization_id
    AND exception.lease_id = p_lease_id
    AND exception.billing_period_start = p_billing_period_start
    AND exception.resolved_at IS NULL;

  RETURN v_invoice_id;
END;
$function$;

ALTER FUNCTION app_private.generate_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.generate_lease_rent_invoice(
  uuid, uuid, date, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.tenant_invoice_rent_segments IS
  'Immutable per-term exact-money evidence for one lease-derived rent invoice.';

CREATE OR REPLACE FUNCTION public.schedule_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_supersedes_term_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_lease public.leases%ROWTYPE;
  v_previous public.lease_terms%ROWTYPE;
  v_expected_term_end date;
  v_expected_term_start date;
  v_term_id uuid;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_supersedes_term_id IS NOT NULL THEN
    SELECT terms.*
    INTO v_previous
    FROM public.lease_terms AS terms
    WHERE terms.id = p_supersedes_term_id
      AND terms.organization_id = p_organization_id
      AND terms.lease_id = p_lease_id
      AND terms.authority_kind = 'authoritative'
      AND terms.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Scheduled term to supersede was not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_previous.status = 'active' THEN
      v_expected_term_start := v_previous.start_date;
      v_expected_term_end := v_previous.end_date;

      IF p_start_date <= current_date
        OR p_start_date <= v_previous.start_date THEN
        RAISE EXCEPTION
          'A future rent change must begin after today and after the active term starts'
          USING ERRCODE = '22023';
      END IF;

      SELECT leases.*
      INTO v_lease
      FROM public.leases AS leases
      WHERE leases.id = p_lease_id
        AND leases.organization_id = p_organization_id
        AND leases.archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lease was not found' USING ERRCODE = '23503';
      END IF;

      IF p_start_date <= v_previous.end_date THEN
        PERFORM app_private.lock_open_lease_term_periods(
          p_organization_id,
          v_lease.property_id,
          p_rent_currency,
          p_start_date,
          v_previous.end_date
        );
      END IF;

      SELECT leases.*
      INTO v_lease
      FROM public.leases AS leases
      WHERE leases.id = p_lease_id
        AND leases.organization_id = p_organization_id
        AND leases.archived_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lease was not found' USING ERRCODE = '23503';
      END IF;

      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          pg_catalog.concat_ws(
            ':', 'lease_term_v1', p_organization_id, p_lease_id
          ),
          0
        )
      );

      SELECT terms.*
      INTO v_previous
      FROM public.lease_terms AS terms
      WHERE terms.id = p_supersedes_term_id
        AND terms.organization_id = p_organization_id
        AND terms.lease_id = p_lease_id
        AND terms.authority_kind = 'authoritative'
        AND terms.status = 'active'
        AND terms.archived_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Active term changed while scheduling its replacement'
          USING ERRCODE = '40001';
      END IF;

      IF v_previous.start_date <> v_expected_term_start
        OR v_previous.end_date <> v_expected_term_end THEN
        RAISE EXCEPTION 'Active term changed while scheduling its replacement'
          USING ERRCODE = '40001';
      END IF;

      IF p_start_date <= v_previous.end_date
        AND EXISTS (
          SELECT 1
          FROM public.tenant_invoices AS invoice
          WHERE invoice.organization_id = p_organization_id
            AND invoice.lease_id = p_lease_id
            AND invoice.billing_period_end >= p_start_date
            AND invoice.billing_period_start <= v_previous.end_date
        ) THEN
        RAISE EXCEPTION 'rent_obligation_already_generated'
          USING ERRCODE = '23514';
      END IF;

      IF p_start_date <= v_previous.end_date THEN
        UPDATE public.lease_terms
        SET
          end_date = p_start_date - 1,
          updated_at = pg_catalog.now(),
          updated_by = v_actor_id
        WHERE id = v_previous.id;

        INSERT INTO public.activity_logs (
          organization_id,
          actor_id,
          entity_type,
          entity_id,
          action,
          previous_values,
          new_values
        )
        SELECT
          p_organization_id,
          v_actor_id,
          'lease_term',
          terms.id,
          'authoritative_lease_term_future_range_shortened',
          pg_catalog.to_jsonb(v_previous),
          pg_catalog.to_jsonb(terms)
        FROM public.lease_terms AS terms
        WHERE terms.id = v_previous.id;
      END IF;

      v_term_id := public.create_authoritative_lease_term(
        p_organization_id,
        p_lease_id,
        p_start_date,
        p_end_date,
        p_rent_amount,
        p_rent_currency,
        p_rent_due_day,
        p_payment_frequency,
        'upcoming',
        NULL,
        p_idempotency_key
      );

      UPDATE public.lease_terms
      SET supersedes_term_id = p_supersedes_term_id
      WHERE id = v_term_id
        AND supersedes_term_id IS NULL;

      RETURN v_term_id;
    END IF;
  END IF;

  RETURN public.create_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_start_date,
    p_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    'upcoming',
    p_supersedes_term_id,
    p_idempotency_key
  );
END;
$function$;

ALTER FUNCTION public.schedule_authoritative_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.schedule_authoritative_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_authoritative_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, uuid, text
) TO authenticated;
