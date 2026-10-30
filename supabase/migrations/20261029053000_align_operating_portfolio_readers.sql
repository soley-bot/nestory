-- Combine bounded SQL readers with the dashboard's current-lease occupancy contract.
-- Existing signatures, invoker RLS, empty search paths and execution grants remain intact.
-- Replacing these functions preserves their ACLs; the two source migrations stay unchanged.

CREATE OR REPLACE FUNCTION public.get_unit_register_page(
  p_organization_id uuid, p_filters jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_query text := coalesce(p_filters->>'query', '');
  v_sort text := coalesce(p_filters->>'sort', 'property_asc');
  v_archive text := coalesce(p_filters->>'archiveState', 'active');
  v_status text := coalesce(p_filters->>'status', 'all');
  v_property text := coalesce(p_filters->>'propertyId', 'all');
  v_lease text := coalesce(p_filters->>'leaseStatus', 'all');
  v_occupancy text := coalesce(p_filters->>'occupancy', 'all');
  v_operational boolean := coalesce((p_filters->>'operationalOnly')::boolean, false);
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 10)));
BEGIN
  RETURN (
    WITH property_records AS MATERIALIZED (
      -- Check each property's visibility once even when it has many units.
      SELECT p.id, p.code, p.name, p.owner, p.status, p.archived_at FROM public.properties p
      WHERE p.organization_id = p_organization_id
        AND (v_property = 'all' OR p.id::text = v_property)
    ), base AS MATERIALIZED (
      SELECT u.*, coalesce(p.code, 'Unknown') AS property_code, coalesce(p.name, 'Unknown property') AS property_name, p.owner AS legacy_owner,
        CASE WHEN lower(btrim(u.status)) IN ('occupied', 'reserved', 'maintenance', 'inactive') THEN lower(btrim(u.status)) ELSE 'vacant' END AS normalized_status
      FROM public.units u LEFT JOIN property_records p ON p.id = u.property_id
      WHERE u.organization_id = p_organization_id
        AND (v_property = 'all' OR u.property_id::text = v_property)
        -- Apply dashboard scope before the exact count, ordering and page boundary.
        AND (NOT v_operational OR (u.archived_at IS NULL AND u.status <> 'inactive'
          AND p.id IS NOT NULL AND p.archived_at IS NULL AND p.status <> 'inactive'))
        AND (v_archive = 'all' OR (v_archive = 'archived' AND u.archived_at IS NOT NULL) OR (v_archive = 'active' AND u.archived_at IS NULL))
    ), ledger_totals AS MATERIALIZED (
      SELECT b.scope_id, sum(CASE WHEN b.direction = 'expense' THEN -b.amount ELSE b.amount END) AS net
      FROM jsonb_to_recordset(CASE WHEN v_sort = 'net_desc'
        THEN app_private.portfolio_ledger_totals(p_organization_id, ARRAY[]::uuid[], ARRAY(SELECT id FROM base), NULL)
        ELSE '[]'::jsonb END) AS b(scope_id uuid, direction text, amount numeric)
      GROUP BY b.scope_id
    ), current_unit_leases AS MATERIALIZED (
      SELECT DISTINCT ON (l.unit_id) l.unit_id, l.status, l.tenant_name, l.monthly_rent_amount
      FROM public.current_leases l
      WHERE l.organization_id = p_organization_id AND l.archived_at IS NULL AND l.status IN ('active', 'notice_given', 'draft')
        AND l.unit_id IN (SELECT id FROM base)
      ORDER BY l.unit_id, (l.status IN ('active', 'notice_given')) DESC, l.lease_start_date DESC, l.id DESC
    ), candidates AS (
      SELECT u.*, l.status AS lease_status, coalesce(l.tenant_name || ' / ' || initcap(replace(l.status, '_', ' ')), 'No lease') AS lease_label,
        coalesce(l.status IN ('active', 'notice_given'), false) AS has_active_lease,
        CASE WHEN l.status IN ('active', 'notice_given') THEN coalesce(l.monthly_rent_amount, 0)
          WHEN u.current_rent_currency IS NOT NULL THEN coalesce(u.current_rent_amount, 0) ELSE 0 END AS rent,
        coalesce(owners.names, CASE WHEN u.legacy_owner IS NOT NULL THEN ARRAY[u.legacy_owner] ELSE ARRAY[]::text[] END) AS owner_names,
        owners.primary_name, event.title AS event_title, coalesce(ledger.net, 0) AS ledger_net
      FROM base u
      LEFT JOIN current_unit_leases l ON l.unit_id = u.id
      LEFT JOIN LATERAL (
        SELECT array_agg(coalesce(person.display_name, '') || ' ' || coalesce(person.legal_name, '') ORDER BY o.id) AS names,
          (array_agg(person.display_name ORDER BY o.id DESC) FILTER (WHERE o.is_primary))[1] AS primary_name
        FROM public.property_owners o LEFT JOIN public.people person ON person.id = o.person_id AND person.organization_id = p_organization_id
        WHERE o.organization_id = p_organization_id AND o.property_id = u.property_id AND o.archived_at IS NULL AND o.ended_on IS NULL AND v_query <> ''
      ) owners ON true
      LEFT JOIN LATERAL (
        SELECT t.title FROM public.timeline_events t WHERE t.organization_id = p_organization_id AND t.unit_id = u.id AND t.archived_at IS NULL AND v_query <> ''
        ORDER BY t.event_date DESC, t.id DESC LIMIT 1
      ) event ON true
      LEFT JOIN ledger_totals ledger ON ledger.scope_id = u.id
      WHERE v_status = 'all' OR u.normalized_status = v_status
    ), filtered AS MATERIALIZED (
      SELECT u.* FROM candidates u WHERE
        (v_lease <> 'missing' OR NOT has_active_lease)
        AND (v_occupancy = 'all' OR (v_occupancy = 'occupied' AND has_active_lease) OR (v_occupancy = 'unoccupied' AND NOT has_active_lease))
        AND public.matches_register_search(v_query, ARRAY[u.unit_number, u.property_code, u.property_name, u.primary_name,
          coalesce(u.floor, 'Not set'), replace(u.status, '_', ' '), u.lease_label, u.event_title] || u.owner_names)
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY
        CASE WHEN v_sort = 'rent_desc' THEN rent END DESC,
        CASE WHEN v_sort = 'net_desc' THEN ledger_net END DESC,
        CASE WHEN v_sort = 'status_asc' THEN NOT has_active_lease END,
        CASE WHEN v_sort = 'unit_asc' THEN public.register_natural_sort_key(unit_number) END,
        CASE WHEN v_sort = 'property_asc' THEN archived_at IS NOT NULL END,
        public.register_natural_sort_key(property_code),
        CASE WHEN v_sort = 'property_asc' THEN public.register_natural_sort_key(property_name) END,
        public.register_natural_sort_key(unit_number), id) AS position FROM filtered
    ), bounds AS (
      SELECT count(*) AS total_count, (least(greatest(coalesce(p_page, 1), 1)::bigint, greatest(1, (count(*) + v_size - 1) / v_size)) - 1) * v_size AS skip FROM filtered
    )
    SELECT jsonb_build_object('total_count', b.total_count, 'ids', coalesce((SELECT jsonb_agg(r.id ORDER BY r.position) FROM ranked r WHERE r.position > b.skip AND r.position <= b.skip + v_size), '[]'::jsonb)) FROM bounds b
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_overview_summary(
  p_organization_id uuid,
  p_today date,
  p_month date,
  p_property_id uuid default null,
  p_financial_start_date date default null
) returns jsonb
language sql stable security invoker set search_path = ''
as $function$
with bounds as (
  select date_trunc('month', p_month)::date as month_start,
    (date_trunc('month', p_month) + interval '1 month')::date as month_end,
    greatest((date_trunc('month', p_month) - interval '5 months')::date,
      coalesce(p_financial_start_date, '0001-01-01'::date)) as ledger_start
), properties as materialized (
  select p.id, p.code, p.name, p.rental_structure
  from public.properties p
  where p.organization_id = p_organization_id and p.archived_at is null and p.status <> 'inactive'
    and (p_property_id is null or p.id = p_property_id)
), units as materialized (
  select u.id, u.property_id, u.status
  from public.units u join properties p on p.id = u.property_id
  where u.organization_id = p_organization_id and u.archived_at is null and u.status <> 'inactive'
), current_leases as materialized (
  select l.id, l.property_id, l.unit_id, l.lease_end_date, l.primary_tenant_person_id,
    coalesce((p.rental_structure = 'single_space' and l.unit_id is null)
      or (p.rental_structure = 'multi_unit' and u.id is not null and u.property_id = p.id), false) as operational
  from public.current_leases l
  left join properties p on p.id = l.property_id
  left join units u on u.id = l.unit_id
  where l.organization_id = p_organization_id and l.archived_at is null
    and l.status in ('active', 'notice_given') and (p_property_id is null or l.property_id = p_property_id)
), operational_leases as materialized (
  select * from current_leases where operational
), unit_facts as materialized (
  select u.*, exists(select 1 from operational_leases l where l.unit_id = u.id) as leased
  from units u
), unit_counts as (
  select property_id, count(*) as total,
    count(*) filter(where leased) as occupied,
    count(*) filter(where not leased) as unoccupied,
    count(*) filter(where not leased and lower(status) = 'vacant') as vacant,
    count(*) filter(where not leased) as lease_gaps
  from unit_facts group by property_id
), tenants_missing as (
  select property_id, count(*) as total from operational_leases where primary_tenant_person_id is null group by property_id
), owner_properties as (
  select distinct po.property_id from public.property_owners po
  where po.organization_id = p_organization_id and po.archived_at is null and po.ended_on is null and po.is_primary
    and (p_property_id is null or po.property_id = p_property_id)
), document_counts as (
  select d.property_id, count(*) as total from public.documents d
  where d.organization_id = p_organization_id and d.archived_at is null and d.property_id is not null
    and (p_property_id is null or d.property_id = p_property_id)
  group by d.property_id
), tasks as materialized (
  select t.id, t.property_id, t.title, t.status, t.priority, t.due_date,
    row_number() over(partition by t.property_id order by
      case t.priority when 'urgent' then 4 when 'high' then 3 when 'low' then 1 else 2 end desc,
      t.due_date asc nulls last, t.title, t.id) as preview_rank
  from public.tasks t
  where t.organization_id = p_organization_id and t.archived_at is null
    and t.status in ('pending', 'scheduled', 'in_progress', 'blocked', 'ready_for_review')
    and (p_property_id is null or t.property_id = p_property_id)
), task_counts as (
  select property_id, count(*) as total,
    count(*) filter(where status = 'blocked') as blocked,
    count(*) filter(where due_date < p_today) as overdue,
    count(*) filter(where priority in ('high', 'urgent')) as urgent,
    coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'dueDate', due_date,
      'priority', priority, 'status', status) order by preview_rank) filter(where preview_rank <= 6), '[]'::jsonb) as cases
  from tasks group by property_id
), people as materialized (
  select p.id, p.primary_email, p.primary_phone
  from public.people p where p.organization_id = p_organization_id and p.archived_at is null
), roles as materialized (
  select r.person_id, r.role from public.person_roles r join people p on p.id = r.person_id
  where r.organization_id = p_organization_id and r.archived_at is null and r.status = 'active'
), people_counts as (
  select count(*) as total,
    count(*) filter(where not exists(select 1 from roles r where r.person_id = p.id)) as no_role,
    count(*) filter(where coalesce(btrim(p.primary_email), '') = '' and coalesce(btrim(p.primary_phone), '') = ''
      and not exists(select 1 from public.person_contacts c where c.organization_id = p_organization_id
        and c.person_id = p.id and c.archived_at is null
        and (coalesce(btrim(c.email), '') <> '' or coalesce(btrim(c.phone), '') <> ''))) as missing_contact
  from people p
), ledger as materialized (
  select * from app_private.overview_ledger_buckets(
    p_organization_id, p_today, p_month, p_property_id, p_financial_start_date
  )
), ledger_buckets as (
  select transaction_date, currency, direction, amount from ledger where window_count > 0
), rent_terms as (
  select t.lease_id, max(t.rent_amount) as amount, max(t.payment_frequency) as frequency, count(*) as term_count
  from public.lease_terms t join operational_leases l on l.id = t.lease_id
  where t.organization_id = p_organization_id and t.authority_kind = 'authoritative'
    and t.archived_at is null and t.status in ('active', 'expired', 'terminated', 'upcoming')
    and t.start_date <= p_today and t.end_date >= p_today group by t.lease_id
), lease_endings as (
  select to_char(l.lease_end_date, 'YYYY-MM') as month, count(*) as count
  from operational_leases l cross join bounds b
  where l.lease_end_date >= b.month_start and l.lease_end_date < b.month_start + interval '6 months'
  group by 1
), property_summaries as (
  select p.id, p.code, p.name, coalesce(d.total, 0) as "documentCount",
    coalesce(tm.total, 0) as "missingTenantLinks", op.property_id is not null as "ownerLinked",
    coalesce(u.total, 0) as "totalUnits", coalesce(u.occupied, 0) as "occupiedUnits",
    coalesce(u.unoccupied, 0) as "unoccupiedUnits", coalesce(u.vacant, 0) as "vacantUnits",
    coalesce(t.blocked, 0) as "blockedCount", coalesce(t.total, 0) as "openCount",
    coalesce(t.overdue, 0) as "overdueCount", coalesce(t.urgent, 0) as "urgentCount",
    coalesce(t.cases, '[]'::jsonb) as cases
  from properties p left join unit_counts u on u.property_id = p.id
  left join tenants_missing tm on tm.property_id = p.id left join owner_properties op on op.property_id = p.id
  left join document_counts d on d.property_id = p.id left join task_counts t on t.property_id = p.id
)
select jsonb_build_object(
  'counts', jsonb_build_object(
    'activeLeaseCount', (select count(*) from operational_leases),
    'currentLeaseCount', (select count(*) from current_leases),
    'invalidScopeLeases', (select count(*) from current_leases where not operational),
    'largeRecentExpenseCount', (select coalesce(sum(large_expense_count), 0) from ledger),
    'leaseGapUnits', (select coalesce(sum(lease_gaps), 0) from unit_counts),
    'leasesEndingSoon', (select count(*) from operational_leases where lease_end_date between p_today and p_today + 60),
    'missingTenantLeases', (select coalesce(sum(total), 0) from tenants_missing),
    'missingOwnerLinks', (select count(*) from property_summaries where not "ownerLinked"),
    'openMaintenanceCount', (select count(*) from tasks),
    'peopleMissingContacts', (select missing_contact from people_counts),
    'peopleWithoutRoles', (select no_role from people_counts),
    'vacantUnits', (select coalesce(sum(vacant), 0) from unit_counts),
    'peopleCount', (select total from people_counts),
    'tenantCount', (select count(*) from roles where role = 'tenant'),
    'ledgerEntryCount', (select coalesce(sum(entry_count), 0) from ledger),
    'occupiedUnits', (select coalesce(sum(occupied), 0) from unit_counts),
    'unitCount', (select count(*) from units)),
  'expectedRent', (select jsonb_build_object('leaseCount', count(*), 'amount', coalesce(sum(amount), 0))
    from rent_terms where term_count = 1 and frequency = 'monthly'),
  'leaseEndings', (select coalesce(jsonb_agg(to_jsonb(e) order by e.month), '[]'::jsonb) from lease_endings e),
  'ledger', (select coalesce(jsonb_agg(to_jsonb(l) order by l.transaction_date, l.currency, l.direction), '[]'::jsonb) from ledger_buckets l),
  'properties', (select coalesce(jsonb_agg(to_jsonb(p) order by p.code, p.id), '[]'::jsonb) from property_summaries p)
);
$function$;
