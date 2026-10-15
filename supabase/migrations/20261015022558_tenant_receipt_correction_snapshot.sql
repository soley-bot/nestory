-- Receipt balances describe the historical instant immediately after their
-- payment, not publication time. This read-only projection never rewrites
-- invoice headers or published artifacts. Corrections are atomic settlement batches: replace their old
-- settlements, then order replacements by the original command's replay order.
CREATE FUNCTION app_private.tenant_receipt_historical_money(p_org uuid,p_payment uuid)
RETURNS TABLE(invoice_total numeric,previously_paid numeric,ambiguous_order boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
WITH RECURSIVE source AS (
  SELECT p.*,i.total_amount AS issued_total
  FROM public.tenant_invoice_payments p
  JOIN public.tenant_invoices i ON i.organization_id=p.organization_id AND i.id=p.invoice_id
  WHERE p.organization_id=p_org AND p.id=p_payment AND p.reversal_of_id IS NULL
), replays AS (
  SELECT r.*
  FROM public.historical_rent_settlement_reapplications r
  JOIN public.tenant_invoice_corrections c ON c.organization_id=r.organization_id AND c.id=r.correction_occurrence_id
  JOIN source s ON c.organization_id=s.organization_id AND c.tenant_invoice_id=s.invoice_id
), source_replay AS (
  SELECT r.* FROM replays r WHERE r.settlement_kind='ips_payment' AND r.replacement_settlement_id=p_payment
), line_ancestry AS (
  SELECT l.id,l.supersedes_line_id,l.correction_occurrence_id
  FROM public.tenant_invoice_lines l
  JOIN public.tenant_invoice_payment_allocations a ON a.organization_id=l.organization_id AND a.invoice_line_id=l.id
  JOIN source s ON s.organization_id=a.organization_id AND s.id=a.payment_id AND s.invoice_id=l.invoice_id
  UNION
  SELECT parent.id,parent.supersedes_line_id,parent.correction_occurrence_id
  FROM line_ancestry child
  JOIN public.tenant_invoice_lines parent ON parent.organization_id=p_org AND parent.id=child.supersedes_line_id
), correction_times AS (
  SELECT c.id,max(l.created_at) AS recorded_at
  FROM public.tenant_invoice_corrections c JOIN source s
    ON s.organization_id=c.organization_id AND s.invoice_id=c.tenant_invoice_id
  JOIN public.tenant_invoice_lines l ON l.organization_id=c.organization_id
    AND l.invoice_id=c.tenant_invoice_id AND l.correction_occurrence_id=c.id
  GROUP BY c.id
), known_corrections AS (
  SELECT c.id FROM correction_times c CROSS JOIN source s
  -- Correction headers retain transaction time; signed invoice lines carry
  -- the immutable financial statement-time stamp introduced in 20261005.
  WHERE c.recorded_at<s.created_at
    OR c.id IN (SELECT correction_occurrence_id FROM line_ancestry)
    OR c.id IN (SELECT correction_occurrence_id FROM source_replay)
), events AS (
  SELECT 'ips_payment'::text AS kind,p.id,p.received_date AS event_date,p.created_at,p.reversal_of_id,
    CASE WHEN p.reversal_of_id IS NULL THEN p.amount ELSE -p.amount END AS amount
  FROM public.tenant_invoice_payments p JOIN source s ON s.organization_id=p.organization_id AND s.invoice_id=p.invoice_id
  UNION ALL
  SELECT 'owner_confirmation',p.id,p.confirmed_date,p.created_at,p.reversal_of_id,
    CASE WHEN p.reversal_of_id IS NULL THEN p.amount ELSE -p.amount END
  FROM public.owner_collection_confirmations p JOIN source s ON s.organization_id=p.organization_id AND s.invoice_id=p.invoice_id
  UNION ALL
  SELECT 'deposit_application',p.id,p.settlement_date,e.created_at,p.reversal_of_application_id,
    CASE WHEN p.reversal_of_application_id IS NULL THEN p.amount ELSE -p.amount END
  FROM public.deposit_rent_applications p JOIN source s ON s.organization_id=p.organization_id AND s.invoice_id=p.invoice_id
  JOIN public.lease_deposit_events e ON e.organization_id=p.organization_id AND e.id=p.deposit_event_id
), event_line_ancestry AS (
  SELECT a.payment_id,l.id,l.supersedes_line_id,l.correction_occurrence_id
  FROM public.tenant_invoice_payment_allocations a
  JOIN public.tenant_invoice_lines l ON l.organization_id=a.organization_id AND l.id=a.invoice_line_id
  JOIN source s ON s.organization_id=a.organization_id AND s.invoice_id=l.invoice_id
  UNION
  SELECT child.payment_id,parent.id,parent.supersedes_line_id,parent.correction_occurrence_id
  FROM event_line_ancestry child
  JOIN public.tenant_invoice_lines parent ON parent.organization_id=p_org AND parent.id=child.supersedes_line_id
), ordered_events AS (
  SELECT e.*,produced.correction_occurrence_id AS produced_by,produced.reversal_settlement_id,
    original.correction_occurrence_id AS replaced_by,
    predecessor.event_date AS original_date,predecessor.created_at AS original_created_at,
    predecessor.id AS original_id
  FROM events e
  LEFT JOIN replays produced ON produced.settlement_kind=e.kind
    AND e.id IN (produced.reversal_settlement_id,produced.replacement_settlement_id)
  LEFT JOIN replays original ON original.settlement_kind=e.kind AND original.original_settlement_id=e.id
  LEFT JOIN events predecessor ON predecessor.kind=produced.settlement_kind AND predecessor.id=produced.original_settlement_id
), decisions AS (
  SELECT e.amount,CASE
    WHEN e.kind='ips_payment' AND (e.id=s.id OR e.reversal_of_id=s.id) THEN false
    -- Recorded-later backdating must not change a historical receipt.
    WHEN e.created_at>s.created_at OR e.event_date>s.received_date THEN false
    WHEN e.produced_by IS NOT NULL AND e.produced_by NOT IN (SELECT id FROM known_corrections) THEN false
    WHEN e.kind='ips_payment' AND EXISTS(SELECT 1 FROM event_line_ancestry a
      WHERE a.payment_id=e.id AND a.correction_occurrence_id IS NOT NULL
        AND a.correction_occurrence_id NOT IN (SELECT id FROM known_corrections)) THEN false
    -- Remove the whole current batch's old settlements, including all linked
    -- reversals, before adding earlier replacements in original replay order.
    WHEN e.replaced_by=sr.correction_occurrence_id THEN false
    WHEN e.produced_by=sr.correction_occurrence_id THEN
      e.id<>e.reversal_settlement_id AND
      (CASE e.kind WHEN 'ips_payment' THEN 0 ELSE 1 END,e.original_date,e.original_created_at,e.original_id)
       < (0,source_original.event_date,source_original.created_at,source_original.id)
    -- Earlier causal batches are complete, even when all now() values tie.
    WHEN e.produced_by IN (SELECT id FROM known_corrections)
      OR e.replaced_by IN (SELECT id FROM known_corrections) THEN true
    -- An ordinary payment allocated to this batch's successor can only follow
    -- the atomic command. It is not a predecessor of a replacement receipt.
    WHEN sr.correction_occurrence_id IS NOT NULL AND e.created_at=s.created_at
      AND e.kind='ips_payment' AND EXISTS(SELECT 1 FROM event_line_ancestry a
        WHERE a.payment_id=e.id AND a.correction_occurrence_id=sr.correction_occurrence_id) THEN false
    -- No sequence is recorded for unrelated same-transaction commands. UUID
    -- order is not financial evidence; let the checked caller fail closed.
    WHEN e.created_at=s.created_at THEN NULL
    ELSE true
  END AS precedes
  FROM ordered_events e CROSS JOIN source s
  LEFT JOIN source_replay sr ON true
  LEFT JOIN events source_original ON source_original.kind='ips_payment' AND source_original.id=sr.original_settlement_id
), previous AS (
  SELECT coalesce(sum(amount) FILTER(WHERE precedes),0) AS amount,
    coalesce(bool_or(precedes IS NULL),false) AS ambiguous FROM decisions
), charge_history AS (
  -- Base charges can append to an issued header. Remove later additions;
  -- expense reversals remain separate signed adjustments, just as in the
  -- authoritative invoice balance view. Both carry statement-time stamps.
  SELECT coalesce((SELECT sum(l.amount) FROM public.tenant_invoice_lines l
    WHERE l.organization_id=s.organization_id AND l.invoice_id=s.invoice_id
      AND l.correction_occurrence_id IS NULL AND l.created_at>s.created_at),0) AS later_base,
    coalesce((SELECT sum(a.amount) FROM public.expense_customer_adjustments a
      WHERE a.organization_id=s.organization_id AND a.tenant_invoice_id=s.invoice_id
        AND a.responsibility='tenant' AND a.created_at<s.created_at),0) AS adjustment,
    EXISTS(SELECT 1 FROM correction_times c WHERE c.recorded_at=s.created_at
      AND c.id NOT IN(SELECT id FROM known_corrections)
      -- An original explicitly consumed by the correction necessarily came
      -- before that atomic command, even with a legacy shared clock.
      AND NOT EXISTS(SELECT 1 FROM replays r WHERE r.correction_occurrence_id=c.id
        AND r.settlement_kind='ips_payment' AND r.original_settlement_id=s.id))
    OR EXISTS(SELECT 1 FROM public.tenant_invoice_lines l
      WHERE l.organization_id=s.organization_id AND l.invoice_id=s.invoice_id
        AND l.correction_occurrence_id IS NULL AND l.created_at=s.created_at
        AND l.id NOT IN(SELECT id FROM line_ancestry))
    OR EXISTS(SELECT 1 FROM public.expense_customer_adjustments a
      WHERE a.organization_id=s.organization_id AND a.tenant_invoice_id=s.invoice_id
        AND a.responsibility='tenant' AND a.created_at=s.created_at) AS ambiguous
  FROM source s
)
SELECT (s.issued_total-charge_history.later_base+charge_history.adjustment
  +coalesce((SELECT sum(l.amount) FROM public.tenant_invoice_lines l
  WHERE l.organization_id=s.organization_id AND l.invoice_id=s.invoice_id
    AND l.correction_occurrence_id IN (SELECT id FROM known_corrections)),0))::numeric(20,2),
  previous.amount::numeric(20,2),previous.ambiguous OR charge_history.ambiguous
FROM source s CROSS JOIN previous CROSS JOIN charge_history;
$$;
REVOKE ALL ON FUNCTION app_private.tenant_receipt_historical_money(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Keep the released property/branch authorization and context cleanup. Only
-- the read-only receipt money projection changes; invoice sources stay issued.
CREATE OR REPLACE FUNCTION public.get_tenant_commercial_document_publication_source(
  p_organization_id uuid,p_source_kind text,p_source_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb;v_money record; BEGIN
  IF pg_catalog.lower(pg_catalog.btrim(p_source_kind)) NOT IN ('invoice','receipt') THEN
    IF (SELECT auth.uid()) IS NULL
      OR NOT app_private.has_org_permission(p_organization_id,'finance.view') THEN
      RAISE EXCEPTION 'tenant_commercial_document_source_forbidden' USING ERRCODE='42501';
    END IF;
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid' USING ERRCODE='22023';
  END IF;
  v_property_id:=app_private.tenant_commercial_document_property_id(p_organization_id,p_source_kind,p_source_id);
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'tenant_commercial_document_source_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.view');
  BEGIN
    v_result:=app_private.get_tenant_commercial_document_publication_source_baseline_branch106(p_organization_id,p_source_kind,p_source_id);
    -- Published bytes/snapshot are already authoritative. Publication retries
    -- need this artifact identity even if legacy event order is ambiguous.
    IF pg_catalog.lower(pg_catalog.btrim(p_source_kind))='receipt'
      AND coalesce(v_result#>>'{artifact,publication_status}','')<>'published' THEN
      SELECT * INTO STRICT v_money FROM app_private.tenant_receipt_historical_money(p_organization_id,p_source_id);
      IF v_money.ambiguous_order THEN
        RAISE EXCEPTION 'tenant_receipt_snapshot_order_ambiguous' USING ERRCODE='55000';
      END IF;
      v_result:=pg_catalog.jsonb_set(v_result,'{invoice,total_amount}',pg_catalog.to_jsonb(v_money.invoice_total::text));
      v_result:=pg_catalog.jsonb_set(v_result,'{payment,amount_previously_paid}',pg_catalog.to_jsonb(v_money.previously_paid::text));
      v_result:=pg_catalog.jsonb_set(v_result,'{payment,remaining_balance}',pg_catalog.to_jsonb(
        (v_money.invoice_total-v_money.previously_paid-(v_result#>>'{payment,amount}')::numeric)::numeric(20,2)::text));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.get_tenant_commercial_document_publication_source(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_commercial_document_publication_source(uuid,text,uuid) TO authenticated;
