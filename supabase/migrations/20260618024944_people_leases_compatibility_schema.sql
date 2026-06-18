-- People and leases compatibility schema.
-- Keeps public.leases as the parent record while normalizing tenant/owner/vendor identity.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.units
  ADD CONSTRAINT units_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS primary_tenant_person_id uuid,
  ADD CONSTRAINT leases_organization_id_id_key UNIQUE (organization_id, id),
  ADD CONSTRAINT leases_date_range_check CHECK (lease_end_date >= lease_start_date),
  ADD CONSTRAINT leases_monthly_rent_non_negative_check CHECK (monthly_rent_amount >= 0),
  ADD CONSTRAINT leases_deposit_non_negative_check CHECK (
    deposit_amount IS NULL OR deposit_amount >= 0
  ),
  ADD CONSTRAINT leases_status_check CHECK (
    status IN ('draft', 'active', 'notice_given', 'ended', 'terminated', 'cancelled')
  ),
  ADD CONSTRAINT leases_tenant_name_not_blank_check CHECK (
    length(trim(tenant_name)) > 0
  ),
  ADD CONSTRAINT leases_deposit_currency_pair_check CHECK (
    (deposit_amount IS NULL AND deposit_currency IS NULL)
    OR (deposit_amount IS NOT NULL AND deposit_currency IS NOT NULL)
  );

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  legal_name text,
  party_type text NOT NULL DEFAULT 'individual',
  primary_email text,
  primary_phone text,
  tax_identifier text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT people_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT people_display_name_not_blank_check CHECK (length(trim(display_name)) > 0),
  CONSTRAINT people_legal_name_not_blank_check CHECK (
    legal_name IS NULL OR length(trim(legal_name)) > 0
  ),
  CONSTRAINT people_party_type_check CHECK (party_type IN ('individual', 'company')),
  CONSTRAINT people_primary_email_not_blank_check CHECK (
    primary_email IS NULL OR length(trim(primary_email)) > 0
  ),
  CONSTRAINT people_primary_phone_not_blank_check CHECK (
    primary_phone IS NULL OR length(trim(primary_phone)) > 0
  )
);

CREATE TABLE public.person_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT person_roles_person_fk
    FOREIGN KEY (organization_id, person_id)
    REFERENCES public.people(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT person_roles_role_check CHECK (role IN ('tenant', 'owner', 'vendor')),
  CONSTRAINT person_roles_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE public.person_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  contact_name text,
  contact_type text NOT NULL DEFAULT 'general',
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT person_contacts_person_fk
    FOREIGN KEY (organization_id, person_id)
    REFERENCES public.people(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT person_contacts_contact_type_check CHECK (
    contact_type IN (
      'general',
      'email',
      'phone',
      'mobile',
      'whatsapp',
      'telegram',
      'billing',
      'emergency',
      'other'
    )
  ),
  CONSTRAINT person_contacts_has_contact_value_check CHECK (
    contact_name IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL
  ),
  CONSTRAINT person_contacts_contact_name_not_blank_check CHECK (
    contact_name IS NULL OR length(trim(contact_name)) > 0
  ),
  CONSTRAINT person_contacts_email_not_blank_check CHECK (
    email IS NULL OR length(trim(email)) > 0
  ),
  CONSTRAINT person_contacts_phone_not_blank_check CHECK (
    phone IS NULL OR length(trim(phone)) > 0
  )
);

CREATE TABLE public.property_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  person_id uuid NOT NULL,
  ownership_label text,
  ownership_percent numeric(6, 3),
  is_primary boolean NOT NULL DEFAULT false,
  started_on date,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT property_owners_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT property_owners_person_fk
    FOREIGN KEY (organization_id, person_id)
    REFERENCES public.people(organization_id, id),
  CONSTRAINT property_owners_label_not_blank_check CHECK (
    ownership_label IS NULL OR length(trim(ownership_label)) > 0
  ),
  CONSTRAINT property_owners_percent_check CHECK (
    ownership_percent IS NULL
    OR (ownership_percent >= 0 AND ownership_percent <= 100)
  ),
  CONSTRAINT property_owners_date_range_check CHECK (
    ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on
  )
);

