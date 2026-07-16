CREATE OR REPLACE FUNCTION app_private.protect_last_organization_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
BEGIN
  IF OLD.role = 'admin'
    AND (
      NEW.role <> 'admin'
      OR NEW.organization_id <> OLD.organization_id
    )
  THEN
    PERFORM organizations.id
    FROM public.organizations AS organizations
    WHERE organizations.id = OLD.organization_id
    FOR UPDATE;

    IF (
      SELECT count(*)
      FROM public.organization_members AS members
      WHERE members.organization_id = OLD.organization_id
        AND members.role = 'admin'
    ) <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last administrator';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.protect_last_organization_admin()
FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_last_organization_admin
ON public.organization_members;

CREATE TRIGGER protect_last_organization_admin
BEFORE UPDATE OF role, organization_id
ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION app_private.protect_last_organization_admin();
