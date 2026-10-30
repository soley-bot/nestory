-- Page the chart under the caller's existing table RLS. Complete catalogs remain
-- available to intent-loaded forms; a register never transfers every account.
CREATE FUNCTION app_private.finance_account_sort_key(p_value text)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT jsonb_agg(CASE WHEN token[1] ~ '^[0-9]+$'
    THEN jsonb_build_array(0, token[1]::numeric)
    ELSE jsonb_build_array(1, lower(token[1])) END ORDER BY ordinal)
  FROM regexp_matches(p_value, '([0-9]+|[^0-9]+)', 'g') WITH ORDINALITY AS parts(token, ordinal);
$$;
REVOKE ALL ON FUNCTION app_private.finance_account_sort_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.finance_account_sort_key(text) TO authenticated;

CREATE FUNCTION public.get_finance_account_register_page(
  p_organization_id uuid, p_query text DEFAULT '', p_account_class text DEFAULT 'all',
  p_status text DEFAULT 'active', p_page integer DEFAULT 1, p_page_size integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_count integer; v_page integer; v_pages integer; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT app_private.has_org_permission(p_organization_id, 'finance.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_page_size NOT IN (10,25,50,100) OR p_page < 1
    OR p_status NOT IN ('active','inactive','all')
    OR p_account_class NOT IN ('all','asset','liability','equity','income','expense')
    OR length(p_query) > 200 THEN
    RAISE EXCEPTION 'Invalid account page' USING ERRCODE = '22023';
  END IF;
  WITH matches AS MATERIALIZED (
    SELECT account.*,
      CASE WHEN account.parent_account_id IS NULL THEN account.account_number ELSE parent.account_number END root_number,
      CASE WHEN account.parent_account_id IS NULL THEN account.display_name ELSE parent.display_name END root_name,
      coalesce(account.parent_account_id,account.id) root_id
    FROM public.finance_accounts account
    LEFT JOIN public.finance_accounts parent ON parent.organization_id=account.organization_id AND parent.id=account.parent_account_id
    WHERE account.organization_id=p_organization_id
      AND (p_account_class='all' OR account.account_class=p_account_class)
      AND (p_status='all' OR (p_status='active')=(account.archived_at IS NULL))
      AND public.matches_register_search(p_query, ARRAY[
        account.account_number,account.display_name,account.description,
        CASE account.account_subtype WHEN 'cogs' THEN 'Cost of goods sold' ELSE replace(account.account_subtype,'_',' ') END,
        CASE account.system_role WHEN 'operating_bank' THEN 'Operating account' WHEN 'trust_bank' THEN 'Trust account' WHEN 'rental_income' THEN 'Rent income' ELSE replace(account.system_role,'_',' ') END,
        (SELECT string_agg(CASE role.role_code WHEN 'operating_bank' THEN 'Operating account' WHEN 'trust_bank' THEN 'Trust account' WHEN 'rental_income' THEN 'Rent income' ELSE replace(role.role_code,'_',' ') END,' ') FROM public.finance_account_roles role
          WHERE role.organization_id=account.organization_id AND role.account_id=account.id)
      ])
  ), totals AS (SELECT count(*)::integer count FROM matches), bounds AS (
    SELECT count, greatest(1,(count+p_page_size-1)/p_page_size) pages,
      least(p_page,greatest(1,(count+p_page_size-1)/p_page_size)) page FROM totals
  ), selected AS (
    SELECT matches.*, row_number() OVER (ORDER BY
      array_position(ARRAY['asset','liability','equity','income','expense'],account_class),
      app_private.finance_account_sort_key(root_number) NULLS LAST,
      app_private.finance_account_sort_key(root_name),root_id,
      (parent_account_id IS NOT NULL),app_private.finance_account_sort_key(account_number) NULLS LAST,
      app_private.finance_account_sort_key(display_name),id) ordinal
    FROM matches
    ORDER BY ordinal LIMIT p_page_size OFFSET (SELECT (page-1)*p_page_size FROM bounds)
  )
  SELECT bounds.count,bounds.page,bounds.pages,
    coalesce((SELECT jsonb_agg(to_jsonb(selected)-'root_number'-'root_name'-'root_id'-'ordinal' ORDER BY ordinal) FROM selected),'[]'::jsonb)
  INTO v_count,v_page,v_pages,v_rows FROM bounds;
  RETURN jsonb_build_object('accounts',v_rows,'pagination',jsonb_build_object(
    'page',v_page,'pageSize',p_page_size,'totalCount',v_count,'totalPages',v_pages,
    'from',CASE WHEN v_count=0 THEN 0 ELSE (v_page-1)*p_page_size+1 END,'to',least(v_page*p_page_size,v_count)));
END;
$$;
REVOKE ALL ON FUNCTION public.get_finance_account_register_page(uuid,text,text,text,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_account_register_page(uuid,text,text,text,integer,integer) TO authenticated;

-- A separate bounded reader preserves the released form/availability contract.
CREATE FUNCTION app_private.lease_register_context(
  p_organization_id uuid,p_lease_ids uuid[] DEFAULT NULL,p_include_filter_options boolean DEFAULT false,p_property_ids uuid[] DEFAULT ARRAY[]::uuid[],p_unit_ids uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT app_private.has_org_permission(p_organization_id,'leases.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF cardinality(p_lease_ids)>1000 THEN
    RAISE EXCEPTION 'Lease context is limited to 1000 leases' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_lease_ids) requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leases lease
      JOIN public.properties property ON property.organization_id=lease.organization_id
        AND property.id=lease.property_id
      WHERE lease.organization_id=p_organization_id AND lease.id=requested.id
        AND app_private.can_access_property(p_organization_id,property.id,'leases.view')
        AND (lease.unit_id IS NULL OR EXISTS (
          SELECT 1 FROM public.units unit WHERE unit.id=lease.unit_id
            AND unit.organization_id=lease.organization_id AND unit.property_id=lease.property_id))
    )
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  -- NULL or [] returns selector/availability context only, never full detail.
  WITH properties AS MATERIALIZED (
    SELECT property.id,property.code,property.name,property.rental_structure,property.archived_at
    FROM public.properties property WHERE property.organization_id=p_organization_id
      AND app_private.can_access_property(p_organization_id,property.id,'leases.view')
      AND (p_include_filter_options OR property.id=ANY(p_property_ids) OR EXISTS (SELECT 1 FROM public.units selected_unit WHERE selected_unit.organization_id=p_organization_id AND selected_unit.property_id=property.id AND selected_unit.id=ANY(p_unit_ids)) OR EXISTS (SELECT 1 FROM public.leases selected WHERE selected.organization_id=p_organization_id AND selected.property_id=property.id AND selected.id=ANY(p_lease_ids)))
  ), units AS MATERIALIZED (
    SELECT unit.id,unit.property_id,unit.unit_number,unit.floor,unit.status,unit.archived_at
    FROM public.units unit JOIN properties property ON property.id=unit.property_id
    WHERE unit.organization_id=p_organization_id
      AND (p_include_filter_options OR unit.id=ANY(p_unit_ids) OR EXISTS (SELECT 1 FROM public.leases selected WHERE selected.organization_id=p_organization_id AND selected.unit_id=unit.id AND selected.id=ANY(p_lease_ids)))
  ), allowed_leases AS MATERIALIZED (
    SELECT lease.id,lease.property_id,lease.unit_id,lease.archived_at,lease.primary_tenant_person_id
    FROM public.leases lease JOIN properties property ON property.id=lease.property_id
    WHERE lease.organization_id=p_organization_id
      AND (lease.unit_id IS NULL OR EXISTS (
        SELECT 1 FROM units unit WHERE unit.id=lease.unit_id AND unit.property_id=lease.property_id))
  ), selected_leases AS MATERIALIZED (
    SELECT lease.* FROM allowed_leases lease WHERE lease.id=ANY(p_lease_ids)
  ), availability_leases AS (
    SELECT lease.id,lease.unit_id,lease.archived_at FROM allowed_leases lease WHERE false AND lease.unit_id IS NOT NULL
  ), availability_terms AS (
    SELECT term.lease_id,term.start_date,term.end_date,term.status,term.archived_at
    FROM public.lease_terms term JOIN allowed_leases lease ON lease.id=term.lease_id
    WHERE term.organization_id=p_organization_id AND lease.archived_at IS NULL
      AND false AND lease.unit_id IS NOT NULL AND term.status IN ('active','draft','upcoming')
  ), parties AS MATERIALIZED (
    SELECT party.id,party.lease_id,party.person_id,party.party_role,party.is_primary,
      party.started_on,party.ended_on,party.archived_at
    FROM public.lease_parties party JOIN selected_leases lease ON lease.id=party.lease_id
    JOIN public.people person ON person.organization_id=party.organization_id AND person.id=party.person_id
    WHERE party.organization_id=p_organization_id
  ), terms AS (
    SELECT term.id,term.lease_id,term.term_sequence,term.start_date,term.end_date,term.rent_amount,
      term.rent_currency,term.rent_due_day,term.payment_frequency,term.status,term.archived_at
    FROM public.lease_terms term JOIN selected_leases lease ON lease.id=term.lease_id
    WHERE term.organization_id=p_organization_id
  ), billing_terms AS MATERIALIZED (
    SELECT billing.archived_at, billing.billing_recipient_kind, billing.billing_recipient_person_id, billing.charge_management_fee_when_active, billing.charge_through_lease_end, billing.collection_route, billing.created_at, billing.effective_from, billing.effective_to, billing.final_period_prorated_amount, billing.first_period_prorated_amount, billing.full_management_fee_during_proration, billing.id, billing.lease_end_proration_rule, billing.lease_id, billing.lease_start_proration_rule, billing.management_fee_mode, billing.management_fee_value, billing.mid_period_rent_change_rule, billing.organization_id, billing.property_id, billing.rent_calculation_timezone, billing.rule_source, billing.short_month_due_day_rule
    FROM public.lease_billing_terms billing JOIN selected_leases lease
      ON lease.id=billing.lease_id AND lease.property_id=billing.property_id
    WHERE billing.organization_id=p_organization_id
      AND (billing.billing_recipient_person_id IS NULL OR EXISTS (
        SELECT 1 FROM public.people person WHERE person.organization_id=billing.organization_id
          AND person.id=billing.billing_recipient_person_id))
  ), people AS (
    SELECT person.id,person.display_name FROM public.people person
    WHERE person.organization_id=p_organization_id AND (
      EXISTS (SELECT 1 FROM selected_leases lease WHERE lease.primary_tenant_person_id=person.id)
      OR EXISTS (SELECT 1 FROM parties party WHERE party.person_id=person.id)
      OR EXISTS (SELECT 1 FROM billing_terms billing WHERE billing.billing_recipient_person_id=person.id))
  ), occupancies AS (
    SELECT occupancy.id,occupancy.lease_id,occupancy.unit_id,occupancy.status,
      occupancy.business_lifecycle,occupancy.evidence_state,
      occupancy.scheduled_move_in_date,occupancy.scheduled_move_in_kind,occupancy.scheduled_move_in_confidence,
      occupancy.actual_move_in_date,occupancy.actual_move_in_kind,occupancy.actual_move_in_confidence,
      occupancy.scheduled_move_out_date,occupancy.scheduled_move_out_kind,occupancy.scheduled_move_out_confidence,
      occupancy.actual_move_out_date,occupancy.actual_move_out_kind,occupancy.actual_move_out_confidence,
      occupancy.archived_at,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',participant.id,
        'business_lifecycle',participant.business_lifecycle,'evidence_state',participant.evidence_state)
        ORDER BY participant.id) FROM public.lease_occupancy_participants participant
        JOIN public.lease_parties party ON party.organization_id=participant.organization_id
          AND party.id=participant.lease_party_id AND party.lease_id=lease.id
        WHERE participant.organization_id=p_organization_id
          AND participant.lease_occupancy_id=occupancy.id),'[]'::jsonb) participants
    FROM public.lease_occupancies occupancy JOIN selected_leases lease ON lease.id=occupancy.lease_id
    WHERE occupancy.organization_id=p_organization_id AND occupancy.property_id=lease.property_id
      AND (occupancy.unit_id IS NULL OR EXISTS (SELECT 1 FROM units unit
        WHERE unit.id=occupancy.unit_id AND unit.property_id=lease.property_id))
    ORDER BY occupancy.updated_at DESC,occupancy.id
  ), deposits AS (
    SELECT deposit.id,deposit.lease_id,deposit.deposit_type,deposit.amount,deposit.currency,
      deposit.status,deposit.archived_at
    FROM public.lease_deposits deposit JOIN selected_leases lease ON lease.id=deposit.lease_id
    WHERE deposit.organization_id=p_organization_id
      AND app_private.can_access_property(p_organization_id,lease.property_id,'finance.view')
    ORDER BY deposit.updated_at DESC,deposit.id
  ), deposit_events AS (
    SELECT event.id,event.lease_deposit_id,event.event_type,event.event_date,event.amount,
      event.currency,NULL::text AS reference,event.reversal_of_id
    FROM public.lease_deposit_events event
    JOIN deposits deposit ON deposit.id=event.lease_deposit_id
    JOIN selected_leases lease ON lease.id=deposit.lease_id
    WHERE event.organization_id=p_organization_id AND event.property_id=lease.property_id
    -- Identity, amount and dates are enough for the existing held-balance math.
    -- Free-text references remain available only through independent base RLS.
  )
  SELECT jsonb_build_object(
    'properties',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.code,row.id) FROM properties row),'[]'::jsonb),
    'units',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.unit_number,row.id) FROM units row),'[]'::jsonb),
    'availability_leases',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM availability_leases row),'[]'::jsonb),
    'availability_terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.lease_id,row.start_date) FROM availability_terms row),'[]'::jsonb),
    'people',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.display_name,row.id) FROM people row),'[]'::jsonb),
    'parties',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.is_primary DESC,row.party_role,row.id) FROM parties row),'[]'::jsonb),
    'terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.term_sequence DESC,row.id) FROM terms row),'[]'::jsonb),
    'billing_terms',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.effective_from DESC,row.created_at DESC,row.id) FROM billing_terms row),'[]'::jsonb),
    'occupancies',coalesce((SELECT jsonb_agg(to_jsonb(row)) FROM occupancies row),'[]'::jsonb),
    'deposits',coalesce((SELECT jsonb_agg(to_jsonb(row)) FROM deposits row),'[]'::jsonb),
    'deposit_events',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.event_date DESC,row.id) FROM deposit_events row),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION app_private.lease_register_context(uuid,uuid[],boolean,uuid[],uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.lease_register_context(uuid,uuid[],boolean,uuid[],uuid[]) TO authenticated;
CREATE FUNCTION public.get_lease_register_context(p_organization_id uuid,p_lease_ids uuid[] DEFAULT NULL,p_include_filter_options boolean DEFAULT false,p_property_ids uuid[] DEFAULT ARRAY[]::uuid[],p_unit_ids uuid[] DEFAULT ARRAY[]::uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.lease_register_context(p_organization_id,p_lease_ids,p_include_filter_options,p_property_ids,p_unit_ids);
$$;
REVOKE ALL ON FUNCTION public.get_lease_register_context(uuid,uuid[],boolean,uuid[],uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_lease_register_context(uuid,uuid[],boolean,uuid[],uuid[]) TO authenticated;

-- Role-scoped, searchable person pages keep the selected identity independent
-- from the requested page. Both relations retain their existing caller RLS.
CREATE INDEX people_active_org_lower_name_page_idx ON public.people (organization_id,lower(display_name),id) WHERE archived_at IS NULL;

CREATE FUNCTION public.get_person_select_page(
  p_organization_id uuid,p_roles text[],p_query text DEFAULT '',p_page integer DEFAULT 1,p_selected_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF p_page IS NULL OR p_roles IS NULL OR p_query IS NULL OR p_page<1 OR p_page>100000 OR length(p_query)>200 OR cardinality(p_roles) NOT BETWEEN 1 AND 4
    OR NOT (p_roles <@ ARRAY['tenant','owner','vendor','staff']) THEN
    RAISE EXCEPTION 'Invalid person selection' USING ERRCODE='22023';
  END IF;
  -- Page first. Role arrays and selected identity hydration must not materialize
  -- the organization directory before applying the page bound.
  WITH matched AS MATERIALIZED (
    SELECT person.id,person.display_name,person.party_type,person.primary_email,person.primary_phone,person.archived_at
    FROM public.people person
    WHERE person.organization_id=p_organization_id AND person.archived_at IS NULL
      AND public.matches_register_search(p_query,ARRAY[person.display_name,person.primary_email,person.primary_phone])
      AND EXISTS (SELECT 1 FROM public.person_roles role
        WHERE role.organization_id=p_organization_id AND role.person_id=person.id
          AND role.status='active' AND role.archived_at IS NULL AND role.role::text=ANY(p_roles))
    ORDER BY lower(person.display_name),person.id LIMIT 26 OFFSET (p_page-1)*25
  ), page_rows AS MATERIALIZED (
    SELECT matched.* FROM matched ORDER BY lower(display_name),id LIMIT 25
  ), chosen AS MATERIALIZED (
    SELECT * FROM page_rows UNION
    SELECT person.id,person.display_name,person.party_type,person.primary_email,person.primary_phone,person.archived_at
    FROM public.people person WHERE person.organization_id=p_organization_id AND person.id=p_selected_id
  ), hydrated AS (
    SELECT chosen.*,role_choices.roles FROM chosen CROSS JOIN LATERAL (
      SELECT array_agg(DISTINCT role.role::text ORDER BY role.role::text) roles FROM public.person_roles role
      WHERE role.organization_id=p_organization_id AND role.person_id=chosen.id
        AND role.status='active' AND role.archived_at IS NULL AND role.role::text=ANY(p_roles)
    ) role_choices WHERE cardinality(role_choices.roles)>0
  ), options AS (
    SELECT jsonb_build_object('id',id,'label',display_name,'partyType',party_type,'archived',archived_at IS NOT NULL,'roles',roles,
      'description',concat_ws(' · ',(SELECT string_agg(initcap(role),', ' ORDER BY role) FROM unnest(roles) role),coalesce(primary_email,primary_phone))) value,id,display_name
    FROM hydrated
  )
  SELECT jsonb_build_object(
    'options',coalesce((SELECT jsonb_agg(value ORDER BY lower(display_name),id) FROM options WHERE id IN (SELECT id FROM page_rows)),'[]'::jsonb),
    'hasMore',(SELECT count(*)>25 FROM matched),
    'selectedOption',(SELECT value FROM options WHERE id=p_selected_id)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_person_select_page(uuid,text[],text,integer,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_person_select_page(uuid,text[],text,integer,uuid) TO authenticated;