CREATE TABLE public.vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  service_category text,
  service_area text,
  preferred boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vendor_profiles_person_fk
    FOREIGN KEY (organization_id, person_id)
    REFERENCES public.people(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT vendor_profiles_person_unique UNIQUE (organization_id, person_id),
  CONSTRAINT vendor_profiles_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT vendor_profiles_category_not_blank_check CHECK (
    service_category IS NULL OR length(trim(service_category)) > 0
  ),
  CONSTRAINT vendor_profiles_area_not_blank_check CHECK (
    service_area IS NULL OR length(trim(service_area)) > 0
  )
);

CREATE TABLE public.lease_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  person_id uuid NOT NULL,
  party_role text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  started_on date,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_parties_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_parties_person_fk
    FOREIGN KEY (organization_id, person_id)
    REFERENCES public.people(organization_id, id),
  CONSTRAINT lease_parties_party_role_check CHECK (
    party_role IN (
      'primary_tenant',
      'co_tenant',
      'guarantor',
      'billing_contact',
      'authorized_occupant'
    )
  ),
  CONSTRAINT lease_parties_primary_role_check CHECK (
    NOT is_primary OR party_role = 'primary_tenant'
  ),
  CONSTRAINT lease_parties_date_range_check CHECK (
    ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on
  )
);

CREATE TABLE public.lease_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  term_sequence integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  rent_amount numeric(14, 2) NOT NULL,
  rent_currency public.currency_code NOT NULL,
  rent_due_day integer,
  payment_frequency text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  notice_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_terms_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_terms_sequence_unique UNIQUE (organization_id, lease_id, term_sequence),
  CONSTRAINT lease_terms_sequence_positive_check CHECK (term_sequence > 0),
  CONSTRAINT lease_terms_date_range_check CHECK (end_date >= start_date),
  CONSTRAINT lease_terms_rent_non_negative_check CHECK (rent_amount >= 0),
  CONSTRAINT lease_terms_due_day_check CHECK (rent_due_day IS NULL OR rent_due_day BETWEEN 1 AND 31),
  CONSTRAINT lease_terms_payment_frequency_check CHECK (
    payment_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'one_time')
  ),
  CONSTRAINT lease_terms_status_check CHECK (
    status IN ('draft', 'upcoming', 'active', 'expired', 'terminated', 'superseded')
  )
);

CREATE TABLE public.lease_occupancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  property_id uuid NOT NULL,
  unit_id uuid,
  status text NOT NULL DEFAULT 'occupied',
  scheduled_move_in_date date,
  actual_move_in_date date,
  notice_date date,
  scheduled_move_out_date date,
  actual_move_out_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_occupancies_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_occupancies_property_fk
    FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_occupancies_unit_fk
    FOREIGN KEY (organization_id, unit_id)
    REFERENCES public.units(organization_id, id)
    ON DELETE SET NULL (unit_id),
  CONSTRAINT lease_occupancies_status_check CHECK (
    status IN ('reserved', 'occupied', 'notice_given', 'vacated', 'cancelled')
  ),
  CONSTRAINT lease_occupancies_scheduled_range_check CHECK (
    scheduled_move_out_date IS NULL
    OR scheduled_move_in_date IS NULL
    OR scheduled_move_out_date >= scheduled_move_in_date
  ),
  CONSTRAINT lease_occupancies_actual_range_check CHECK (
    actual_move_out_date IS NULL
    OR actual_move_in_date IS NULL
    OR actual_move_out_date >= actual_move_in_date
  )
);

CREATE TABLE public.lease_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  deposit_type text NOT NULL DEFAULT 'security',
  amount numeric(14, 2) NOT NULL,
  currency public.currency_code NOT NULL,
  status text NOT NULL DEFAULT 'held',
  received_on date,
  returned_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lease_deposits_lease_fk
    FOREIGN KEY (organization_id, lease_id)
    REFERENCES public.leases(organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT lease_deposits_type_not_blank_check CHECK (length(trim(deposit_type)) > 0),
  CONSTRAINT lease_deposits_amount_non_negative_check CHECK (amount >= 0),
  CONSTRAINT lease_deposits_status_check CHECK (
    status IN ('pending', 'received', 'held', 'partially_returned', 'returned', 'forfeited', 'waived')
  ),
  CONSTRAINT lease_deposits_date_range_check CHECK (
    returned_on IS NULL OR received_on IS NULL OR returned_on >= received_on
  )
);

ALTER TABLE public.leases
  ADD CONSTRAINT leases_primary_tenant_person_fk
    FOREIGN KEY (organization_id, primary_tenant_person_id)
    REFERENCES public.people(organization_id, id)
    ON DELETE SET NULL (primary_tenant_person_id);

