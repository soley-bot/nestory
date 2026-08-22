WITH pilot AS (
  SELECT organization.id
  FROM public.organizations AS organization
  WHERE organization.slug = 'pilot'
),
snapshot AS (
  SELECT jsonb_build_object(
    'organizationCount', (SELECT count(*) FROM pilot),
    'membershipCount', (
      SELECT count(*)
      FROM public.organization_members AS member
      JOIN pilot ON pilot.id = member.organization_id
    ),
    'superAdminMembershipCount', (
      SELECT count(*)
      FROM public.organization_members AS member
      JOIN pilot ON pilot.id = member.organization_id
      WHERE member.role = 'super_admin'
    ),
    'branchCount', (SELECT count(*) FROM public.organization_branches AS record JOIN pilot ON pilot.id = record.organization_id),
    'teamCount', (SELECT count(*) FROM public.organization_teams AS record JOIN pilot ON pilot.id = record.organization_id),
    'propertyCount', (SELECT count(*) FROM public.properties AS record JOIN pilot ON pilot.id = record.organization_id),
    'unitCount', (SELECT count(*) FROM public.units AS record JOIN pilot ON pilot.id = record.organization_id),
    'personCount', (SELECT count(*) FROM public.people AS record JOIN pilot ON pilot.id = record.organization_id),
    'leaseCount', (SELECT count(*) FROM public.leases AS record JOIN pilot ON pilot.id = record.organization_id),
    'leaseLifecycleEventCount', (SELECT count(*) FROM public.lease_lifecycle_events AS record JOIN pilot ON pilot.id = record.organization_id),
    'documentCount', (SELECT count(*) FROM public.documents AS record JOIN pilot ON pilot.id = record.organization_id),
    'assetPhotoCount', (SELECT count(*) FROM public.asset_photos AS record JOIN pilot ON pilot.id = record.organization_id),
    'taskCount', (SELECT count(*) FROM public.tasks AS record JOIN pilot ON pilot.id = record.organization_id),
    'maintenanceSeriesCount', (SELECT count(*) FROM public.maintenance_recurrence_series AS record JOIN pilot ON pilot.id = record.organization_id),
    'ledgerEntryCount', (SELECT count(*) FROM public.ledger_entries AS record JOIN pilot ON pilot.id = record.organization_id),
    'financialMonthLockCount', (SELECT count(*) FROM public.financial_month_locks AS record JOIN pilot ON pilot.id = record.organization_id),
    'tenantInvoiceCount', (SELECT count(*) FROM public.tenant_invoices AS record JOIN pilot ON pilot.id = record.organization_id),
    'ownerInvoiceCount', (SELECT count(*) FROM public.owner_invoices AS record JOIN pilot ON pilot.id = record.organization_id),
    'ownerCashEventCount', (SELECT count(*) FROM public.owner_cash_events AS record JOIN pilot ON pilot.id = record.organization_id),
    'ownerComponentMovementCount', (SELECT count(*) FROM public.owner_component_movements AS record JOIN pilot ON pilot.id = record.organization_id),
    'ownerStatementPublicationCount', (SELECT count(*) FROM public.owner_statement_publications AS record JOIN pilot ON pilot.id = record.organization_id),
    'timelineEventCount', (SELECT count(*) FROM public.timeline_events AS record JOIN pilot ON pilot.id = record.organization_id),
    'activityLogCount', (SELECT count(*) FROM public.activity_logs AS record JOIN pilot ON pilot.id = record.organization_id)
  ) AS value
)
SELECT value AS pilot_preservation
FROM snapshot
WHERE (value ->> 'organizationCount')::integer = 1
  AND (value ->> 'membershipCount')::integer = 4
  AND (value ->> 'superAdminMembershipCount')::integer = 4;
