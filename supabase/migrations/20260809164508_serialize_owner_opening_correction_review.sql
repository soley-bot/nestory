CREATE OR REPLACE FUNCTION app_private.guard_owner_opening_balance_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_correction_target_id uuid;
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

  IF NEW.status = 'approved' AND OLD.request_kind = 'correction' THEN
    SELECT target.id
    INTO v_correction_target_id
    FROM public.owner_opening_balance_entries AS target
    WHERE target.organization_id = OLD.organization_id
      AND target.property_id = OLD.property_id
      AND target.owner_person_id = OLD.owner_person_id
      AND target.currency = OLD.currency
      AND target.effective_date = OLD.effective_date
      AND target.component = OLD.component
      AND target.id = OLD.correction_of_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'owner opening correction target is missing or outside the authority scope';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.guard_owner_opening_balance_request_mutation()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_opening_balance_request_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