CREATE OR REPLACE FUNCTION public.validate_lease_property_unit_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE organization_id = NEW.organization_id
      AND id = NEW.unit_id
      AND property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Lease unit must belong to the selected property'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_lease_occupancy_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  linked_lease record;
BEGIN
  SELECT property_id, unit_id
  INTO linked_lease
  FROM public.leases
  WHERE organization_id = NEW.organization_id
    AND id = NEW.lease_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease not found for occupancy'
      USING ERRCODE = '23503';
  END IF;

  IF linked_lease.property_id <> NEW.property_id THEN
    RAISE EXCEPTION 'Lease occupancy property must match the lease property'
      USING ERRCODE = '23503';
  END IF;

  IF linked_lease.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM linked_lease.unit_id THEN
    RAISE EXCEPTION 'Lease occupancy unit must match the lease unit'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE organization_id = NEW.organization_id
      AND id = NEW.unit_id
      AND property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Lease occupancy unit must belong to the selected property'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_leases_property_unit_scope
BEFORE INSERT OR UPDATE OF organization_id, property_id, unit_id ON public.leases
FOR EACH ROW EXECUTE FUNCTION public.validate_lease_property_unit_scope();

CREATE TRIGGER validate_lease_occupancies_scope
BEFORE INSERT OR UPDATE OF organization_id, lease_id, property_id, unit_id ON public.lease_occupancies
FOR EACH ROW EXECUTE FUNCTION public.validate_lease_occupancy_scope();

CREATE TRIGGER set_people_updated_at
BEFORE UPDATE ON public.people
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_person_roles_updated_at
BEFORE UPDATE ON public.person_roles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_person_contacts_updated_at
BEFORE UPDATE ON public.person_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_property_owners_updated_at
BEFORE UPDATE ON public.property_owners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_vendor_profiles_updated_at
BEFORE UPDATE ON public.vendor_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_lease_parties_updated_at
BEFORE UPDATE ON public.lease_parties
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_lease_terms_updated_at
BEFORE UPDATE ON public.lease_terms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_lease_occupancies_updated_at
BEFORE UPDATE ON public.lease_occupancies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_lease_deposits_updated_at
BEFORE UPDATE ON public.lease_deposits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_occupancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage people"
ON public.people
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage person roles"
ON public.person_roles
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage person contacts"
ON public.person_contacts
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage property owners"
ON public.property_owners
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage vendor profiles"
ON public.vendor_profiles
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage lease parties"
ON public.lease_parties
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage lease terms"
ON public.lease_terms
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage lease occupancies"
ON public.lease_occupancies
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

CREATE POLICY "Admins can manage lease deposits"
ON public.lease_deposits
FOR ALL
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

REVOKE ALL ON
  public.people,
  public.person_roles,
  public.person_contacts,
  public.property_owners,
  public.vendor_profiles,
  public.lease_parties,
  public.lease_terms,
  public.lease_occupancies,
  public.lease_deposits
FROM PUBLIC, anon;

REVOKE ALL ON
  public.people,
  public.person_roles,
  public.person_contacts,
  public.property_owners,
  public.vendor_profiles,
  public.lease_parties,
  public.lease_terms,
  public.lease_occupancies,
  public.lease_deposits
FROM authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON
  public.people,
  public.person_roles,
  public.person_contacts,
  public.property_owners,
  public.vendor_profiles,
  public.lease_parties,
  public.lease_terms,
  public.lease_occupancies,
  public.lease_deposits
TO authenticated, service_role;

CREATE INDEX leases_org_primary_tenant_person_id_idx
  ON public.leases (organization_id, primary_tenant_person_id)
  WHERE primary_tenant_person_id IS NOT NULL;

CREATE INDEX people_created_by_idx ON public.people (created_by);
CREATE INDEX people_updated_by_idx ON public.people (updated_by);
CREATE INDEX people_archived_by_idx ON public.people (archived_by);
CREATE INDEX people_active_org_display_name_idx
  ON public.people (organization_id, lower(display_name))
  WHERE archived_at IS NULL;
CREATE INDEX people_display_name_trgm_idx
  ON public.people USING gin (display_name extensions.gin_trgm_ops);

CREATE INDEX person_roles_org_person_id_idx ON public.person_roles (organization_id, person_id);
CREATE INDEX person_roles_created_by_idx ON public.person_roles (created_by);
CREATE INDEX person_roles_updated_by_idx ON public.person_roles (updated_by);
CREATE INDEX person_roles_archived_by_idx ON public.person_roles (archived_by);
CREATE INDEX person_roles_org_role_status_idx
  ON public.person_roles (organization_id, role, status);
