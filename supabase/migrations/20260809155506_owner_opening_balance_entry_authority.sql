CREATE OR REPLACE FUNCTION app_private.can_read_owner_balance_authority(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager', 'finance_member'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_submit_owner_opening_balance(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_member'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_request_owner_opening_balance_correction(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager', 'finance_member'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_review_owner_opening_balance(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_inspect_owner_close_readiness(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id)
      IN ('super_admin', 'finance_manager', 'finance_member'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_close_owner_month(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_reopen_owner_month(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.can_publish_owner_statement(
  target_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$$;

ALTER FUNCTION app_private.can_read_owner_balance_authority(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_submit_owner_opening_balance(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_request_owner_opening_balance_correction(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_review_owner_opening_balance(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_inspect_owner_close_readiness(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_close_owner_month(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_reopen_owner_month(uuid) OWNER TO postgres;
ALTER FUNCTION app_private.can_publish_owner_statement(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION app_private.can_read_owner_balance_authority(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_submit_owner_opening_balance(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_request_owner_opening_balance_correction(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_review_owner_opening_balance(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_inspect_owner_close_readiness(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_close_owner_month(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_reopen_owner_month(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_publish_owner_statement(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE UNIQUE INDEX owner_opening_balance_requests_authority_id_uidx
  ON public.owner_opening_balance_requests (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component,
    id
  );

CREATE TABLE public.owner_opening_balance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  property_owner_id uuid NOT NULL,
  ownership_percent_snapshot numeric(6,3) NOT NULL,
  ownership_roster_hash text NOT NULL,
  currency public.currency_code NOT NULL,
  effective_date date NOT NULL,
  component public.owner_balance_component NOT NULL,
  entry_kind text NOT NULL,
  signed_amount numeric(14,2) NOT NULL,
  reversal_of_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,

  CONSTRAINT owner_opening_balance_entries_organization_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations (id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_entries_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_entries_owner_person_fkey
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_entries_property_owner_fkey
    FOREIGN KEY (
      organization_id,
      property_id,
      owner_person_id,
      property_owner_id
    )
    REFERENCES public.property_owners (
      organization_id,
      property_id,
      person_id,
      id
    )
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_entries_request_fkey
    FOREIGN KEY (
      organization_id,
      property_id,
      owner_person_id,
      currency,
      effective_date,
      component,
      request_id
    )
    REFERENCES public.owner_opening_balance_requests (
      organization_id,
      property_id,
      owner_person_id,
      currency,
      effective_date,
      component,
      id
    )
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_entries_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users (id)
    ON DELETE RESTRICT,

  CONSTRAINT owner_opening_balance_entries_org_id_uidx
    UNIQUE (organization_id, id),
  CONSTRAINT owner_opening_balance_entries_scope_id_uidx
    UNIQUE (
      organization_id,
      property_id,
      owner_person_id,
      currency,
      effective_date,
      component,
      id
    ),
  CONSTRAINT owner_opening_balance_entries_request_kind_uidx
    UNIQUE (request_id, entry_kind),

  CONSTRAINT owner_opening_balance_entries_ownership_snapshot_check
    CHECK (
      ownership_percent_snapshot > 0.000
      AND ownership_percent_snapshot <= 100.000
    ),
  CONSTRAINT owner_opening_balance_entries_roster_hash_check
    CHECK (ownership_roster_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT owner_opening_balance_entries_currency_check
    CHECK (currency = 'USD'::public.currency_code),
  CONSTRAINT owner_opening_balance_entries_effective_month_check
    CHECK (
      effective_date = date_trunc('month', effective_date::timestamp)::date
    ),
  CONSTRAINT owner_opening_balance_entries_kind_check
    CHECK (
      entry_kind IN (
        'opening',
        'correction_reversal',
        'correction_replacement'
      )
    ),
  CONSTRAINT owner_opening_balance_entries_amount_lineage_check
    CHECK (
      (
        entry_kind IN ('opening', 'correction_replacement')
        AND signed_amount >= 0.00
        AND reversal_of_entry_id IS NULL
      )
      OR (
        entry_kind = 'correction_reversal'
        AND signed_amount <= 0.00
        AND reversal_of_entry_id IS NOT NULL
      )
    ),
  CONSTRAINT owner_opening_balance_entries_reversal_not_self_check
    CHECK (
      reversal_of_entry_id IS NULL
      OR reversal_of_entry_id <> id
    )
);

ALTER TABLE public.owner_opening_balance_entries OWNER TO postgres;

CREATE UNIQUE INDEX owner_opening_balance_entries_opening_uidx
  ON public.owner_opening_balance_entries (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component
  )
  WHERE entry_kind = 'opening';

CREATE UNIQUE INDEX owner_opening_balance_entries_reversal_target_uidx
  ON public.owner_opening_balance_entries (reversal_of_entry_id)
  WHERE reversal_of_entry_id IS NOT NULL;

CREATE INDEX owner_opening_balance_entries_authority_idx
  ON public.owner_opening_balance_entries (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component,
    created_at,
    id
  );

ALTER TABLE public.owner_opening_balance_entries
  ADD CONSTRAINT owner_opening_balance_entries_reversal_target_fkey
  FOREIGN KEY (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component,
    reversal_of_entry_id
  )
  REFERENCES public.owner_opening_balance_entries (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component,
    id
  )
  ON DELETE RESTRICT;

ALTER TABLE public.owner_opening_balance_requests
  ADD CONSTRAINT owner_opening_balance_requests_correction_target_fkey
  FOREIGN KEY (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component,
    correction_of_entry_id
  )
  REFERENCES public.owner_opening_balance_entries (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component,
    id
  )
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_balance_correction_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_target public.owner_opening_balance_entries%ROWTYPE;
BEGIN
  IF NEW.request_kind <> 'correction' THEN
    RETURN NEW;
  END IF;

  SELECT target.*
  INTO v_target
  FROM public.owner_opening_balance_entries AS target
  WHERE target.organization_id = NEW.organization_id
    AND target.property_id = NEW.property_id
    AND target.owner_person_id = NEW.owner_person_id
    AND target.currency = NEW.currency
    AND target.effective_date = NEW.effective_date
    AND target.component = NEW.component
    AND target.id = NEW.correction_of_entry_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'owner opening correction target is missing or outside the authority scope';
  END IF;

  IF v_target.entry_kind NOT IN ('opening', 'correction_replacement') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'owner opening correction target must carry current authority';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_opening_balance_entries AS reversal
    WHERE reversal.reversal_of_entry_id = v_target.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'owner opening correction target is stale';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_opening_balance_correction_target()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_opening_balance_correction_target()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_owner_opening_balance_correction_target
  BEFORE INSERT
  ON public.owner_opening_balance_requests
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_owner_opening_balance_correction_target();

CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_balance_entry_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_request public.owner_opening_balance_requests%ROWTYPE;
  v_target public.owner_opening_balance_entries%ROWTYPE;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'owner opening entries require the checked approval path';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.owner_opening_balance_requests AS request
  WHERE request.organization_id = NEW.organization_id
    AND request.property_id = NEW.property_id
    AND request.owner_person_id = NEW.owner_person_id
    AND request.currency = NEW.currency
    AND request.effective_date = NEW.effective_date
    AND request.component = NEW.component
    AND request.id = NEW.request_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'approved owner opening request not found';
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'owner opening entry requires an approved request';
  END IF;

  IF NEW.created_by IS DISTINCT FROM v_request.reviewed_by THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'owner opening entry actor must be the independent reviewer';
  END IF;

  IF NEW.entry_kind = 'opening' THEN
    IF v_request.request_kind <> 'initial'
      OR NEW.signed_amount IS DISTINCT FROM v_request.proposed_amount
      OR ROW(
        NEW.property_owner_id,
        NEW.ownership_percent_snapshot,
        NEW.ownership_roster_hash
      ) IS DISTINCT FROM ROW(
        v_request.property_owner_id,
        v_request.ownership_percent_snapshot,
        v_request.ownership_roster_hash
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'opening entry must copy its approved initial request';
    END IF;
  ELSIF NEW.entry_kind = 'correction_replacement' THEN
    IF v_request.request_kind <> 'correction'
      OR NEW.signed_amount IS DISTINCT FROM v_request.proposed_amount
      OR ROW(
        NEW.property_owner_id,
        NEW.ownership_percent_snapshot,
        NEW.ownership_roster_hash
      ) IS DISTINCT FROM ROW(
        v_request.property_owner_id,
        v_request.ownership_percent_snapshot,
        v_request.ownership_roster_hash
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.owner_opening_balance_entries AS reversal
        WHERE reversal.request_id = NEW.request_id
          AND reversal.entry_kind = 'correction_reversal'
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'correction replacement must copy its approved request after its reversal';
    END IF;
  ELSE
    IF v_request.request_kind <> 'correction'
      OR NEW.reversal_of_entry_id IS DISTINCT FROM v_request.correction_of_entry_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'correction reversal must target its approved request authority';
    END IF;

    SELECT target.*
    INTO v_target
    FROM public.owner_opening_balance_entries AS target
    WHERE target.organization_id = NEW.organization_id
      AND target.property_id = NEW.property_id
      AND target.owner_person_id = NEW.owner_person_id
      AND target.currency = NEW.currency
      AND target.effective_date = NEW.effective_date
      AND target.component = NEW.component
      AND target.id = NEW.reversal_of_entry_id
    FOR KEY SHARE;

    IF NOT FOUND
      OR v_target.entry_kind NOT IN ('opening', 'correction_replacement')
      OR NEW.signed_amount IS DISTINCT FROM -v_target.signed_amount
      OR ROW(
        NEW.property_owner_id,
        NEW.ownership_percent_snapshot,
        NEW.ownership_roster_hash
      ) IS DISTINCT FROM ROW(
        v_target.property_owner_id,
        v_target.ownership_percent_snapshot,
        v_target.ownership_roster_hash
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'correction reversal must exactly negate current authority';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.owner_opening_balance_entries AS reversal
      WHERE reversal.reversal_of_entry_id = v_target.id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'owner opening authority is already reversed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_opening_balance_entry_insert()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_opening_balance_entry_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_owner_opening_balance_entry_insert
  BEFORE INSERT
  ON public.owner_opening_balance_entries
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_owner_opening_balance_entry_insert();

CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_balance_entry_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'owner opening balance entries are immutable';
END;
$$;

ALTER FUNCTION app_private.guard_owner_opening_balance_entry_immutable()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_opening_balance_entry_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_owner_opening_balance_entry_immutable
  BEFORE UPDATE OR DELETE
  ON public.owner_opening_balance_entries
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_owner_opening_balance_entry_immutable();

ALTER TABLE public.owner_opening_balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_opening_balance_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read owner opening entries"
  ON public.owner_opening_balance_entries
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app_private.can_read_finance(organization_id))
  );

REVOKE ALL ON TABLE public.owner_opening_balance_entries
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.owner_opening_balance_entries TO authenticated;

CREATE VIEW public.owner_opening_balance_known_authority_v1
WITH (security_invoker = true)
AS
SELECT
  entry.organization_id,
  entry.property_id,
  entry.owner_person_id,
  entry.currency,
  entry.effective_date,
  entry.component,
  'known'::text AS authority_state,
  sum(entry.signed_amount)::numeric(14,2) AS current_amount,
  count(*)::bigint AS entry_count,
  max(entry.created_at) AS latest_entry_at
FROM public.owner_opening_balance_entries AS entry
GROUP BY
  entry.organization_id,
  entry.property_id,
  entry.owner_person_id,
  entry.currency,
  entry.effective_date,
  entry.component;

ALTER VIEW public.owner_opening_balance_known_authority_v1 OWNER TO postgres;
REVOKE ALL ON TABLE public.owner_opening_balance_known_authority_v1
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.owner_opening_balance_known_authority_v1
  TO authenticated;

COMMENT ON VIEW public.owner_opening_balance_known_authority_v1 IS
  'Known opening authority only. A missing row is unknown and must never be coalesced to zero; an approved zero entry chain returns a known 0.00 row.';
