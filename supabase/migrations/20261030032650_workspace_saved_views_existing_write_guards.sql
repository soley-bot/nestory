-- Personal preferences are organization-scoped writes and must participate in
-- the same session verification and checkpoint seal as existing workspace tables.
BEGIN;

CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_saved_views
FOR EACH ROW EXECUTE FUNCTION
  app_private.enforce_privileged_email_step_up_on_organization_mutation();

CREATE TRIGGER zzzzz_financial_reset_checkpoint_seal
AFTER INSERT OR UPDATE OR DELETE ON public.workspace_saved_views
FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_checkpoint_row();

COMMIT;
