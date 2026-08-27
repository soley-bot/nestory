-- Allow an active lease's still-unused scheduled billing successor to be
-- revised atomically. The existing lease-scoped advisory lock and row locks
-- continue to serialize different idempotency keys, while invoice snapshots
-- keep a used successor immutable.
DO $migration$
DECLARE
  v_function constant regprocedure :=
    'public.save_lease_billing_rules(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  v_definition text := pg_catalog.replace(
    pg_catalog.pg_get_functiondef(v_function), E'\r\n', E'\n'
  );
  v_old text;
  v_new text;
  v_anchor_count integer;
BEGIN
  v_old := $old$  v_current public.lease_billing_terms%ROWTYPE;
  v_current_is_complete boolean;$old$;
  v_new := $new$  v_current public.lease_billing_terms%ROWTYPE;
  v_current_is_complete boolean;
  v_future public.lease_billing_terms%ROWTYPE;
  v_future_count integer;$new$;
  v_anchor_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Unexpected save_lease_billing_rules declaration predecessor: % matches',
      v_anchor_count;
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$      IF EXISTS (
        SELECT 1
        FROM public.lease_billing_terms AS billing
        WHERE billing.organization_id = p_organization_id
          AND billing.lease_id = p_lease_id
          AND billing.archived_at IS NULL
          AND billing.id <> v_current.id
          AND billing.superseded_at IS NULL
          AND billing.effective_from > v_current.effective_from
      ) THEN
        RAISE EXCEPTION 'A future billing rule is already scheduled'
          USING ERRCODE = '55000', DETAIL = 'lease_billing_future_rule_exists';
      END IF;$old$;
  v_new := $new$      SELECT pg_catalog.count(*)::integer
      INTO v_future_count
      FROM public.lease_billing_terms AS billing
      WHERE billing.organization_id = p_organization_id
        AND billing.lease_id = p_lease_id
        AND billing.archived_at IS NULL
        AND billing.id <> v_current.id
        AND billing.superseded_at IS NULL
        AND billing.effective_from > v_current.effective_from;

      IF v_future_count > 1 THEN
        RAISE EXCEPTION 'The billing rule changed after the page loaded'
          USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
      ELSIF v_future_count = 1 THEN
        SELECT billing.*
        INTO v_future
        FROM public.lease_billing_terms AS billing
        WHERE billing.organization_id = p_organization_id
          AND billing.lease_id = p_lease_id
          AND billing.archived_at IS NULL
          AND billing.id <> v_current.id
          AND billing.superseded_at IS NULL
          AND billing.effective_from > v_current.effective_from;

        IF v_future.supersedes_billing_term_id IS DISTINCT FROM v_current.id
          OR v_future.rule_source <> 'lease_default_v1' THEN
          RAISE EXCEPTION 'The billing rule changed after the page loaded'
            USING ERRCODE = '40001', DETAIL = 'lease_billing_rule_stale';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.tenant_invoices AS invoice
          WHERE invoice.organization_id = p_organization_id
            AND invoice.lease_id = p_lease_id
            AND invoice.billing_term_id = v_future.id
        ) THEN
          RAISE EXCEPTION 'A used billing rule cannot be overwritten'
            USING ERRCODE = '55000', DETAIL = 'lease_billing_rule_used';
        END IF;
      END IF;$new$;
  v_anchor_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Unexpected save_lease_billing_rules future-rule predecessor: % matches',
      v_anchor_count;
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$      IF v_candidate_effective_from <= v_current.effective_from
        OR v_candidate_effective_from > v_current.effective_to
        OR v_candidate_effective_from > v_term_end THEN
        RAISE EXCEPTION 'There is no unbilled future month in this Lease'
          USING ERRCODE = '55000', DETAIL = 'lease_billing_no_future_month';
      END IF;$old$;
  v_new := $new$      IF v_candidate_effective_from <= v_current.effective_from
        OR v_candidate_effective_from > v_term_end
        OR (
          v_future.id IS NULL
          AND v_candidate_effective_from > v_current.effective_to
        )
        OR (
          v_future.id IS NOT NULL
          AND (
            v_candidate_effective_from <> v_future.effective_from
            OR v_future.effective_to <> v_term_end
          )
        ) THEN
        RAISE EXCEPTION 'There is no unbilled future month in this Lease'
          USING ERRCODE = '55000', DETAIL = 'lease_billing_no_future_month';
      END IF;$new$;
  v_anchor_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Unexpected save_lease_billing_rules candidate predecessor: % matches',
      v_anchor_count;
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$      UPDATE public.lease_billing_terms AS billing
      SET
        effective_to = v_candidate_effective_from - 1,$old$;
  v_new := $new$      IF v_future.id IS NOT NULL THEN
        UPDATE public.lease_billing_terms AS billing
        SET
          property_id = v_lease.property_id,
          effective_to = v_term_end,
          collection_route = v_billing_rule ->> 'collectionRoute',
          management_fee_mode = v_billing_rule ->> 'managementFeeMode',
          management_fee_value =
            (v_billing_rule ->> 'managementFeeValue')::numeric,
          charge_management_fee_when_active =
            (v_billing_rule ->> 'chargeManagementFeeWhenActive')::boolean,
          full_management_fee_during_proration =
            (v_billing_rule ->> 'fullManagementFeeDuringProration')::boolean,
          billing_recipient_kind =
            v_billing_rule ->> 'billingRecipientKind',
          billing_recipient_person_id =
            (v_billing_rule ->> 'billingRecipientPersonId')::uuid,
          first_period_prorated_amount =
            (v_billing_rule ->> 'firstPeriodProratedAmount')::numeric,
          final_period_prorated_amount =
            (v_billing_rule ->> 'finalPeriodProratedAmount')::numeric,
          rent_calculation_timezone =
            v_billing_rule ->> 'rentCalculationTimezone',
          short_month_due_day_rule =
            v_billing_rule ->> 'shortMonthDueDayRule',
          lease_start_proration_rule =
            v_billing_rule ->> 'leaseStartProrationRule',
          lease_end_proration_rule =
            v_billing_rule ->> 'leaseEndProrationRule',
          mid_period_rent_change_rule =
            v_billing_rule ->> 'midPeriodRentChangeRule',
          charge_through_lease_end =
            (v_billing_rule ->> 'chargeThroughLeaseEnd')::boolean,
          confirmed_at = pg_catalog.clock_timestamp(),
          confirmed_by = v_actor_id,
          updated_by = v_actor_id
        WHERE billing.organization_id = p_organization_id
          AND billing.lease_id = p_lease_id
          AND billing.id = v_future.id
          AND billing.archived_at IS NULL
          AND billing.superseded_at IS NULL
          AND billing.supersedes_billing_term_id = v_current.id
          AND billing.effective_from = v_candidate_effective_from
          AND NOT EXISTS (
            SELECT 1
            FROM public.tenant_invoices AS invoice
            WHERE invoice.organization_id = p_organization_id
              AND invoice.lease_id = p_lease_id
              AND invoice.billing_term_id = billing.id
          )
        RETURNING billing.id INTO v_billing_term_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'A used billing rule cannot be overwritten'
            USING ERRCODE = '55000', DETAIL = 'lease_billing_rule_used';
        END IF;

        INSERT INTO public.activity_logs (
          organization_id,
          actor_id,
          entity_type,
          entity_id,
          action,
          previous_values,
          new_values
        )
        SELECT
          p_organization_id,
          v_actor_id,
          'lease_billing_term',
          v_billing_term_id,
          'lease_billing_scheduled_revised',
          pg_catalog.to_jsonb(v_future),
          pg_catalog.to_jsonb(billing)
        FROM public.lease_billing_terms AS billing
        WHERE billing.organization_id = p_organization_id
          AND billing.lease_id = p_lease_id
          AND billing.id = v_billing_term_id;

        v_result := pg_catalog.jsonb_build_object(
          'leaseId', p_lease_id,
          'billingTermId', v_billing_term_id,
          'supersedesBillingTermId', v_current.id,
          'effectiveFrom', v_candidate_effective_from,
          'mode', 'scheduled_revision'
        );

        RETURN app_private.complete_financial_idempotency(
          v_claim.request_id,
          p_organization_id,
          v_actor_id,
          v_result
        );
      END IF;

      UPDATE public.lease_billing_terms AS billing
      SET
        effective_to = v_candidate_effective_from - 1,$new$;
  v_anchor_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'Unexpected save_lease_billing_rules write predecessor: % matches',
      v_anchor_count;
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END;
$migration$;

ALTER FUNCTION public.save_lease_billing_rules(uuid, uuid, jsonb, uuid, text)
  OWNER TO postgres;
ALTER FUNCTION public.save_lease_billing_rules(uuid, uuid, jsonb, uuid, text)
  SET search_path = '';
REVOKE ALL ON FUNCTION public.save_lease_billing_rules(
  uuid, uuid, jsonb, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_lease_billing_rules(
  uuid, uuid, jsonb, uuid, text
) TO authenticated;

COMMENT ON FUNCTION public.save_lease_billing_rules(
  uuid, uuid, jsonb, uuid, text
) IS
  'Revises unused scheduled lease billing successors atomically while preserving used billing evidence.';
