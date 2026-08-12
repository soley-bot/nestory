CREATE OR REPLACE FUNCTION app_private.lock_owner_opening_property_month(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.lock_property_financial_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_opening_property_month_v1',
        p_organization_id::text,
        p_property_id::text,
        p_currency::text,
        pg_catalog.date_trunc('month', p_effective_date)::date::text
      ),
      0
    )
  );
END;
$$;

ALTER FUNCTION app_private.lock_owner_opening_property_month(
  uuid, uuid, public.currency_code, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_owner_opening_property_month(
  uuid, uuid, public.currency_code, date
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_owner_opening_balance(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid,
  p_currency public.currency_code,
  p_effective_date date,
  p_component public.owner_balance_component,
  p_amount numeric,
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
  v_claim record;
  v_request_id uuid;
  v_roster record;
  v_predecessor public.owner_opening_balance_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
    OR NOT app_private.can_submit_owner_opening_balance(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to submit owner opening balances'
      USING ERRCODE = '42501';
  END IF;

  IF p_property_id IS NULL
    OR p_owner_person_id IS NULL
    OR p_currency IS NULL
    OR p_effective_date IS NULL
    OR p_component IS NULL THEN
    RAISE EXCEPTION 'Complete opening authority scope is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_effective_date IS DISTINCT FROM
      pg_catalog.date_trunc('month', p_effective_date)::date THEN
    RAISE EXCEPTION 'Opening effective date must be the first day of a month'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
    OR p_amount < 0
    OR p_amount > 999999999999.99
    OR p_amount IS DISTINCT FROM pg_catalog.trunc(p_amount, 2) THEN
    RAISE EXCEPTION 'Opening amount must be nonnegative and use at most two decimal places'
      USING ERRCODE = '22023';
  END IF;
  v_amount_text := pg_catalog.to_char(
    p_amount,
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
    'property_id', p_property_id::text,
    'owner_person_id', p_owner_person_id::text,
    'currency', p_currency::text,
    'effective_date', p_effective_date::text,
    'component', p_component::text,
    'amount', v_amount_text,
    'reason', v_reason,
    'source_reference', v_source_reference,
    'supporting_document_id', p_supporting_document_id::text,
    'evidence_sha256', p_evidence_sha256,
    'resubmission_of_request_id', p_resubmission_of_request_id::text
  );
  v_payload_hash := app_private.canonical_financial_payload_hash(v_payload);

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'submit_owner_opening_balance',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  PERFORM app_private.lock_owner_opening_property_month(
    p_organization_id,
    p_property_id,
    p_currency,
    p_effective_date
  );

  IF app_private.is_financial_month_locked(
    p_organization_id,
    p_effective_date
  ) THEN
    RAISE EXCEPTION 'Financial month is locked'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'owner_opening_authority_v1',
        p_organization_id::text,
        p_property_id::text,
        p_owner_person_id::text,
        p_currency::text,
        p_effective_date::text,
        p_component::text
      ),
      0
    )
  );

  SELECT claim.*
  INTO STRICT v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'submit_owner_opening_balance',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;

  IF v_claim.is_replay THEN
    RETURN v_claim.result_ids;
  END IF;

  PERFORM property.id
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
    AND property.archived_at IS NULL
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  PERFORM owner_person.id
  FROM public.people AS owner_person
  WHERE owner_person.organization_id = p_organization_id
    AND owner_person.id = p_owner_person_id
    AND owner_person.archived_at IS NULL
  FOR KEY SHARE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.person_roles AS owner_role
    WHERE owner_role.organization_id = p_organization_id
      AND owner_role.person_id = p_owner_person_id
      AND owner_role.role = 'owner'
      AND owner_role.status = 'active'
      AND owner_role.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Owner person not found' USING ERRCODE = '23503';
  END IF;

  PERFORM property_owner.id
  FROM public.property_owners AS property_owner
  WHERE property_owner.organization_id = p_organization_id
    AND property_owner.property_id = p_property_id
    AND property_owner.archived_at IS NULL
    AND property_owner.started_on <= p_effective_date
    AND (
      property_owner.ended_on IS NULL
      OR p_effective_date < property_owner.ended_on
    )
  ORDER BY property_owner.id
  FOR KEY SHARE;

  SELECT roster.*
  INTO v_roster
  FROM app_private.validate_owner_roster_on_date(
    p_organization_id,
    p_property_id,
    p_effective_date
  ) AS roster
  WHERE roster.owner_person_id = p_owner_person_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner is not in the effective property roster'
      USING ERRCODE = '23503';
  END IF;

  IF p_supporting_document_id IS NOT NULL THEN
    PERFORM app_private.assert_owner_opening_evidence_eligible(
      p_organization_id,
      p_property_id,
      p_supporting_document_id,
      p_evidence_sha256
    );
  END IF;

  IF p_resubmission_of_request_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.owner_opening_balance_requests AS rejected
      WHERE rejected.organization_id = p_organization_id
        AND rejected.property_id = p_property_id
        AND rejected.owner_person_id = p_owner_person_id
        AND rejected.currency = p_currency
        AND rejected.effective_date = p_effective_date
        AND rejected.component = p_component
        AND rejected.request_kind = 'initial'
        AND rejected.correction_of_entry_id IS NULL
        AND rejected.status = 'rejected'
        AND NOT EXISTS (
          SELECT 1
          FROM public.owner_opening_balance_requests AS successor
          WHERE successor.resubmission_of_request_id = rejected.id
        )
    ) THEN
      RAISE EXCEPTION 'Latest rejected predecessor is required for resubmission'
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
      p_property_id,
      p_owner_person_id,
      p_currency,
      p_effective_date,
      p_component,
      'initial'::text,
      NULL::uuid
    ) THEN
      RAISE EXCEPTION 'Rejected predecessor does not match the opening authority key'
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
      WHERE later_rejected.organization_id = p_organization_id
        AND later_rejected.property_id = p_property_id
        AND later_rejected.owner_person_id = p_owner_person_id
        AND later_rejected.currency = p_currency
        AND later_rejected.effective_date = p_effective_date
        AND later_rejected.component = p_component
        AND later_rejected.request_kind = 'initial'
        AND later_rejected.correction_of_entry_id IS NULL
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
    WHERE pending.organization_id = p_organization_id
      AND pending.property_id = p_property_id
      AND pending.owner_person_id = p_owner_person_id
      AND pending.currency = p_currency
      AND pending.effective_date = p_effective_date
      AND pending.component = p_component
      AND pending.request_kind = 'initial'
      AND pending.status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'An initial opening request is already submitted for this authority key'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.owner_opening_balance_entries AS opening_entry
    WHERE opening_entry.organization_id = p_organization_id
      AND opening_entry.property_id = p_property_id
      AND opening_entry.owner_person_id = p_owner_person_id
      AND opening_entry.currency = p_currency
      AND opening_entry.effective_date = p_effective_date
      AND opening_entry.component = p_component
      AND opening_entry.entry_kind = 'opening'
  ) THEN
    RAISE EXCEPTION 'Initial owner opening authority already exists'
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
    p_organization_id,
    p_property_id,
    p_owner_person_id,
    v_roster.property_owner_id,
    v_roster.ownership_percent,
    v_roster.ownership_roster_hash,
    p_currency,
    p_effective_date,
    p_component,
    'initial',
    p_amount,
    NULL,
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
    p_organization_id,
    v_actor_id,
    'owner_opening_balance_request',
    v_request_id,
    CASE
      WHEN p_resubmission_of_request_id IS NULL THEN 'submitted'
      ELSE 'resubmitted'
    END,
    pg_catalog.jsonb_build_object(
      'source', 'checked_rpc',
      'operation', 'submit_owner_opening_balance',
      'financial_idempotency_request_id', v_claim.request_id,
      'payload_hash', v_payload_hash,
      'resubmission_of_request_id', p_resubmission_of_request_id,
      'proposed_amount', v_amount_text,
      'evidence_sha256', p_evidence_sha256
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'request_id', v_request_id,
    'resubmission_of_request_id', p_resubmission_of_request_id,
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

ALTER FUNCTION public.submit_owner_opening_balance(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, uuid, text, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, uuid, text, uuid, text
) TO authenticated;

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
  v_replay_result jsonb;
  v_snapshot public.owner_opening_balance_requests%ROWTYPE;
  v_request public.owner_opening_balance_requests%ROWTYPE;
  v_claim record;
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

  IF v_decision = 'approve' THEN
    RAISE EXCEPTION 'Owner opening approval is not available in this workflow milestone'
      USING ERRCODE = '22023';
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
    'rejected',
    pg_catalog.jsonb_build_object(
      'source', 'checked_rpc',
      'operation', 'review_owner_opening_balance',
      'financial_idempotency_request_id', v_claim.request_id,
      'decision', 'reject',
      'review_reason', v_review_reason,
      'entry_ids', pg_catalog.jsonb_build_array()
    )
  );

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'status', 'rejected',
    'entry_ids', pg_catalog.jsonb_build_array()
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

REVOKE ALL ON TABLE public.owner_opening_balance_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.owner_opening_balance_requests TO authenticated;
REVOKE ALL ON TABLE public.owner_opening_balance_entries
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.owner_opening_balance_entries TO authenticated;

COMMENT ON FUNCTION app_private.lock_owner_opening_property_month(
  uuid, uuid, public.currency_code, date
) IS
  'Serializes owner-opening work first on the existing organization financial month and then on one property/currency/month key.';

COMMENT ON FUNCTION public.submit_owner_opening_balance(
  uuid, uuid, uuid, public.currency_code, date,
  public.owner_balance_component, numeric, text, text, uuid, text, uuid, text
) IS
  'Submits an evidence-backed initial owner opening request or one linked resubmission; creates no balance entry.';

COMMENT ON FUNCTION public.review_owner_opening_balance(
  uuid, uuid, text, text, text
) IS
  'Task 2.2B rejection-only review boundary; approval is added atomically with entry creation in Task 2.2C.';
