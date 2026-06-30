CREATE INDEX IF NOT EXISTS people_active_org_display_name_page_idx
  ON public.people (organization_id, display_name, id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS people_active_org_updated_at_page_idx
  ON public.people (organization_id, updated_at DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS lease_parties_created_by_idx ON public.lease_parties (created_by);
CREATE INDEX IF NOT EXISTS lease_parties_updated_by_idx ON public.lease_parties (updated_by);
CREATE INDEX IF NOT EXISTS lease_parties_archived_by_idx ON public.lease_parties (archived_by);

CREATE INDEX IF NOT EXISTS leases_primary_tenant_person_fk_idx
  ON public.leases (organization_id, primary_tenant_person_id)
  WHERE primary_tenant_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS people_created_by_idx ON public.people (created_by);
CREATE INDEX IF NOT EXISTS people_updated_by_idx ON public.people (updated_by);
CREATE INDEX IF NOT EXISTS people_archived_by_idx ON public.people (archived_by);

CREATE INDEX IF NOT EXISTS person_contacts_created_by_idx ON public.person_contacts (created_by);
CREATE INDEX IF NOT EXISTS person_contacts_updated_by_idx ON public.person_contacts (updated_by);
CREATE INDEX IF NOT EXISTS person_contacts_archived_by_idx ON public.person_contacts (archived_by);

CREATE INDEX IF NOT EXISTS person_roles_created_by_idx ON public.person_roles (created_by);
CREATE INDEX IF NOT EXISTS person_roles_updated_by_idx ON public.person_roles (updated_by);
CREATE INDEX IF NOT EXISTS person_roles_archived_by_idx ON public.person_roles (archived_by);

CREATE INDEX IF NOT EXISTS property_owners_created_by_idx ON public.property_owners (created_by);
CREATE INDEX IF NOT EXISTS property_owners_updated_by_idx ON public.property_owners (updated_by);
CREATE INDEX IF NOT EXISTS property_owners_archived_by_idx ON public.property_owners (archived_by);

CREATE INDEX IF NOT EXISTS tasks_property_id_idx ON public.tasks (property_id);
CREATE INDEX IF NOT EXISTS tasks_unit_id_idx ON public.tasks (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_vendor_person_id_idx ON public.tasks (vendor_person_id) WHERE vendor_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_requests_property_id_idx ON public.tenant_requests (property_id);
CREATE INDEX IF NOT EXISTS tenant_requests_unit_id_idx ON public.tenant_requests (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenant_requests_requested_by_person_id_idx
  ON public.tenant_requests (requested_by_person_id)
  WHERE requested_by_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_profiles_created_by_idx ON public.vendor_profiles (created_by);
CREATE INDEX IF NOT EXISTS vendor_profiles_updated_by_idx ON public.vendor_profiles (updated_by);
CREATE INDEX IF NOT EXISTS vendor_profiles_archived_by_idx ON public.vendor_profiles (archived_by);
