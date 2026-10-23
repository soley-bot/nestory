-- Missing rent must not become a zero-income owner close. Existing immutable
-- publications remain historical evidence; new closes/publications are checked.
BEGIN;
CREATE FUNCTION app_private.owner_month_rent_completeness(
  p_organization_id uuid,p_property_id uuid,p_currency public.currency_code,p_month_start date
) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  WITH expected AS (
    SELECT l.id,l.property_id,l.unit_id,l.status,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.start_date,t.id)
        FROM public.lease_terms t WHERE t.organization_id=l.organization_id AND t.lease_id=l.id
          AND t.archived_at IS NULL AND t.status<>'superseded'),'[]'::jsonb) AS terms,
      coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.effective_from,b.id)
        FROM public.lease_billing_terms b WHERE b.organization_id=l.organization_id AND b.lease_id=l.id
          AND b.archived_at IS NULL),'[]'::jsonb) AS billing_rules
    FROM public.leases l
    LEFT JOIN LATERAL (
      SELECT t.* FROM public.lease_terms t
      WHERE t.organization_id=l.organization_id AND t.lease_id=l.id AND t.archived_at IS NULL
        AND t.status<>'superseded' AND t.start_date<(p_month_start+interval '1 month')::date
      ORDER BY t.start_date DESC,t.term_sequence DESC,t.id LIMIT 1
    ) last_term ON true
    WHERE l.organization_id=p_organization_id AND l.property_id=p_property_id AND l.archived_at IS NULL
      AND (
        (l.status IN ('active','notice_given') AND (
          (last_term.id IS NOT NULL AND last_term.rent_currency=p_currency AND last_term.rent_amount>0)
          -- Canonical lease start is term-derived: future-only terms describe
          -- a future lease, while no authoritative terms require review.
          OR NOT EXISTS(SELECT 1 FROM public.lease_terms t WHERE t.organization_id=l.organization_id
            AND t.lease_id=l.id AND t.archived_at IS NULL AND t.status<>'superseded')))
        -- A later zero-rent term must not erase rent owed for an earlier
        -- segment of the same month, including on a still-active lease.
        OR (l.status IN ('active','notice_given','ended','terminated') AND EXISTS(
          SELECT 1 FROM public.lease_terms t WHERE t.organization_id=l.organization_id AND t.lease_id=l.id
            AND t.archived_at IS NULL AND t.status<>'superseded' AND t.rent_currency=p_currency AND t.rent_amount>0
            AND t.start_date<(p_month_start+interval '1 month')::date AND t.end_date>=p_month_start))
      )
  ), evidence AS (
    SELECT e.*,coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'billing_term_id',i.billing_term_id,
      'lease_term_id',i.lease_term_id,'total_amount',i.total_amount,'period_end',i.billing_period_end,
      'rent_lines',(SELECT jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount,'income_item_id',r.income_item_id) ORDER BY r.id)
        FROM public.tenant_invoice_lines r WHERE r.organization_id=i.organization_id AND r.invoice_id=i.id AND r.line_type='rent')) ORDER BY i.id)
      FROM public.tenant_invoices i WHERE i.organization_id=p_organization_id AND i.property_id=p_property_id
        AND i.lease_id=e.id AND i.currency=p_currency AND i.billing_period_start=p_month_start AND i.lifecycle='issued'
        AND EXISTS(SELECT 1 FROM public.tenant_invoice_lines r WHERE r.organization_id=i.organization_id
          AND r.invoice_id=i.id AND r.line_type='rent')),'[]'::jsonb) AS invoices
    FROM expected e
  ) SELECT jsonb_build_object(
    'expected',coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb),
    'gaps',coalesce(jsonb_agg(jsonb_build_object('lease_id',e.id,'property_id',e.property_id,'unit_id',e.unit_id,
      'code',CASE WHEN jsonb_array_length(e.invoices)=0 THEN 'monthly_rent_invoice_missing' ELSE 'monthly_rent_invoice_ambiguous' END)
      ORDER BY e.id) FILTER (WHERE jsonb_array_length(e.invoices)<>1),'[]'::jsonb)
  ) FROM evidence e;
