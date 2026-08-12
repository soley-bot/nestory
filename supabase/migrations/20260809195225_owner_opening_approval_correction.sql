CREATE OR REPLACE FUNCTION public.review_owner_opening_balance(
  p_organization_id uuid,
  p_request_id uuid,
  p_decision text,
  p_review_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_decision text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_decision, ''))
  );
  v_review_reason text := nullif(
    pg_catalog.btrim(coalesce(p_review_reason, '')),
    ''
  );
  v_idempotency_key text := pg_catalog.btrim(
    coalesce(p_idempotency_key, '')
  );
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_snapshot public.owner_opening_balance_requests%ROWTYPE;
  v_request public.owner_opening_balance_requests%ROWTYPE;
  v_target public.owner_opening_balance_entries%ROWTYPE;
  v_roster record;
  v_claim record;
  v_opening_entry_id uuid;
  v_reversal_entry_id uuid;
  v_replacement_entry_id uuid;
  v_entry_ids jsonb := pg_catalog.jsonb_build_array();
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
    OR NOT app_private.can_review_owner_opening_balance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to review owner opening balances'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Owner opening request identity is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Choose approve or reject'
      USING ERRCODE = '22023';
  END IF;

  IF v_decision = 'reject' AND v_review_reason IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required'
      USING ERRCODE = '22023';
  END IF;

  IF v_review_reason IS NOT NULL
    AND pg_catalog.char_length(v_review_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Review reason must contain between 3 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'request_id', p_request_id::text,
    'decision', v_decision,
    'review_reason', v_review_reason
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'review_owner_opening_balance',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  SELECT request.*
  INTO v_snapshot
  FROM public.owner_opening_balance_requests AS request
  WHERE request.organization_id = p_organization_id
    AND request.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner opening request not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    v_snapshot.property_id,
    v_snapshot.currency,
    v_snapshot.effective_date
  );

  IF v_decision = 'approve'
    AND app_private.is_financial_month_locked(
      p_organization_id,
      v_snapshot.effective_date
    ) THEN
    RAISE EXCEPTION 'Financial month is locked'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_opening_authority_v1',
        v_snapshot.organization_id::text,
        v_snapshot.property_id::text,
        v_snapshot.owner_person_id::text,
        v_snapshot.currency::text,
        v_snapshot.effective_date::text,
        v_snapshot.component::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'review_owner_opening_balance',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  IF v_decision = 'approve' AND v_snapshot.request_kind = 'correction' THEN
    SELECT target.*
    INTO v_target
    FROM public.owner_opening_balance_entries AS target
    WHERE target.organization_id = v_snapshot.organization_id
      AND target.property_id = v_snapshot.property_id
      AND target.owner_person_id = v_snapshot.owner_person_id
      AND target.currency = v_snapshot.currency
      AND target.effective_date = v_snapshot.effective_date
      AND target.component = v_snapshot.component
      AND target.id = v_snapshot.correction_of_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Owner opening correction target not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_target.entry_kind NOT IN ('opening', 'correction_replacement') THEN
      RAISE EXCEPTION 'Owner opening correction target must carry current authority'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.owner_opening_balance_entries AS reversal
      WHERE reversal.reversal_of_entry_id = v_target.id
    ) THEN
      RAISE EXCEPTION 'Owner opening correction target is stale'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.owner_opening_balance_requests AS request
  WHERE request.organization_id = p_organization_id
    AND request.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner opening request not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_request.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted owner opening request can be reviewed'
      USING ERRCODE = '22023';
  END IF;

  IF v_request.submitted_by = v_actor_id THEN
    RAISE EXCEPTION 'Owner opening submitter cannot review the same request'
      USING ERRCODE = '22023';
  END IF;

  IF v_decision = 'approve' THEN
    PERFORM 1
    FROM public.property_owners AS property_owner
    WHERE property_owner.organization_id = v_request.organization_id
      AND property_owner.property_id = v_request.property_id
      AND property_owner.archived_at IS NULL
      AND property_owner.started_on <= v_request.effective_date
      AND (
        property_owner.ended_on IS NULL
        OR v_request.effective_date < property_owner.ended_on
      )
    ORDER BY property_owner.id
    FOR KEY SHARE;

    SELECT roster.*
    INTO v_roster
    FROM app_private.validate_owner_roster_on_date(
      v_request.organization_id,
      v_request.property_id,
      v_request.effective_date
    ) AS roster
    WHERE roster.owner_person_id = v_request.owner_person_id;

    IF NOT FOUND
      OR ROW(
        v_roster.property_owner_id,
        v_roster.ownership_percent,
        v_roster.ownership_roster_hash
      ) IS DISTINCT FROM ROW(
        v_request.property_owner_id,
        v_request.ownership_percent_snapshot,
        v_request.ownership_roster_hash
      ) THEN
      RAISE EXCEPTION 'ownership_roster_changed'
        USING ERRCODE = '22023';
    END IF;

    IF v_request.supporting_document_id IS NOT NULL THEN
      PERFORM app_private.assert_owner_opening_evidence_eligible(
        v_request.organization_id,
        v_request.property_id,
        v_request.supporting_document_id,
        v_request.evidence_sha256
      );
    END IF;

    IF v_request.request_kind = 'initial' THEN
      IF EXISTS (
        SELECT 1
        FROM public.owner_opening_balance_entries AS opening_entry
        WHERE opening_entry.organization_id = v_request.organization_id
          AND opening_entry.property_id = v_request.property_id
          AND opening_entry.owner_person_id = v_request.owner_person_id
          AND opening_entry.currency = v_request.currency
          AND opening_entry.effective_date = v_request.effective_date
          AND opening_entry.component = v_request.component
          AND opening_entry.entry_kind = 'opening'
      ) THEN
        RAISE EXCEPTION 'Initial owner opening authority already exists'
          USING ERRCODE = '23505';
      END IF;
    ELSIF v_target.id IS DISTINCT FROM v_request.correction_of_entry_id THEN
      RAISE EXCEPTION 'Owner opening correction target not found'
        USING ERRCODE = '23503';
    END IF;

    PERFORM pg_catalog.set_config(
      'app.owner_opening_request_review_context',
      'checked-review-v1',
      true
    );

    UPDATE public.owner_opening_balance_requests
    SET status = 'approved',
        reviewed_at = pg_catalog.now(),
        reviewed_by = v_actor_id,
        review_reason = v_review_reason
    WHERE organization_id = p_organization_id
      AND id = p_request_id;

    IF v_request.request_kind = 'initial' THEN
      v_opening_entry_id := gen_random_uuid();

      INSERT INTO public.owner_opening_balance_entries (
        id,
        request_id,
        organization_id,
        property_id,
        owner_person_id,
        property_owner_id,
        ownership_percent_snapshot,
        ownership_roster_hash,
        currency,
        effective_date,
        component,
        entry_kind,
        signed_amount,
        reversal_of_entry_id,
        created_by
      )
      VALUES (
        v_opening_entry_id,
        v_request.id,
        v_request.organization_id,
        v_request.property_id,
        v_request.owner_person_id,
        v_request.property_owner_id,
        v_request.ownership_percent_snapshot,
        v_request.ownership_roster_hash,
        v_request.currency,
        v_request.effective_date,
        v_request.component,
        'opening',
        v_request.proposed_amount,
        NULL,
        v_actor_id
      );

      v_entry_ids := pg_catalog.jsonb_build_array(v_opening_entry_id);
    ELSE
      v_reversal_entry_id := gen_random_uuid();
      v_replacement_entry_id := gen_random_uuid();

      INSERT INTO public.owner_opening_balance_entries (
        id,
        request_id,
        organization_id,
        property_id,
        owner_person_id,
        property_owner_id,
        ownership_percent_snapshot,
        ownership_roster_hash,
        currency,
        effective_date,
        component,
        entry_kind,
        signed_amount,
        reversal_of_entry_id,
        created_by
      )
      VALUES (
        v_reversal_entry_id,
        v_request.id,
        v_request.organization_id,
        v_request.property_id,
        v_request.owner_person_id,
        v_target.property_owner_id,
        v_target.ownership_percent_snapshot,
        v_target.ownership_roster_hash,
        v_request.currency,
        v_request.effective_date,
        v_request.component,
        'correction_reversal',
        -v_target.signed_amount,
        v_target.id,
        v_actor_id
      );

      INSERT INTO public.owner_opening_balance_entries (
        id,
        request_id,
        organization_id,
        property_id,
        owner_person_id,
        property_owner_id,
        ownership_percent_snapshot,
        ownership_roster_hash,
        currency,
        effective_date,
        component,
        entry_kind,
        signed_amount,
        reversal_of_entry_id,
        created_by
      )
      VALUES (
        v_replacement_entry_id,
        v_request.id,
        v_request.organization_id,
        v_request.property_id,
        v_request.owner_person_id,
        v_request.property_owner_id,
        v_request.ownership_percent_snapshot,
        v_request.ownership_roster_hash,
        v_request.currency,
        v_request.effective_date,
        v_request.component,
        'correction_replacement',
        v_request.proposed_amount,
        NULL,
        v_actor_id
      );

      v_entry_ids := pg_catalog.jsonb_build_array(
        v_reversal_entry_id,
        v_replacement_entry_id
      );
    END IF;
  ELSE
    PERFORM pg_catalog.set_config(
      'app.owner_opening_request_review_context',
      'checked-review-v1',
      true
    );

    UPDATE public.owner_opening_balance_requests
    SET status = 'rejected',
        reviewed_at = pg_catalog.now(),
        reviewed_by = v_actor_id,
        review_reason = v_review_reason
    WHERE organization_id = p_organization_id
      AND id = p_request_id;
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
    v_actor_id,
    'owner_opening_balance_request',
    p_request_id,
    CASE WHEN v_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
    pg_catalog.jsonb_build_object(
      'source', 'checked_rpc',
      'operation', 'review_owner_opening_balance',
      'financial_idempotency_request_id', v_claim.request_id,
      'payload_hash', v_payload_hash,
      'decision', v_decision,
      'review_reason', v_review_reason,
      'entry_ids', v_entry_ids
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'status', CASE WHEN v_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
    'entry_ids', v_entry_ids
  );

  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

