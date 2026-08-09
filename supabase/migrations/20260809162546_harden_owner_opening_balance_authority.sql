CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_balance_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'submitted' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'owner opening balance requests must be inserted as submitted';
    END IF;

    RETURN NEW;
  END IF;

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

DROP TRIGGER guard_owner_opening_balance_request_mutation
  ON public.owner_opening_balance_requests;
CREATE TRIGGER guard_owner_opening_balance_request_mutation
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.owner_opening_balance_requests
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_owner_opening_balance_request_mutation();

CREATE OR REPLACE FUNCTION app_private.enforce_owner_opening_balance_approved_entries()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_request_id uuid;
  v_request_kind text;
  v_request_status text;
  v_entry_count integer;
  v_opening_count integer;
  v_reversal_count integer;
  v_replacement_count integer;
BEGIN
  v_request_id := coalesce(
    to_jsonb(NEW) ->> 'request_id',
    to_jsonb(NEW) ->> 'id'
  )::uuid;

  SELECT request.request_kind, request.status
  INTO v_request_kind, v_request_status
  FROM public.owner_opening_balance_requests AS request
  WHERE request.id = v_request_id;

  IF NOT FOUND OR v_request_status <> 'approved' THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE entry.entry_kind = 'opening')::integer,
    count(*) FILTER (WHERE entry.entry_kind = 'correction_reversal')::integer,
    count(*) FILTER (WHERE entry.entry_kind = 'correction_replacement')::integer
  INTO
    v_entry_count,
    v_opening_count,
    v_reversal_count,
    v_replacement_count
  FROM public.owner_opening_balance_entries AS entry
  WHERE entry.request_id = v_request_id;

  IF v_request_kind = 'initial' THEN
    IF v_entry_count <> 1 OR v_opening_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'approved initial owner opening request requires exactly one opening entry';
    END IF;
  ELSIF v_entry_count <> 2
    OR v_reversal_count <> 1
    OR v_replacement_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'approved correction owner opening request requires exactly one reversal and one replacement entry';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION app_private.enforce_owner_opening_balance_approved_entries()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_owner_opening_balance_approved_entries()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER owner_opening_balance_approved_entries_complete
  AFTER INSERT OR UPDATE
  ON public.owner_opening_balance_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_owner_opening_balance_approved_entries();

CREATE CONSTRAINT TRIGGER owner_opening_balance_entry_request_complete
  AFTER INSERT
  ON public.owner_opening_balance_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_owner_opening_balance_approved_entries();

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
  FOR UPDATE;

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
    FOR UPDATE;

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
      FROM public.owner_opening_balance_requests AS submitted_correction
      WHERE submitted_correction.correction_of_entry_id = v_target.id
        AND submitted_correction.status = 'submitted'
        AND submitted_correction.id <> v_request.id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'another submitted owner opening correction already targets current authority';
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