$$;
REVOKE ALL ON FUNCTION app_private.owner_month_rent_completeness(uuid,uuid,public.currency_code,date)
  FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION app_private.owner_close_input_snapshot(uuid,uuid,uuid,public.currency_code,date)
  RENAME TO owner_close_input_snapshot_before_rent_completeness;
CREATE FUNCTION app_private.owner_close_input_snapshot(p_organization_id uuid,p_property_id uuid,
 p_owner_person_id uuid,p_currency public.currency_code,p_month_start date)
RETURNS TABLE(input_watermark text,input_canonical text,input_hash text)
LANGUAGE sql STABLE SET search_path='' AS $$
  WITH old AS (SELECT * FROM app_private.owner_close_input_snapshot_before_rent_completeness(
    p_organization_id,p_property_id,p_owner_person_id,p_currency,p_month_start)),
  rent AS (SELECT app_private.owner_month_rent_completeness(p_organization_id,p_property_id,p_currency,p_month_start) AS data),
  combined AS (SELECT old.input_watermark || ';rent_completeness=v1' AS watermark,
    old.input_canonical || E'\n--monthly-rent-completeness-v1--\n' || rent.data::text AS canonical FROM old CROSS JOIN rent)
  SELECT watermark,canonical,encode(extensions.digest(canonical,'sha256'),'hex') FROM combined;
$$;
REVOKE ALL ON FUNCTION app_private.owner_close_input_snapshot(uuid,uuid,uuid,public.currency_code,date)
 FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION app_private.build_owner_close_readiness(uuid,uuid,uuid,public.currency_code,date)
  RENAME TO build_owner_close_readiness_before_rent_completeness;
CREATE FUNCTION app_private.build_owner_close_readiness(p_organization_id uuid,p_property_id uuid,
 p_owner_person_id uuid,p_currency public.currency_code,p_month_start date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE result jsonb; gaps jsonb;
BEGIN
  result:=app_private.build_owner_close_readiness_before_rent_completeness(
    p_organization_id,p_property_id,p_owner_person_id,p_currency,p_month_start);
  gaps:=app_private.owner_month_rent_completeness(p_organization_id,p_property_id,p_currency,p_month_start)->'gaps';
  IF jsonb_array_length(gaps)>0 THEN
    result:=result || jsonb_build_object('is_ready',false,'blockers',(result->'blockers') || gaps);
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION app_private.build_owner_close_readiness(uuid,uuid,uuid,public.currency_code,date)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.guard_owner_month_rent_completeness() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_property uuid; v_month date; v_currency public.currency_code; gaps jsonb;
BEGIN
  IF TG_TABLE_NAME='owner_close_revisions' THEN
    IF NEW.status<>'closed' THEN RETURN NEW; END IF;
    v_property:=NEW.property_id; v_month:=NEW.month_start; v_currency:=NEW.currency;
  ELSE
    SELECT property_id,month_start,currency INTO STRICT v_property,v_month,v_currency
      FROM public.owner_close_revisions WHERE organization_id=NEW.organization_id AND id=NEW.owner_close_revision_id;
  END IF;
  gaps:=app_private.owner_month_rent_completeness(NEW.organization_id,v_property,v_currency,v_month)->'gaps';
  IF jsonb_array_length(gaps)>0 THEN
    RAISE EXCEPTION 'owner_month_rent_incomplete' USING ERRCODE='23514',DETAIL=gaps::text;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_owner_month_rent_completeness() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER a_monthly_rent_completeness BEFORE INSERT OR UPDATE ON public.owner_close_revisions
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_month_rent_completeness();
CREATE TRIGGER a_monthly_rent_completeness BEFORE INSERT ON public.owner_statement_publications
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_month_rent_completeness();

DO $readiness$
DECLARE definition text; anchor text; replacement text;
BEGIN
  SELECT pg_get_functiondef('app_private.get_owner_statement_readiness_baseline_branch106(uuid,uuid)'::regprocedure) INTO definition;
  anchor:='  RETURN pg_catalog.jsonb_build_object(';
  replacement:=E'  v_blockers:=v_blockers || (app_private.owner_month_rent_completeness(p_organization_id,v_revision.property_id,v_revision.currency,v_revision.month_start)->''gaps'');\n' || anchor;
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'owner_statement_readiness_predecessor_changed'; END IF;
  EXECUTE replace(definition,anchor,replacement);
END;
$readiness$;
COMMIT;
