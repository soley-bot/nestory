-- Track 4A: immutable owner close revisions, checked reopen/correction, and
-- deterministic frozen close lines. Publication and artifacts are Track 4B.

ALTER TABLE public.owner_event_allocation_sets
  DROP CONSTRAINT owner_event_allocation_sets_source_type_check,
  ADD CONSTRAINT owner_event_allocation_sets_source_type_check CHECK (
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
      'owner_close_correction',
      'reversal'
    )
  );

CREATE TABLE public.owner_close_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  month_start date NOT NULL,
  state text NOT NULL DEFAULT 'open',
  active_revision_id uuid,
  current_closed_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  state_changed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  state_changed_by uuid NOT NULL,
  CONSTRAINT owner_close_series_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_close_series_period_unique UNIQUE (
    organization_id, property_id, owner_person_id, currency, month_start
  ),
  CONSTRAINT owner_close_series_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_series_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_series_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_series_changed_by_fk
    FOREIGN KEY (state_changed_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_series_month_check CHECK (
    month_start = pg_catalog.date_trunc('month', month_start)::date
  ),
  CONSTRAINT owner_close_series_currency_check CHECK (
    currency = 'USD'::public.currency_code
  ),
  CONSTRAINT owner_close_series_state_check CHECK (
    state IN ('open', 'preparing', 'closed', 'stale')
  ),
  CONSTRAINT owner_close_series_state_refs_check CHECK (
    (state = 'open' AND active_revision_id IS NULL
      AND current_closed_revision_id IS NULL)
    OR (state = 'preparing' AND active_revision_id IS NOT NULL)
    OR (state = 'closed' AND active_revision_id IS NOT NULL
      AND active_revision_id = current_closed_revision_id)
    OR (state = 'stale' AND (
      (active_revision_id IS NULL AND current_closed_revision_id IS NULL)
      OR active_revision_id = current_closed_revision_id
    ))
  )
);

