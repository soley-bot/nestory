BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(9);

CREATE TEMP TABLE no_global_rent_fallback_state (
  slot integer PRIMARY KEY,
  organization_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  billing_term_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  direct_result jsonb,
  helper_result jsonb,
  scheduled_result jsonb
) ON COMMIT DROP;

INSERT INTO no_global_rent_fallback_state (
  slot, organization_id, lease_id, billing_term_id, actor_id
)
SELECT
  row_number() OVER (ORDER BY lease.id),
  lease.organization_id,
  lease.id,
  billing.id,
  membership.user_id
FROM public.leases AS lease
JOIN public.lease_terms AS term
  ON term.organization_id = lease.organization_id
  AND term.lease_id = lease.id
  AND term.authority_kind = 'authoritative'
  AND term.status IN ('active', 'upcoming')
  AND term.archived_at IS NULL
  AND term.start_date <= DATE '2027-04-30'
  AND term.end_date >= DATE '2027-01-01'
JOIN public.lease_billing_terms AS billing
  ON billing.organization_id = lease.organization_id
  AND billing.lease_id = lease.id
  AND billing.archived_at IS NULL
  AND billing.effective_from <= DATE '2027-04-30'
  AND billing.effective_to >= DATE '2027-01-01'
JOIN LATERAL (
  SELECT member.user_id
  FROM public.organization_members AS member
  WHERE member.organization_id = lease.organization_id
    AND member.role = 'super_admin'
  ORDER BY member.created_at, member.id
  LIMIT 1
) AS membership ON true
WHERE lease.archived_at IS NULL
  AND lease.status IN ('active', 'notice_given')
ORDER BY lease.id
LIMIT 4;

SELECT is(
  (SELECT count(*)::integer FROM no_global_rent_fallback_state),
  4,
  'the fixture provides three missing-rule leases and one Lease-owned control'
);

SET LOCAL session_replication_role = replica;

UPDATE public.leases AS lease
SET status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM no_global_rent_fallback_state AS state
    WHERE state.organization_id = lease.organization_id
      AND state.lease_id = lease.id
  ) THEN 'active'
  ELSE 'ended'
END
WHERE lease.organization_id = (
    SELECT organization_id FROM no_global_rent_fallback_state LIMIT 1
  )
  AND lease.archived_at IS NULL
  AND lease.status IN ('active', 'notice_given');

UPDATE public.lease_billing_terms AS billing
SET rule_source = CASE state.slot
  WHEN 4 THEN 'lease_default_v1'
  ELSE 'historical_policy_snapshot'
END
FROM no_global_rent_fallback_state AS state
WHERE billing.organization_id = state.organization_id
  AND billing.id = state.billing_term_id;

UPDATE public.rent_policy_versions AS policy
SET rent_calculation_timezone = 'Pacific/Honolulu',
    due_day_source = 'policy_default',
    policy_default_due_day = 28,
    short_month_due_day_rule = 'next_calendar_month'
WHERE policy.organization_id = (
  SELECT organization_id
  FROM no_global_rent_fallback_state
  LIMIT 1
)
  AND policy.lifecycle = 'approved';

SET LOCAL session_replication_role = origin;

UPDATE no_global_rent_fallback_state AS state
SET direct_result = app_private.try_generate_lease_rent_invoice(
  state.organization_id,
  state.lease_id,
  DATE '2027-01-01',
  DATE '2027-01-15',
  'activation_catch_up',
  state.actor_id
)
WHERE state.slot = 1;

SELECT is(
  (SELECT direct_result ->> 'status'
   FROM no_global_rent_fallback_state WHERE slot = 1),
  'failed',
  'explicit current-period generation fails closed without an effective Lease rule'
);

SELECT is(
  (SELECT direct_result ->> 'code'
   FROM no_global_rent_fallback_state WHERE slot = 1),
  'billing_setup_missing',
  'explicit current-period generation reports the typed billing setup exception'
);

UPDATE no_global_rent_fallback_state AS state
SET helper_result = app_private.try_current_month_rent(
  state.organization_id,
  state.lease_id,
  'activation_catch_up',
  TIMESTAMPTZ '2027-02-15 12:00:00+00'
)
WHERE state.slot = 2;

SELECT is(
  (SELECT helper_result ->> 'status'
   FROM no_global_rent_fallback_state WHERE slot = 2),
  'failed',
  'the current-period helper fails closed during activation without a Lease rule'
);

SELECT is(
  (SELECT helper_result ->> 'code'
   FROM no_global_rent_fallback_state WHERE slot = 2),
  'billing_setup_missing',
  'the current-period helper does not resolve its month from the changed global policy'
);

UPDATE no_global_rent_fallback_state AS state
SET scheduled_result = app_private.run_due_rent_generation(
  TIMESTAMPTZ '2027-03-15 12:00:00+00'
)
WHERE state.slot = 3;

SELECT is(
  (SELECT scheduled_result
   FROM no_global_rent_fallback_state WHERE slot = 3),
  jsonb_build_object('generated', 1, 'failed', 3, 'skipped', 0),
  'scheduled generation records missing Lease rules as failures and generates the configured control'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.rent_generation_exceptions AS exception
    JOIN no_global_rent_fallback_state AS state
      ON state.organization_id = exception.organization_id
      AND state.lease_id = exception.lease_id
      AND state.slot <= 3
    WHERE exception.error_code = 'billing_setup_missing'
      AND exception.billing_period_start BETWEEN DATE '2027-01-01' AND DATE '2027-03-01'
  ),
  5,
  'each explicit, helper, and scheduled missing-rule attempt retains a typed reviewable exception'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices AS invoice
    JOIN no_global_rent_fallback_state AS state
      ON state.organization_id = invoice.organization_id
      AND state.lease_id = invoice.lease_id
      AND state.slot <= 3
    WHERE invoice.billing_period_start IN (
      DATE '2027-01-01', DATE '2027-02-01', DATE '2027-03-01'
    )
  ),
  0,
  'the changed global policy cannot create current invoices for missing-rule leases'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tenant_invoices AS invoice
    JOIN no_global_rent_fallback_state AS state
      ON state.organization_id = invoice.organization_id
      AND state.lease_id = invoice.lease_id
      AND state.slot = 4
    WHERE invoice.billing_period_start = DATE '2027-03-01'
      AND invoice.billing_term_id = state.billing_term_id
  ),
  1,
  'a lease with an effective lease_default_v1 rule still generates from that rule'
);

SELECT * FROM finish();

ROLLBACK;
