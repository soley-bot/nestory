-- Keep setup readiness aligned with the exact date used by monthly rent
-- generation while preserving the business-date checks for every other item.
ALTER FUNCTION public.get_ips_setup_readiness(uuid, uuid, uuid, uuid, date)
  RENAME TO get_ips_setup_readiness_before_billing_period_alignment;
ALTER FUNCTION public.get_ips_setup_readiness_before_billing_period_alignment(
  uuid, uuid, uuid, uuid, date
) SET SCHEMA app_private;

REVOKE ALL ON FUNCTION
  app_private.get_ips_setup_readiness_before_billing_period_alignment(
    uuid, uuid, uuid, uuid, date
  )
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_ips_setup_readiness(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_effective_date date
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_items jsonb;
  v_policy_effective_date date;
  v_policy_ready boolean;
  v_policy_reason text;
  v_ready boolean;
BEGIN
  v_result :=
    app_private.get_ips_setup_readiness_before_billing_period_alignment(
      p_organization_id,
      p_property_id,
      p_unit_id,
      p_lease_id,
      p_effective_date
    );

  SELECT greatest(
    date_trunc('month', p_effective_date)::date,
    term.start_date
  )
  INTO v_policy_effective_date
  FROM public.resolve_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_effective_date
  ) AS term
  WHERE term.resolution_status = 'resolved';

  IF v_policy_effective_date IS NULL THEN
    RETURN v_result;
  END IF;

  SELECT readiness.readiness_status = 'ready', readiness.reason_code
  INTO v_policy_ready, v_policy_reason
  FROM public.resolve_lease_rent_readiness(
    p_organization_id,
    p_lease_id,
    v_policy_effective_date
  ) AS readiness;
  v_policy_ready := coalesce(v_policy_ready, false);

  SELECT coalesce(
    jsonb_agg(
      CASE WHEN item.value ->> 'code' = 'rent_policy' THEN
        item.value || jsonb_build_object(
          'ready', v_policy_ready,
          'reason', coalesce(v_policy_reason, 'rent_not_ready'),
          'policyEffectiveDate', v_policy_effective_date
        )
      ELSE item.value END
      ORDER BY item.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM jsonb_array_elements(v_result -> 'items')
    WITH ORDINALITY AS item(value, ordinality);

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS item
    WHERE NOT coalesce((item ->> 'ready')::boolean, false)
  )
  INTO v_ready;

  RETURN jsonb_set(
    jsonb_set(v_result, '{items}', v_items),
    '{ready}',
    to_jsonb(v_ready)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ips_setup_readiness(
  uuid, uuid, uuid, uuid, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ips_setup_readiness(
  uuid, uuid, uuid, uuid, date
) TO authenticated;

COMMENT ON FUNCTION public.get_ips_setup_readiness(
  uuid, uuid, uuid, uuid, date
) IS
  'Returns compositional IPS readiness and evaluates rent policy at the exact monthly-generation effective date.';

-- A setup repaired during the open current month needs a policy effective at
-- that month boundary. Older billing months remain immutable.
CREATE OR REPLACE FUNCTION public.approve_rent_policy_version(
  p_organization_id uuid,
  p_policy_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_policy public.rent_policy_versions%ROWTYPE;
  v_property_scope record;
BEGIN
  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':', 'rent_policy_version_v1', p_organization_id
      ),
      0
    )
  );

  SELECT policy.*
  INTO v_policy
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id
    AND policy.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent policy version was not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_policy.lifecycle <> 'draft' THEN
    RAISE EXCEPTION 'Only draft rent policy versions can be approved'
      USING ERRCODE = '42501';
  END IF;

  IF v_policy.effective_from <
      date_trunc('month', current_date)::date THEN
    RAISE EXCEPTION
      'Rent policy effective date cannot precede the current billing month'
      USING ERRCODE = '22023';
  END IF;

  IF v_policy.supported_frequencies IS NULL
    OR cardinality(v_policy.supported_frequencies) = 0
    OR v_policy.rent_calculation_timezone IS NULL
    OR v_policy.due_day_source IS NULL
    OR v_policy.short_month_due_day_rule IS NULL
    OR v_policy.lease_start_proration_rule IS NULL
    OR v_policy.lease_end_proration_rule IS NULL
    OR v_policy.notice_period_charging_rule IS NULL
    OR v_policy.mid_period_rent_change_rule IS NULL
    OR v_policy.concessions_support_state IS NULL
    OR v_policy.rent_free_support_state IS NULL
    OR v_policy.waivers_support_state IS NULL
    OR (
      v_policy.due_day_source = 'policy_default'
      AND v_policy.policy_default_due_day IS NULL
    )
    OR (
      v_policy.due_day_source = 'term'
      AND v_policy.policy_default_due_day IS NOT NULL
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_timezone_names AS timezone
      WHERE timezone.name = v_policy.rent_calculation_timezone
    ) THEN
    RAISE EXCEPTION 'Rent policy is incomplete and cannot be approved'
      USING ERRCODE = '23514';
  END IF;

  FOR v_property_scope IN
    SELECT DISTINCT
      leases.property_id,
      leases.monthly_rent_currency AS currency
    FROM public.current_leases AS leases
    WHERE leases.organization_id = p_organization_id
      AND leases.archived_at IS NULL
      AND leases.property_id IS NOT NULL
      AND leases.lease_end_date >= v_policy.effective_from
    ORDER BY leases.property_id, leases.monthly_rent_currency
  LOOP
    PERFORM app_private.lock_open_lease_term_periods(
      p_organization_id,
      v_property_scope.property_id,
      v_property_scope.currency,
      v_policy.effective_from,
      greatest(v_policy.effective_from, current_date)
    );
  END LOOP;

  PERFORM 1
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id
    AND policy.organization_id = p_organization_id
    AND policy.lifecycle = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent policy version changed during approval'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.rent_policy_versions
  SET lifecycle = 'approved',
      approved_at = now(),
      approved_by = v_actor_id,
      updated_at = now(),
      updated_by = v_actor_id
  WHERE id = p_policy_id
    AND organization_id = p_organization_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  SELECT p_organization_id,
    v_actor_id,
    'rent_policy_version',
    policy.id,
    'rent_policy_version_approved',
    to_jsonb(v_policy),
    to_jsonb(policy)
  FROM public.rent_policy_versions AS policy
  WHERE policy.id = p_policy_id;

  RETURN p_policy_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_rent_policy_version(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_rent_policy_version(uuid, uuid)
  TO authenticated;

-- The generic registrar remains finance/super-admin only. A transaction-local
-- service context is opened only after the task-bound wrapper proves the
-- Operations Manager owns the task's exact branch.
CREATE OR REPLACE FUNCTION app_private.can_submit_paid_cost_as_actor(
  p_organization_id uuid,
  p_actor_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_actor_id
      AND (
        (
          membership.role IN ('super_admin', 'finance_member')
          AND membership.branch_id IS NULL
          AND membership.person_id IS NULL
        )
        OR (
          membership.role = 'operations_manager'
          AND membership.branch_id IS NOT NULL
          AND current_setting(
            'app.paid_cost_task_service_context', true
          ) = 'verified'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_submit_paid_cost_as_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.assert_paid_cost_task_actor_scope(
  p_organization_id uuid,
  p_actor_id uuid,
  p_property_id uuid,
  p_task_id uuid
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.organization_members AS membership
      ON membership.organization_id = task.organization_id
     AND membership.user_id = p_actor_id
    WHERE task.organization_id = p_organization_id
      AND task.property_id = p_property_id
      AND task.id = p_task_id
      AND task.archived_at IS NULL
      AND (
        (
          membership.role IN ('super_admin', 'finance_member')
          AND membership.branch_id IS NULL
          AND membership.person_id IS NULL
        )
        OR (
          membership.role = 'operations_manager'
          AND membership.branch_id IS NOT NULL
          AND membership.branch_id = task.branch_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_forbidden'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.assert_paid_cost_task_actor_scope(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_paid_cost_evidence_object(
  p_organization_id uuid,
  p_actor_id uuid,
  p_property_id uuid,
  p_storage_path text,
  p_task_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app_private.assert_paid_cost_task_actor_scope(
    p_organization_id,
    p_actor_id,
    p_property_id,
    p_task_id
  );
  PERFORM set_config(
    'app.paid_cost_task_service_context', 'verified', true
  );
  BEGIN
    v_result := public.get_paid_cost_evidence_object(
      p_organization_id,
      p_actor_id,
      p_property_id,
      p_storage_path
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.paid_cost_task_service_context', 'off', true
    );
    RAISE;
  END;
  PERFORM set_config(
    'app.paid_cost_task_service_context', 'off', true
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_paid_cost_evidence_object(
  uuid, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_paid_cost_evidence_object(
  uuid, uuid, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.register_paid_cost_evidence_verified(
  p_organization_id uuid,
  p_actor_id uuid,
  p_property_id uuid,
  p_file_name text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_content_sha256 text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_idempotency_key text,
  p_task_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_document_id uuid;
BEGIN
  PERFORM app_private.assert_paid_cost_task_actor_scope(
    p_organization_id,
    p_actor_id,
    p_property_id,
    p_task_id
  );
  PERFORM set_config(
    'app.paid_cost_task_service_context', 'verified', true
  );
  BEGIN
    v_result := public.register_paid_cost_evidence_verified(
      p_organization_id,
      p_actor_id,
      p_property_id,
      p_file_name,
      p_storage_path,
      p_content_type,
      p_size_bytes,
      p_content_sha256,
      p_storage_object_id,
      p_storage_object_version,
      p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.paid_cost_task_service_context', 'off', true
    );
    RAISE;
  END;
  PERFORM set_config(
    'app.paid_cost_task_service_context', 'off', true
  );

  v_document_id := (v_result ->> 'document_id')::uuid;
  UPDATE public.documents
  SET task_id = p_task_id
  WHERE organization_id = p_organization_id
    AND property_id = p_property_id
    AND id = v_document_id
    AND (task_id IS NULL OR task_id = p_task_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task evidence binding conflicts'
      USING ERRCODE = '23505';
  END IF;

  RETURN v_result || jsonb_build_object('task_id', p_task_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_paid_cost_evidence_verified(
  uuid, uuid, uuid, text, text, text, bigint, text, uuid, text, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.get_paid_cost_evidence_object(
  uuid, uuid, uuid, text, uuid
) IS
  'Service-only task-bound Storage verification for an exact branch-authorized maintenance actor.';
COMMENT ON FUNCTION app_private.assert_paid_cost_task_actor_scope(
  uuid, uuid, uuid, uuid
) IS
  'Rejects paid-cost task evidence unless actor, task, property, organization, and Operations branch agree exactly.';
