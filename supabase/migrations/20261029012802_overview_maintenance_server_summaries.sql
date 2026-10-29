-- Keep dashboard counters exact without transferring underlying portfolio/history rows.
-- Public summaries are invokers. The ledger-only helper evaluates the exact
-- canonical SELECT policy once per distinct property, returning aggregates only.
create or replace function app_private.overview_ledger_buckets(
  p_organization_id uuid,
  p_today date,
  p_month date,
  p_property_id uuid,
  p_financial_start_date date
) returns table (
  transaction_date date, currency public.currency_code, direction text,
  entry_count bigint, large_expense_count bigint, window_count bigint, amount numeric
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then return; end if;
  -- Fail closed if any new/restrictive policy or changed authority expression
  -- would make factoring the released ledger SELECT predicate incomplete.
  if (select count(*) from pg_catalog.pg_policy
      where polrelid = 'public.ledger_entries'::regclass and polcmd in ('r', '*')) <> 1
    or not exists (
      select 1 from pg_catalog.pg_policy
      where polrelid = 'public.ledger_entries'::regclass
        and polname = 'ledger_entries_branch_select' and polcmd = 'r' and polpermissive
        and polroles = array['authenticated'::regrole::oid]
        and pg_catalog.pg_get_expr(polqual, polrelid) = 'app_private.can_read_finance_property(organization_id, property_id)'
    ) then
    raise exception 'Ledger read policy changed; review overview aggregate authorization before continuing'
      using errcode = '42501';
  end if;
  return query
  with bounds as (
    select (date_trunc('month', p_month) + interval '1 month')::date as month_end,
      greatest((date_trunc('month', p_month) - interval '5 months')::date,
        coalesce(p_financial_start_date, '0001-01-01'::date)) as ledger_start
  ), scoped as materialized (
    select l.property_id, l.transaction_date, l.currency, l.direction, l.amount
    from public.ledger_entries l
    where l.organization_id = p_organization_id and l.archived_at is null
      and (p_property_id is null or l.property_id = p_property_id)
      and l.transaction_date >= coalesce(p_financial_start_date, '0001-01-01'::date)
  ), property_scope as materialized (
    select distinct l.property_id from scoped l
  ), authorized as materialized (
    select scope.property_id from property_scope scope
    where app_private.can_read_finance_property(p_organization_id, scope.property_id)
  )
  select date_trunc('month', l.transaction_date)::date, l.currency, l.direction,
    count(*),
    count(*) filter(where l.direction = 'expense' and l.amount >= 1000
      and l.transaction_date >= p_today - 30 and l.transaction_date < p_today + 1),
    count(*) filter(where l.transaction_date >= b.ledger_start and l.transaction_date < b.month_end),
    sum(round(l.amount * 100)) filter(where l.transaction_date >= b.ledger_start and l.transaction_date < b.month_end) / 100
  from scoped l join authorized a on a.property_id = l.property_id cross join bounds b
  group by 1, l.currency, l.direction;
end;
$function$;
revoke all on function app_private.overview_ledger_buckets(uuid, date, date, uuid, date) from public, anon, service_role;
grant execute on function app_private.overview_ledger_buckets(uuid, date, date, uuid, date) to authenticated;

create or replace function public.get_overview_summary(
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
    count(*) filter(where leased or lower(status) = 'occupied') as occupied,
    count(*) filter(where not leased and lower(status) <> 'occupied' and lower(status) <> 'inactive') as unoccupied,
    count(*) filter(where lower(status) = 'vacant') as vacant,
    count(*) filter(where not leased and lower(status) <> 'vacant') as lease_gaps
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
revoke all on function public.get_overview_summary(uuid, date, date, uuid, date) from public, anon;
grant execute on function public.get_overview_summary(uuid, date, date, uuid, date) to authenticated;

-- One predicate produces the exact filtered summary, queue destinations, and
-- bounded visible IDs. Sorting happens before pagination, including broad search.
create or replace function public.get_maintenance_summary(
  p_organization_id uuid,
  p_filters jsonb,
  p_today date,
  p_current_time time,
  p_month date,
  p_include_queue_counts boolean default false
) returns jsonb
language sql stable security invoker set search_path = ''
as $function$
with options as (
  select greatest(1, coalesce((p_filters->>'page')::integer, 1)) as page,
    greatest(1, least(100, coalesce((p_filters->>'pageSize')::integer, 10))) as page_size,
    coalesce(p_filters->>'sort', 'due_asc') as sort,
    coalesce(p_filters->>'review', 'all') as review,
    nullif(p_filters->>'taskId', 'all')::uuid as task_id
), scoped_tasks as materialized (
  select t.id, t.property_id, t.unit_id, t.title, t.description, t.category, t.priority, t.status,
    t.due_date, t.due_time, t.reminder_date, t.reminder_time, t.created_at,
    t.actual_cost_amount, t.cost_estimate_amount, t.recurrence_frequency
  from public.tasks t
  where t.organization_id = p_organization_id
    and (coalesce(p_filters->>'archiveState', 'active') = 'all'
      or (p_filters->>'archiveState' = 'archived' and t.archived_at is not null)
      or (coalesce(p_filters->>'archiveState', 'active') = 'active' and t.archived_at is null))
    and (coalesce(p_filters->>'actorScope', 'organization') = 'organization'
      or t.branch_id = coalesce((p_filters->>'actorBranchId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    and (coalesce(p_filters->>'actorScope', 'organization') <> 'assigned'
      or t.assignee_person_id = coalesce((p_filters->>'actorPersonId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
), units as materialized (
  -- A relation used for labels must not re-run its RLS for every task join.
  -- Only identities referenced by already-visible tasks can contribute here.
  select u.id, u.property_id, u.unit_number, u.archived_at
  from public.units u where u.organization_id = p_organization_id
    and u.id in (select t.unit_id from scoped_tasks t where t.unit_id is not null)
), properties as materialized (
  select p.id, p.code, p.name, p.archived_at,
    array[p.code, p.name] || case when jsonb_array_length(coalesce(p_filters->'searchTokens', '[]'::jsonb)) = 0 then array[]::text[] when exists(
      select 1 from public.property_owners po where po.organization_id = p_organization_id
        and po.property_id = p.id and po.archived_at is null and po.ended_on is null
    ) then array(select unnest(array[person.display_name, person.legal_name])
      from public.property_owners po left join public.people person on person.id = po.person_id
        and person.organization_id = p_organization_id
      where po.organization_id = p_organization_id and po.property_id = p.id
        and po.archived_at is null and po.ended_on is null)
    else array[p.owner] end as search_values
  from public.properties p where p.organization_id = p_organization_id
    and p.id in (select t.property_id from scoped_tasks t union select u.property_id from units u)
), base as materialized (
  select t.id, t.property_id, t.unit_id, t.title, t.description, t.category, t.priority, t.status,
    t.due_date, t.due_time, t.reminder_date, t.reminder_time, t.created_at,
    t.actual_cost_amount, t.cost_estimate_amount, t.recurrence_frequency,
    coalesce(case when p.archived_at is null then p.code || ' - ' || p.name end, 'Unknown property') as property_label,
    coalesce(case when u.archived_at is null then 'Unit ' || u.unit_number end, 'No specific unit') as unit_label,
    t.status in ('pending', 'scheduled', 'in_progress', 'blocked', 'ready_for_review') as is_open,
    t.status not in ('completed', 'cancelled') and t.due_date < p_today as is_overdue,
    t.status not in ('completed', 'cancelled') and t.due_date between p_today and p_today + 7 as is_upcoming,
    t.status in ('pending', 'scheduled', 'in_progress', 'blocked') and
      (t.reminder_date < p_today or (t.reminder_date = p_today and
        (t.reminder_time is null or date_trunc('minute', t.reminder_time::interval) <= p_current_time::interval))) as is_reminder_due,
    (coalesce(p_filters->>'propertyId', 'all') = 'all' or t.property_id = nullif(p_filters->>'propertyId', 'all')::uuid)
    and (coalesce(p_filters->>'unitId', 'all') = 'all' or t.unit_id = nullif(p_filters->>'unitId', 'all')::uuid)
    and (coalesce(p_filters->>'priority', 'all') = 'all' or t.priority = p_filters->>'priority')
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(p_filters->'searchTokens', '[]'::jsonb)) token(value)
      where not (
        -- Direct task fields retain literal ilike matching; relationship text
        -- uses the same normalized/compact matching as the register search.
        position(token.value in lower(coalesce(t.title, ''))) > 0
        or position(token.value in lower(coalesce(t.description, ''))) > 0
        or position(token.value in lower(coalesce(t.category, ''))) > 0
        or position(token.value in lower(t.status)) > 0
        or position(token.value in lower(t.priority)) > 0
        or public.matches_register_search(token.value, coalesce(p.search_values, array[]::text[]))
        or public.matches_register_search(token.value, coalesce(up.search_values, array[]::text[]) || array[u.unit_number])
      )
    ) as matches_context
  from scoped_tasks t
  left join properties p on p.id = t.property_id
  left join units u on u.id = t.unit_id
  left join properties up on up.id = u.property_id and jsonb_array_length(coalesce(p_filters->'searchTokens', '[]'::jsonb)) > 0
), filtered as materialized (
  select b.* from base b cross join options o
  where case when o.task_id is not null then b.id = o.task_id else
    b.matches_context and (coalesce(p_filters->>'status', 'all') = 'all' or b.status = p_filters->>'status')
    and case o.review
      when 'open' then b.is_open
      when 'overdue' then b.is_overdue
      when 'scheduled' then b.is_open and (b.due_date is not null or b.reminder_date is not null)
      when 'upcoming' then b.is_upcoming
      when 'reminders' then b.is_reminder_due
      when 'inspections' then b.category ilike '%inspect%' or b.title ilike '%inspect%' or b.description ilike '%inspect%'
      when 'high_priority' then b.priority in ('high', 'urgent')
      when 'high_cost' then b.actual_cost_amount >= 1000 or b.cost_estimate_amount >= 1000
      when 'recurring' then b.recurrence_frequency <> 'none'
      when 'review_completion' then b.status = 'ready_for_review'
      when 'completed' then b.status = 'completed'
      else true end
    end
), ordered as materialized (
  select f.*, row_number() over(order by
    case when o.sort = 'created_desc' then f.created_at end desc,
    case when o.sort = 'cost_desc' then f.actual_cost_amount end desc nulls last,
    case when o.sort = 'cost_desc' then f.cost_estimate_amount end desc nulls last,
    case when o.sort = 'priority_desc' then f.priority end desc,
    case when o.sort <> 'created_desc' then f.due_date end asc nulls last,
    case when o.sort not in ('created_desc', 'cost_desc', 'priority_desc') then f.due_time end asc nulls last,
    case when o.sort not in ('created_desc', 'cost_desc', 'priority_desc') then f.created_at end desc,
    f.id) as ordinal
  from filtered f cross join options o
), totals as (
  select count(*) as total, coalesce(sum(actual_cost_amount), 0) as "actualCostAmount",
    coalesce(sum(cost_estimate_amount), 0) as "estimateCostAmount",
    count(*) filter(where status = 'blocked') as blocked,
    count(*) filter(where status = 'completed') as completed,
    count(*) filter(where greatest(coalesce(actual_cost_amount, 0), coalesce(cost_estimate_amount, 0)) >= 1000) as "highCost",
    count(*) filter(where priority in ('high', 'urgent')) as "highPriority",
    count(*) filter(where status = 'in_progress') as "inProgress",
    count(*) filter(where is_open) as open, count(*) filter(where is_overdue) as overdue,
    count(*) filter(where status = 'pending') as pending,
    count(*) filter(where recurrence_frequency in ('weekly', 'monthly', 'quarterly', 'semi_annual', 'annual')) as recurring,
    count(*) filter(where status = 'ready_for_review') as "readyForReview",
    count(*) filter(where is_reminder_due) as "reminderDue",
    count(*) filter(where status = 'scheduled') as scheduled,
    count(*) filter(where is_upcoming) as upcoming
  from filtered
), page_bounds as (
  select least(o.page, greatest(1, ceil(t.total::numeric / o.page_size)::integer)) as page, o.page_size
  from options o cross join totals t
), month_cases as (
  select * from filtered where to_char(coalesce(due_date, timezone('UTC', created_at)::date), 'YYYY-MM') = to_char(p_month, 'YYYY-MM')
), categories as (
  select category, count(*) as "caseCount", round(count(*)::numeric / greatest(1, (select count(*) from month_cases)) * 100)::text || '%' as "percentLabel"
  from month_cases group by category order by count(*) desc, category limit 6
), property_stats as (
  select property_id as "propertyId", property_label as "propertyLabel",
    count(*) filter(where status = 'completed') as completed,
    count(*) filter(where status = 'in_progress') as "inProgress", count(*) filter(where is_open) as open,
    count(*) filter(where is_overdue) as overdue, count(*) filter(where status = 'pending') as pending
  from ordered group by property_id, property_label
  order by count(*) filter(where is_open) desc, count(*) filter(where is_overdue) desc, property_label, min(ordinal) limit 8
), unit_stats as (
  select unit_id as "unitId", (array_agg(property_id order by ordinal))[1] as "propertyId", unit_label as "unitLabel",
    count(*) filter(where status = 'completed') as completed,
    count(*) filter(where status = 'in_progress') as "inProgress", count(*) filter(where is_open) as open,
    count(*) filter(where is_overdue) as overdue, count(*) filter(where status = 'pending') as pending
  from ordered where unit_id is not null group by unit_id, unit_label
  order by count(*) filter(where is_open) desc, count(*) filter(where is_overdue) desc, unit_label, min(ordinal) limit 8
), repeat_groups as (
  select property_id, lower(category), null::uuid as grouping_unit_id, false as unit_group,
    count(*) as "caseCount", min(ordinal) as first_ordinal,
    count(distinct coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid)) > 1 as property_wide
  from ordered group by property_id, lower(category) having count(*) >= 2
  union all
  select property_id, lower(category), unit_id, true, count(*), min(ordinal), false
  from ordered group by property_id, unit_id, lower(category) having count(*) >= 2
), repeats as (
  select r."caseCount", f.category, f.property_id as "propertyId",
    case when r.property_wide then null else f.unit_id end as "unitId",
    f.property_label as "propertyLabel", case when r.property_wide then 'Property-wide' else 'Unit repeat' end as "scopeLabel",
    case when r.property_wide then 'Across units' else f.unit_label end as "unitLabel"
  from repeat_groups r join ordered f on f.ordinal = r.first_ordinal
  order by r."caseCount" desc, case when r.property_wide then 'Property-wide' else 'Unit repeat' end,
    f.property_label, r.first_ordinal, r.unit_group limit 6
), queues as (
  select count(*) as total, count(*) filter(where status = 'completed') as completed,
    count(*) filter(where is_open) as open, count(*) filter(where is_overdue) as overdue,
    count(*) filter(where status = 'ready_for_review') as "readyForReview", count(*) filter(where is_upcoming) as upcoming
  from base where p_include_queue_counts and matches_context
)
select jsonb_build_object(
  'summary', (select to_jsonb(t) from totals t) || jsonb_build_object(
    'categoryStats', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from categories c),
    'propertyStats', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from property_stats p),
    'unitStats', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) from unit_stats u),
    'repeatedIssues', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from repeats r)),
  'queueCounts', case when p_include_queue_counts then (select to_jsonb(q) from queues q) else null end,
  'pageIds', (select coalesce(jsonb_agg(f.id order by f.ordinal), '[]'::jsonb)
    from ordered f cross join page_bounds p where f.ordinal > (p.page - 1) * p.page_size and f.ordinal <= p.page * p.page_size),
  'page', (select page from page_bounds), 'pageSize', (select page_size from page_bounds)
);
$function$;
revoke all on function public.get_maintenance_summary(uuid, jsonb, date, time, date, boolean) from public, anon;
grant execute on function public.get_maintenance_summary(uuid, jsonb, date, time, date, boolean) to authenticated;
