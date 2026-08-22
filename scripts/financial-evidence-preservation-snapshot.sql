WITH expected_targets(
  id,
  organization_id,
  branch_id,
  document_row_sha256,
  expense_reference_count,
  active_opening_reference_count,
  financial_reference_sha256,
  expected_parent_count
) AS (
  VALUES
    (
      '1759ac8e-881d-4e01-8c91-f671f2d7361b'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid,
      '5c1eed5acfe780771360e8aefc580345bbd379fedeb1b35ae0c554a5255ade36',
      1,
      0,
      '2e709c2269424c28626a88554f62403c2dfd5e61a35f72a9c40f3293c39febd7',
      1
    ),
    (
      '19a60225-b17b-4d1d-ad6b-c1bcc25ce10d'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid,
      '37a99d408f2abe9e68b257db3c3d476ffa7bed92e36169278abe812c3775f3b2',
      1,
      0,
      '7e9859df80871fd1559de45325033c1ded97cb5b69e51271683dbec3f05972ef',
      2
    ),
    (
      '71a9b2e7-2e03-4504-89e4-1b822290117f'::uuid,
      '1221152a-3a7d-48f6-a109-45f2b2173813'::uuid,
      'a8120000-0000-4000-8000-000000000001'::uuid,
      '97210808b2b73170ea6db5dd1ae9b9e65139e5041de7bd627b2e9c857ef2f525',
      1,
      0,
      'cd9da1a9f6be9aedd84a9a9640c89ecc66c47d3e3264d8f7d748eededbc62308',
      2
    )
), observed AS (
  SELECT
    expected_targets.id,
    expected_targets.branch_id,
    encode(
      extensions.digest(
        convert_to((to_jsonb(document) - 'branch_id')::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ) AS document_row_sha256,
    app_private.is_financial_evidence_document_locked(document.id) AS is_locked,
    (
      SELECT count(*)::integer
      FROM public.expense_submissions AS submission
      WHERE submission.supporting_document_id = document.id
    ) AS expense_reference_count,
    (
      SELECT count(*)::integer
      FROM public.owner_opening_balance_requests AS request
      WHERE request.supporting_document_id = document.id
        AND request.status IN ('submitted', 'approved')
    ) AS active_opening_reference_count,
    encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'expense_submissions', coalesce((
              SELECT jsonb_agg(to_jsonb(submission) ORDER BY submission.id)
              FROM public.expense_submissions AS submission
              WHERE submission.supporting_document_id = document.id
            ), '[]'::jsonb),
            'owner_opening_balance_requests', coalesce((
              SELECT jsonb_agg(to_jsonb(request) ORDER BY request.id)
              FROM public.owner_opening_balance_requests AS request
              WHERE request.supporting_document_id = document.id
            ), '[]'::jsonb)
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS financial_reference_sha256,
    scope.expected_parent_count,
    scope.resolved_parent_count,
    scope.distinct_branch_count,
    scope.expected_branch_id,
    (
      SELECT count(*)::integer
      FROM storage.objects AS object_record
      WHERE object_record.bucket_id = 'nestory-documents'
        AND object_record.name = document.storage_path
    ) AS storage_object_count
  FROM expected_targets
  JOIN public.documents AS document
    ON document.organization_id = expected_targets.organization_id
   AND document.id = expected_targets.id
  CROSS JOIN LATERAL (
    WITH expected AS (
      SELECT
        (document.property_id IS NOT NULL)::integer
        + (document.unit_id IS NOT NULL)::integer
        + (document.lease_id IS NOT NULL)::integer
        + (document.timeline_event_id IS NOT NULL)::integer
        + (document.ledger_entry_id IS NOT NULL)::integer
        + (document.task_id IS NOT NULL)::integer
        + (document.tenant_request_id IS NOT NULL)::integer AS count
    ), scopes AS (
      SELECT property.branch_id
      FROM public.properties AS property
      WHERE document.property_id IS NOT NULL
        AND property.organization_id = document.organization_id
        AND property.id = document.property_id
      UNION ALL
      SELECT property.branch_id
      FROM public.units AS unit_record
      JOIN public.properties AS property
        ON property.organization_id = unit_record.organization_id
       AND property.id = unit_record.property_id
      WHERE document.unit_id IS NOT NULL
        AND unit_record.organization_id = document.organization_id
        AND unit_record.id = document.unit_id
      UNION ALL
      SELECT property.branch_id
      FROM public.leases AS lease_record
      JOIN public.properties AS property
        ON property.organization_id = lease_record.organization_id
       AND property.id = lease_record.property_id
      WHERE document.lease_id IS NOT NULL
        AND lease_record.organization_id = document.organization_id
        AND lease_record.id = document.lease_id
      UNION ALL
      SELECT property.branch_id
      FROM public.timeline_events AS event
      JOIN public.properties AS property
        ON property.organization_id = event.organization_id
       AND property.id = event.property_id
      WHERE document.timeline_event_id IS NOT NULL
        AND event.organization_id = document.organization_id
        AND event.id = document.timeline_event_id
      UNION ALL
      SELECT property.branch_id
      FROM public.ledger_entries AS entry
      JOIN public.properties AS property
        ON property.organization_id = entry.organization_id
       AND property.id = entry.property_id
      WHERE document.ledger_entry_id IS NOT NULL
        AND entry.organization_id = document.organization_id
        AND entry.id = document.ledger_entry_id
      UNION ALL
      SELECT task.branch_id
      FROM public.tasks AS task
      JOIN public.properties AS property
        ON property.organization_id = task.organization_id
       AND property.id = task.property_id
       AND property.branch_id = task.branch_id
      WHERE document.task_id IS NOT NULL
        AND task.organization_id = document.organization_id
        AND task.id = document.task_id
      UNION ALL
      SELECT property.branch_id
      FROM public.tenant_requests AS request
      JOIN public.properties AS property
        ON property.organization_id = request.organization_id
       AND property.id = request.property_id
      WHERE document.tenant_request_id IS NOT NULL
        AND request.organization_id = document.organization_id
        AND request.id = document.tenant_request_id
    )
    SELECT
      expected.count AS expected_parent_count,
      count(scopes.branch_id)::integer AS resolved_parent_count,
      count(DISTINCT scopes.branch_id)::integer AS distinct_branch_count,
      CASE
        WHEN expected.count > 0
          AND count(scopes.branch_id) = expected.count
          AND count(DISTINCT scopes.branch_id) = 1
        THEN min(scopes.branch_id::text)::uuid
        ELSE NULL::uuid
      END AS expected_branch_id
    FROM expected
    LEFT JOIN scopes ON true
    GROUP BY expected.count
  ) AS scope
), related_activity AS (
  SELECT
    count(*)::integer AS related_activity_count,
    encode(
      extensions.digest(
        convert_to(
          coalesce(
            jsonb_agg((to_jsonb(activity) - 'branch_id') ORDER BY activity.id),
            '[]'::jsonb
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS related_activity_sha256
  FROM public.activity_logs AS activity
  JOIN expected_targets ON expected_targets.id = activity.entity_id
  WHERE activity.entity_type IN ('document', 'documents')
), validated AS (
  SELECT observed.*
  FROM observed
  JOIN expected_targets USING (id, branch_id)
  WHERE observed.document_row_sha256 = expected_targets.document_row_sha256
    AND observed.is_locked
    AND observed.expense_reference_count = expected_targets.expense_reference_count
    AND observed.active_opening_reference_count = expected_targets.active_opening_reference_count
    AND observed.financial_reference_sha256 = expected_targets.financial_reference_sha256
    AND observed.expected_parent_count = expected_targets.expected_parent_count
    AND observed.resolved_parent_count = expected_targets.expected_parent_count
    AND observed.distinct_branch_count = 1
    AND observed.expected_branch_id = expected_targets.branch_id
    AND observed.storage_object_count = 1
)
SELECT jsonb_build_object(
  'target_count', count(*),
  'documents', jsonb_agg(
    jsonb_build_object(
      'id', validated.id,
      'document_row_sha256', validated.document_row_sha256,
      'financial_reference_sha256', validated.financial_reference_sha256,
      'expense_reference_count', validated.expense_reference_count,
      'active_opening_reference_count', validated.active_opening_reference_count,
      'related_branch_id', validated.expected_branch_id,
      'storage_object_count', validated.storage_object_count
    ) ORDER BY validated.id
  ),
  'related_activity_count', related_activity.related_activity_count,
  'related_activity_sha256', related_activity.related_activity_sha256
) AS financial_evidence_preservation
FROM validated
CROSS JOIN related_activity
GROUP BY
  related_activity.related_activity_count,
  related_activity.related_activity_sha256
HAVING count(*) = 3
  AND (SELECT count(*) FROM public.documents) = 3
  AND related_activity.related_activity_count = 3
  AND related_activity.related_activity_sha256 = 'e65cc7a22effc643c7a638bc400de8a4cda83c9cdc01f765358f143cfb9ac6eb';