CREATE TABLE public.owner_close_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_close_series_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  month_start date NOT NULL,
  revision_number integer NOT NULL,
  status text NOT NULL,
  supersedes_revision_id uuid,
  reopen_reason text,
  prepared_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  prepared_by uuid NOT NULL,
  input_watermark text,
  input_hash text,
  content_hash text,
  closed_at timestamptz,
  closed_by uuid,
  close_reason text,
  CONSTRAINT owner_close_revisions_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_close_revisions_series_revision_unique UNIQUE (
    owner_close_series_id, revision_number
  ),
  CONSTRAINT owner_close_revisions_series_fk
    FOREIGN KEY (organization_id, owner_close_series_id)
    REFERENCES public.owner_close_series (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_revisions_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_revisions_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_revisions_prepared_by_fk
    FOREIGN KEY (prepared_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_revisions_closed_by_fk
    FOREIGN KEY (closed_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_revisions_supersedes_fk
    FOREIGN KEY (organization_id, supersedes_revision_id)
    REFERENCES public.owner_close_revisions (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_revisions_revision_check CHECK (revision_number > 0),
  CONSTRAINT owner_close_revisions_month_check CHECK (
    month_start = pg_catalog.date_trunc('month', month_start)::date
  ),
  CONSTRAINT owner_close_revisions_currency_check CHECK (
    currency = 'USD'::public.currency_code
  ),
  CONSTRAINT owner_close_revisions_status_check CHECK (
    status IN ('preparing', 'closed', 'abandoned')
  ),
  CONSTRAINT owner_close_revisions_lineage_check CHECK (
    (revision_number = 1 AND supersedes_revision_id IS NULL
      AND reopen_reason IS NULL)
    OR (revision_number > 1 AND supersedes_revision_id IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(reopen_reason)) BETWEEN 3 AND 500)
  ),
  CONSTRAINT owner_close_revisions_hash_check CHECK (
    (input_hash IS NULL OR input_hash ~ '^[0-9a-f]{64}$')
    AND (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT owner_close_revisions_status_fields_check CHECK (
    (
      status = 'preparing'
      AND input_watermark IS NULL
      AND input_hash IS NULL
      AND content_hash IS NULL
      AND closed_at IS NULL
      AND closed_by IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'closed'
      AND pg_catalog.length(input_watermark) > 0
      AND input_hash IS NOT NULL
      AND content_hash IS NOT NULL
      AND closed_at IS NOT NULL
      AND closed_by IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(close_reason)) BETWEEN 3 AND 500
    )
    OR status = 'abandoned'
  )
);

CREATE UNIQUE INDEX owner_close_revisions_one_preparing_idx
  ON public.owner_close_revisions (owner_close_series_id)
  WHERE status = 'preparing';

ALTER TABLE public.owner_close_series
  ADD CONSTRAINT owner_close_series_active_revision_fk
    FOREIGN KEY (organization_id, active_revision_id)
    REFERENCES public.owner_close_revisions (organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT owner_close_series_current_closed_revision_fk
    FOREIGN KEY (organization_id, current_closed_revision_id)
    REFERENCES public.owner_close_revisions (organization_id, id)
    ON DELETE RESTRICT;

CREATE TABLE public.owner_close_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_close_revision_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  line_number integer NOT NULL,
  line_kind text NOT NULL,
  component public.owner_balance_component,
  description text NOT NULL,
  business_date date NOT NULL,
  signed_amount numeric(14,2) NOT NULL,
  source_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_close_lines_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_close_lines_number_unique UNIQUE (
    owner_close_revision_id, line_number
  ),
  CONSTRAINT owner_close_lines_revision_fk
    FOREIGN KEY (organization_id, owner_close_revision_id)
    REFERENCES public.owner_close_revisions (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_lines_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_lines_number_check CHECK (line_number > 0),
  CONSTRAINT owner_close_lines_kind_check CHECK (
    line_kind IN ('opening', 'movement', 'activity', 'closing')
  ),
  CONSTRAINT owner_close_lines_component_check CHECK (
    (line_kind = 'activity' AND component IS NULL)
    OR (line_kind <> 'activity' AND component IS NOT NULL)
  ),
  CONSTRAINT owner_close_lines_amount_check CHECK (
    signed_amount = pg_catalog.round(signed_amount, 2)
    AND (line_kind <> 'movement' OR signed_amount <> 0)
    AND (line_kind <> 'activity' OR signed_amount <> 0)
  ),
  CONSTRAINT owner_close_lines_source_count_check CHECK (source_count > 0),
  CONSTRAINT owner_close_lines_description_check CHECK (
    pg_catalog.length(pg_catalog.btrim(description)) BETWEEN 1 AND 240
  )
);

CREATE TABLE public.owner_close_line_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_close_revision_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  close_line_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_line_id uuid NOT NULL,
  source_fingerprint text NOT NULL,
  owner_component_movement_id uuid,
  owner_event_owner_allocation_id uuid,
  owner_balance_period_component_id uuid,
  owner_opening_balance_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_close_line_sources_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_close_line_sources_identity_unique UNIQUE (
    owner_close_revision_id,
    close_line_id,
    source_type,
    source_line_id,
    source_fingerprint
  ),
  CONSTRAINT owner_close_line_sources_revision_fk
    FOREIGN KEY (organization_id, owner_close_revision_id)
    REFERENCES public.owner_close_revisions (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_line_sources_line_fk
    FOREIGN KEY (organization_id, close_line_id)
    REFERENCES public.owner_close_lines (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_line_sources_movement_fk
    FOREIGN KEY (organization_id, owner_component_movement_id)
    REFERENCES public.owner_component_movements (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_line_sources_allocation_fk
    FOREIGN KEY (organization_id, owner_event_owner_allocation_id)
    REFERENCES public.owner_event_owner_allocations (organization_id, id)
    ON DELETE RESTRICT,
  -- Period component rows are the mutable roll-forward projection and are
  -- replaced during an ordered reroll. Retain their frozen UUID/fingerprint
  -- as evidence, but deliberately do not create a live FK to that projection.
  CONSTRAINT owner_close_line_sources_opening_entry_fk
    FOREIGN KEY (organization_id, owner_opening_balance_entry_id)
    REFERENCES public.owner_opening_balance_entries (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_line_sources_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_line_sources_fingerprint_check CHECK (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_close_line_sources_exact_lineage_check CHECK (
    pg_catalog.num_nonnulls(
      owner_component_movement_id,
      owner_event_owner_allocation_id,
      owner_balance_period_component_id,
      owner_opening_balance_entry_id
    ) = 1
  )
);

CREATE UNIQUE INDEX owner_close_line_sources_movement_unique
  ON public.owner_close_line_sources (
    owner_close_revision_id, owner_component_movement_id
  )
  WHERE owner_component_movement_id IS NOT NULL;

CREATE UNIQUE INDEX owner_close_line_sources_activity_unique
  ON public.owner_close_line_sources (
    owner_close_revision_id, owner_event_owner_allocation_id
  )
  WHERE owner_event_owner_allocation_id IS NOT NULL;

CREATE TABLE public.owner_close_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_close_revision_id uuid NOT NULL,
  owner_close_series_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  month_start date NOT NULL,
  effective_date date NOT NULL,
  component public.owner_balance_component NOT NULL,
  signed_amount numeric(14,2) NOT NULL,
  reason text NOT NULL,
  source_reference text NOT NULL,
  evidence_sha256 text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_close_corrections_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT owner_close_corrections_idempotency_unique UNIQUE (
    organization_id, idempotency_key
  ),
  CONSTRAINT owner_close_corrections_revision_fk
    FOREIGN KEY (organization_id, owner_close_revision_id)
    REFERENCES public.owner_close_revisions (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_corrections_series_fk
    FOREIGN KEY (organization_id, owner_close_series_id)
    REFERENCES public.owner_close_series (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_close_corrections_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_corrections_owner_fk
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_corrections_actor_fk
    FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE RESTRICT,
  CONSTRAINT owner_close_corrections_currency_check CHECK (
    currency = 'USD'::public.currency_code
  ),
  CONSTRAINT owner_close_corrections_month_check CHECK (
    month_start = pg_catalog.date_trunc('month', month_start)::date
    AND effective_date >= month_start
    AND effective_date < (month_start + INTERVAL '1 month')::date
  ),
  CONSTRAINT owner_close_corrections_amount_check CHECK (
    signed_amount <> 0 AND signed_amount = pg_catalog.round(signed_amount, 2)
  ),
  CONSTRAINT owner_close_corrections_reason_check CHECK (
    pg_catalog.length(pg_catalog.btrim(reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT owner_close_corrections_reference_check CHECK (
    pg_catalog.length(pg_catalog.btrim(source_reference)) BETWEEN 3 AND 240
  ),
  CONSTRAINT owner_close_corrections_evidence_check CHECK (
    evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT owner_close_corrections_idempotency_check CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 8 AND 160
  ),
  CONSTRAINT owner_close_corrections_payload_hash_check CHECK (
    payload_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX owner_close_series_scope_idx
  ON public.owner_close_series (
    organization_id, property_id, owner_person_id, currency, month_start
  );
CREATE INDEX owner_close_revisions_history_idx
  ON public.owner_close_revisions (
    organization_id, owner_close_series_id, revision_number DESC
  );
CREATE INDEX owner_close_lines_revision_order_idx
  ON public.owner_close_lines (owner_close_revision_id, line_number);
CREATE INDEX owner_close_line_sources_revision_idx
  ON public.owner_close_line_sources (
    owner_close_revision_id, close_line_id, source_type, source_line_id
  );

CREATE OR REPLACE FUNCTION app_private.guard_owner_close_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_revision_status text;
BEGIN
  IF current_user <> 'postgres'
    OR pg_catalog.current_setting('app.owner_close_write_context', true)
      IS DISTINCT FROM 'checked-owner-close-v1' THEN
    RAISE EXCEPTION 'authoritative owner close writes require a checked path'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'owner_close_revisions' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'closed' THEN
      RAISE EXCEPTION 'closed owner revision is immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('owner_close_lines', 'owner_close_line_sources') THEN
    IF TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'frozen owner close detail is immutable'
        USING ERRCODE = '42501';
    END IF;
    SELECT revision.status
    INTO v_revision_status
    FROM public.owner_close_revisions AS revision
    WHERE revision.organization_id = NEW.organization_id
      AND revision.id = NEW.owner_close_revision_id;
    IF v_revision_status IS DISTINCT FROM 'preparing' THEN
      RAISE EXCEPTION 'frozen owner close detail requires a preparing revision'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'owner_close_corrections' AND TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'owner close corrections are append only'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

ALTER FUNCTION app_private.guard_owner_close_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_close_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_owner_close_series_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_close_series
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_close_write();
CREATE TRIGGER guard_owner_close_revisions_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_close_revisions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_close_write();
CREATE TRIGGER guard_owner_close_lines_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_close_lines
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_close_write();
CREATE TRIGGER guard_owner_close_line_sources_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_close_line_sources
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_close_write();
CREATE TRIGGER guard_owner_close_corrections_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_close_corrections
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_close_write();

DO $owner_close_rls_and_grants$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'owner_close_series',
    'owner_close_revisions',
    'owner_close_lines',
    'owner_close_line_sources',
    'owner_close_corrections'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table
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
      'GRANT SELECT ON TABLE public.%I TO authenticated', v_table
    );
  END LOOP;
END;
$owner_close_rls_and_grants$;

CREATE OR REPLACE FUNCTION app_private.owner_close_component_rank(
  p_component public.owner_balance_component
) RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT CASE p_component
    WHEN 'ips_held_owner_cash' THEN 1
    WHEN 'owner_due_to_ips' THEN 2
    WHEN 'ips_due_to_owner' THEN 3
    WHEN 'security_deposit_custody' THEN 4
  END;
$$;

CREATE OR REPLACE FUNCTION app_private.owner_close_source_rank(
  p_source_type text
) RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT CASE p_source_type
    WHEN 'tenant_rent_receipt' THEN 10
    WHEN 'owner_direct_rent_receipt' THEN 20
    WHEN 'management_fee_occurrence' THEN 30
    WHEN 'owner_paid_cost' THEN 40
    WHEN 'owner_invoice_payment' THEN 50
    WHEN 'owner_contribution' THEN 60
    WHEN 'owner_reimbursement' THEN 70
    WHEN 'owner_distribution' THEN 80
    WHEN 'security_deposit_receipt' THEN 90
    WHEN 'security_deposit_refund' THEN 100
    WHEN 'owner_component_transfer' THEN 110
    WHEN 'owner_close_correction' THEN 120
    WHEN 'reversal' THEN 130
    ELSE 999
  END;
$$;

CREATE OR REPLACE FUNCTION app_private.owner_close_source_label(
  p_source_type text
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT CASE p_source_type
    WHEN 'tenant_rent_receipt' THEN 'Tenant rent receipt'
    WHEN 'owner_direct_rent_receipt' THEN 'Owner-direct rent receipt'
    WHEN 'management_fee_occurrence' THEN 'Management fee'
    WHEN 'owner_paid_cost' THEN 'Owner-paid cost'
    WHEN 'owner_invoice_payment' THEN 'Owner invoice payment'
    WHEN 'owner_contribution' THEN 'Owner contribution'
    WHEN 'owner_reimbursement' THEN 'Owner reimbursement'
    WHEN 'owner_distribution' THEN 'Owner distribution'
    WHEN 'security_deposit_receipt' THEN 'Security deposit receipt'
    WHEN 'security_deposit_refund' THEN 'Security deposit refund'
    WHEN 'owner_component_transfer' THEN 'Owner component transfer'
    WHEN 'owner_close_correction' THEN 'Owner close correction'
    WHEN 'reversal' THEN 'Reversal'
    ELSE 'Unsupported owner source'
  END;
$$;

CREATE OR REPLACE FUNCTION app_private.lock_owner_close_scope(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
BEGIN
  PERFORM app_private.lock_property_financial_month(
    p_organization_id, p_property_id, p_currency, p_month_start
  );
  PERFORM app_private.lock_owner_balance_lifecycle(
    p_organization_id, p_property_id, p_owner_person_id, p_currency
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'owner_close_series_v1', p_organization_id::text,
        p_property_id::text, p_owner_person_id::text, p_currency::text,
        p_month_start::text
      ),
      0
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.lock_owner_close_sources(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
DECLARE
  v_source record;
BEGIN
  FOR v_source IN
    SELECT allocation_set.source_type, allocation_set.source_line_id
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.property_id = p_property_id
      AND allocation_set.currency = p_currency
      AND allocation_set.event_date >= p_month_start
      AND allocation_set.event_date < (p_month_start + INTERVAL '1 month')::date
      AND owner_allocation.owner_person_id = p_owner_person_id
    ORDER BY allocation_set.source_type, allocation_set.source_line_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat_ws(
          ':', 'owner_balance_source_v1', p_organization_id::text,
          v_source.source_type, v_source.source_line_id::text
        ),
        0
      )
    );
  END LOOP;

  PERFORM 1
  FROM public.owner_event_allocation_sets AS allocation_set
  JOIN public.owner_event_owner_allocations AS owner_allocation
    ON owner_allocation.organization_id = allocation_set.organization_id
   AND owner_allocation.allocation_set_id = allocation_set.id
  WHERE allocation_set.organization_id = p_organization_id
    AND allocation_set.property_id = p_property_id
    AND allocation_set.currency = p_currency
    AND allocation_set.event_date >= p_month_start
    AND allocation_set.event_date < (p_month_start + INTERVAL '1 month')::date
    AND owner_allocation.owner_person_id = p_owner_person_id
  ORDER BY allocation_set.source_type, allocation_set.source_line_id
  FOR KEY SHARE OF allocation_set, owner_allocation;

  PERFORM 1
  FROM public.owner_component_movements AS movement
  WHERE movement.organization_id = p_organization_id
    AND movement.property_id = p_property_id
    AND movement.owner_person_id = p_owner_person_id
    AND movement.currency = p_currency
    AND movement.month_start = p_month_start
  ORDER BY movement.id
  FOR KEY SHARE;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.owner_close_input_snapshot(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS TABLE (
  input_watermark text,
  input_canonical text,
  input_hash text
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH target_period AS (
    SELECT period.*
    FROM public.owner_balance_periods AS period
    WHERE period.organization_id = p_organization_id
      AND period.property_id = p_property_id
      AND period.owner_person_id = p_owner_person_id
      AND period.currency = p_currency
      AND period.month_start = p_month_start
  ), component_rows AS (
    SELECT
      component.id,
      component.component,
      component.opening_amount,
      component.movement_amount,
      component.closing_amount,
      app_private.owner_close_component_rank(component.component) AS rank
    FROM target_period AS period
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = period.organization_id
     AND component.owner_balance_period_id = period.id
  ), source_rows AS (
    SELECT
      allocation_set.id AS allocation_set_id,
      allocation_set.source_type,
      allocation_set.source_id,
      allocation_set.source_line_id,
      allocation_set.source_fingerprint,
      allocation_set.event_date,
      owner_allocation.id AS owner_allocation_id,
      owner_allocation.property_owner_id,
      owner_allocation.owner_person_id,
      owner_allocation.ownership_percent_snapshot,
      owner_allocation.ownership_roster_hash,
      owner_allocation.allocated_gross_signed_amount
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.property_id = p_property_id
      AND allocation_set.currency = p_currency
      AND allocation_set.event_date >= p_month_start
      AND allocation_set.event_date < (p_month_start + INTERVAL '1 month')::date
      AND owner_allocation.owner_person_id = p_owner_person_id
  ), movement_rows AS (
    SELECT movement.*
    FROM public.owner_component_movements AS movement
    WHERE movement.organization_id = p_organization_id
      AND movement.property_id = p_property_id
      AND movement.owner_person_id = p_owner_person_id
      AND movement.currency = p_currency
      AND movement.month_start = p_month_start
  ), opening_rows AS (
    SELECT
      entry.id,
      entry.request_id,
      entry.component,
      entry.entry_kind,
      entry.signed_amount,
      request.evidence_sha256,
      request.supporting_document_id,
      request.source_reference
    FROM public.owner_opening_balance_entries AS entry
    JOIN public.owner_opening_balance_requests AS request
      ON request.organization_id = entry.organization_id
     AND request.id = entry.request_id
    WHERE entry.organization_id = p_organization_id
      AND entry.property_id = p_property_id
      AND entry.owner_person_id = p_owner_person_id
      AND entry.currency = p_currency
      AND entry.effective_date = p_month_start
  ), canonical AS (
    SELECT pg_catalog.concat_ws(
      E'\n--components--\n',
      (
        SELECT 'period|' || period.id::text || '|' || period.input_watermark ||
          '|' || period.input_hash
        FROM target_period AS period
      ),
      coalesce((
        SELECT pg_catalog.string_agg(
          component.id::text || '|' || component.component::text || '|' ||
          pg_catalog.to_char(component.opening_amount, 'FM999999999990.00') || '|' ||
          pg_catalog.to_char(component.movement_amount, 'FM999999999990.00') || '|' ||
          pg_catalog.to_char(component.closing_amount, 'FM999999999990.00'),
          E'\n' ORDER BY component.rank
        )
        FROM component_rows AS component
      ), ''),
      '--sources--',
      coalesce((
        SELECT pg_catalog.string_agg(
          source.source_type || '|' || source.source_id::text || '|' ||
          source.source_line_id::text || '|' || source.source_fingerprint || '|' ||
          source.event_date::text || '|' || source.owner_allocation_id::text || '|' ||
          source.property_owner_id::text || '|' || source.owner_person_id::text || '|' ||
          pg_catalog.to_char(source.ownership_percent_snapshot, 'FM990.000') || '|' ||
          source.ownership_roster_hash || '|' ||
          pg_catalog.to_char(source.allocated_gross_signed_amount, 'FM999999999990.00'),
          E'\n' ORDER BY source.event_date,
            app_private.owner_close_source_rank(source.source_type),
            source.source_line_id, source.owner_allocation_id
        )
        FROM source_rows AS source
      ), ''),
      '--movements--',
      coalesce((
        SELECT pg_catalog.string_agg(
          movement.id::text || '|' || movement.owner_event_owner_allocation_id::text || '|' ||
          movement.event_date::text || '|' || movement.component::text || '|' ||
          pg_catalog.to_char(movement.signed_amount, 'FM999999999990.00') || '|' ||
          movement.movement_order::text || '|' ||
          coalesce(movement.reversal_of_movement_id::text, ''),
          E'\n' ORDER BY movement.event_date,
            movement.owner_event_owner_allocation_id,
            app_private.owner_close_component_rank(movement.component),
            movement.movement_order, movement.id
        )
        FROM movement_rows AS movement
      ), ''),
      '--openings--',
      coalesce((
        SELECT pg_catalog.string_agg(
          opening.id::text || '|' || opening.request_id::text || '|' ||
          opening.component::text || '|' || opening.entry_kind || '|' ||
          pg_catalog.to_char(opening.signed_amount, 'FM999999999990.00') || '|' ||
          opening.evidence_sha256 || '|' ||
          coalesce(opening.supporting_document_id::text, '') || '|' ||
          coalesce(opening.source_reference, ''),
          E'\n' ORDER BY app_private.owner_close_component_rank(opening.component),
            opening.id
        )
        FROM opening_rows AS opening
      ), '')
    ) AS value
  )
  SELECT
    pg_catalog.concat_ws(
      ';',
      'components=' || (SELECT count(*)::text FROM component_rows),
      'sources=' || (SELECT count(*)::text FROM source_rows),
      'movements=' || (SELECT count(*)::text FROM movement_rows),
      'openings=' || (SELECT count(*)::text FROM opening_rows),
      'month=' || p_month_start::text
    ),
    canonical.value,
    pg_catalog.encode(extensions.digest(canonical.value, 'sha256'), 'hex')
  FROM canonical;
$$;

CREATE OR REPLACE FUNCTION app_private.build_owner_close_readiness(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_period public.owner_balance_periods%ROWTYPE;
  v_series public.owner_close_series%ROWTYPE;
  v_blockers jsonb := '[]'::jsonb;
  v_components jsonb := '[]'::jsonb;
  v_component_count integer := 0;
  v_pending_sources jsonb;
  v_transfer_detail jsonb;
  v_source record;
  v_current_fingerprint text;
  v_input record;
BEGIN
  IF p_month_start IS NULL
    OR p_month_start <> pg_catalog.date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'owner_close_month_start_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_currency <> 'USD'::public.currency_code THEN
    RAISE EXCEPTION 'owner_close_currency_unsupported' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.properties AS property
    WHERE property.organization_id = p_organization_id
      AND property.id = p_property_id
      AND property.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'owner_close_property_not_found' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.people AS person
    WHERE person.organization_id = p_organization_id
      AND person.id = p_owner_person_id
  ) THEN
    RAISE EXCEPTION 'owner_close_owner_not_found' USING ERRCODE = '23503';
  END IF;

  IF NOT app_private.is_financial_month_locked(
    p_organization_id, p_month_start
  ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'financial_month_not_locked',
        'month_start', p_month_start::text
      )
    );
  END IF;

  SELECT period.*
  INTO v_period
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = p_month_start;

  IF v_period.id IS NULL THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'owner_balance_period_missing',
        'property_id', p_property_id::text,
        'owner_person_id', p_owner_person_id::text,
        'month_start', p_month_start::text
      )
    );
  ELSE
    IF v_period.status <> 'ready' THEN
      v_blockers := v_blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', CASE v_period.status
            WHEN 'stale' THEN 'owner_balance_period_stale'
            WHEN 'blocked' THEN coalesce(
              v_period.blocked_reason_code, 'owner_balance_period_blocked'
            )
            WHEN 'closed' THEN 'owner_balance_period_already_closed'
            ELSE 'owner_balance_period_not_ready'
          END,
          'period_id', v_period.id::text,
          'status', v_period.status,
          'detail', v_period.blocked_reason_detail
        )
      );
    END IF;

    SELECT
      count(*)::integer,
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'component', component.component::text,
            'opening_amount', pg_catalog.to_char(
              component.opening_amount, 'FM999999999990.00'
            ),
            'movement_amount', pg_catalog.to_char(
              component.movement_amount, 'FM999999999990.00'
            ),
            'closing_amount', pg_catalog.to_char(
              component.closing_amount, 'FM999999999990.00'
            )
          ) ORDER BY component.component::text
        ),
        '[]'::jsonb
      )
    INTO v_component_count, v_components
    FROM public.owner_balance_period_components AS component
    WHERE component.organization_id = p_organization_id
      AND component.owner_balance_period_id = v_period.id;

    IF v_component_count <> 4 THEN
      v_blockers := v_blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'owner_balance_component_count_invalid',
          'period_id', v_period.id::text,
          'observed_count', v_component_count,
          'required_count', 4
        )
      );
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.owner_balance_period_components AS component
      WHERE component.organization_id = p_organization_id
        AND component.owner_balance_period_id = v_period.id
        AND component.opening_amount + component.movement_amount
          <> component.closing_amount
    ) THEN
      v_blockers := v_blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'owner_balance_component_reconciliation_failed',
          'period_id', v_period.id::text
        )
      );
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.owner_balance_period_components AS component
      WHERE component.organization_id = p_organization_id
        AND component.owner_balance_period_id = v_period.id
        AND component.closing_amount < 0
    ) THEN
      v_blockers := v_blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'owner_balance_component_negative',
          'period_id', v_period.id::text
        )
      );
    END IF;
  END IF;

  SELECT series.*
  INTO v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.property_id = p_property_id
    AND series.owner_person_id = p_owner_person_id
    AND series.currency = p_currency
    AND series.month_start = p_month_start;

  IF v_series.id IS NOT NULL AND v_series.state IN ('closed', 'stale')
    AND NOT EXISTS (
      SELECT 1 FROM public.owner_close_revisions AS revision
      WHERE revision.organization_id = p_organization_id
        AND revision.owner_close_series_id = v_series.id
        AND revision.status = 'preparing'
    ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'owner_close_reopen_required',
        'series_id', v_series.id::text,
        'state', v_series.state
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_balance_periods AS prior
    WHERE prior.organization_id = p_organization_id
      AND prior.property_id = p_property_id
      AND prior.owner_person_id = p_owner_person_id
      AND prior.currency = p_currency
      AND prior.month_start = (p_month_start - INTERVAL '1 month')::date
      AND prior.status <> 'closed'
  ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'prior_period_not_closed',
        'expected_month_start',
          (p_month_start - INTERVAL '1 month')::date::text
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_balance_periods AS earlier
    WHERE earlier.organization_id = p_organization_id
      AND earlier.property_id = p_property_id
      AND earlier.owner_person_id = p_owner_person_id
      AND earlier.currency = p_currency
      AND earlier.month_start < p_month_start
      AND earlier.status = 'stale'
  ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'earlier_dependent_period_stale',
        'month_start', (
          SELECT pg_catalog.min(earlier.month_start)::text
          FROM public.owner_balance_periods AS earlier
          WHERE earlier.organization_id = p_organization_id
            AND earlier.property_id = p_property_id
            AND earlier.owner_person_id = p_owner_person_id
            AND earlier.currency = p_currency
            AND earlier.month_start < p_month_start
            AND earlier.status = 'stale'
        )
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = p_organization_id
      AND request.property_id = p_property_id
      AND request.owner_person_id = p_owner_person_id
      AND request.currency = p_currency
      AND request.effective_date <= p_month_start
      AND request.status = 'submitted'
  ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'pending_owner_opening_or_correction',
        'month_start', p_month_start::text
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app_private.financial_idempotency_requests AS request
    WHERE request.organization_id = p_organization_id
      AND request.status = 'pending'
  ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'pending_financial_idempotency',
        'organization_id', p_organization_id::text
      )
    );
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'source_type', queue.source_type,
        'source_line_id', queue.source_line_id::text,
        'event_date', queue.event_date::text,
        'state', queue.allocation_state,
        'remediation_code', queue.remediation_code
      ) ORDER BY queue.event_date, queue.source_type, queue.source_line_id
    ) FILTER (WHERE queue.allocation_state <> 'allocated'),
    '[]'::jsonb
  )
  INTO v_pending_sources
  FROM public.get_owner_event_allocation_queue(
    p_organization_id,
    p_property_id,
    p_currency,
    p_month_start,
    (p_month_start + INTERVAL '1 month - 1 day')::date
  ) AS queue;

  IF pg_catalog.jsonb_array_length(v_pending_sources) > 0 THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'source_allocation_incomplete',
        'sources', v_pending_sources
      )
    );
  END IF;

  v_transfer_detail := app_private.get_unresolved_owner_transfer_detail(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );
  IF v_transfer_detail IS NOT NULL THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'unresolved_owner_transfer',
        'detail', v_transfer_detail
      )
    );
  END IF;

  FOR v_source IN
    SELECT allocation_set.source_type, allocation_set.source_line_id,
      allocation_set.source_fingerprint
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.property_id = p_property_id
      AND allocation_set.currency = p_currency
      AND allocation_set.event_date >= p_month_start
      AND allocation_set.event_date < (p_month_start + INTERVAL '1 month')::date
      AND owner_allocation.owner_person_id = p_owner_person_id
      AND allocation_set.source_type <> 'owner_close_correction'
    ORDER BY allocation_set.source_type, allocation_set.source_line_id
  LOOP
    BEGIN
      SELECT resolved.source_fingerprint
      INTO STRICT v_current_fingerprint
      FROM app_private.resolve_owner_event_source(
        p_organization_id, v_source.source_type, v_source.source_line_id
      ) AS resolved;
      IF v_current_fingerprint IS DISTINCT FROM v_source.source_fingerprint THEN
        v_blockers := v_blockers || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'source_fingerprint_changed',
            'source_type', v_source.source_type,
            'source_line_id', v_source.source_line_id::text
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_blockers := v_blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'source_evidence_unreadable',
          'source_type', v_source.source_type,
          'source_line_id', v_source.source_line_id::text
        )
      );
    END;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.owner_opening_balance_entries AS entry
    JOIN public.owner_opening_balance_requests AS request
      ON request.organization_id = entry.organization_id
     AND request.id = entry.request_id
    JOIN public.documents AS document
      ON document.organization_id = request.organization_id
     AND document.id = request.supporting_document_id
    WHERE entry.organization_id = p_organization_id
      AND entry.property_id = p_property_id
      AND entry.owner_person_id = p_owner_person_id
      AND entry.currency = p_currency
      AND entry.effective_date = p_month_start
      AND document.content_sha256 IS DISTINCT FROM request.evidence_sha256
  ) THEN
    v_blockers := v_blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'opening_evidence_integrity_changed',
        'month_start', p_month_start::text
      )
    );
  END IF;

  IF v_period.id IS NOT NULL THEN
    SELECT snapshot.*
    INTO v_input
    FROM app_private.owner_close_input_snapshot(
      p_organization_id, p_property_id, p_owner_person_id, p_currency,
      p_month_start
    ) AS snapshot;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'month_start', p_month_start::text,
    'period_id', CASE WHEN v_period.id IS NULL THEN NULL ELSE v_period.id::text END,
    'series_id', CASE WHEN v_series.id IS NULL THEN NULL ELSE v_series.id::text END,
    'series_state', v_series.state,
    'is_ready', pg_catalog.jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'components', v_components,
    'input_watermark', v_input.input_watermark,
    'input_hash', v_input.input_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_close_readiness(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_inspect_owner_close_readiness(p_organization_id) THEN
    RAISE EXCEPTION 'owner_close_readiness_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN app_private.build_owner_close_readiness(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_close_history(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_series public.owner_close_series%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_inspect_owner_close_readiness(p_organization_id) THEN
    RAISE EXCEPTION 'owner_close_history_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL
    OR p_month_start <> pg_catalog.date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'owner_close_month_start_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_currency <> 'USD'::public.currency_code THEN
    RAISE EXCEPTION 'owner_close_currency_unsupported' USING ERRCODE = '22023';
  END IF;

  SELECT series.*
  INTO v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.property_id = p_property_id
    AND series.owner_person_id = p_owner_person_id
    AND series.currency = p_currency
    AND series.month_start = p_month_start;

  IF v_series.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'series', NULL,
      'revisions', '[]'::jsonb,
      'corrections', '[]'::jsonb
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'series', pg_catalog.jsonb_build_object(
      'id', v_series.id::text,
      'state', v_series.state,
      'active_revision_id', v_series.active_revision_id::text,
      'current_closed_revision_id', v_series.current_closed_revision_id::text,
      'state_changed_at', v_series.state_changed_at
    ),
    'revisions', coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', revision.id::text,
          'revision_number', revision.revision_number,
          'status', revision.status,
          'supersedes_revision_id', revision.supersedes_revision_id::text,
          'reopen_reason', revision.reopen_reason,
          'prepared_at', revision.prepared_at,
          'prepared_by', revision.prepared_by::text,
          'input_watermark', revision.input_watermark,
          'input_hash', revision.input_hash,
          'content_hash', revision.content_hash,
          'closed_at', revision.closed_at,
          'closed_by', revision.closed_by::text,
          'close_reason', revision.close_reason,
          'lines', coalesce((
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', line.id::text,
                'line_number', line.line_number,
                'line_kind', line.line_kind,
                'component', line.component::text,
                'description', line.description,
                'business_date', line.business_date::text,
                'signed_amount', pg_catalog.to_char(
                  line.signed_amount, 'FM999999999990.00'
                ),
                'source_count', line.source_count,
                'sources', coalesce((
                  SELECT pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                      'id', source.id::text,
                      'source_type', source.source_type,
                      'source_id', source.source_id::text,
                      'source_line_id', source.source_line_id::text,
                      'source_fingerprint', source.source_fingerprint,
                      'owner_component_movement_id',
                        source.owner_component_movement_id::text,
                      'owner_event_owner_allocation_id',
                        source.owner_event_owner_allocation_id::text,
                      'owner_balance_period_component_id',
                        source.owner_balance_period_component_id::text,
                      'owner_opening_balance_entry_id',
                        source.owner_opening_balance_entry_id::text
                    ) ORDER BY source.source_type,
                      source.source_line_id, source.id
                  )
                  FROM public.owner_close_line_sources AS source
                  WHERE source.organization_id = p_organization_id
                    AND source.owner_close_revision_id = revision.id
                    AND source.close_line_id = line.id
                ), '[]'::jsonb)
              ) ORDER BY line.line_number
            )
            FROM public.owner_close_lines AS line
            WHERE line.organization_id = p_organization_id
              AND line.owner_close_revision_id = revision.id
          ), '[]'::jsonb)
        ) ORDER BY revision.revision_number DESC
      )
      FROM public.owner_close_revisions AS revision
      WHERE revision.organization_id = p_organization_id
        AND revision.owner_close_series_id = v_series.id
    ), '[]'::jsonb),
    'corrections', coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', correction.id::text,
          'owner_close_revision_id', correction.owner_close_revision_id::text,
          'effective_date', correction.effective_date::text,
          'component', correction.component::text,
          'signed_amount', pg_catalog.to_char(
            correction.signed_amount, 'FM999999999990.00'
          ),
          'reason', correction.reason,
          'source_reference', correction.source_reference,
          'evidence_sha256', correction.evidence_sha256,
          'created_at', correction.created_at,
          'created_by', correction.created_by::text
        ) ORDER BY correction.created_at, correction.id
      )
      FROM public.owner_close_corrections AS correction
      WHERE correction.organization_id = p_organization_id
        AND correction.owner_close_series_id = v_series.id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.owner_close_content_hash(
  p_organization_id uuid,
  p_revision_id uuid,
  p_close_reason text
) RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH revision_row AS (
    SELECT revision.*
    FROM public.owner_close_revisions AS revision
    WHERE revision.organization_id = p_organization_id
      AND revision.id = p_revision_id
  ), canonical AS (
    SELECT pg_catalog.concat_ws(
      E'\n--lines--\n',
      (
        SELECT revision.organization_id::text || '|' ||
          revision.property_id::text || '|' || revision.owner_person_id::text ||
          '|' || revision.currency::text || '|' || revision.month_start::text ||
          '|' || revision.revision_number::text || '|' ||
          pg_catalog.btrim(p_close_reason)
        FROM revision_row AS revision
      ),
      coalesce((
        SELECT pg_catalog.string_agg(
          line.line_number::text || '|' || line.line_kind || '|' ||
          coalesce(line.component::text, '') || '|' || line.description || '|' ||
          line.business_date::text || '|' ||
          pg_catalog.to_char(line.signed_amount, 'FM999999999990.00') || '|' ||
          line.source_count::text,
          E'\n' ORDER BY line.line_number
        )
        FROM public.owner_close_lines AS line
        WHERE line.organization_id = p_organization_id
          AND line.owner_close_revision_id = p_revision_id
      ), ''),
      '--sources--',
      coalesce((
        SELECT pg_catalog.string_agg(
          line.line_number::text || '|' || source.source_type || '|' ||
          source.source_id::text || '|' || source.source_line_id::text || '|' ||
          source.source_fingerprint || '|' ||
          coalesce(source.owner_component_movement_id::text, '') || '|' ||
          coalesce(source.owner_event_owner_allocation_id::text, '') || '|' ||
          coalesce(source.owner_balance_period_component_id::text, '') || '|' ||
          coalesce(source.owner_opening_balance_entry_id::text, ''),
          E'\n' ORDER BY line.line_number, source.source_type,
            source.source_line_id, source.id
        )
        FROM public.owner_close_line_sources AS source
        JOIN public.owner_close_lines AS line
          ON line.organization_id = source.organization_id
         AND line.id = source.close_line_id
        WHERE source.organization_id = p_organization_id
          AND source.owner_close_revision_id = p_revision_id
      ), '')
    ) AS value
  )
  SELECT pg_catalog.encode(
    extensions.digest(canonical.value, 'sha256'), 'hex'
  )
  FROM canonical;
