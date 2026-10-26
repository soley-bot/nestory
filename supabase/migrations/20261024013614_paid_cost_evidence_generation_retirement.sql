-- Retain registered evidence and Storage protection across a financial restart,
-- but never let a new idempotency key revive its old submission authority.
ALTER TABLE app_private.paid_cost_evidence_registrations
  ADD COLUMN financial_generation integer NOT NULL DEFAULT 0
  CHECK (financial_generation >= 0);

CREATE TRIGGER a0_financial_generation
BEFORE INSERT OR UPDATE OR DELETE
ON app_private.paid_cost_evidence_registrations
FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_generation_row();

-- Preserve existing signatures, ACLs and all actor/document/object checks. Pin
-- the exact predecessors so a future body cannot silently miss these checks.
DO $migration$
DECLARE
  v_signature text;
  v_expected_hash text;
  v_anchor text;
  v_replacement text;
  v_definition text;
BEGIN
  FOR v_signature, v_expected_hash, v_anchor, v_replacement IN
    SELECT * FROM (VALUES
      (
        'app_private.assert_paid_cost_evidence_eligible(uuid,uuid,uuid,uuid,text,uuid)',
        'd238c1aa29c4deb4d252a05bc7a66a9b22e5f7f60613e75f77351fcdced20e58',
        E'  IF NOT FOUND\n    OR v_registration.property_id IS DISTINCT FROM v_document.property_id',
        E'  IF FOUND AND NOT app_private.financial_row_is_current(\n    v_registration.organization_id, v_registration.financial_generation\n  ) THEN\n    RAISE EXCEPTION ''paid_cost_evidence_retired'' USING ERRCODE = ''55000'';\n  END IF;\n\n  IF NOT FOUND\n    OR v_registration.property_id IS DISTINCT FROM v_document.property_id'
      ),
      (
        'public.register_paid_cost_evidence_verified(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)',
        'd881812d883cca1a35044e0c47cd98c1f38e327efa83bd850e097d87337130cd',
        E'  IF FOUND THEN\n    IF v_registration.document_id IS DISTINCT FROM v_document_id',
        E'  IF FOUND THEN\n    IF NOT app_private.financial_row_is_current(\n      v_registration.organization_id, v_registration.financial_generation\n    ) THEN\n      RAISE EXCEPTION ''paid_cost_evidence_retired'' USING ERRCODE = ''55000'';\n    END IF;\n    IF v_registration.document_id IS DISTINCT FROM v_document_id'
      ),
      (
        'app_private.guard_paid_cost_approval_evidence()',
        'c9b8a19658976580ee8c7807ff67ac5925fe7b0310acd8305d88f5b759aa06aa',
        '          AND document.id = NEW.supporting_document_id',
        E'          AND app_private.financial_row_is_current(\n            registration.organization_id, registration.financial_generation\n          )\n          AND document.id = NEW.supporting_document_id'
      )
    ) AS patches(signature, predecessor_hash, anchor, replacement)
  LOOP
    v_definition := replace(pg_get_functiondef(v_signature::regprocedure), chr(13), '');
    IF encode(extensions.digest(v_definition, 'sha256'), 'hex') <> v_expected_hash
      OR (length(v_definition) - length(replace(v_definition, v_anchor, '')))
        / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION 'Paid cost generation predecessor changed: %', v_signature;
    END IF;
    EXECUTE replace(v_definition, v_anchor, v_replacement);
  END LOOP;
END;
$migration$;

COMMENT ON COLUMN app_private.paid_cost_evidence_registrations.financial_generation IS
  'Original registration generation. Retained evidence is never rebased by reset or restore; stale registrations remain protected from Storage cleanup but cannot authorize new costs.';
