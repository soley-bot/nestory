-- Return the trusted-report document source in one PostgreSQL statement so
-- API row caps and concurrent mutations cannot produce a mixed population.
--
-- This is a read-only Plan 03 evidence boundary. It does not cut over a report
-- calculation or grant any document mutation authority.

CREATE OR REPLACE FUNCTION public.get_report_documents_snapshot(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'count',
    (
      SELECT pg_catalog.count(*)
      FROM public.documents
      WHERE documents.organization_id = p_organization_id
        AND documents.archived_at IS NULL
    ),
    'documents',
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', bounded_documents.id,
            'property_id', bounded_documents.property_id,
            'unit_id', bounded_documents.unit_id,
            'lease_id', bounded_documents.lease_id,
            'ledger_entry_id', bounded_documents.ledger_entry_id,
            'timeline_event_id', bounded_documents.timeline_event_id,
            'file_name', bounded_documents.file_name
          )
          ORDER BY bounded_documents.id
        )
        FROM (
          SELECT
            documents.id,
            documents.property_id,
            documents.unit_id,
            documents.lease_id,
            documents.ledger_entry_id,
            documents.timeline_event_id,
            documents.file_name
          FROM public.documents
          WHERE documents.organization_id = p_organization_id
            AND documents.archived_at IS NULL
          ORDER BY documents.id
          LIMIT 5001
        ) AS bounded_documents
      ),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL
ON FUNCTION public.get_report_documents_snapshot(uuid)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE
ON FUNCTION public.get_report_documents_snapshot(uuid)
TO authenticated;

COMMENT ON FUNCTION public.get_report_documents_snapshot(uuid) IS
  'Returns one RLS-scoped, statement-snapshot JSON payload for active organization documents; at most 5001 rows are materialized so callers can enforce the 5000-row report boundary.';