$$;

CREATE OR REPLACE FUNCTION app_private.freeze_owner_close_revision(
  p_organization_id uuid,
  p_revision_id uuid,
  p_period_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date,
  p_actor_id uuid
) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $$
DECLARE
  v_business_count integer := 0;
  v_previous_period_id uuid;
BEGIN
  SELECT period.id
  INTO v_previous_period_id
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = (p_month_start - INTERVAL '1 month')::date;

  INSERT INTO public.owner_close_lines (
    owner_close_revision_id, organization_id, line_number, line_kind,
    component, description, business_date, signed_amount, source_count,
    created_by
  )
  SELECT
    p_revision_id,
    p_organization_id,
    app_private.owner_close_component_rank(component.component),
    'opening',
    component.component,
    CASE component.component
      WHEN 'ips_held_owner_cash' THEN 'Opening IPS-held owner cash'
      WHEN 'owner_due_to_ips' THEN 'Opening owner due to IPS'
      WHEN 'ips_due_to_owner' THEN 'Opening IPS due to owner'
      WHEN 'security_deposit_custody' THEN 'Opening security-deposit custody'
    END,
    p_month_start,
    component.opening_amount,
    CASE
      WHEN v_previous_period_id IS NOT NULL THEN 1
      ELSE (
        SELECT count(*)::integer
        FROM public.owner_opening_balance_entries AS entry
        WHERE entry.organization_id = p_organization_id
          AND entry.property_id = p_property_id
          AND entry.owner_person_id = p_owner_person_id
          AND entry.currency = p_currency
          AND entry.effective_date = p_month_start
          AND entry.component = component.component
      )
    END,
    p_actor_id
  FROM public.owner_balance_period_components AS component
  WHERE component.organization_id = p_organization_id
    AND component.owner_balance_period_id = p_period_id
  ORDER BY app_private.owner_close_component_rank(component.component);

  IF v_previous_period_id IS NOT NULL THEN
    INSERT INTO public.owner_close_line_sources (
      owner_close_revision_id, organization_id, close_line_id,
      source_type, source_id, source_line_id, source_fingerprint,
      owner_balance_period_component_id, created_by
    )
    SELECT
      p_revision_id,
      p_organization_id,
      line.id,
      'prior_period_component',
      v_previous_period_id,
      previous_component.id,
      pg_catalog.encode(
        extensions.digest(
          v_previous_period_id::text || '|' ||
          previous_component.component::text || '|' ||
          pg_catalog.to_char(
            previous_component.closing_amount, 'FM999999999990.00'
          ),
          'sha256'
        ),
        'hex'
      ),
      previous_component.id,
      p_actor_id
    FROM public.owner_close_lines AS line
    JOIN public.owner_balance_period_components AS previous_component
      ON previous_component.organization_id = p_organization_id
     AND previous_component.owner_balance_period_id = v_previous_period_id
     AND previous_component.component = line.component
    WHERE line.organization_id = p_organization_id
      AND line.owner_close_revision_id = p_revision_id
      AND line.line_kind = 'opening';
  ELSE
    INSERT INTO public.owner_close_line_sources (
      owner_close_revision_id, organization_id, close_line_id,
      source_type, source_id, source_line_id, source_fingerprint,
      owner_opening_balance_entry_id, created_by
    )
    SELECT
      p_revision_id,
      p_organization_id,
      line.id,
      'opening_balance_entry',
      entry.request_id,
      entry.id,
      pg_catalog.encode(
        extensions.digest(
          entry.id::text || '|' || entry.request_id::text || '|' ||
          entry.component::text || '|' || entry.entry_kind || '|' ||
          pg_catalog.to_char(entry.signed_amount, 'FM999999999990.00') || '|' ||
          request.evidence_sha256,
          'sha256'
        ),
        'hex'
      ),
      entry.id,
      p_actor_id
    FROM public.owner_close_lines AS line
    JOIN public.owner_opening_balance_entries AS entry
      ON entry.organization_id = p_organization_id
     AND entry.property_id = p_property_id
     AND entry.owner_person_id = p_owner_person_id
     AND entry.currency = p_currency
     AND entry.effective_date = p_month_start
     AND entry.component = line.component
    JOIN public.owner_opening_balance_requests AS request
      ON request.organization_id = entry.organization_id
     AND request.id = entry.request_id
    WHERE line.organization_id = p_organization_id
      AND line.owner_close_revision_id = p_revision_id
      AND line.line_kind = 'opening';
  END IF;

  WITH business_rows AS (
    SELECT
      gen_random_uuid() AS line_id,
      'movement'::text AS line_kind,
      movement.component,
      app_private.owner_close_source_label(allocation_set.source_type)
        || ' · ' || movement.component::text AS description,
      movement.event_date AS business_date,
      movement.signed_amount,
      allocation_set.source_type,
      allocation_set.source_id,
      allocation_set.source_line_id,
      allocation_set.source_fingerprint,
      movement.id AS owner_component_movement_id,
      NULL::uuid AS owner_event_owner_allocation_id,
      app_private.owner_close_source_rank(allocation_set.source_type) AS source_rank,
      app_private.owner_close_component_rank(movement.component) AS component_rank,
      movement.id AS stable_id
    FROM public.owner_component_movements AS movement
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = movement.organization_id
     AND owner_allocation.id = movement.owner_event_owner_allocation_id
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = owner_allocation.organization_id
     AND allocation_set.id = owner_allocation.allocation_set_id
    WHERE movement.organization_id = p_organization_id
      AND movement.property_id = p_property_id
      AND movement.owner_person_id = p_owner_person_id
      AND movement.currency = p_currency
      AND movement.month_start = p_month_start

    UNION ALL

    SELECT
      gen_random_uuid(),
      'activity'::text,
      NULL::public.owner_balance_component,
      app_private.owner_close_source_label(allocation_set.source_type),
      allocation_set.event_date,
      owner_allocation.allocated_gross_signed_amount,
      allocation_set.source_type,
      allocation_set.source_id,
      allocation_set.source_line_id,
      allocation_set.source_fingerprint,
      NULL::uuid,
      owner_allocation.id,
      app_private.owner_close_source_rank(allocation_set.source_type),
      0,
      owner_allocation.id
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    WHERE allocation_set.organization_id = p_organization_id
      AND allocation_set.property_id = p_property_id
      AND allocation_set.currency = p_currency
      AND allocation_set.event_date >= p_month_start
      AND allocation_set.event_date < (p_month_start + INTERVAL '1 month')::date
      AND owner_allocation.owner_person_id = p_owner_person_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_component_movements AS movement
        WHERE movement.organization_id = owner_allocation.organization_id
          AND movement.owner_event_owner_allocation_id = owner_allocation.id
      )
  ), numbered AS (
    SELECT business.*,
      4 + pg_catalog.row_number() OVER (
        ORDER BY business.business_date, business.source_rank,
          business.source_line_id, business.component_rank,
          business.stable_id
      )::integer AS line_number
    FROM business_rows AS business
  ), inserted_lines AS (
    INSERT INTO public.owner_close_lines (
      id, owner_close_revision_id, organization_id, line_number, line_kind,
      component, description, business_date, signed_amount, source_count,
      created_by
    )
    SELECT
      numbered.line_id, p_revision_id, p_organization_id,
      numbered.line_number, numbered.line_kind, numbered.component,
      numbered.description, numbered.business_date, numbered.signed_amount,
      1, p_actor_id
    FROM numbered
    ORDER BY numbered.line_number
    RETURNING id
  )
  INSERT INTO public.owner_close_line_sources (
    owner_close_revision_id, organization_id, close_line_id,
    source_type, source_id, source_line_id, source_fingerprint,
    owner_component_movement_id, owner_event_owner_allocation_id, created_by
  )
  SELECT
    p_revision_id, p_organization_id, numbered.line_id,
    numbered.source_type, numbered.source_id, numbered.source_line_id,
    numbered.source_fingerprint, numbered.owner_component_movement_id,
    numbered.owner_event_owner_allocation_id, p_actor_id
  FROM numbered
  JOIN inserted_lines ON inserted_lines.id = numbered.line_id;

  SELECT count(*)::integer
  INTO v_business_count
  FROM public.owner_close_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.owner_close_revision_id = p_revision_id
    AND line.line_kind IN ('movement', 'activity');

  INSERT INTO public.owner_close_lines (
    owner_close_revision_id, organization_id, line_number, line_kind,
    component, description, business_date, signed_amount, source_count,
    created_by
  )
  SELECT
    p_revision_id,
    p_organization_id,
    4 + v_business_count
      + app_private.owner_close_component_rank(component.component),
    'closing',
    component.component,
    CASE component.component
      WHEN 'ips_held_owner_cash' THEN 'Closing IPS-held owner cash'
      WHEN 'owner_due_to_ips' THEN 'Closing owner due to IPS'
      WHEN 'ips_due_to_owner' THEN 'Closing IPS due to owner'
      WHEN 'security_deposit_custody' THEN 'Closing security-deposit custody'
    END,
    (p_month_start + INTERVAL '1 month - 1 day')::date,
    component.closing_amount,
    1,
    p_actor_id
  FROM public.owner_balance_period_components AS component
  WHERE component.organization_id = p_organization_id
    AND component.owner_balance_period_id = p_period_id
  ORDER BY app_private.owner_close_component_rank(component.component);

  INSERT INTO public.owner_close_line_sources (
    owner_close_revision_id, organization_id, close_line_id,
    source_type, source_id, source_line_id, source_fingerprint,
    owner_balance_period_component_id, created_by
  )
  SELECT
    p_revision_id,
    p_organization_id,
    line.id,
    'period_component',
    p_period_id,
    component.id,
    pg_catalog.encode(
      extensions.digest(
        p_period_id::text || '|' || component.component::text || '|' ||
        pg_catalog.to_char(component.opening_amount, 'FM999999999990.00') || '|' ||
        pg_catalog.to_char(component.movement_amount, 'FM999999999990.00') || '|' ||
        pg_catalog.to_char(component.closing_amount, 'FM999999999990.00'),
        'sha256'
      ),
      'hex'
    ),
    component.id,
    p_actor_id
  FROM public.owner_close_lines AS line
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = p_organization_id
   AND component.owner_balance_period_id = p_period_id
   AND component.component = line.component
  WHERE line.organization_id = p_organization_id
    AND line.owner_close_revision_id = p_revision_id
    AND line.line_kind = 'closing';

  RETURN v_business_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_owner_month(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_month_start date,
  p_close_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_close_reason text := pg_catalog.btrim(p_close_reason);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_replay_result jsonb;
  v_claim record;
  v_readiness jsonb;
  v_input_before record;
  v_input_after record;
  v_period public.owner_balance_periods%ROWTYPE;
  v_series public.owner_close_series%ROWTYPE;
  v_revision public.owner_close_revisions%ROWTYPE;
  v_series_id uuid;
  v_revision_id uuid;
  v_content_hash text;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_close_owner_month(p_organization_id) THEN
    RAISE EXCEPTION 'owner_close_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL
    OR p_month_start <> pg_catalog.date_trunc('month', p_month_start)::date THEN
    RAISE EXCEPTION 'owner_close_month_start_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_currency <> 'USD'::public.currency_code THEN
    RAISE EXCEPTION 'owner_close_currency_unsupported' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_close_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'owner_close_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_close_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'month_start', p_month_start::text,
    'close_reason', v_close_reason
  );

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id, 'close_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );

  v_readiness := app_private.build_owner_close_readiness(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  );
  IF NOT (v_readiness->>'is_ready')::boolean THEN
    RAISE EXCEPTION 'owner_close_blocked'
      USING ERRCODE = '23514', DETAIL = (v_readiness->'blockers')::text;
  END IF;

  SELECT snapshot.*
  INTO STRICT v_input_before
  FROM app_private.owner_close_input_snapshot(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  ) AS snapshot;

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'close_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT period.*
  INTO STRICT v_period
  FROM public.owner_balance_periods AS period
  WHERE period.organization_id = p_organization_id
    AND period.property_id = p_property_id
    AND period.owner_person_id = p_owner_person_id
    AND period.currency = p_currency
    AND period.month_start = p_month_start
  FOR UPDATE;

  SELECT series.*
  INTO v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.property_id = p_property_id
    AND series.owner_person_id = p_owner_person_id
    AND series.currency = p_currency
    AND series.month_start = p_month_start
  FOR UPDATE;

  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context', 'checked-owner-close-v1', true
  );

  IF v_series.id IS NULL THEN
    INSERT INTO public.owner_close_series (
      organization_id, property_id, owner_person_id, currency, month_start,
      state, created_by, state_changed_by
    ) VALUES (
      p_organization_id, p_property_id, p_owner_person_id, p_currency,
      p_month_start, 'open', v_actor_id, v_actor_id
    )
    RETURNING id INTO v_series_id;
  ELSE
    v_series_id := v_series.id;
  END IF;

  IF v_series.id IS NOT NULL AND v_series.state = 'preparing' THEN
    SELECT revision.*
    INTO STRICT v_revision
    FROM public.owner_close_revisions AS revision
    WHERE revision.organization_id = p_organization_id
      AND revision.owner_close_series_id = v_series.id
      AND revision.id = v_series.active_revision_id
      AND revision.status = 'preparing'
    FOR UPDATE;
    v_revision_id := v_revision.id;
  ELSIF v_series.id IS NULL OR v_series.state = 'open' THEN
    INSERT INTO public.owner_close_revisions (
      owner_close_series_id, organization_id, property_id, owner_person_id,
      currency, month_start, revision_number, status, prepared_by
    ) VALUES (
      v_series_id, p_organization_id, p_property_id, p_owner_person_id,
      p_currency, p_month_start, 1, 'preparing', v_actor_id
    )
    RETURNING id INTO v_revision_id;

    UPDATE public.owner_close_series AS series
    SET state = 'preparing',
      active_revision_id = v_revision_id,
      state_changed_at = pg_catalog.now(),
      state_changed_by = v_actor_id
    WHERE series.organization_id = p_organization_id
      AND series.id = v_series_id;
  ELSE
    RAISE EXCEPTION 'owner_close_reopen_required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.owner_close_lines AS line
    WHERE line.organization_id = p_organization_id
      AND line.owner_close_revision_id = v_revision_id
  ) THEN
    RAISE EXCEPTION 'preparing_owner_revision_already_frozen'
      USING ERRCODE = '23505';
  END IF;

  PERFORM app_private.freeze_owner_close_revision(
    p_organization_id, v_revision_id, v_period.id, p_property_id,
    p_owner_person_id, p_currency, p_month_start, v_actor_id
  );

  SELECT snapshot.*
  INTO STRICT v_input_after
  FROM app_private.owner_close_input_snapshot(
    p_organization_id, p_property_id, p_owner_person_id, p_currency,
    p_month_start
  ) AS snapshot;

  IF v_input_after.input_hash IS DISTINCT FROM v_input_before.input_hash
    OR v_input_after.input_watermark IS DISTINCT FROM v_input_before.input_watermark THEN
    RAISE EXCEPTION 'owner_close_input_changed_concurrently'
      USING ERRCODE = '40001';
  END IF;

  v_content_hash := app_private.owner_close_content_hash(
    p_organization_id, v_revision_id, v_close_reason
  );

  UPDATE public.owner_close_revisions AS revision
  SET status = 'closed',
    input_watermark = v_input_after.input_watermark,
    input_hash = v_input_after.input_hash,
    content_hash = v_content_hash,
    closed_at = pg_catalog.now(),
    closed_by = v_actor_id,
    close_reason = v_close_reason
  WHERE revision.organization_id = p_organization_id
    AND revision.id = v_revision_id
    AND revision.status = 'preparing';

  UPDATE public.owner_close_series AS series
  SET state = 'closed',
    active_revision_id = v_revision_id,
    current_closed_revision_id = v_revision_id,
    state_changed_at = pg_catalog.now(),
    state_changed_by = v_actor_id
  WHERE series.organization_id = p_organization_id
    AND series.id = v_series_id;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', 'checked-rollforward-v1', true
  );
  UPDATE public.owner_balance_periods AS period
  SET status = 'closed',
    closed_revision_id = v_revision_id,
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = NULL,
    stale_reason = NULL
  WHERE period.organization_id = p_organization_id
    AND period.id = v_period.id;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'closed',
    'series_id', v_series_id::text,
    'revision_id', v_revision_id::text,
    'revision_number', (
      SELECT revision.revision_number
      FROM public.owner_close_revisions AS revision
      WHERE revision.id = v_revision_id
    ),
    'input_hash', v_input_after.input_hash,
    'content_hash', v_content_hash
  );

  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_owner_month(
  p_organization_id uuid,
  p_owner_close_series_id uuid,
  p_reopen_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reopen_reason text := pg_catalog.btrim(p_reopen_reason);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_replay_result jsonb;
  v_claim record;
  v_series public.owner_close_series%ROWTYPE;
  v_current public.owner_close_revisions%ROWTYPE;
  v_revision_id uuid;
  v_revision_number integer;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_reopen_owner_month(p_organization_id) THEN
    RAISE EXCEPTION 'owner_reopen_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_owner_close_series_id IS NULL THEN
    RAISE EXCEPTION 'owner_close_series_required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reopen_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'owner_reopen_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_reopen_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'owner_close_series_id', p_owner_close_series_id::text,
    'reopen_reason', v_reopen_reason
  );
  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id, 'reopen_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT series.*
  INTO v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = p_owner_close_series_id;
  IF v_series.id IS NULL THEN
    RAISE EXCEPTION 'owner_close_series_not_found' USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT series.*
  INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = p_owner_close_series_id
  FOR UPDATE;

  IF v_series.state NOT IN ('closed', 'stale')
    OR v_series.current_closed_revision_id IS NULL THEN
    RAISE EXCEPTION 'owner_close_series_not_closed' USING ERRCODE = '22023';
  END IF;

  SELECT revision.*
  INTO STRICT v_current
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = v_series.current_closed_revision_id
    AND revision.status = 'closed'
  FOR KEY SHARE;

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'reopen_owner_month', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT coalesce(pg_catalog.max(revision.revision_number), 0) + 1
  INTO v_revision_number
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.owner_close_series_id = v_series.id;

  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context', 'checked-owner-close-v1', true
  );
  INSERT INTO public.owner_close_revisions (
    owner_close_series_id, organization_id, property_id, owner_person_id,
    currency, month_start, revision_number, status,
    supersedes_revision_id, reopen_reason, prepared_by
  ) VALUES (
    v_series.id, p_organization_id, v_series.property_id,
    v_series.owner_person_id, v_series.currency, v_series.month_start,
    v_revision_number, 'preparing', v_current.id, v_reopen_reason, v_actor_id
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.owner_close_series AS series
  SET state = 'preparing',
    active_revision_id = v_revision_id,
    state_changed_at = pg_catalog.now(),
    state_changed_by = v_actor_id
  WHERE series.organization_id = p_organization_id
    AND series.id = v_series.id;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', 'checked-rollforward-v1', true
  );
  UPDATE public.owner_balance_periods AS period
  SET status = 'stale',
    closed_revision_id = NULL,
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = CASE
      WHEN period.month_start = v_series.month_start
        THEN 'owner_close_reopened:' || v_revision_id::text
      ELSE 'earlier_owner_close_reopened:' || v_revision_id::text
    END
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_series.property_id
    AND period.owner_person_id = v_series.owner_person_id
    AND period.currency = v_series.currency
    AND period.month_start >= v_series.month_start;

  UPDATE public.owner_close_series AS later_series
  SET state = 'stale',
    active_revision_id = later_series.current_closed_revision_id,
    state_changed_at = pg_catalog.now(),
    state_changed_by = v_actor_id
  WHERE later_series.organization_id = p_organization_id
    AND later_series.property_id = v_series.property_id
    AND later_series.owner_person_id = v_series.owner_person_id
    AND later_series.currency = v_series.currency
    AND later_series.month_start > v_series.month_start
    AND later_series.current_closed_revision_id IS NOT NULL;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'preparing',
    'series_id', v_series.id::text,
    'revision_id', v_revision_id::text,
    'revision_number', v_revision_number,
    'supersedes_revision_id', v_current.id::text
  );
  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_owner_close_correction(
  p_organization_id uuid,
  p_owner_close_revision_id uuid,
  p_component public.owner_balance_component,
  p_effective_date date,
  p_signed_amount numeric,
  p_reason text,
  p_source_reference text,
  p_evidence_sha256 text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_source_reference text := pg_catalog.btrim(p_source_reference);
  v_evidence_sha256 text := pg_catalog.btrim(p_evidence_sha256);
  v_idempotency_key text := pg_catalog.btrim(p_idempotency_key);
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_claim record;
  v_revision public.owner_close_revisions%ROWTYPE;
  v_series public.owner_close_series%ROWTYPE;
  v_owner record;
  v_current_closing numeric(14,2);
  v_existing_corrections numeric(14,2);
  v_correction_id uuid;
  v_allocation_set_id uuid;
  v_owner_allocation_id uuid;
  v_movement_id uuid;
  v_source_fingerprint text;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.can_reopen_owner_month(p_organization_id) THEN
    RAISE EXCEPTION 'owner_close_correction_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_owner_close_revision_id IS NULL OR p_effective_date IS NULL
    OR p_component IS NULL THEN
    RAISE EXCEPTION 'owner_close_correction_target_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_signed_amount IS NULL OR p_signed_amount = 0
    OR p_signed_amount <> pg_catalog.round(p_signed_amount, 2) THEN
    RAISE EXCEPTION 'owner_close_correction_amount_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) NOT BETWEEN 3 AND 500
    OR pg_catalog.length(v_source_reference) NOT BETWEEN 3 AND 240
    OR v_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'owner_close_correction_evidence_invalid' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'owner_close_correction_idempotency_key_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'owner_close_revision_id', p_owner_close_revision_id::text,
    'component', p_component::text,
    'effective_date', p_effective_date::text,
    'signed_amount', pg_catalog.to_char(
      p_signed_amount, 'FM999999999990.00'
    ),
    'reason', v_reason,
    'source_reference', v_source_reference,
    'evidence_sha256', v_evidence_sha256
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);
  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id, 'record_owner_close_correction', v_idempotency_key,
    v_actor_id, v_payload
  );
  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = p_owner_close_revision_id;
  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'owner_close_revision_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT series.*
  INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = v_revision.owner_close_series_id;

  PERFORM app_private.lock_owner_close_scope(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );
  PERFORM app_private.lock_owner_close_sources(
    p_organization_id, v_series.property_id, v_series.owner_person_id,
    v_series.currency, v_series.month_start
  );

  SELECT series.*
  INTO STRICT v_series
  FROM public.owner_close_series AS series
  WHERE series.organization_id = p_organization_id
    AND series.id = v_revision.owner_close_series_id
  FOR UPDATE;
  SELECT revision.*
  INTO STRICT v_revision
  FROM public.owner_close_revisions AS revision
  WHERE revision.organization_id = p_organization_id
    AND revision.id = p_owner_close_revision_id
  FOR UPDATE;

  IF v_series.state <> 'preparing'
    OR v_series.active_revision_id <> v_revision.id
    OR v_revision.status <> 'preparing' THEN
    RAISE EXCEPTION 'owner_close_correction_requires_preparing_revision'
      USING ERRCODE = '22023';
  END IF;
  IF p_effective_date < v_series.month_start
    OR p_effective_date >= (v_series.month_start + INTERVAL '1 month')::date THEN
    RAISE EXCEPTION 'owner_close_correction_date_outside_period'
      USING ERRCODE = '22023';
  END IF;
  IF NOT app_private.is_financial_month_locked(
    p_organization_id, v_series.month_start
  ) THEN
    RAISE EXCEPTION 'owner_close_correction_month_not_locked'
      USING ERRCODE = '22023';
  END IF;

  SELECT component.closing_amount
  INTO STRICT v_current_closing
  FROM public.owner_balance_periods AS period
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = period.organization_id
   AND component.owner_balance_period_id = period.id
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_series.property_id
    AND period.owner_person_id = v_series.owner_person_id
    AND period.currency = v_series.currency
    AND period.month_start = v_series.month_start
    AND component.component = p_component;

  SELECT coalesce(pg_catalog.sum(correction.signed_amount), 0)::numeric(14,2)
  INTO v_existing_corrections
  FROM public.owner_close_corrections AS correction
  WHERE correction.organization_id = p_organization_id
    AND correction.owner_close_revision_id = v_revision.id
    AND correction.component = p_component;

  IF v_current_closing + v_existing_corrections + p_signed_amount < 0 THEN
    RAISE EXCEPTION 'owner_close_correction_negative_component'
      USING ERRCODE = '23514';
  END IF;

  SELECT roster.*
  INTO v_owner
  FROM app_private.validate_owner_roster_on_date(
    p_organization_id, v_series.property_id, p_effective_date
  ) AS roster
  WHERE roster.owner_person_id = v_series.owner_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_close_correction_owner_not_effective'
      USING ERRCODE = '23514';
  END IF;

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'record_owner_close_correction', v_idempotency_key,
    v_actor_id, v_payload
  ) AS claim;
  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids || pg_catalog.jsonb_build_object('status', 'replayed');
  END IF;

  PERFORM pg_catalog.set_config(
    'app.owner_close_write_context', 'checked-owner-close-v1', true
  );
  PERFORM pg_catalog.set_config(
    'app.owner_balance_write_context', 'checked-owner-balance-v1', true
  );

  INSERT INTO public.owner_close_corrections (
    owner_close_revision_id, owner_close_series_id, organization_id,
    property_id, owner_person_id, currency, month_start, effective_date,
    component, signed_amount, reason, source_reference, evidence_sha256,
    idempotency_key, payload_hash, created_by
  ) VALUES (
    v_revision.id, v_series.id, p_organization_id, v_series.property_id,
    v_series.owner_person_id, v_series.currency, v_series.month_start,
    p_effective_date, p_component, p_signed_amount, v_reason,
    v_source_reference, v_evidence_sha256, v_idempotency_key,
    v_payload_hash, v_actor_id
  )
  RETURNING id INTO v_correction_id;

  v_source_fingerprint := pg_catalog.encode(
    extensions.digest(
      v_correction_id::text || '|' || v_revision.id::text || '|' ||
      p_component::text || '|' || p_effective_date::text || '|' ||
      pg_catalog.to_char(p_signed_amount, 'FM999999999990.00') || '|' ||
      v_reason || '|' || v_source_reference || '|' || v_evidence_sha256,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.owner_event_allocation_sets (
    organization_id, property_id, currency, event_date, source_type,
    source_id, source_line_id, gross_signed_amount, source_fingerprint,
    allocation_basis, explicit_owner_person_id, idempotency_key,
    command_payload_hash, created_by
  ) VALUES (
    p_organization_id, v_series.property_id, v_series.currency,
    p_effective_date, 'owner_close_correction', v_correction_id,
    v_correction_id, p_signed_amount, v_source_fingerprint,
    'explicit_owner', v_series.owner_person_id, v_idempotency_key,
    v_payload_hash, v_actor_id
  )
  RETURNING id INTO v_allocation_set_id;

  INSERT INTO public.owner_event_owner_allocations (
    allocation_set_id, organization_id, property_owner_id, owner_person_id,
    ownership_percent_snapshot, ownership_started_on_snapshot,
    ownership_ended_on_snapshot, ownership_roster_hash,
    allocated_gross_signed_amount, allocation_order, created_by
  ) VALUES (
    v_allocation_set_id, p_organization_id, v_owner.property_owner_id,
    v_series.owner_person_id, v_owner.ownership_percent, v_owner.started_on,
    v_owner.ended_on, v_owner.ownership_roster_hash, p_signed_amount, 1,
    v_actor_id
  )
  RETURNING id INTO v_owner_allocation_id;

  INSERT INTO public.owner_component_movements (
    organization_id, owner_event_owner_allocation_id, property_id,
    owner_person_id, currency, event_date, month_start, component,
    signed_amount, movement_order, created_by
  ) VALUES (
    p_organization_id, v_owner_allocation_id, v_series.property_id,
    v_series.owner_person_id, v_series.currency, p_effective_date,
    v_series.month_start, p_component, p_signed_amount, 1, v_actor_id
  )
  RETURNING id INTO v_movement_id;

  PERFORM pg_catalog.set_config(
    'app.owner_balance_period_write_context', 'checked-rollforward-v1', true
  );
  UPDATE public.owner_balance_periods AS period
  SET status = 'stale',
    closed_revision_id = NULL,
    blocked_reason_code = NULL,
    blocked_reason_detail = NULL,
    stale_at = pg_catalog.now(),
    stale_reason = 'owner_close_correction:' || v_correction_id::text
  WHERE period.organization_id = p_organization_id
    AND period.property_id = v_series.property_id
    AND period.owner_person_id = v_series.owner_person_id
    AND period.currency = v_series.currency
    AND period.month_start >= v_series.month_start;

  UPDATE public.owner_close_series AS later_series
  SET state = 'stale',
    active_revision_id = later_series.current_closed_revision_id,
    state_changed_at = pg_catalog.now(),
    state_changed_by = v_actor_id
  WHERE later_series.organization_id = p_organization_id
    AND later_series.property_id = v_series.property_id
    AND later_series.owner_person_id = v_series.owner_person_id
    AND later_series.currency = v_series.currency
    AND later_series.month_start > v_series.month_start
    AND later_series.current_closed_revision_id IS NOT NULL;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'recorded',
    'correction_id', v_correction_id::text,
    'allocation_set_id', v_allocation_set_id::text,
    'movement_id', v_movement_id::text,
    'revision_id', v_revision.id::text
  );
  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id, v_result
  );
