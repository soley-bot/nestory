CREATE OR REPLACE FUNCTION public.get_finance_income_workflow_summary(
  p_organization_id uuid,
  p_due_from date,
  p_due_before date,
  p_status text,
  p_property_id uuid,
  p_unit_id uuid,
  p_query text,
  p_today date
)
RETURNS TABLE (
  receivable_total numeric,
  received_total numeric,
  open_count bigint,
  overdue_count bigint,
  unposted_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  normalized_status text := NULLIF(lower(trim(coalesce(p_status, ''))), '');
  normalized_tokens text[] := ARRAY[]::text[];
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(token ORDER BY ordinal), ARRAY[]::text[])
  INTO normalized_tokens
  FROM (
    SELECT token, ordinal
    FROM unnest(
      regexp_split_to_array(
        lower(regexp_replace(coalesce(p_query, ''), '[,%()*]', ' ', 'g')),
        '[[:space:]]+'
      )
    ) WITH ORDINALITY AS raw_tokens(token, ordinal)
    WHERE token <> ''
    ORDER BY ordinal
    LIMIT 6
  ) tokens;

  RETURN QUERY
  WITH scoped AS (
    SELECT item.*
    FROM public.finance_income_items item
    WHERE item.organization_id = p_organization_id
      AND item.archived_at IS NULL
      AND item.due_date >= p_due_from
      AND item.due_date < p_due_before
      AND (normalized_status IS NULL OR item.status = normalized_status)
      AND (p_property_id IS NULL OR item.property_id = p_property_id)
      AND (p_unit_id IS NULL OR item.unit_id = p_unit_id)
      AND (
        cardinality(normalized_tokens) = 0
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(normalized_tokens) AS token(value)
          WHERE NOT (
            lower(item.payer_label) LIKE '%' || replace(replace(replace(token.value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
            OR lower(coalesce(item.description, '')) LIKE '%' || replace(replace(replace(token.value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
            OR lower(coalesce(item.reference, '')) LIKE '%' || replace(replace(replace(token.value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
          )
        )
      )
  )
  SELECT
    coalesce(sum(scoped.amount_due), 0)::numeric AS receivable_total,
    coalesce(sum(scoped.amount_received), 0)::numeric AS received_total,
    count(*) FILTER (
      WHERE scoped.status IN ('open', 'partially_received', 'received')
    )::bigint AS open_count,
    count(*) FILTER (
      WHERE scoped.due_date < p_today
        AND scoped.status IN ('open', 'partially_received')
    )::bigint AS overdue_count,
    count(*) FILTER (
      WHERE scoped.status IN ('partially_received', 'received')
    )::bigint AS unposted_count
  FROM scoped;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_expense_workflow_summary(
  p_organization_id uuid,
  p_invoice_from date,
  p_invoice_before date,
  p_status text,
  p_property_id uuid,
  p_unit_id uuid,
  p_query text,
  p_today date
)
RETURNS TABLE (
  approved_count bigint,
  draft_count bigint,
  overdue_count bigint,
  posted_total numeric,
  unposted_total numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  normalized_status text := NULLIF(lower(trim(coalesce(p_status, ''))), '');
  normalized_tokens text[] := ARRAY[]::text[];
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(token ORDER BY ordinal), ARRAY[]::text[])
  INTO normalized_tokens
  FROM (
    SELECT token, ordinal
    FROM unnest(
      regexp_split_to_array(
        lower(regexp_replace(coalesce(p_query, ''), '[,%()*]', ' ', 'g')),
        '[[:space:]]+'
      )
    ) WITH ORDINALITY AS raw_tokens(token, ordinal)
    WHERE token <> ''
    ORDER BY ordinal
    LIMIT 6
  ) tokens;

  RETURN QUERY
  WITH scoped AS (
    SELECT item.*
    FROM public.finance_expense_items item
    WHERE item.organization_id = p_organization_id
      AND item.archived_at IS NULL
      AND item.invoice_date >= p_invoice_from
      AND item.invoice_date < p_invoice_before
      AND (normalized_status IS NULL OR item.status = normalized_status)
      AND (p_property_id IS NULL OR item.property_id = p_property_id)
      AND (p_unit_id IS NULL OR item.unit_id = p_unit_id)
      AND (
        cardinality(normalized_tokens) = 0
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(normalized_tokens) AS token(value)
          WHERE NOT (
            lower(item.vendor_label) LIKE '%' || replace(replace(replace(token.value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
            OR lower(item.category) LIKE '%' || replace(replace(replace(token.value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
            OR lower(coalesce(item.description, '')) LIKE '%' || replace(replace(replace(token.value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
            OR lower(coalesce(item.reference, '')) LIKE '%' || replace(replace(replace(token.value, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
          )
        )
      )
  )
  SELECT
    count(*) FILTER (WHERE scoped.status = 'approved')::bigint AS approved_count,
    count(*) FILTER (WHERE scoped.status = 'draft')::bigint AS draft_count,
    count(*) FILTER (
      WHERE scoped.due_date < p_today
        AND scoped.status IN ('draft', 'approved')
    )::bigint AS overdue_count,
    coalesce(sum(scoped.amount) FILTER (
      WHERE scoped.status IN ('posted', 'paid')
    ), 0)::numeric AS posted_total,
    coalesce(sum(scoped.amount) FILTER (
      WHERE scoped.status = 'approved'
    ), 0)::numeric AS unposted_total
  FROM scoped;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_income_workflow_summary(
  uuid,
  date,
  date,
  text,
  uuid,
  uuid,
  text,
  date
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_finance_expense_workflow_summary(
  uuid,
  date,
  date,
  text,
  uuid,
  uuid,
  text,
  date
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_finance_income_workflow_summary(
  uuid,
  date,
  date,
  text,
  uuid,
  uuid,
  text,
  date
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_finance_expense_workflow_summary(
  uuid,
  date,
  date,
  text,
  uuid,
  uuid,
  text,
  date
) TO authenticated;