CREATE UNIQUE INDEX person_roles_one_active_role_idx
  ON public.person_roles (organization_id, person_id, role)
  WHERE status = 'active' AND archived_at IS NULL;

CREATE INDEX person_contacts_org_person_id_idx
  ON public.person_contacts (organization_id, person_id);
CREATE INDEX person_contacts_created_by_idx ON public.person_contacts (created_by);
CREATE INDEX person_contacts_updated_by_idx ON public.person_contacts (updated_by);
CREATE INDEX person_contacts_archived_by_idx ON public.person_contacts (archived_by);
CREATE UNIQUE INDEX person_contacts_one_primary_contact_idx
  ON public.person_contacts (organization_id, person_id)
  WHERE is_primary AND archived_at IS NULL;

CREATE INDEX property_owners_org_property_id_idx
  ON public.property_owners (organization_id, property_id);
CREATE INDEX property_owners_org_person_id_idx
  ON public.property_owners (organization_id, person_id);
CREATE INDEX property_owners_created_by_idx ON public.property_owners (created_by);
CREATE INDEX property_owners_updated_by_idx ON public.property_owners (updated_by);
CREATE INDEX property_owners_archived_by_idx ON public.property_owners (archived_by);
CREATE INDEX property_owners_active_property_idx
  ON public.property_owners (organization_id, property_id, started_on DESC)
  WHERE archived_at IS NULL;
CREATE UNIQUE INDEX property_owners_one_current_primary_idx
  ON public.property_owners (organization_id, property_id)
  WHERE is_primary AND archived_at IS NULL AND ended_on IS NULL;

CREATE INDEX vendor_profiles_org_person_id_idx
  ON public.vendor_profiles (organization_id, person_id);
CREATE INDEX vendor_profiles_created_by_idx ON public.vendor_profiles (created_by);
CREATE INDEX vendor_profiles_updated_by_idx ON public.vendor_profiles (updated_by);
CREATE INDEX vendor_profiles_archived_by_idx ON public.vendor_profiles (archived_by);
CREATE INDEX vendor_profiles_active_category_idx
  ON public.vendor_profiles (organization_id, service_category)
  WHERE archived_at IS NULL AND status = 'active';

CREATE INDEX lease_parties_org_lease_id_idx
  ON public.lease_parties (organization_id, lease_id);
CREATE INDEX lease_parties_org_person_id_idx
  ON public.lease_parties (organization_id, person_id);
CREATE INDEX lease_parties_created_by_idx ON public.lease_parties (created_by);
CREATE INDEX lease_parties_updated_by_idx ON public.lease_parties (updated_by);
CREATE INDEX lease_parties_archived_by_idx ON public.lease_parties (archived_by);
CREATE INDEX lease_parties_active_lease_role_idx
  ON public.lease_parties (organization_id, lease_id, party_role)
  WHERE archived_at IS NULL;
CREATE UNIQUE INDEX lease_parties_one_active_primary_tenant_idx
  ON public.lease_parties (organization_id, lease_id)
  WHERE party_role = 'primary_tenant'
    AND is_primary
    AND archived_at IS NULL
    AND ended_on IS NULL;
CREATE UNIQUE INDEX lease_parties_one_active_person_role_idx
  ON public.lease_parties (organization_id, lease_id, person_id, party_role)
  WHERE archived_at IS NULL AND ended_on IS NULL;

CREATE INDEX lease_terms_org_lease_id_idx
  ON public.lease_terms (organization_id, lease_id);
CREATE INDEX lease_terms_created_by_idx ON public.lease_terms (created_by);
CREATE INDEX lease_terms_updated_by_idx ON public.lease_terms (updated_by);
CREATE INDEX lease_terms_archived_by_idx ON public.lease_terms (archived_by);
CREATE INDEX lease_terms_active_end_date_idx
  ON public.lease_terms (organization_id, end_date)
  WHERE archived_at IS NULL AND status IN ('upcoming', 'active');
CREATE UNIQUE INDEX lease_terms_one_active_term_idx
  ON public.lease_terms (organization_id, lease_id)
  WHERE archived_at IS NULL AND status = 'active';

CREATE INDEX lease_occupancies_org_lease_id_idx
  ON public.lease_occupancies (organization_id, lease_id);
