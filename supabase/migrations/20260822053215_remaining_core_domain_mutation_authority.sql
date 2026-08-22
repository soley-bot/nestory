CREATE FUNCTION app_private.assert_property_permission(
  p_organization_id uuid,
  p_property_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_branch_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT property.branch_id
  INTO v_branch_id
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id;

  IF NOT app_private.can_access_property(
      p_organization_id,
      p_property_id,
      p_permission_key
    ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor_id;
END;
$$;

-- Tenant requests currently have no public checked mutation contract. Contain
-- the legacy direct-write surface until that workflow is introduced; reads
-- retain their separately-scoped maintenance policies.
REVOKE INSERT,UPDATE,DELETE ON TABLE public.tenant_requests
  FROM anon,authenticated;

COMMENT ON FUNCTION app_private.assert_property_permission(
  uuid,
  uuid,
  public.organization_permission_key
) IS
  'Requires the exact permission plus the Property active branch from one committed authorization snapshot. Unresolved, inactive, cross-organization, and cross-branch scope is denied.';

CREATE FUNCTION app_private.assert_person_permission(
  p_organization_id uuid,
  p_person_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_branch_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.user_id = v_actor_id
      AND member.role = 'super_admin'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      WHERE person.organization_id = p_organization_id
        AND person.id = p_person_id
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN v_actor_id;
  END IF;

  v_branch_id := app_private.current_active_branch_id(p_organization_id);
  IF v_branch_id IS NULL
    OR NOT app_private.has_org_permission(p_organization_id, p_permission_key)
    OR NOT EXISTS (
      SELECT 1
      FROM public.person_branch_relationships AS relationship
      JOIN public.organization_branches AS branch
        ON branch.organization_id = relationship.organization_id
       AND branch.id = relationship.branch_id
       AND branch.status = 'active'
       AND branch.archived_at IS NULL
      WHERE relationship.organization_id = p_organization_id
        AND relationship.person_id = p_person_id
        AND relationship.branch_id = v_branch_id
        AND relationship.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor_id;
END;
$$;

COMMENT ON FUNCTION app_private.assert_person_permission(
  uuid,
  uuid,
  public.organization_permission_key
) IS
  'Requires the exact permission plus an explicit active Person relationship from one committed authorization snapshot. Super Admin remains organization-wide.';

-- Preserve the checked mutation bodies and their lifecycle/dependency guards while
-- replacing only the obsolete fixed-role predicate. Fail closed if the expected
-- predecessor body is not present.
DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_replacement text;
  v_old_predicate text :=
    '  IF NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.set_property_rental_structure(uuid,uuid,text)'::regprocedure,
    'public.update_property_details(uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric)'::regprocedure,
    'public.archive_property(uuid,uuid)'::regprocedure,
    'public.restore_property(uuid,uuid)'::regprocedure,
    'public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])'::regprocedure,
    'public.archive_person(uuid,uuid)'::regprocedure,
    'public.restore_person(uuid,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);

    IF pg_catalog.strpos(v_definition, v_old_predicate) = 0 THEN
      RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function
        USING ERRCODE = '55000';
    END IF;

    IF v_function IN (
      'public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])'::regprocedure,
      'public.archive_person(uuid,uuid)'::regprocedure,
      'public.restore_person(uuid,uuid)'::regprocedure
    ) THEN
      v_replacement :=
        '  PERFORM app_private.assert_person_permission(' || chr(10) ||
        '    p_organization_id,' || chr(10) ||
        '    p_person_id,' || chr(10) ||
        CASE
          WHEN v_function IN (
            'public.archive_person(uuid,uuid)'::regprocedure,
            'public.restore_person(uuid,uuid)'::regprocedure
          ) THEN '    ''people.archive''::public.organization_permission_key' || chr(10)
          ELSE '    ''people.write''::public.organization_permission_key' || chr(10)
        END ||
        '  );';
    ELSE
      v_replacement :=
        '  PERFORM app_private.assert_property_permission(' || chr(10) ||
        '    p_organization_id,' || chr(10) ||
        '    p_property_id,' || chr(10) ||
        CASE
          WHEN v_function IN (
            'public.archive_property(uuid,uuid)'::regprocedure,
            'public.restore_property(uuid,uuid)'::regprocedure
          ) THEN '    ''properties.archive''::public.organization_permission_key' || chr(10)
          ELSE '    ''properties.write''::public.organization_permission_key' || chr(10)
        END ||
        '  );';
    END IF;

    EXECUTE pg_catalog.replace(v_definition, v_old_predicate, v_replacement);
  END LOOP;
END;
$$;

ALTER FUNCTION public.set_property_rental_structure(uuid,uuid,text)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_property_details(
  uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric
)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.archive_property(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.restore_property(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_person(
  uuid,uuid,text,text,text,text,text,text,text,text[]
)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_person(
  uuid,uuid,text,text,text,text,text,text,text,text[],text,date,date
)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.archive_person(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.restore_person(uuid,uuid)
  SECURITY DEFINER SET search_path='';

REVOKE ALL ON FUNCTION app_private.assert_property_permission(
  uuid,uuid,public.organization_permission_key
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_person_permission(
  uuid,uuid,public.organization_permission_key
) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.set_property_rental_structure(uuid,uuid,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.set_property_rental_structure(uuid,uuid,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.update_property_details(
  uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_property_details(
  uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric
) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_property(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.archive_property(uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.restore_property(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.restore_property(uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.update_person(
  uuid,uuid,text,text,text,text,text,text,text,text[]
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_person(
  uuid,uuid,text,text,text,text,text,text,text,text[]
) TO authenticated;
REVOKE ALL ON FUNCTION public.update_person(
  uuid,uuid,text,text,text,text,text,text,text,text[],text,date,date
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_person(
  uuid,uuid,text,text,text,text,text,text,text,text[],text,date,date
) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_person(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.archive_person(uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.restore_person(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.restore_person(uuid,uuid)
  TO authenticated;

CREATE FUNCTION app_private.assert_asset_photo_permission(
  p_organization_id uuid,
  p_photo_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
BEGIN
  SELECT photo.property_id
  INTO v_property_id
  FROM public.asset_photos AS photo
  WHERE photo.organization_id = p_organization_id
    AND photo.id = p_photo_id;

  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.assert_property_permission(
    p_organization_id,
    v_property_id,
    p_permission_key
  );
END;
$$;

COMMENT ON FUNCTION app_private.assert_asset_photo_permission(
  uuid,
  uuid,
  public.organization_permission_key
) IS
  'Resolves an asset through its Property and requires the exact Property permission and active branch. Missing or unresolved assets are denied without exposing identifiers.';

DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_replacement text;
  v_old_predicate text :=
    '  IF NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.create_asset_photo(uuid,uuid,uuid,text,text,text,bigint,text,boolean,date)'::regprocedure,
    'public.set_asset_photo_cover(uuid,uuid)'::regprocedure,
    'public.archive_asset_photo(uuid,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);
    IF pg_catalog.strpos(v_definition, v_old_predicate) = 0 THEN
      RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function
        USING ERRCODE = '55000';
    END IF;

    IF v_function =
      'public.create_asset_photo(uuid,uuid,uuid,text,text,text,bigint,text,boolean,date)'::regprocedure
    THEN
      v_replacement :=
        '  PERFORM app_private.assert_property_permission(' || chr(10) ||
        '    p_organization_id,' || chr(10) ||
        '    p_property_id,' || chr(10) ||
        '    ''properties.write''::public.organization_permission_key' || chr(10) ||
        '  );';
    ELSE
      v_replacement :=
        '  PERFORM app_private.assert_asset_photo_permission(' || chr(10) ||
        '    p_organization_id,' || chr(10) ||
        '    p_photo_id,' || chr(10) ||
        CASE
          WHEN v_function = 'public.archive_asset_photo(uuid,uuid)'::regprocedure
            THEN '    ''properties.archive''::public.organization_permission_key' || chr(10)
          ELSE '    ''properties.write''::public.organization_permission_key' || chr(10)
        END ||
        '  );';
    END IF;

    EXECUTE pg_catalog.replace(v_definition, v_old_predicate, v_replacement);
  END LOOP;
END;
$$;

ALTER FUNCTION public.create_asset_photo(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.set_asset_photo_cover(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.archive_asset_photo(uuid,uuid)
  SECURITY DEFINER SET search_path='';

REVOKE ALL ON FUNCTION app_private.assert_asset_photo_permission(
  uuid,uuid,public.organization_permission_key
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.asset_photos
  FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.create_asset_photo(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_asset_photo(
  uuid,uuid,uuid,text,text,text,bigint,text,boolean,date
) TO authenticated;
REVOKE ALL ON FUNCTION public.set_asset_photo_cover(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.set_asset_photo_cover(uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.archive_asset_photo(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.archive_asset_photo(uuid,uuid)
  TO authenticated;

CREATE FUNCTION app_private.assert_lease_permission(
  p_organization_id uuid,
  p_lease_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
BEGIN
  SELECT lease.property_id
  INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;

  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.assert_property_permission(
    p_organization_id,
    v_property_id,
    p_permission_key
  );
END;
$$;

COMMENT ON FUNCTION app_private.assert_lease_permission(
  uuid,
  uuid,
  public.organization_permission_key
) IS
  'Resolves a Lease through its Property and requires the exact Lease permission and active Property branch. Missing and unresolved Lease scope is denied.';

DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old_predicate text :=
    '  IF NOT app_private.can_configure_leases(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_replacement text :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.archive''::public.organization_permission_key' || chr(10) ||
    '  );';
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.archive_lease(uuid,uuid)'::regprocedure,
    'public.restore_lease(uuid,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function);
    IF pg_catalog.strpos(v_definition, v_old_predicate) = 0 THEN
      RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function
        USING ERRCODE = '55000';
    END IF;
    EXECUTE pg_catalog.replace(v_definition, v_old_predicate, v_replacement);
  END LOOP;
END;
$$;

ALTER FUNCTION public.archive_lease(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.restore_lease(uuid,uuid)
  SECURITY DEFINER SET search_path='';

REVOKE ALL ON FUNCTION app_private.assert_lease_permission(
  uuid,uuid,public.organization_permission_key
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.leases
  FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.lease_parties
  FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.lease_occupancies
  FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.lease_occupancy_participants
  FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.lease_terms
  FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.lease_billing_terms
  FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.archive_lease(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.archive_lease(uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.restore_lease(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.restore_lease(uuid,uuid)
  TO authenticated;

CREATE FUNCTION app_private.assert_person_in_property_branch(
  p_organization_id uuid,
  p_property_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_branch_id uuid;
BEGIN
  IF p_person_id IS NULL THEN
    RETURN;
  END IF;

  SELECT property.branch_id
  INTO v_branch_id
  FROM public.properties AS property
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = p_organization_id
      AND member.user_id = v_actor_id
      AND member.role = 'super_admin'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.people AS person
      WHERE person.organization_id = p_organization_id
        AND person.id = p_person_id
    ) THEN
      RETURN;
    END IF;
  ELSIF v_branch_id IS NOT NULL
    AND app_private.current_active_branch_id(p_organization_id) = v_branch_id
    AND EXISTS (
      SELECT 1
      FROM public.person_branch_relationships AS relationship
      WHERE relationship.organization_id = p_organization_id
        AND relationship.person_id = p_person_id
        AND relationship.branch_id = v_branch_id
        AND relationship.archived_at IS NULL
    ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION app_private.assert_person_in_property_branch(uuid,uuid,uuid)
IS 'Requires an ordinary relationship Person to share the exact active Property branch. Super Admin retains organization-wide Person relationships.';

DO $$
DECLARE
  v_function constant regprocedure :=
    'public.update_property_details(uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_anchor text :=
    '  PERFORM app_private.assert_property_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_property_id,' || chr(10) ||
    '    ''properties.write''::public.organization_permission_key' || chr(10) ||
    '  );';
  v_replacement text;
BEGIN
  IF pg_catalog.strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION 'Expected Property authority anchor is missing from %', v_function
      USING ERRCODE = '55000';
  END IF;
  v_replacement := v_anchor || chr(10) ||
    '  PERFORM app_private.assert_person_in_property_branch(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_property_id,' || chr(10) ||
    '    p_owner_person_id' || chr(10) ||
    '  );';
  EXECUTE pg_catalog.replace(v_definition, v_anchor, v_replacement);
END;
$$;

ALTER FUNCTION public.update_property_details(
  uuid,uuid,text,text,text,text,text,text,date,date,text,uuid,date,numeric
) SECURITY DEFINER SET search_path='';
REVOKE ALL ON FUNCTION app_private.assert_person_in_property_branch(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.property_owners
  FROM anon,authenticated;

DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_function :=
    'public.create_property_lease(uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF v_actor_id IS NULL' || chr(10) ||
    '    OR NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_property_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_property_id,' || chr(10) ||
    '    ''leases.prepare''::public.organization_permission_key' || chr(10) ||
    '  );' || chr(10) ||
    '  PERFORM app_private.assert_person_in_property_branch(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_property_id,' || chr(10) ||
    '    p_primary_tenant_person_id' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function
      USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function :=
    'public.update_lease_with_authoritative_term(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF (SELECT auth.uid()) IS NULL' || chr(10) ||
    '    OR NOT app_private.can_configure_leases(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.change_terms''::public.organization_permission_key' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function
      USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function :=
    'public.request_lease_activation(uuid,uuid,text,uuid,date,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.activate''::public.organization_permission_key' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function
      USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function :=
    'public.transition_lease_lifecycle(uuid,uuid,text,uuid,text,date,date,text,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    CASE WHEN v_transition = ''activate''' || chr(10) ||
    '      THEN ''leases.activate''::public.organization_permission_key' || chr(10) ||
    '      ELSE ''leases.close''::public.organization_permission_key' || chr(10) ||
    '    END' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function
      USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$$;

ALTER FUNCTION public.create_property_lease(
  uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,
  numeric,public.currency_code,text,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_lease_with_authoritative_term(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.request_lease_activation(uuid,uuid,text,uuid,date,text)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.transition_lease_lifecycle(
  uuid,uuid,text,uuid,text,date,date,text,text
) SECURITY DEFINER SET search_path='';

REVOKE ALL ON FUNCTION public.create_property_lease(
  uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,
  numeric,public.currency_code,text,text
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_property_lease(
  uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,
  numeric,public.currency_code,text,text
) TO authenticated;
REVOKE ALL ON FUNCTION public.update_lease_with_authoritative_term(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,text
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_lease_with_authoritative_term(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,text
) TO authenticated;
REVOKE ALL ON FUNCTION public.request_lease_activation(uuid,uuid,text,uuid,date,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.request_lease_activation(uuid,uuid,text,uuid,date,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.transition_lease_lifecycle(
  uuid,uuid,text,uuid,text,date,date,text,text
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.transition_lease_lifecycle(
  uuid,uuid,text,uuid,text,date,date,text,text
) TO authenticated;

CREATE TABLE app_private.lease_lifecycle_authority_tokens (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  organization_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  PRIMARY KEY (backend_pid, transaction_id, organization_id, lease_id)
);

CREATE FUNCTION app_private.assert_lease_term_permission(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app_private.lease_lifecycle_authority_tokens AS token
    WHERE token.backend_pid = pg_catalog.pg_backend_pid()
      AND token.transaction_id = pg_catalog.txid_current()
      AND token.organization_id = p_organization_id
      AND token.lease_id = p_lease_id
  ) THEN
    RETURN v_actor_id;
  END IF;

  RETURN app_private.assert_lease_permission(
    p_organization_id,
    p_lease_id,
    'leases.change_terms'::public.organization_permission_key
  );
END;
$$;

CREATE FUNCTION app_private.assert_lease_creation_scope(
  p_organization_id uuid,
  p_property_id uuid,
  p_primary_tenant_person_id uuid,
  p_relationship_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_participant jsonb;
BEGIN
  PERFORM app_private.assert_property_permission(
    p_organization_id,
    p_property_id,
    'leases.prepare'::public.organization_permission_key
  );
  PERFORM app_private.assert_person_in_property_branch(
    p_organization_id,
    p_property_id,
    p_primary_tenant_person_id
  );

  IF pg_catalog.jsonb_typeof(p_relationship_payload -> 'participants') = 'array'
  THEN
    FOR v_participant IN
      SELECT participant.value
      FROM pg_catalog.jsonb_array_elements(
        p_relationship_payload -> 'participants'
      ) AS participant(value)
    LOOP
      PERFORM app_private.assert_person_in_property_branch(
        p_organization_id,
        p_property_id,
        NULLIF(v_participant ->> 'personId', '')::uuid
      );
    END LOOP;
  END IF;
END;
$$;

CREATE FUNCTION app_private.assert_activation_schedule_permission(
  p_organization_id uuid,
  p_schedule_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease_id uuid;
BEGIN
  SELECT schedule.lease_id
  INTO v_lease_id
  FROM public.lease_activation_schedules AS schedule
  WHERE schedule.organization_id = p_organization_id
    AND schedule.id = p_schedule_id;

  IF v_lease_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN app_private.assert_lease_permission(
    p_organization_id,
    v_lease_id,
    'leases.activate'::public.organization_permission_key
  );
END;
$$;

CREATE FUNCTION app_private.assert_person_in_lease_branch(
  p_organization_id uuid,
  p_lease_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
BEGIN
  IF p_person_id IS NULL THEN
    RETURN;
  END IF;

  SELECT lease.property_id
  INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;

  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM app_private.assert_person_in_property_branch(
    p_organization_id,
    v_property_id,
    p_person_id
  );
END;
$$;

DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_function :=
    'public.create_lease_with_relationships(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF (SELECT auth.uid()) IS NULL' || chr(10) ||
    '    OR NOT app_private.can_configure_leases(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_creation_scope(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_property_id,' || chr(10) ||
    '    p_primary_tenant_person_id,' || chr(10) ||
    '    p_relationship_payload' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function := 'public.cancel_lease_activation(uuid,uuid)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_activation_schedule_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_schedule_id' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function :=
    'public.create_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF auth.uid() IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_term_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function :=
    'public.correct_authoritative_lease_term(uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF v_actor_id IS NULL' || chr(10) ||
    '    OR NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.change_terms''::public.organization_permission_key' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function USING ERRCODE='55000';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);
  v_definition := pg_catalog.replace(
    v_definition,
    'DECLARE' || chr(10) ||
    '  v_actor_id uuid := (SELECT auth.uid());' || chr(10) ||
    'BEGIN',
    'BEGIN'
  );
  EXECUTE v_definition;

  v_function :=
    'public.schedule_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,uuid,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF v_actor_id IS NULL' || chr(10) ||
    '    OR NOT app_private.can_configure_leases(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.change_terms''::public.organization_permission_key' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function :=
    'public.record_current_lease_occupancy_evidence(uuid,uuid,uuid,date,date,date,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF NOT app_private.can_configure_leases(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.change_terms''::public.organization_permission_key' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);

  v_function :=
    'public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_old :=
    '  IF v_actor_id IS NULL' || chr(10) ||
    '    OR NOT app_private.can_configure_leases(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.change_terms''::public.organization_permission_key' || chr(10) ||
    '  );' || chr(10) ||
    '  PERFORM app_private.assert_person_in_lease_branch(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    p_billing_recipient_person_id' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected fixed-role predicate is missing from %', v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old, v_new);
END;
$$;

-- The checked lifecycle routine may call the public authoritative-term routine.
-- A private transaction-scoped token preserves that call chain without granting
-- standalone term mutation to an activate/close-only actor.
DO $$
DECLARE
  v_function constant regprocedure :=
    'public.transition_lease_lifecycle(uuid,uuid,text,uuid,text,date,date,text,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_anchor text := '  IF v_transition = ''activate'' THEN';
  v_insert text :=
    '  INSERT INTO app_private.lease_lifecycle_authority_tokens(' || chr(10) ||
    '    backend_pid,transaction_id,organization_id,lease_id' || chr(10) ||
    '  ) VALUES (' || chr(10) ||
    '    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),' || chr(10) ||
    '    p_organization_id,p_lease_id' || chr(10) ||
    '  ) ON CONFLICT DO NOTHING;' || chr(10) || chr(10) ||
    v_anchor;
  v_return_anchor text := '  RETURN jsonb_build_object(';
  v_delete text :=
    '  DELETE FROM app_private.lease_lifecycle_authority_tokens AS token' || chr(10) ||
    '  WHERE token.backend_pid=pg_catalog.pg_backend_pid()' || chr(10) ||
    '    AND token.transaction_id=pg_catalog.txid_current()' || chr(10) ||
    '    AND token.organization_id=p_organization_id' || chr(10) ||
    '    AND token.lease_id=p_lease_id;' || chr(10) || chr(10) ||
    v_return_anchor;
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0
    OR pg_catalog.strpos(v_definition,v_return_anchor)=0 THEN
    RAISE EXCEPTION 'Expected lifecycle token anchors are missing from %',v_function USING ERRCODE='55000';
  END IF;
  v_definition := pg_catalog.replace(v_definition,v_anchor,v_insert);
  v_definition := pg_catalog.replace(v_definition,v_return_anchor,v_delete);
  EXECUTE v_definition;
END;
$$;

ALTER FUNCTION public.create_lease_with_relationships(
  uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,
  numeric,public.currency_code,text,jsonb,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.cancel_lease_activation(uuid,uuid) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.create_authoritative_lease_term(
  uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.correct_authoritative_lease_term(
  uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.schedule_authoritative_lease_term(
  uuid,uuid,date,date,numeric,public.currency_code,integer,text,uuid,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.record_current_lease_occupancy_evidence(
  uuid,uuid,uuid,date,date,date,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.set_lease_billing_term(
  uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.transition_lease_lifecycle(
  uuid,uuid,text,uuid,text,date,date,text,text
) SECURITY DEFINER SET search_path='';

REVOKE ALL ON TABLE app_private.lease_lifecycle_authority_tokens
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_lease_term_permission(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_lease_creation_scope(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_activation_schedule_permission(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_person_in_lease_branch(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.create_lease_with_relationships(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure,
    'public.cancel_lease_activation(uuid,uuid)'::regprocedure,
    'public.create_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure,
    'public.correct_authoritative_lease_term(uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,text)'::regprocedure,
    'public.schedule_authoritative_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,uuid,text)'::regprocedure,
    'public.record_current_lease_occupancy_evidence(uuid,uuid,uuid,date,date,date,text)'::regprocedure,
    'public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)'::regprocedure
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',v_function);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated',v_function);
  END LOOP;
END;
$$;

-- This routine is a low-level checked writer used by higher-level Lease
-- transitions and corrections. Preserve its internal-only Data API contract.
REVOKE ALL ON FUNCTION public.create_authoritative_lease_term(
  uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text
) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.assert_lease_edit_permission(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_branch_id uuid;
  v_lease_status text;
  v_permission_key public.organization_permission_key;
  v_property_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lease.property_id, property.branch_id
  INTO v_property_id, v_branch_id
  FROM public.leases AS lease
  JOIN public.properties AS property
    ON property.organization_id = lease.organization_id
   AND property.id = lease.property_id
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id;

  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,NULL,NULL
  );
  PERFORM app_private.lock_current_organization_membership(p_organization_id);
  IF v_branch_id IS NOT NULL THEN
    PERFORM app_private.lock_organization_authorization_scope(
      p_organization_id,v_branch_id,NULL
    );
  END IF;

  SELECT lease.status
  INTO v_lease_status
  FROM public.leases AS lease
  WHERE lease.organization_id = p_organization_id
    AND lease.id = p_lease_id
  FOR UPDATE;

  IF NOT FOUND OR v_property_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM term.id
  FROM public.lease_terms AS term
  WHERE term.organization_id = p_organization_id
    AND term.lease_id = p_lease_id
    AND term.authority_kind = 'authoritative'
    AND term.archived_at IS NULL
  ORDER BY term.id
  FOR SHARE;

  v_permission_key := CASE
    WHEN v_lease_status = 'draft'
      AND NOT EXISTS (
        SELECT 1
        FROM public.lease_terms AS term
        WHERE term.organization_id = p_organization_id
          AND term.lease_id = p_lease_id
          AND term.authority_kind = 'authoritative'
          AND term.archived_at IS NULL
          AND term.status IN ('active','upcoming')
      )
      THEN 'leases.prepare'::public.organization_permission_key
    ELSE 'leases.change_terms'::public.organization_permission_key
  END;

  IF NOT app_private.can_access_property(
    p_organization_id,
    v_property_id,
    v_permission_key
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor_id;
END;
$$;

COMMENT ON FUNCTION app_private.assert_lease_edit_permission(uuid,uuid)
IS 'Authorization-first Lease edit gate: draft preparation requires leases.prepare; non-draft or active/upcoming authoritative-term changes require leases.change_terms, always on the exact Property branch.';

DO $$
DECLARE
  v_function constant regprocedure :=
    'public.update_lease_with_authoritative_term(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.change_terms''::public.organization_permission_key' || chr(10) ||
    '  );';
  v_new text :=
    '  PERFORM app_private.assert_lease_edit_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id' || chr(10) ||
    '  );';
BEGIN
  IF pg_catalog.strpos(v_definition,v_old)=0 THEN
    RAISE EXCEPTION 'Expected Lease edit authority anchor is missing from %',v_function
      USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_old,v_new);
END;
$$;

ALTER FUNCTION public.update_lease_with_authoritative_term(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,text
) SECURITY DEFINER SET search_path='';
REVOKE ALL ON FUNCTION app_private.assert_lease_edit_permission(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE app_private.lease_checked_mutation_capabilities (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  lease_id uuid,
  capability text NOT NULL CHECK (capability IN ('create','update')),
  PRIMARY KEY (
    backend_pid,transaction_id,organization_id,property_id,capability
  )
);

CREATE FUNCTION app_private.assert_lease_mutation_capability(
  p_organization_id uuid,
  p_property_id uuid,
  p_lease_id uuid,
  p_capability text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app_private.lease_checked_mutation_capabilities AS capability
    WHERE capability.backend_pid=pg_catalog.pg_backend_pid()
      AND capability.transaction_id=pg_catalog.txid_current()
      AND capability.organization_id=p_organization_id
      AND capability.property_id=p_property_id
      AND capability.capability=p_capability
      AND CASE
        WHEN p_capability='create' THEN capability.lease_id IS NULL
        ELSE capability.lease_id=p_lease_id
      END
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  RETURN v_actor_id;
END;
$$;

CREATE FUNCTION app_private.run_checked_lease_relationship_creation(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_term_status text,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_lease_status text,
  p_relationship_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO app_private.lease_checked_mutation_capabilities(
    backend_pid,transaction_id,organization_id,property_id,lease_id,capability
  ) VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
    p_organization_id,p_property_id,NULL,'create'
  );

  v_result := app_private.create_lease_with_relationships_internal(
    p_organization_id,p_property_id,p_unit_id,p_primary_tenant_person_id,
    p_lease_start_date,p_lease_end_date,p_rent_amount,p_rent_currency,
    p_rent_due_day,p_payment_frequency,p_term_status,p_deposit_amount,
    p_deposit_currency,p_lease_status,p_relationship_payload,p_idempotency_key
  );

  DELETE FROM app_private.lease_checked_mutation_capabilities AS capability
  WHERE capability.backend_pid=pg_catalog.pg_backend_pid()
    AND capability.transaction_id=pg_catalog.txid_current()
    AND capability.organization_id=p_organization_id
    AND capability.property_id=p_property_id
    AND capability.capability='create';
  RETURN v_result;
END;
$$;

CREATE FUNCTION app_private.run_checked_lease_update(
  p_lease_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_primary_tenant_person_id uuid,
  p_lease_start_date date,
  p_lease_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_term_status text,
  p_deposit_amount numeric,
  p_deposit_currency public.currency_code,
  p_lease_status text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result uuid;
BEGIN
  INSERT INTO app_private.lease_checked_mutation_capabilities(
    backend_pid,transaction_id,organization_id,property_id,lease_id,capability
  ) VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
    p_organization_id,p_property_id,p_lease_id,'update'
  );

  v_result := app_private.update_lease_with_authoritative_term_internal(
    p_lease_id,p_organization_id,p_property_id,p_unit_id,
    p_primary_tenant_person_id,p_lease_start_date,p_lease_end_date,
    p_rent_amount,p_rent_currency,p_rent_due_day,p_payment_frequency,
    p_term_status,p_deposit_amount,p_deposit_currency,p_lease_status,
    p_idempotency_key
  );

  DELETE FROM app_private.lease_checked_mutation_capabilities AS capability
  WHERE capability.backend_pid=pg_catalog.pg_backend_pid()
    AND capability.transaction_id=pg_catalog.txid_current()
    AND capability.organization_id=p_organization_id
    AND capability.property_id=p_property_id
    AND capability.lease_id=p_lease_id
    AND capability.capability='update';
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.assert_lease_term_permission(
  p_organization_id uuid,
  p_lease_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_property_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM app_private.lease_lifecycle_authority_tokens AS token
    WHERE token.backend_pid=pg_catalog.pg_backend_pid()
      AND token.transaction_id=pg_catalog.txid_current()
      AND token.organization_id=p_organization_id
      AND token.lease_id=p_lease_id
  ) THEN
    RETURN v_actor_id;
  END IF;

  SELECT lease.property_id INTO v_property_id
  FROM public.leases AS lease
  WHERE lease.organization_id=p_organization_id AND lease.id=p_lease_id;
  IF v_property_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM app_private.lease_checked_mutation_capabilities AS capability
    WHERE capability.backend_pid=pg_catalog.pg_backend_pid()
      AND capability.transaction_id=pg_catalog.txid_current()
      AND capability.organization_id=p_organization_id
      AND capability.property_id=v_property_id
      AND (
        (capability.capability='create' AND capability.lease_id IS NULL)
        OR (capability.capability='update' AND capability.lease_id=p_lease_id)
      )
  ) THEN
    RETURN v_actor_id;
  END IF;

  RETURN app_private.assert_lease_permission(
    p_organization_id,p_lease_id,
    'leases.change_terms'::public.organization_permission_key
  );
END;
$$;

DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_function :=
    'public.create_lease_with_relationships(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_function);
  v_old:='RETURN app_private.create_lease_with_relationships_internal(';
  v_new:='RETURN app_private.run_checked_lease_relationship_creation(';
  IF pg_catalog.strpos(v_definition,v_old)=0 THEN
    RAISE EXCEPTION 'Expected Lease creation delegation is missing from %',v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_old,v_new);

  v_function :=
    'public.update_lease_with_authoritative_term(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_function);
  v_old:='app_private.update_lease_with_authoritative_term_internal(';
  v_new:='app_private.run_checked_lease_update(';
  IF pg_catalog.strpos(v_definition,v_old)=0 THEN
    RAISE EXCEPTION 'Expected Lease update delegation is missing from %',v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_old,v_new);

  FOREACH v_function IN ARRAY ARRAY[
    'app_private.create_lease_with_relationships_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure,
    'app_private.create_lease_core_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure
  ] LOOP
    v_definition:=pg_catalog.pg_get_functiondef(v_function);
    v_old:=
      '  IF v_actor_id IS NULL' || chr(10) ||
      '    OR NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
      '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
      '  END IF;';
    v_new:=
      '  PERFORM app_private.assert_lease_mutation_capability(' || chr(10) ||
      '    p_organization_id,p_property_id,NULL,''create''' || chr(10) ||
      '  );';
    IF pg_catalog.strpos(v_definition,v_old)=0 THEN
      RAISE EXCEPTION 'Expected nested Lease create predicate is missing from %',v_function USING ERRCODE='55000';
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_old,v_new);
  END LOOP;

  v_function :=
    'app_private.update_lease_with_authoritative_term_internal(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_function);
  v_old:=
    '  IF v_actor_id IS NULL' || chr(10) ||
    '    OR NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new:=
    '  PERFORM app_private.assert_lease_mutation_capability(' || chr(10) ||
    '    p_organization_id,p_property_id,p_lease_id,''update''' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition,v_old)=0 THEN
    RAISE EXCEPTION 'Expected nested Lease update predicate is missing from %',v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_old,v_new);

  v_function :=
    'app_private.create_authoritative_lease_term_internal(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_function);
  v_old:=
    '  IF v_actor_id IS NULL' || chr(10) ||
    '    OR NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new:=
    '  PERFORM app_private.assert_lease_term_permission(' || chr(10) ||
    '    p_organization_id,p_lease_id' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition,v_old)=0 THEN
    RAISE EXCEPTION 'Expected nested authoritative term predicate is missing from %',v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_old,v_new);

  v_function :=
    'app_private.create_authoritative_property_lease_term(uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,uuid,text)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_function);
  v_old:=
    '  IF v_actor_id IS NULL OR NOT app_private.is_org_admin(p_organization_id) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';' || chr(10) ||
    '  END IF;';
  v_new:=
    '  PERFORM app_private.assert_lease_term_permission(' || chr(10) ||
    '    p_organization_id,p_lease_id' || chr(10) ||
    '  );';
  IF pg_catalog.strpos(v_definition,v_old)=0 THEN
    RAISE EXCEPTION 'Expected nested Property term predicate is missing from %',v_function USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_old,v_new);
END;
$$;

ALTER FUNCTION public.create_lease_with_relationships(
  uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,
  numeric,public.currency_code,text,jsonb,text
) SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_lease_with_authoritative_term(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,text
) SECURITY DEFINER SET search_path='';

REVOKE ALL ON TABLE app_private.lease_checked_mutation_capabilities
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_lease_mutation_capability(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.run_checked_lease_relationship_creation(
  uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,
  numeric,public.currency_code,text,jsonb,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.run_checked_lease_update(
  uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,
  text,text,numeric,public.currency_code,text,text
) FROM PUBLIC,anon,authenticated,service_role;

-- Creating relationship evidence always prepares a Lease. Direct active-state
-- creation additionally exercises activation authority; every status that
-- represents or closes an effective relationship exercises close authority.
CREATE FUNCTION app_private.assert_lease_creation_status_permission(
  p_organization_id uuid,
  p_property_id uuid,
  p_lease_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease_status text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_lease_status,''::text))
  );
BEGIN
  CASE
    WHEN v_lease_status = 'draft' THEN
      NULL;
    WHEN v_lease_status = 'active' THEN
      PERFORM app_private.assert_property_permission(
        p_organization_id,
        p_property_id,
        'leases.activate'::public.organization_permission_key
      );
    WHEN v_lease_status IN (
      'cancelled','notice_given','ended','terminated'
    ) THEN
      PERFORM app_private.assert_property_permission(
        p_organization_id,
        p_property_id,
        'leases.close'::public.organization_permission_key
      );
    ELSE
      -- Preserve the canonical payload validator's status error contract.
      NULL;
  END CASE;
END;
$$;

DO $$
DECLARE
  v_function constant regprocedure :=
    'public.create_lease_with_relationships(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_anchor text :=
    '  PERFORM app_private.assert_lease_creation_scope(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_property_id,' || chr(10) ||
    '    p_primary_tenant_person_id,' || chr(10) ||
    '    p_relationship_payload' || chr(10) ||
    '  );';
  v_replacement text :=
    v_anchor || chr(10) ||
    '  PERFORM app_private.assert_lease_creation_status_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_property_id,' || chr(10) ||
    '    p_lease_status' || chr(10) ||
    '  );';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Expected Lease creation authority anchor is missing from %',v_function
      USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$$;

ALTER FUNCTION public.create_lease_with_relationships(
  uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,
  numeric,public.currency_code,text,jsonb,text
) SECURITY DEFINER SET search_path='';
REVOKE ALL ON FUNCTION app_private.assert_lease_creation_status_permission(
  uuid,uuid,text
) FROM PUBLIC,anon,authenticated,service_role;

-- Recording accepted current-occupancy evidence is part of activation, not a
-- commercial-term change. Keep the downstream lifecycle and evidence guards.
DO $$
DECLARE
  v_function constant regprocedure :=
    'public.record_current_lease_occupancy_evidence(uuid,uuid,uuid,date,date,date,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_old text :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.change_terms''::public.organization_permission_key' || chr(10) ||
    '  );';
  v_new text :=
    '  PERFORM app_private.assert_lease_permission(' || chr(10) ||
    '    p_organization_id,' || chr(10) ||
    '    p_lease_id,' || chr(10) ||
    '    ''leases.activate''::public.organization_permission_key' || chr(10) ||
    '  );';
BEGIN
  IF pg_catalog.strpos(v_definition,v_old)=0 THEN
    RAISE EXCEPTION 'Expected occupancy-evidence authority anchor is missing from %',v_function
      USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_old,v_new);
END;
$$;

ALTER FUNCTION public.record_current_lease_occupancy_evidence(
  uuid,uuid,uuid,date,date,date,text
) SECURITY DEFINER SET search_path='';

-- The checked import path is a separately guarded Super-Admin workflow. Give
-- each normalized Lease row the same exact branch/status checks before it may
-- mint the private nested-creation capability.
DO $$
DECLARE
  v_function constant regprocedure :=
    'app_private.commit_generic_import_run_internal(uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function);
  v_anchor text :=
    '      v_relationship_result :=' || chr(10) ||
    '        app_private.create_lease_with_relationships_internal(';
  v_replacement text :=
    '      PERFORM app_private.assert_lease_creation_scope(' || chr(10) ||
    '        p_organization_id,' || chr(10) ||
    '        (v_row.normalized_data ->> ''propertyId'')::uuid,' || chr(10) ||
    '        (v_row.normalized_data ->> ''tenantPersonId'')::uuid,' || chr(10) ||
    '        app_private.build_checked_lease_import_relationship_payload(' || chr(10) ||
    '          v_row.id,v_row.normalized_data' || chr(10) ||
    '        )' || chr(10) ||
    '      );' || chr(10) ||
    '      PERFORM app_private.assert_lease_creation_status_permission(' || chr(10) ||
    '        p_organization_id,' || chr(10) ||
    '        (v_row.normalized_data ->> ''propertyId'')::uuid,' || chr(10) ||
    '        v_row.normalized_data ->> ''status''' || chr(10) ||
    '      );' || chr(10) || chr(10) ||
    '      v_relationship_result :=' || chr(10) ||
    '        app_private.run_checked_lease_relationship_creation(';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Expected checked Lease import creation anchor is missing from %',v_function
      USING ERRCODE='55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$$;

ALTER FUNCTION app_private.commit_generic_import_run_internal(uuid,uuid)
  SECURITY DEFINER SET search_path='';
