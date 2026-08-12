CREATE TYPE public.owner_balance_component AS ENUM (
  'ips_held_owner_cash',
  'owner_due_to_ips',
  'ips_due_to_owner',
  'security_deposit_custody'
);

ALTER TYPE public.owner_balance_component OWNER TO postgres;

CREATE UNIQUE INDEX property_owners_owner_opening_scope_uidx
  ON public.property_owners (organization_id, property_id, person_id, id);

CREATE TABLE public.owner_opening_balance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_person_id uuid NOT NULL,
  property_owner_id uuid NOT NULL,
  ownership_percent_snapshot numeric(6,3) NOT NULL,
  ownership_roster_hash text NOT NULL,
  currency public.currency_code NOT NULL,
  effective_date date NOT NULL,
  component public.owner_balance_component NOT NULL,
  request_kind text NOT NULL,
  proposed_amount numeric(14,2) NOT NULL,
  correction_of_entry_id uuid,
  resubmission_of_request_id uuid,
  status text NOT NULL DEFAULT 'submitted',
  reason text NOT NULL,
  source_reference text,
  supporting_document_id uuid,
  evidence_sha256 text NOT NULL,
  payload_hash text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT owner_opening_balance_requests_organization_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations (id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_requests_property_fkey
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_requests_owner_person_fkey
    FOREIGN KEY (organization_id, owner_person_id)
    REFERENCES public.people (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_requests_property_owner_fkey
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
  CONSTRAINT owner_opening_balance_requests_document_fkey
    FOREIGN KEY (supporting_document_id)
    REFERENCES public.documents (id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_requests_submitted_by_fkey
    FOREIGN KEY (submitted_by)
    REFERENCES auth.users (id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_opening_balance_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by)
    REFERENCES auth.users (id)
    ON DELETE RESTRICT,

  CONSTRAINT owner_opening_balance_requests_org_id_uidx
    UNIQUE (organization_id, id),
  CONSTRAINT owner_opening_balance_requests_resubmission_fkey
    FOREIGN KEY (organization_id, resubmission_of_request_id)
    REFERENCES public.owner_opening_balance_requests (organization_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT owner_opening_balance_requests_ownership_snapshot_check
    CHECK (
      ownership_percent_snapshot > 0.000
      AND ownership_percent_snapshot <= 100.000
    ),
  CONSTRAINT owner_opening_balance_requests_roster_hash_check
    CHECK (ownership_roster_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT owner_opening_balance_requests_currency_check
    CHECK (currency = 'USD'::public.currency_code),
  CONSTRAINT owner_opening_balance_requests_effective_month_check
    CHECK (
      effective_date = date_trunc('month', effective_date::timestamp)::date
    ),
  CONSTRAINT owner_opening_balance_requests_kind_check
    CHECK (request_kind IN ('initial', 'correction')),
  CONSTRAINT owner_opening_balance_requests_amount_check
    CHECK (proposed_amount >= 0.00),
  CONSTRAINT owner_opening_balance_requests_correction_pairing_check
    CHECK (
      (request_kind = 'initial' AND correction_of_entry_id IS NULL)
      OR (request_kind = 'correction' AND correction_of_entry_id IS NOT NULL)
    ),
  CONSTRAINT owner_opening_balance_requests_correction_not_self_check
    CHECK (
      correction_of_entry_id IS NULL
      OR correction_of_entry_id <> id
    ),
  CONSTRAINT owner_opening_balance_requests_resubmission_not_self_check
    CHECK (
      resubmission_of_request_id IS NULL
      OR resubmission_of_request_id <> id
    ),
  CONSTRAINT owner_opening_balance_requests_status_check
    CHECK (status IN ('submitted', 'approved', 'rejected')),
  CONSTRAINT owner_opening_balance_requests_reason_check
    CHECK (
      reason = btrim(reason)
      AND char_length(reason) BETWEEN 3 AND 500
    ),
  CONSTRAINT owner_opening_balance_requests_source_reference_check
    CHECK (
      source_reference IS NULL
      OR (
        source_reference = btrim(source_reference)
        AND char_length(source_reference) BETWEEN 3 AND 240
      )
    ),
  CONSTRAINT owner_opening_balance_requests_evidence_source_check
    CHECK (
      source_reference IS NOT NULL
      OR supporting_document_id IS NOT NULL
    ),
  CONSTRAINT owner_opening_balance_requests_evidence_hash_check
    CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT owner_opening_balance_requests_payload_hash_check
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT owner_opening_balance_requests_review_state_check
    CHECK (
      (
        status = 'submitted'
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
        AND review_reason IS NULL
      )
      OR (
        status = 'approved'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND (
          review_reason IS NULL
          OR (
            review_reason = btrim(review_reason)
            AND char_length(review_reason) BETWEEN 3 AND 500
          )
        )
      )
      OR (
        status = 'rejected'
        AND reviewed_at IS NOT NULL
        AND reviewed_by IS NOT NULL
        AND review_reason = btrim(review_reason)
        AND char_length(review_reason) BETWEEN 3 AND 500
      )
    ),
  CONSTRAINT owner_opening_balance_requests_independent_reviewer_check
    CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by)
);

ALTER TABLE public.owner_opening_balance_requests OWNER TO postgres;

CREATE UNIQUE INDEX owner_opening_balance_requests_submitted_initial_uidx
  ON public.owner_opening_balance_requests (
    organization_id,
    property_id,
    owner_person_id,
    currency,
    effective_date,
    component
  )
  WHERE request_kind = 'initial' AND status = 'submitted';

CREATE UNIQUE INDEX owner_opening_balance_requests_submitted_correction_uidx
  ON public.owner_opening_balance_requests (correction_of_entry_id)
  WHERE request_kind = 'correction' AND status = 'submitted';

CREATE UNIQUE INDEX owner_opening_balance_requests_resubmission_uidx
  ON public.owner_opening_balance_requests (resubmission_of_request_id)
  WHERE resubmission_of_request_id IS NOT NULL;

CREATE INDEX owner_opening_balance_requests_queue_idx
  ON public.owner_opening_balance_requests (
    organization_id,
    status,
    submitted_at,
    id
  );

CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_balance_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'owner opening balance requests are append-only';
  END IF;

  IF current_user <> 'postgres'
    OR coalesce(
      current_setting('app.owner_opening_request_review_context', true),
      ''
    ) <> 'checked-review-v1' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'owner opening balance requests require the checked review path';
  END IF;

  IF OLD.status <> 'submitted'
    OR NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'owner opening balance request status transition is invalid';
  END IF;

  IF ROW(
    NEW.id,
    NEW.organization_id,
    NEW.property_id,
    NEW.owner_person_id,
    NEW.property_owner_id,
    NEW.ownership_percent_snapshot,
    NEW.ownership_roster_hash,
    NEW.currency,
    NEW.effective_date,
    NEW.component,
    NEW.request_kind,
    NEW.proposed_amount,
    NEW.correction_of_entry_id,
    NEW.resubmission_of_request_id,
    NEW.reason,
    NEW.source_reference,
    NEW.supporting_document_id,
    NEW.evidence_sha256,
    NEW.payload_hash,
    NEW.submitted_at,
    NEW.submitted_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.organization_id,
    OLD.property_id,
    OLD.owner_person_id,
    OLD.property_owner_id,
    OLD.ownership_percent_snapshot,
    OLD.ownership_roster_hash,
    OLD.currency,
    OLD.effective_date,
    OLD.component,
    OLD.request_kind,
    OLD.proposed_amount,
    OLD.correction_of_entry_id,
    OLD.resubmission_of_request_id,
    OLD.reason,
    OLD.source_reference,
    OLD.supporting_document_id,
    OLD.evidence_sha256,
    OLD.payload_hash,
    OLD.submitted_at,
    OLD.submitted_by,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'owner opening balance request evidence and authority are immutable';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_opening_balance_request_mutation()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_opening_balance_request_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_owner_opening_balance_request_mutation
  BEFORE UPDATE OR DELETE
  ON public.owner_opening_balance_requests
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_owner_opening_balance_request_mutation();

ALTER TABLE public.owner_opening_balance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_opening_balance_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read owner opening requests"
  ON public.owner_opening_balance_requests
  FOR SELECT
  TO authenticated
  USING (
    (SELECT app_private.can_read_finance(organization_id))
  );

REVOKE ALL ON TABLE public.owner_opening_balance_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.owner_opening_balance_requests TO authenticated;

COMMENT ON TABLE public.owner_opening_balance_requests IS
  'Append-only evidence-backed opening owner balance requests. Missing approved entries remain unknown; submitted and rejected requests establish no balance.';
