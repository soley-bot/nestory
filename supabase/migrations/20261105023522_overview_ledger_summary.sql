-- The overview needs monthly amounts and exact counts, not full ledger rows.
-- SECURITY INVOKER retains the caller's existing organization/branch finance RLS.
CREATE FUNCTION public.get_overview_ledger_summary(
  p_organization_id uuid,
  p_window_from date,
  p_window_before date,
  p_recent_expense_from date,
  p_recent_expense_before date,
  p_large_expense_threshold numeric,
  p_property_id uuid DEFAULT NULL,
  p_financial_start_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH grouped AS (
    SELECT
      CASE
        WHEN entry.transaction_date >= p_window_from
          AND entry.transaction_date < p_window_before
        THEN pg_catalog.date_trunc('month', entry.transaction_date::timestamp)::date
      END AS month_start,
      entry.currency,
      entry.direction,
      sum(entry.amount) FILTER (
        WHERE entry.transaction_date >= p_window_from
          AND entry.transaction_date < p_window_before
      ) AS amount,
      count(*) AS entry_count,
      count(*) FILTER (
        WHERE entry.direction = 'expense'
          AND entry.amount >= p_large_expense_threshold
          AND entry.transaction_date >= p_recent_expense_from
          AND entry.transaction_date < p_recent_expense_before
      ) AS recent_expense_count
    FROM public.ledger_entries AS entry
    WHERE entry.organization_id = p_organization_id
      AND (p_property_id IS NULL OR entry.property_id = p_property_id)
      AND entry.archived_at IS NULL
      AND entry.transaction_date >= coalesce(p_financial_start_date, DATE '0001-01-01')
    GROUP BY 1, entry.currency, entry.direction
  )
  SELECT pg_catalog.jsonb_build_object(
    'ledger_entry_count', coalesce(sum(grouped.entry_count), 0),
    'large_recent_expense_count', coalesce(sum(grouped.recent_expense_count), 0),
    'months', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'transaction_date', grouped.month_start,
          'currency', grouped.currency,
          'direction', grouped.direction,
          'amount', grouped.amount
        ) ORDER BY grouped.month_start, grouped.currency, grouped.direction
      ) FILTER (WHERE grouped.month_start IS NOT NULL),
      '[]'::jsonb
    )
  )
  FROM grouped;
$function$;

REVOKE ALL ON FUNCTION public.get_overview_ledger_summary(uuid, date, date, date, date, numeric, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_ledger_summary(uuid, date, date, date, date, numeric, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_overview_ledger_summary(uuid, date, date, date, date, numeric, uuid, date)
IS 'Overview ledger counts and monthly amounts from one RLS-scoped snapshot. Business-date and financial-start bounds are supplied by the guarded server loader.';
