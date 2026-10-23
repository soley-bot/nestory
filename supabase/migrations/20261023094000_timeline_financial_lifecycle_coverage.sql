BEGIN;
-- Timeline combines operational history with financial projections. Preserve
-- historical note dates, but freeze every row included in the reset manifest.
CREATE TRIGGER a_financial_write_fence
BEFORE INSERT OR UPDATE OR DELETE ON public.timeline_events
FOR EACH ROW EXECUTE FUNCTION app_private.guard_preserved_write_row();

CREATE FUNCTION app_private.guard_timeline_financial_write_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- Match enforce_timeline_financial_period_open's financial classification.
  -- Validate both images: removing a cost/link or changing the date/scope must
  -- not legalize an old financial record. The preceding preserved-row guard
  -- has already acquired both organization lifecycle locks in sorted order.
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.cost_amount IS NOT NULL OR OLD.ledger_entry_id IS NOT NULL THEN
      PERFORM app_private.assert_financial_write_allowed(OLD.organization_id,OLD.event_date);
      -- The existing month trigger covers INSERT/UPDATE only. Service-role
      -- DELETE and FK cascades must protect the same old financial image.
      IF TG_OP='DELETE' AND app_private.is_financial_month_locked(OLD.organization_id,OLD.event_date) THEN
        RAISE EXCEPTION 'Financial month is locked' USING ERRCODE='22023';
      END IF;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.cost_amount IS NOT NULL OR NEW.ledger_entry_id IS NOT NULL THEN
      PERFORM app_private.assert_financial_write_allowed(NEW.organization_id,NEW.event_date);
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_timeline_financial_write_row() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER b_timeline_financial_write_fence
BEFORE INSERT OR UPDATE OR DELETE ON public.timeline_events
FOR EACH ROW EXECUTE FUNCTION app_private.guard_timeline_financial_write_row();

CREATE TRIGGER financial_report_source_revision
AFTER INSERT OR UPDATE OR DELETE ON public.timeline_events
FOR EACH ROW EXECUTE FUNCTION app_private.advance_financial_report_source_revision();
SELECT app_private.assert_financial_report_source_lifetime();
COMMIT;