END;
$$;

DO $allow_closed_predecessor_rollforward$
DECLARE
  v_definition text;
  v_old text := 'IF v_previous.status <> ''ready'' THEN';
  v_new text := 'IF v_previous.status NOT IN (''ready'', ''closed'') THEN';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app_private.generate_owner_balance_period(uuid,uuid,uuid,public.currency_code,date,text)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'owner_balance_closed_predecessor_contract_changed';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$allow_closed_predecessor_rollforward$;

ALTER TABLE public.owner_close_series OWNER TO postgres;
ALTER TABLE public.owner_close_revisions OWNER TO postgres;
ALTER TABLE public.owner_close_lines OWNER TO postgres;
ALTER TABLE public.owner_close_line_sources OWNER TO postgres;
ALTER TABLE public.owner_close_corrections OWNER TO postgres;

ALTER FUNCTION app_private.owner_close_component_rank(
  public.owner_balance_component
) OWNER TO postgres;
ALTER FUNCTION app_private.owner_close_source_rank(text) OWNER TO postgres;
ALTER FUNCTION app_private.owner_close_source_label(text) OWNER TO postgres;
ALTER FUNCTION app_private.lock_owner_close_scope(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION app_private.lock_owner_close_sources(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION app_private.owner_close_input_snapshot(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION app_private.build_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION app_private.owner_close_content_hash(
  uuid, uuid, text
) OWNER TO postgres;
ALTER FUNCTION app_private.freeze_owner_close_revision(
  uuid, uuid, uuid, uuid, uuid, public.currency_code, date, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.owner_close_component_rank(
  public.owner_balance_component
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.owner_close_source_rank(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.owner_close_source_label(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_owner_close_scope(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.lock_owner_close_sources(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.owner_close_input_snapshot(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.build_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.owner_close_content_hash(
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.freeze_owner_close_revision(
  uuid, uuid, uuid, uuid, uuid, public.currency_code, date, uuid
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.get_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION public.get_owner_close_history(
  uuid, uuid, uuid, public.currency_code, date
) OWNER TO postgres;
ALTER FUNCTION public.close_owner_month(
  uuid, uuid, uuid, public.currency_code, date, text, text
) OWNER TO postgres;
ALTER FUNCTION public.reopen_owner_month(
  uuid, uuid, text, text
) OWNER TO postgres;
ALTER FUNCTION public.record_owner_close_correction(
  uuid, uuid, public.owner_balance_component, date, numeric,
  text, text, text, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_close_readiness(
  uuid, uuid, uuid, public.currency_code, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_owner_close_history(
  uuid, uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_close_history(
  uuid, uuid, uuid, public.currency_code, date
) TO authenticated;

REVOKE ALL ON FUNCTION public.close_owner_month(
  uuid, uuid, uuid, public.currency_code, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.close_owner_month(
  uuid, uuid, uuid, public.currency_code, date, text, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.reopen_owner_month(
  uuid, uuid, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_owner_month(
  uuid, uuid, text, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.record_owner_close_correction(
  uuid, uuid, public.owner_balance_component, date, numeric,
  text, text, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_close_correction(
  uuid, uuid, public.owner_balance_component, date, numeric,
  text, text, text, text
) TO authenticated;