CREATE INDEX lease_occupancies_org_property_id_idx
  ON public.lease_occupancies (organization_id, property_id);
CREATE INDEX lease_occupancies_org_unit_id_idx
  ON public.lease_occupancies (organization_id, unit_id)
  WHERE unit_id IS NOT NULL;
CREATE INDEX lease_occupancies_created_by_idx ON public.lease_occupancies (created_by);
CREATE INDEX lease_occupancies_updated_by_idx ON public.lease_occupancies (updated_by);
CREATE INDEX lease_occupancies_archived_by_idx ON public.lease_occupancies (archived_by);
CREATE INDEX lease_occupancies_org_property_unit_move_in_idx
  ON public.lease_occupancies (
    organization_id,
    property_id,
    unit_id,
    actual_move_in_date DESC
  );
CREATE UNIQUE INDEX lease_occupancies_one_active_unit_idx
  ON public.lease_occupancies (organization_id, unit_id)
  WHERE unit_id IS NOT NULL
    AND archived_at IS NULL
    AND actual_move_out_date IS NULL
    AND status IN ('reserved', 'occupied', 'notice_given');

CREATE INDEX lease_deposits_org_lease_id_idx
  ON public.lease_deposits (organization_id, lease_id);
CREATE INDEX lease_deposits_created_by_idx ON public.lease_deposits (created_by);
CREATE INDEX lease_deposits_updated_by_idx ON public.lease_deposits (updated_by);
CREATE INDEX lease_deposits_archived_by_idx ON public.lease_deposits (archived_by);
CREATE INDEX lease_deposits_org_lease_status_idx
  ON public.lease_deposits (organization_id, lease_id, status);

CREATE TEMP TABLE people_leases_backfill_tenants (
  organization_id uuid NOT NULL,
  tenant_name text NOT NULL,
  person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, tenant_name)
) ON COMMIT DROP;

INSERT INTO people_leases_backfill_tenants (
  organization_id,
  tenant_name,
  created_at,
  updated_at
)
SELECT
  organization_id,
  trim(tenant_name),
  min(created_at),
  max(updated_at)
FROM public.leases
WHERE length(trim(coalesce(tenant_name, ''))) > 0
GROUP BY organization_id, trim(tenant_name);

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  legal_name,
  party_type,
  created_at,
  updated_at
)
SELECT
  person_id,
  organization_id,
  tenant_name,
  tenant_name,
  'individual',
  created_at,
  updated_at
FROM people_leases_backfill_tenants;

INSERT INTO public.person_roles (
  organization_id,
  person_id,
  role,
  status,
  created_at,
  updated_at
)
SELECT
  organization_id,
  person_id,
  'tenant',
  'active',
  created_at,
  updated_at
FROM people_leases_backfill_tenants;

UPDATE public.leases AS leases
SET primary_tenant_person_id = tenants.person_id
FROM people_leases_backfill_tenants AS tenants
WHERE leases.organization_id = tenants.organization_id
  AND trim(leases.tenant_name) = tenants.tenant_name
  AND leases.primary_tenant_person_id IS NULL;

