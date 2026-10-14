-- A rent register page and its totals share one database snapshot. Only the
-- displayed invoices (plus an explicit report selection) leave the database.
CREATE FUNCTION app_private.rent_invoice_search_matches(p_query text, p_text text)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$
  WITH normalized AS (
    SELECT lower(regexp_replace(regexp_replace(pg_catalog.normalize(coalesce(p_query,''),'NFKC'), E'\\\\[tnr]', ' ', 'g'), '[[:space:]]+', ' ', 'g')) query,
      lower(regexp_replace(regexp_replace(pg_catalog.normalize(coalesce(p_text,''),'NFKC'), E'\\\\[tnr]', ' ', 'g'), '[[:space:]]+', ' ', 'g')) text
  )
  SELECT NOT EXISTS (
    SELECT 1 FROM normalized, regexp_split_to_table(btrim(query),' ') token
    WHERE token<>'' AND strpos(text,token)=0 AND NOT (
      translate(token,'#.-','')<>'' AND EXISTS (
        SELECT 1 FROM regexp_split_to_table(text,' ') word
        WHERE strpos(translate(word,'#.-',''),translate(token,'#.-',''))>0
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION app_private.rent_invoice_search_matches(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.rent_invoice_page(
  p_organization_id uuid, p_property_id uuid DEFAULT NULL, p_unit_id uuid DEFAULT NULL,
  p_lease_id uuid DEFAULT NULL, p_selected_invoice_id uuid DEFAULT NULL,
  p_query text DEFAULT '', p_status text DEFAULT 'all', p_due text DEFAULT 'all',
  p_overdue_days integer DEFAULT 0, p_sort text DEFAULT 'default',
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_result jsonb; v_business_date date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.has_org_permission(p_organization_id,'finance.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties p WHERE p.organization_id=p_organization_id AND p.id=p_property_id
      AND app_private.can_access_property(p_organization_id,p.id,'finance.view')
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units u WHERE u.organization_id=p_organization_id AND u.id=p_unit_id
      AND (p_property_id IS NULL OR u.property_id=p_property_id)
      AND app_private.can_access_property(p_organization_id,u.property_id,'finance.view')
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_lease_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leases l WHERE l.organization_id=p_organization_id AND l.id=p_lease_id
      AND (p_property_id IS NULL OR l.property_id=p_property_id)
      AND (p_unit_id IS NULL OR l.unit_id=p_unit_id)
      AND app_private.can_access_property(p_organization_id,l.property_id,'finance.view')
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_page IS NULL OR p_page<1 OR p_page_size IS DISTINCT FROM 50
    OR p_status IS NULL OR p_status NOT IN ('all','open','paid','partly_paid','unpaid')
    OR p_due IS NULL OR p_due NOT IN ('all','overdue','today','next_7_days','this_month')
    OR p_overdue_days IS NULL OR p_overdue_days NOT IN (0,7,30,60)
    OR p_sort IS NULL OR p_sort NOT IN ('default','due_asc','due_desc','balance_desc','tenant_asc')
    OR length(coalesce(p_query,''))>500
  THEN RAISE EXCEPTION 'Invalid invoice filters' USING ERRCODE='22023'; END IF;
  v_business_date := public.get_lease_rent_business_date(p_organization_id);

  WITH allowed_properties AS MATERIALIZED (
    SELECT p.id,p.name,p.code FROM public.properties p
    WHERE p.organization_id=p_organization_id
      AND app_private.can_access_property(p_organization_id,p.id,'finance.view')
  ), scoped AS MATERIALIZED (
    SELECT invoice.* FROM public.tenant_invoice_balances invoice
    JOIN allowed_properties p ON p.id=invoice.property_id
    WHERE invoice.organization_id=p_organization_id
      AND (p_property_id IS NULL OR invoice.property_id=p_property_id)
      AND (p_unit_id IS NULL OR invoice.unit_id=p_unit_id)
      AND (p_lease_id IS NULL OR invoice.lease_id=p_lease_id)
  ), visible AS MATERIALIZED (
    SELECT * FROM scoped WHERE payment_status<>'voided'
  ), filtered AS MATERIALIZED (
    SELECT invoice.* FROM visible invoice JOIN allowed_properties p ON p.id=invoice.property_id
    WHERE (p_status='all' OR (p_status='open' AND invoice.payment_status IN ('unpaid','partly_paid')) OR invoice.payment_status=p_status)
      AND ((p_due<>'overdue' AND p_overdue_days=0) OR (invoice.balance_due>0 AND invoice.payment_status IN ('unpaid','partly_paid')))
      AND (p_due<>'overdue' OR invoice.due_date<v_business_date)
      AND (p_due<>'today' OR invoice.due_date=v_business_date)
      AND (p_due<>'next_7_days' OR invoice.due_date BETWEEN v_business_date AND v_business_date+7)
      AND (p_due<>'this_month' OR date_trunc('month',invoice.due_date)=date_trunc('month',v_business_date))
      AND (p_overdue_days=0 OR invoice.due_date<=v_business_date-p_overdue_days)
      AND (btrim(coalesce(p_query,''))='' OR app_private.rent_invoice_search_matches(p_query,
        concat_ws(' ', p.name,p.code,invoice.invoice_number,invoice.recipient_label,
          array_to_string(invoice.occupant_labels,' '),
          (SELECT u.unit_number FROM public.units u WHERE u.organization_id=p_organization_id AND u.property_id=invoice.property_id AND u.id=invoice.unit_id),
          (SELECT string_agg(person.display_name,' ') FROM public.property_owners owner
            JOIN public.people person ON person.organization_id=owner.organization_id AND person.id=owner.person_id
            WHERE owner.organization_id=p_organization_id AND owner.property_id=invoice.property_id
              AND owner.archived_at IS NULL AND owner.ended_on IS NULL),
          (SELECT string_agg(line.customer_label,' ') FROM public.tenant_invoice_lines line
            WHERE line.organization_id=p_organization_id AND line.invoice_id=invoice.id)
        )))
  ), counts AS (
    SELECT count(*) total_count,greatest(1,(count(*)+p_page_size-1)/p_page_size) total_pages FROM filtered
  ), paging AS (
    SELECT *,least(p_page::bigint,total_pages) page FROM counts
  ), numbered AS (
    SELECT invoice.*,row_number() OVER (ORDER BY
      CASE WHEN p_sort='due_asc' THEN invoice.due_date END ASC,
      CASE WHEN p_sort IN ('default','due_desc') THEN invoice.due_date END DESC,
      CASE WHEN p_sort='balance_desc' THEN invoice.balance_due END DESC,
      CASE WHEN p_sort='tenant_asc' THEN invoice.recipient_label END ASC,
      invoice.id ASC) page_rank FROM filtered invoice
  ), page_rows AS (
    SELECT invoice.* FROM numbered invoice CROSS JOIN paging
    WHERE invoice.page_rank>(paging.page-1)*p_page_size AND invoice.page_rank<=paging.page*p_page_size
  ), currency_totals AS (
    SELECT currency,sum(paid_through_ips+collected_by_owner) collected,sum(balance_due) outstanding FROM filtered GROUP BY currency
  )
  SELECT jsonb_build_object(
    'invoices',coalesce((SELECT jsonb_agg(to_jsonb(row)-'page_rank' ORDER BY row.page_rank) FROM page_rows row),'[]'::jsonb),
    'selectedInvoice',(SELECT to_jsonb(row) FROM scoped row WHERE row.id=p_selected_invoice_id),
    'pagination',jsonb_build_object('page',page,'pageSize',p_page_size,'totalCount',total_count,'totalPages',total_pages,
      'from',CASE WHEN total_count=0 THEN 0 ELSE (page-1)*p_page_size+1 END,'to',least(page*p_page_size,total_count)),
    'totalVisibleCount',(SELECT count(*) FROM visible),
    'totalsByCurrency',coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.currency) FROM currency_totals row),'[]'::jsonb),
    'propertyOptions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.name||' - '||p.code) ORDER BY p.name,p.code,p.id) FROM allowed_properties p),'[]'::jsonb)
  ) INTO v_result FROM paging;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.get_rent_invoice_page(
  p_organization_id uuid, p_property_id uuid DEFAULT NULL, p_unit_id uuid DEFAULT NULL,
  p_lease_id uuid DEFAULT NULL, p_selected_invoice_id uuid DEFAULT NULL,
  p_query text DEFAULT '', p_status text DEFAULT 'all', p_due text DEFAULT 'all',
  p_overdue_days integer DEFAULT 0, p_sort text DEFAULT 'default',
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 50
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT app_private.rent_invoice_page(p_organization_id,p_property_id,p_unit_id,p_lease_id,p_selected_invoice_id,p_query,p_status,p_due,p_overdue_days,p_sort,p_page,p_page_size); $$;
ALTER FUNCTION app_private.rent_invoice_page(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.rent_invoice_page(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.rent_invoice_page(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text,integer,integer) TO authenticated;
ALTER FUNCTION public.get_rent_invoice_page(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_rent_invoice_page(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_rent_invoice_page(uuid,uuid,uuid,uuid,uuid,text,text,text,integer,text,integer,integer) TO authenticated;

-- Keep small property/unit selectors, but load lease histories, billing rules,
-- recovery metadata and owner relationships only for the requested property.
DO $scope_context$
DECLARE
  definition text := pg_catalog.pg_get_functiondef('app_private.finance_read_context(uuid,uuid)'::regprocedure);
  old_lease text := 'WHERE lease.organization_id=p_organization_id';
  old_owner text := 'WHERE assignment.organization_id=p_organization_id';
BEGIN
  IF (length(definition)-length(replace(definition,old_lease,'')))/length(old_lease)<>1
    OR (length(definition)-length(replace(definition,old_owner,'')))/length(old_owner)<>1
  THEN RAISE EXCEPTION 'Expected scoped finance context anchors missing or ambiguous'; END IF;
  definition := replace(definition,old_lease,old_lease||' AND (p_requested_property_id IS NULL OR lease.property_id=p_requested_property_id)');
  definition := replace(definition,old_owner,old_owner||' AND (p_requested_property_id IS NULL OR assignment.property_id=p_requested_property_id)');
  EXECUTE definition;
END;
$scope_context$;
