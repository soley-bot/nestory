-- Apply the existing organization mutation step-up boundary to the new tables.
-- No role, permission, execution grant or customer record is changed.
CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE ON public.deposit_rent_custody_confirmations
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation();

CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE ON public.deposit_rent_applications
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation();

CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE ON public.deposit_rent_allocations
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation();

CREATE TRIGGER privileged_email_step_up_enforcement
BEFORE INSERT OR UPDATE OR DELETE ON public.deposit_rent_owner_bridges
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_privileged_email_step_up_on_organization_mutation();