INSERT INTO public.lease_parties (
  organization_id,
  lease_id,
  person_id,
  party_role,
  is_primary,
  started_on,
  ended_on,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  leases.organization_id,
  leases.id,
  tenants.person_id,
  'primary_tenant',
  true,
  leases.lease_start_date,
  CASE
    WHEN leases.status IN ('ended', 'terminated', 'cancelled') THEN leases.lease_end_date
    ELSE NULL
  END,
  leases.created_at,
  leases.created_by,
  leases.updated_at,
  leases.updated_by,
  leases.archived_at,
  leases.archived_by
FROM public.leases AS leases
JOIN people_leases_backfill_tenants AS tenants
  ON tenants.organization_id = leases.organization_id
  AND tenants.tenant_name = trim(leases.tenant_name);

INSERT INTO public.lease_terms (
  organization_id,
  lease_id,
  term_sequence,
  start_date,
  end_date,
  rent_amount,
  rent_currency,
  rent_due_day,
  payment_frequency,
  status,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  organization_id,
  id,
  1,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
  extract(day from lease_start_date)::integer,
  'monthly',
  CASE
    WHEN status IN ('active', 'notice_given') THEN 'active'
    WHEN status = 'draft' THEN 'draft'
    WHEN status IN ('ended', 'cancelled') THEN 'expired'
    ELSE 'terminated'
  END,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
FROM public.leases;

WITH occupancy_source AS (
  SELECT
    leases.*,
    row_number() OVER (
      PARTITION BY leases.organization_id, leases.unit_id
      ORDER BY
        CASE
          WHEN leases.unit_id IS NOT NULL
            AND leases.archived_at IS NULL
            AND leases.status IN ('active', 'notice_given', 'draft')
          THEN 0
          ELSE 1
        END,
        leases.lease_start_date DESC,
        leases.created_at DESC,
        leases.id
    ) AS unit_rank
  FROM public.leases AS leases
)
INSERT INTO public.lease_occupancies (
  organization_id,
  lease_id,
  property_id,
  unit_id,
  status,
  scheduled_move_in_date,
  actual_move_in_date,
  notice_date,
  scheduled_move_out_date,
  actual_move_out_date,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  organization_id,
  id,
  property_id,
  unit_id,
  CASE
    WHEN unit_id IS NOT NULL
      AND unit_rank > 1
      AND status IN ('active', 'notice_given', 'draft')
    THEN 'vacated'
    WHEN status = 'notice_given' THEN 'notice_given'
    WHEN status IN ('ended', 'terminated', 'cancelled') THEN 'vacated'
    WHEN status = 'draft' THEN 'reserved'
    ELSE 'occupied'
  END,
  lease_start_date,
  lease_start_date,
  CASE WHEN status = 'notice_given' THEN least(current_date, lease_end_date) ELSE NULL END,
  lease_end_date,
  CASE
    WHEN status IN ('ended', 'terminated', 'cancelled') THEN lease_end_date
    WHEN unit_id IS NOT NULL
      AND unit_rank > 1
      AND status IN ('active', 'notice_given', 'draft')
    THEN lease_end_date
    ELSE NULL
  END,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
FROM occupancy_source;

INSERT INTO public.lease_deposits (
  organization_id,
  lease_id,
  deposit_type,
  amount,
  currency,
  status,
  received_on,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
)
SELECT
  organization_id,
  id,
  'security',
  deposit_amount,
  coalesce(deposit_currency, monthly_rent_currency),
  'held',
  lease_start_date,
  created_at,
  created_by,
  updated_at,
  updated_by,
  archived_at,
  archived_by
FROM public.leases
WHERE deposit_amount IS NOT NULL;

INSERT INTO public.activity_logs (
  organization_id,
  actor_id,
  entity_type,
  entity_id,
  action,
  new_values
)
SELECT
  leases.organization_id,
  NULL,
  'people_leases_backfill',
  leases.organization_id,
  'people_leases_backfilled',
  jsonb_build_object(
    'people_count', count(DISTINCT tenants.person_id),
    'lease_count', count(DISTINCT leases.id),
    'source', 'tenant_name compatibility migration'
  )
FROM public.leases AS leases
JOIN people_leases_backfill_tenants AS tenants
  ON tenants.organization_id = leases.organization_id
  AND tenants.tenant_name = trim(leases.tenant_name)
GROUP BY leases.organization_id;

CREATE OR REPLACE FUNCTION public.ensure_lease_primary_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  linked_person_id uuid;
  should_sync boolean := false;
BEGIN
  IF current_setting('app.people_leases_skip_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    should_sync := true;
  ELSE
    should_sync := NEW.primary_tenant_person_id IS NULL
      OR NEW.tenant_name IS DISTINCT FROM OLD.tenant_name;
  END IF;

  IF should_sync THEN
    SELECT id
    INTO linked_person_id
    FROM public.people
    WHERE organization_id = NEW.organization_id
      AND display_name = trim(NEW.tenant_name)
      AND archived_at IS NULL
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    IF linked_person_id IS NULL THEN
      INSERT INTO public.people (
        organization_id,
        display_name,
        legal_name,
        party_type,
        created_by,
        updated_by
      )
      VALUES (
        NEW.organization_id,
        trim(NEW.tenant_name),
        trim(NEW.tenant_name),
        'individual',
        (SELECT auth.uid()),
        (SELECT auth.uid())
      )
      RETURNING id INTO linked_person_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.person_roles
      WHERE organization_id = NEW.organization_id
        AND person_id = linked_person_id
        AND role = 'tenant'
        AND status = 'active'
        AND archived_at IS NULL
    ) THEN
      INSERT INTO public.person_roles (
        organization_id,
        person_id,
        role,
        status,
        created_by,
        updated_by
      )
      VALUES (
        NEW.organization_id,
        linked_person_id,
        'tenant',
        'active',
        (SELECT auth.uid()),
        (SELECT auth.uid())
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.person_contacts
      WHERE organization_id = NEW.organization_id
        AND person_id = linked_person_id
        AND is_primary
        AND archived_at IS NULL
    ) THEN
      INSERT INTO public.person_contacts (
        organization_id,
        person_id,
        contact_name,
        contact_type,
        is_primary,
        notes,
        created_by,
        updated_by
      )
      VALUES (
        NEW.organization_id,
        linked_person_id,
        trim(NEW.tenant_name),
        'general',
        true,
        'Created from lease tenant name.',
        (SELECT auth.uid()),
        (SELECT auth.uid())
      );
    END IF;

    NEW.primary_tenant_person_id := linked_person_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lease_backbone_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  existing_deposit_id uuid;
  existing_occupancy_id uuid;
  existing_party_id uuid;
  lease_party_ended_on date;
  occupancy_actual_move_out date;
  occupancy_notice_date date;
  occupancy_status text;
  term_status text;
BEGIN
  IF current_setting('app.people_leases_skip_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  lease_party_ended_on := CASE
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN NEW.lease_end_date
    ELSE NULL
  END;
  term_status := CASE
    WHEN NEW.status IN ('active', 'notice_given') THEN 'active'
    WHEN NEW.status = 'draft' THEN 'draft'
    WHEN NEW.status IN ('ended', 'cancelled') THEN 'expired'
    ELSE 'terminated'
  END;
  occupancy_status := CASE
    WHEN NEW.status = 'notice_given' THEN 'notice_given'
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN 'vacated'
    WHEN NEW.status = 'draft' THEN 'reserved'
    ELSE 'occupied'
  END;
  occupancy_notice_date := CASE
    WHEN NEW.status = 'notice_given' THEN least(current_date, NEW.lease_end_date)
    ELSE NULL
  END;
  occupancy_actual_move_out := CASE
    WHEN NEW.status IN ('ended', 'terminated', 'cancelled') THEN NEW.lease_end_date
    ELSE NULL
  END;

  SELECT id
  INTO existing_party_id
  FROM public.lease_parties
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND party_role = 'primary_tenant'
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF existing_party_id IS NULL THEN
    INSERT INTO public.lease_parties (
      organization_id,
      lease_id,
      person_id,
      party_role,
      is_primary,
      started_on,
      ended_on,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.primary_tenant_person_id,
      'primary_tenant',
      true,
      NEW.lease_start_date,
      lease_party_ended_on,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_parties
    SET
      person_id = NEW.primary_tenant_person_id,
      is_primary = true,
      started_on = NEW.lease_start_date,
      ended_on = lease_party_ended_on,
      updated_by = (SELECT auth.uid())
    WHERE id = existing_party_id
      AND organization_id = NEW.organization_id;
  END IF;

  INSERT INTO public.lease_terms (
    organization_id,
    lease_id,
    term_sequence,
    start_date,
    end_date,
    rent_amount,
    rent_currency,
    rent_due_day,
    payment_frequency,
    status,
    created_by,
    updated_by,
    archived_at,
    archived_by
  )
  VALUES (
    NEW.organization_id,
    NEW.id,
    1,
    NEW.lease_start_date,
    NEW.lease_end_date,
    NEW.monthly_rent_amount,
    NEW.monthly_rent_currency,
    extract(day from NEW.lease_start_date)::integer,
    'monthly',
    term_status,
    (SELECT auth.uid()),
    (SELECT auth.uid()),
    NEW.archived_at,
    NEW.archived_by
  )
  ON CONFLICT ON CONSTRAINT lease_terms_sequence_unique
  DO UPDATE SET
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    rent_amount = EXCLUDED.rent_amount,
    rent_currency = EXCLUDED.rent_currency,
    rent_due_day = EXCLUDED.rent_due_day,
    payment_frequency = EXCLUDED.payment_frequency,
    status = EXCLUDED.status,
    updated_by = (SELECT auth.uid()),
    archived_at = EXCLUDED.archived_at,
    archived_by = EXCLUDED.archived_by;

  SELECT id
  INTO existing_occupancy_id
  FROM public.lease_occupancies
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF existing_occupancy_id IS NULL THEN
    INSERT INTO public.lease_occupancies (
      organization_id,
      lease_id,
      property_id,
      unit_id,
      status,
      scheduled_move_in_date,
      actual_move_in_date,
      notice_date,
      scheduled_move_out_date,
      actual_move_out_date,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.property_id,
      NEW.unit_id,
      occupancy_status,
      NEW.lease_start_date,
      NEW.lease_start_date,
      occupancy_notice_date,
      NEW.lease_end_date,
      occupancy_actual_move_out,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_occupancies
    SET
      property_id = NEW.property_id,
      unit_id = NEW.unit_id,
      status = occupancy_status,
      scheduled_move_in_date = NEW.lease_start_date,
      actual_move_in_date = NEW.lease_start_date,
      notice_date = occupancy_notice_date,
      scheduled_move_out_date = NEW.lease_end_date,
      actual_move_out_date = occupancy_actual_move_out,
      updated_by = (SELECT auth.uid())
    WHERE id = existing_occupancy_id
      AND organization_id = NEW.organization_id;
  END IF;

  SELECT id
  INTO existing_deposit_id
  FROM public.lease_deposits
  WHERE organization_id = NEW.organization_id
    AND lease_id = NEW.id
    AND deposit_type = 'security'
    AND archived_at IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF NEW.deposit_amount IS NULL THEN
    IF existing_deposit_id IS NOT NULL THEN
      UPDATE public.lease_deposits
      SET
        archived_at = now(),
        archived_by = (SELECT auth.uid()),
        updated_by = (SELECT auth.uid())
      WHERE id = existing_deposit_id
        AND organization_id = NEW.organization_id;
    END IF;
  ELSIF existing_deposit_id IS NULL THEN
    INSERT INTO public.lease_deposits (
      organization_id,
      lease_id,
      deposit_type,
      amount,
      currency,
      status,
      received_on,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      'security',
      NEW.deposit_amount,
      coalesce(NEW.deposit_currency, NEW.monthly_rent_currency),
      'held',
      NEW.lease_start_date,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  ELSE
    UPDATE public.lease_deposits
    SET
      amount = NEW.deposit_amount,
      currency = coalesce(NEW.deposit_currency, NEW.monthly_rent_currency),
      received_on = coalesce(received_on, NEW.lease_start_date),
      updated_by = (SELECT auth.uid())
    WHERE id = existing_deposit_id
      AND organization_id = NEW.organization_id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    NEW.organization_id,
    (SELECT auth.uid()),
    'lease',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'lease_created' ELSE 'lease_updated' END,
    CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'tenant_name', OLD.tenant_name,
        'property_id', OLD.property_id,
        'unit_id', OLD.unit_id,
        'lease_start_date', OLD.lease_start_date,
        'lease_end_date', OLD.lease_end_date,
        'monthly_rent_amount', OLD.monthly_rent_amount,
        'monthly_rent_currency', OLD.monthly_rent_currency,
        'deposit_amount', OLD.deposit_amount,
        'deposit_currency', OLD.deposit_currency,
        'status', OLD.status
      )
      ELSE NULL
    END,
    jsonb_build_object(
      'tenant_name', NEW.tenant_name,
      'primary_tenant_person_id', NEW.primary_tenant_person_id,
      'property_id', NEW.property_id,
      'unit_id', NEW.unit_id,
      'lease_start_date', NEW.lease_start_date,
      'lease_end_date', NEW.lease_end_date,
      'monthly_rent_amount', NEW.monthly_rent_amount,
      'monthly_rent_currency', NEW.monthly_rent_currency,
      'deposit_amount', NEW.deposit_amount,
      'deposit_currency', NEW.deposit_currency,
      'status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_leases_primary_tenant
BEFORE INSERT OR UPDATE OF tenant_name, primary_tenant_person_id ON public.leases
FOR EACH ROW EXECUTE FUNCTION public.ensure_lease_primary_tenant();

CREATE TRIGGER sync_leases_backbone_records
AFTER INSERT OR UPDATE OF
  tenant_name,
  primary_tenant_person_id,
  property_id,
  unit_id,
  lease_start_date,
  lease_end_date,
  monthly_rent_amount,
  monthly_rent_currency,
  deposit_amount,
  deposit_currency,
  status,
  archived_at,
  archived_by
ON public.leases
FOR EACH ROW EXECUTE FUNCTION public.sync_lease_backbone_records();

REVOKE ALL ON FUNCTION public.ensure_lease_primary_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_lease_backbone_records() FROM PUBLIC;