ALTER FUNCTION public.review_owner_opening_balance(
  uuid, uuid, text, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_owner_opening_balance(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_owner_opening_balance(
  uuid, uuid, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_owner_opening_balance_correction(
  p_organization_id uuid,
  p_entry_id uuid,
  p_replacement_amount numeric,
  p_reason text,
  p_source_reference text,
  p_supporting_document_id uuid,
  p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_source_reference text := nullif(
    pg_catalog.btrim(coalesce(p_source_reference, '')),
    ''
  );
  v_idempotency_key text := pg_catalog.btrim(
    coalesce(p_idempotency_key, '')
  );
  v_amount_text text;
  v_payload jsonb;
  v_payload_hash text;
  v_replay_result jsonb;
  v_target_snapshot public.owner_opening_balance_entries%ROWTYPE;
  v_target public.owner_opening_balance_entries%ROWTYPE;
  v_roster record;
  v_predecessor public.owner_opening_balance_requests%ROWTYPE;
  v_claim record;
  v_request_id uuid;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
    OR NOT app_private.can_request_owner_opening_balance_correction(
      p_organization_id
    ) THEN
    RAISE EXCEPTION 'Not authorized to request owner opening balance corrections'
      USING ERRCODE = '42501';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'Owner opening correction target is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_replacement_amount IS NULL
    OR p_replacement_amount < 0
    OR p_replacement_amount > 999999999999.99
    OR p_replacement_amount IS DISTINCT FROM
      pg_catalog.trunc(p_replacement_amount, 2) THEN
    RAISE EXCEPTION 'Replacement amount must be nonnegative and use at most two decimal places'
      USING ERRCODE = '22023';
  END IF;
  v_amount_text := pg_catalog.to_char(
    p_replacement_amount,
    'FM9999999999990.00'
  );

  IF pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Opening reason must contain between 3 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_source_reference IS NOT NULL
    AND pg_catalog.char_length(v_source_reference) NOT BETWEEN 3 AND 240 THEN
    RAISE EXCEPTION 'Opening source reference must contain between 3 and 240 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_source_reference IS NULL AND p_supporting_document_id IS NULL THEN
    RAISE EXCEPTION 'Opening evidence requires a source reference or document'
      USING ERRCODE = '22023';
  END IF;

  IF p_evidence_sha256 IS NULL
    OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Opening evidence fingerprint is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'organization_id', p_organization_id::text,
    'entry_id', p_entry_id::text,
    'replacement_amount', v_amount_text,
    'reason', v_reason,
    'source_reference', v_source_reference,
    'supporting_document_id', p_supporting_document_id::text,
    'evidence_sha256', p_evidence_sha256,
    'resubmission_of_request_id', p_resubmission_of_request_id::text
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'submit_owner_opening_balance_correction',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  SELECT target.*
  INTO v_target_snapshot
  FROM public.owner_opening_balance_entries AS target
  WHERE target.organization_id = p_organization_id
    AND target.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner opening correction target not found'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    v_target_snapshot.property_id,
    v_target_snapshot.currency,
    v_target_snapshot.effective_date
  );

  IF app_private.is_financial_month_locked(
    p_organization_id,
    v_target_snapshot.effective_date
  ) THEN
    RAISE EXCEPTION 'Financial month is locked'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_opening_authority_v1',
        v_target_snapshot.organization_id::text,
        v_target_snapshot.property_id::text,
        v_target_snapshot.owner_person_id::text,
        v_target_snapshot.currency::text,
        v_target_snapshot.effective_date::text,
        v_target_snapshot.component::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'submit_owner_opening_balance_correction',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  SELECT target.*
  INTO v_target
  FROM public.owner_opening_balance_entries AS target
  WHERE target.organization_id = p_organization_id
    AND target.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner opening correction target not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_target.entry_kind NOT IN ('opening', 'correction_replacement') THEN
    RAISE EXCEPTION 'Owner opening correction target must carry current authority'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_opening_balance_entries AS reversal
    WHERE reversal.reversal_of_entry_id = v_target.id
  ) THEN
    RAISE EXCEPTION 'Owner opening correction target is stale'
      USING ERRCODE = '22023';
  END IF;

  PERFORM property_owner.id
  FROM public.property_owners AS property_owner
  WHERE property_owner.organization_id = v_target.organization_id
    AND property_owner.property_id = v_target.property_id
    AND property_owner.archived_at IS NULL
    AND property_owner.started_on <= v_target.effective_date
    AND (
      property_owner.ended_on IS NULL
      OR v_target.effective_date < property_owner.ended_on
    )
  ORDER BY property_owner.id
  FOR KEY SHARE;

  SELECT roster.*
  INTO v_roster
  FROM app_private.validate_owner_roster_on_date(
    v_target.organization_id,
    v_target.property_id,
    v_target.effective_date
  ) AS roster
  WHERE roster.owner_person_id = v_target.owner_person_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner is not in the effective property roster'
      USING ERRCODE = '23503';
  END IF;

  IF p_supporting_document_id IS NOT NULL THEN
    PERFORM app_private.assert_owner_opening_evidence_eligible(
      v_target.organization_id,
      v_target.property_id,
      p_supporting_document_id,
      p_evidence_sha256
    );
  END IF;

  IF p_resubmission_of_request_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.owner_opening_balance_requests AS rejected
      WHERE rejected.organization_id = v_target.organization_id
        AND rejected.property_id = v_target.property_id
        AND rejected.owner_person_id = v_target.owner_person_id
        AND rejected.currency = v_target.currency
        AND rejected.effective_date = v_target.effective_date
        AND rejected.component = v_target.component
        AND rejected.request_kind = 'correction'
        AND rejected.correction_of_entry_id = v_target.id
        AND rejected.status = 'rejected'
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_opening_balance_requests AS successor
          WHERE successor.resubmission_of_request_id = rejected.id
        )
    ) THEN
      RAISE EXCEPTION 'Latest rejected predecessor is required for correction resubmission'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT predecessor.*
    INTO v_predecessor
    FROM public.owner_opening_balance_requests AS predecessor
    WHERE predecessor.organization_id = p_organization_id
      AND predecessor.id = p_resubmission_of_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rejected predecessor not found'
        USING ERRCODE = '23503';
    END IF;

    IF ROW(
      v_predecessor.property_id,
      v_predecessor.owner_person_id,
      v_predecessor.currency,
      v_predecessor.effective_date,
      v_predecessor.component,
      v_predecessor.request_kind,
      v_predecessor.correction_of_entry_id
    ) IS DISTINCT FROM ROW(
      v_target.property_id,
      v_target.owner_person_id,
      v_target.currency,
      v_target.effective_date,
      v_target.component,
      'correction'::text,
      v_target.id
    ) THEN
      RAISE EXCEPTION 'Rejected predecessor does not match the correction authority target'
        USING ERRCODE = '22023';
    END IF;

    IF v_predecessor.status <> 'rejected' THEN
      RAISE EXCEPTION 'Resubmission predecessor must be rejected'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.owner_opening_balance_requests AS successor
      WHERE successor.resubmission_of_request_id = v_predecessor.id
    ) THEN
      RAISE EXCEPTION 'Rejected predecessor already has a successor'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.owner_opening_balance_requests AS later_rejected
      WHERE later_rejected.organization_id = v_target.organization_id
        AND later_rejected.property_id = v_target.property_id
        AND later_rejected.owner_person_id = v_target.owner_person_id
        AND later_rejected.currency = v_target.currency
        AND later_rejected.effective_date = v_target.effective_date
        AND later_rejected.component = v_target.component
        AND later_rejected.request_kind = 'correction'
        AND later_rejected.correction_of_entry_id = v_target.id
        AND later_rejected.status = 'rejected'
        AND later_rejected.id <> v_predecessor.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_opening_balance_requests AS successor
          WHERE successor.resubmission_of_request_id = later_rejected.id
        )
    ) THEN
      RAISE EXCEPTION 'Resubmission must name the latest rejected predecessor'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_opening_balance_requests AS pending
    WHERE pending.correction_of_entry_id = v_target.id
      AND pending.status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'A correction request is already submitted for this authority target'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.owner_opening_balance_requests (
    organization_id,
    property_id,
    owner_person_id,
    property_owner_id,
    ownership_percent_snapshot,
    ownership_roster_hash,
    currency,
    effective_date,
    component,
    request_kind,
    proposed_amount,
    correction_of_entry_id,
    resubmission_of_request_id,
    status,
    reason,
    source_reference,
    supporting_document_id,
    evidence_sha256,
    payload_hash,
    submitted_by
  )
  VALUES (
    v_target.organization_id,
    v_target.property_id,
    v_target.owner_person_id,
    v_roster.property_owner_id,
    v_roster.ownership_percent,
    v_roster.ownership_roster_hash,
    v_target.currency,
    v_target.effective_date,
    v_target.component,
    'correction',
    p_replacement_amount,
    v_target.id,
    p_resubmission_of_request_id,
    'submitted',
    v_reason,
    v_source_reference,
    p_supporting_document_id,
    p_evidence_sha256,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    v_target.organization_id,
    v_actor_id,
    'owner_opening_balance_request',
    v_request_id,
    CASE
      WHEN p_resubmission_of_request_id IS NULL THEN 'submitted'
      ELSE 'resubmitted'
    END,
    pg_catalog.jsonb_build_object(
      'source', 'checked_rpc',
      'operation', 'submit_owner_opening_balance_correction',
      'financial_idempotency_request_id', v_claim.request_id,
      'payload_hash', v_payload_hash,
      'target_entry_id', v_target.id,
      'replacement_amount', v_amount_text,
      'resubmission_of_request_id', p_resubmission_of_request_id,
      'evidence_sha256', p_evidence_sha256
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'request_id', v_request_id,
    'resubmission_of_request_id', p_resubmission_of_request_id,
    'correction_of_entry_id', v_target.id,
    'status', 'submitted'
  );

  RETURN app_private.complete_financial_idempotency(
    v_claim.request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

ALTER FUNCTION public.submit_owner_opening_balance_correction(
  uuid, uuid, numeric, text, text, uuid, text, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance_correction(
  uuid, uuid, numeric, text, text, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance_correction(
  uuid, uuid, numeric, text, text, uuid, text, uuid, text
) TO authenticated;
