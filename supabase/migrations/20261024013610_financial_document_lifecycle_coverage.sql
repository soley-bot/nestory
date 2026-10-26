BEGIN;
-- Reports include document counts, risk flags, and evidence links. Keep historic
-- upload dates, but serialize every document writer with lifecycle freezes and
-- invalidate the same-snapshot report source stamp when metadata changes.
CREATE TRIGGER a_financial_write_fence
BEFORE INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION app_private.guard_preserved_write_row();

CREATE TRIGGER financial_report_source_revision
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION app_private.advance_financial_report_source_revision();

SELECT app_private.assert_financial_report_source_lifetime();
COMMIT;
