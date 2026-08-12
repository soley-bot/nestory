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
      'payload_hash', v_payload_hash,
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
