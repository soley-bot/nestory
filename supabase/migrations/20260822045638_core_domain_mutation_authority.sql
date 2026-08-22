CREATE TABLE public.person_branch_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  person_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT person_branch_relationships_person_fk
    FOREIGN KEY (organization_id, person_id)
    REFERENCES public.people(organization_id, id),
  CONSTRAINT person_branch_relationships_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.organization_branches(organization_id, id),
  CONSTRAINT person_branch_relationships_archive_check
    CHECK ((archived_at IS NULL AND archived_by IS NULL) OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX person_branch_relationships_active_uidx
  ON public.person_branch_relationships (organization_id, person_id, branch_id)
  WHERE archived_at IS NULL;
CREATE INDEX person_branch_relationships_org_branch_active_idx
  ON public.person_branch_relationships (organization_id, branch_id, person_id)
  WHERE archived_at IS NULL;
CREATE INDEX person_branch_relationships_org_person_active_idx
  ON public.person_branch_relationships (organization_id, person_id, branch_id)
  WHERE archived_at IS NULL;

ALTER TABLE public.person_branch_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_branch_relationships FORCE ROW LEVEL SECURITY;

CREATE POLICY person_branch_relationships_authenticated_select
ON public.person_branch_relationships
FOR SELECT TO authenticated
USING (
  app_private.has_org_permission(
    organization_id,
    'people.view'::public.organization_permission_key
  )
  AND app_private.can_access_branch(organization_id, branch_id)
);

CREATE FUNCTION app_private.assert_branch_permission(
  p_organization_id uuid,
  p_branch_id uuid,
  p_permission_key public.organization_permission_key
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

  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id, NULL, NULL
  );
  PERFORM app_private.lock_current_organization_membership(p_organization_id);
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id, p_branch_id, NULL
  );

  IF NOT app_private.has_org_permission(p_organization_id, p_permission_key)
    OR NOT app_private.can_access_branch(p_organization_id, p_branch_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor_id;
END;
$$;

CREATE FUNCTION app_private.create_person_branch_relationship_checked(
  p_organization_id uuid,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_relationship_id uuid;
BEGIN
  v_actor_id := app_private.assert_branch_permission(
    p_organization_id,
    p_branch_id,
    'people.write'::public.organization_permission_key
  );

  PERFORM 1 FROM public.people AS person
  WHERE person.organization_id = p_organization_id AND person.id = p_person_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.person_branch_relationships (
    organization_id, person_id, branch_id, created_by
  ) VALUES (p_organization_id, p_person_id, p_branch_id, v_actor_id)
  ON CONFLICT (organization_id, person_id, branch_id)
    WHERE archived_at IS NULL
  DO UPDATE SET person_id = EXCLUDED.person_id
  RETURNING id INTO v_relationship_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.activity_logs
    WHERE organization_id = p_organization_id
      AND entity_type = 'person_branch_relationship'
      AND entity_id = v_relationship_id
      AND action = 'person_branch_relationship_created'
  ) THEN
    INSERT INTO public.activity_logs (
      organization_id, actor_id, entity_type, entity_id, action, new_values
    ) VALUES (
      p_organization_id, v_actor_id, 'person_branch_relationship',
      v_relationship_id, 'person_branch_relationship_created',
      jsonb_build_object('person_id', p_person_id, 'branch_id', p_branch_id)
    );
  END IF;

  RETURN v_relationship_id;
END;
$$;

CREATE FUNCTION app_private.archive_person_branch_relationship_checked(
  p_organization_id uuid,
  p_relationship_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_target public.person_branch_relationships%ROWTYPE;
BEGIN
  SELECT * INTO v_target
  FROM public.person_branch_relationships
  WHERE organization_id = p_organization_id AND id = p_relationship_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person branch relationship not found' USING ERRCODE='23503'; END IF;

  v_actor_id := app_private.assert_branch_permission(
    p_organization_id, v_target.branch_id,
    'people.archive'::public.organization_permission_key
  );
  SELECT * INTO v_target FROM public.person_branch_relationships
  WHERE organization_id = p_organization_id AND id = p_relationship_id
  FOR UPDATE;
  IF v_target.archived_at IS NOT NULL THEN RETURN p_relationship_id; END IF;

  UPDATE public.person_branch_relationships
  SET archived_at=now(), archived_by=v_actor_id
  WHERE id=p_relationship_id;
  INSERT INTO public.activity_logs (
    organization_id, actor_id, entity_type, entity_id, action, previous_values, new_values
  ) VALUES (
    p_organization_id, v_actor_id, 'person_branch_relationship', p_relationship_id,
    'person_branch_relationship_archived',
    jsonb_build_object('archived_at',NULL,'person_id',v_target.person_id,'branch_id',v_target.branch_id),
    jsonb_build_object('archived_at',now(),'person_id',v_target.person_id,'branch_id',v_target.branch_id)
  );
  RETURN p_relationship_id;
END;
$$;

CREATE FUNCTION public.archive_person_branch_relationship(
  p_organization_id uuid,
  p_relationship_id uuid
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT app_private.archive_person_branch_relationship_checked($1,$2) $$;

-- Allow a checked Property creation wrapper to inject its already-authorized
-- branch into the existing, fully validated Property RPCs without changing
-- either released compatibility signature.
CREATE OR REPLACE FUNCTION app_private.guard_property_branch_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capability_token text;
  v_checked_context boolean;
  v_creation_branch text;
  v_scope_changed boolean;
BEGIN
  SELECT capability.capability_token INTO STRICT v_capability_token
  FROM app_private.property_branch_assignment_context_capability AS capability
  WHERE capability.singleton;
  v_checked_context := coalesce(pg_catalog.current_setting('app.property_branch_assignment_context',true),'') = v_capability_token;
  v_creation_branch := nullif(pg_catalog.current_setting('app.property_creation_branch_id',true),'');
  IF TG_OP='INSERT' AND NEW.branch_id IS NULL AND v_checked_context AND v_creation_branch IS NOT NULL THEN
    NEW.branch_id := v_creation_branch::uuid;
  END IF;
  v_scope_changed := CASE WHEN TG_OP='INSERT' THEN NEW.branch_id IS NOT NULL ELSE OLD.organization_id IS DISTINCT FROM NEW.organization_id OR OLD.branch_id IS DISTINCT FROM NEW.branch_id END;
  IF NOT v_checked_context THEN
    PERFORM app_private.lock_organization_authorization_scope(NEW.organization_id,NULL,NULL);
  END IF;
  IF v_scope_changed AND NOT v_checked_context THEN
    RAISE EXCEPTION 'Property branch changes require the checked assignment path.' USING ERRCODE='42501';
  END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_branches AS branch
    WHERE branch.organization_id=NEW.organization_id AND branch.id=NEW.branch_id
      AND branch.status='active' AND branch.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'An active branch in this organization is required.' USING ERRCODE='23514'; END IF;
  IF NEW.branch_id IS NULL AND EXISTS (
    SELECT 1 FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id=NEW.organization_id AND authorization_state.ordinary_access_enabled
  ) THEN RAISE EXCEPTION 'Ordinary access requires every Property to retain an active branch.' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_property_minimal(
  p_organization_id uuid, p_branch_id uuid, p_name text, p_code text,
  p_property_type text, p_address text, p_registered_date date,
  p_idempotency_key text, p_owner_person_id uuid, p_owner_started_on date,
  p_owner_ownership_percent numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_token text; v_id uuid;
BEGIN
  PERFORM app_private.assert_branch_permission(p_organization_id,p_branch_id,'properties.write');
  SELECT capability_token INTO STRICT v_token FROM app_private.property_branch_assignment_context_capability WHERE singleton;
  PERFORM set_config('app.property_branch_assignment_context',v_token,true);
  PERFORM set_config('app.property_creation_branch_id',p_branch_id::text,true);
  v_id := public.create_property_minimal(p_organization_id,p_name,p_code,p_property_type,p_address,p_registered_date,p_idempotency_key,p_owner_person_id,p_owner_started_on,p_owner_ownership_percent);
  PERFORM set_config('app.property_creation_branch_id','',true);
  PERFORM set_config('app.property_branch_assignment_context','off',true);
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.property_creation_branch_id','',true);
  PERFORM set_config('app.property_branch_assignment_context','off',true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_property(
  p_organization_id uuid, p_branch_id uuid, p_name text, p_code text,
  p_property_type text, p_owner text, p_address text, p_status text,
  p_acquisition_date date, p_notes text, p_owner_person_id uuid,
  p_owner_started_on date, p_owner_ownership_percent numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_token text; v_id uuid;
BEGIN
  PERFORM app_private.assert_branch_permission(p_organization_id,p_branch_id,'properties.write');
  SELECT capability_token INTO STRICT v_token FROM app_private.property_branch_assignment_context_capability WHERE singleton;
  PERFORM set_config('app.property_branch_assignment_context',v_token,true);
  PERFORM set_config('app.property_creation_branch_id',p_branch_id::text,true);
  v_id := public.create_property(p_organization_id,p_name,p_code,p_property_type,p_owner,p_address,p_status,p_acquisition_date,p_notes,p_owner_person_id,p_owner_started_on,p_owner_ownership_percent);
  PERFORM set_config('app.property_creation_branch_id','',true);
  PERFORM set_config('app.property_branch_assignment_context','off',true);
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.property_creation_branch_id','',true);
  PERFORM set_config('app.property_branch_assignment_context','off',true);
  RAISE;
END;
$$;

CREATE FUNCTION public.create_person(
  p_organization_id uuid, p_display_name text, p_legal_name text,
  p_party_type text, p_primary_email text, p_primary_phone text,
  p_tax_identifier text, p_notes text, p_roles text[], p_branch_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid; v_id uuid; v_roles text[]; v_name text:=trim(coalesce(p_display_name,''));
BEGIN
  v_actor := app_private.assert_branch_permission(p_organization_id,p_branch_id,'people.write');
  IF length(v_name)=0 OR length(v_name)>140 THEN RAISE EXCEPTION 'Display name is invalid' USING ERRCODE='22023'; END IF;
  IF lower(trim(coalesce(p_party_type,''))) NOT IN ('individual','company') THEN RAISE EXCEPTION 'Party type is not supported' USING ERRCODE='22023'; END IF;
  INSERT INTO public.people(organization_id,display_name,legal_name,party_type,primary_email,primary_phone,tax_identifier,notes,created_by,updated_by)
  VALUES(p_organization_id,v_name,nullif(trim(coalesce(p_legal_name,'')),''),lower(trim(p_party_type)),nullif(trim(coalesce(p_primary_email,'')),''),nullif(trim(coalesce(p_primary_phone,'')),''),nullif(trim(coalesce(p_tax_identifier,'')),''),nullif(trim(coalesce(p_notes,'')),''),v_actor,v_actor)
  RETURNING id INTO v_id;
  v_roles := app_private.sync_person_roles(p_organization_id,v_id,p_roles);
  PERFORM app_private.create_person_branch_relationship_checked(p_organization_id,v_id,p_branch_id);
  INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
  VALUES(p_organization_id,v_actor,'person',v_id,'created',jsonb_build_object('display_name',v_name,'party_type',lower(trim(p_party_type)),'roles',to_jsonb(v_roles)));
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_person(
  p_organization_id uuid, p_display_name text, p_legal_name text,
  p_party_type text, p_primary_email text, p_primary_phone text,
  p_tax_identifier text, p_notes text, p_roles text[], p_passport_number text,
  p_passport_expiry_date date, p_visa_expiry_date date, p_branch_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_id uuid; v_passport text:=nullif(trim(coalesce(p_passport_number,'')),'');
BEGIN
  IF (v_passport IS NULL) <> (p_passport_expiry_date IS NULL) THEN RAISE EXCEPTION 'Passport number and expiry date must be entered together' USING ERRCODE='22023'; END IF;
  v_id := public.create_person(p_organization_id,p_display_name,p_legal_name,p_party_type,p_primary_email,p_primary_phone,p_tax_identifier,p_notes,p_roles,p_branch_id);
  IF v_passport IS NOT NULL OR p_visa_expiry_date IS NOT NULL THEN
    INSERT INTO public.person_travel_documents(person_id,organization_id,passport_number,passport_expiry_date,visa_expiry_date,created_by,updated_by)
    VALUES(v_id,p_organization_id,v_passport,p_passport_expiry_date,p_visa_expiry_date,auth.uid(),auth.uid());
    INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
    VALUES(p_organization_id,auth.uid(),'person',v_id,'travel_documents_recorded',jsonb_build_object('passportRecorded',v_passport IS NOT NULL,'visaExpiryRecorded',p_visa_expiry_date IS NOT NULL));
  END IF;
  RETURN v_id;
END;
$$;

-- Preserve all four Unit signatures while replacing the fixed-role precheck
-- in the authoritative overloads with exact same-branch permission checks.
DO $$
DECLARE v_oid oid; v_definition text;
BEGIN
  FOREACH v_oid IN ARRAY ARRAY[
    'public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text)'::regprocedure::oid,
    'public.update_unit(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text)'::regprocedure::oid
  ] LOOP
    SELECT pg_get_functiondef(v_oid) INTO v_definition;
    v_definition := replace(v_definition,
      'IF NOT app_private.is_org_admin(p_organization_id) THEN',
      'IF NOT app_private.can_access_property(p_organization_id, p_property_id, ''properties.write''::public.organization_permission_key) THEN');
    v_definition := replace(v_definition,' LANGUAGE plpgsql' || E'\n',' LANGUAGE plpgsql' || E'\n SECURITY DEFINER' || E'\n');
    EXECUTE v_definition;
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.properties, public.units, public.people,
  public.person_roles, public.person_travel_documents,
  public.person_branch_relationships
FROM anon, authenticated, service_role;
REVOKE ALL ON public.person_branch_relationships FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.person_branch_relationships TO authenticated, service_role;

REVOKE ALL ON FUNCTION app_private.assert_branch_permission(uuid,uuid,public.organization_permission_key) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.create_person_branch_relationship_checked(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION app_private.archive_person_branch_relationship_checked(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.create_person_branch_relationship_checked(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.archive_person_branch_relationship_checked(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_person_branch_relationship(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.archive_person_branch_relationship(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_property_minimal(uuid,uuid,text,text,text,text,date,text,uuid,date,numeric) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_property_minimal(uuid,uuid,text,text,text,text,date,text,uuid,date,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.create_property(uuid,uuid,text,text,text,text,text,text,date,text,uuid,date,numeric) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_property(uuid,uuid,text,text,text,text,text,text,date,text,uuid,date,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.create_person(uuid,text,text,text,text,text,text,text,text[],uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_person(uuid,text,text,text,text,text,text,text,text[],uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_person(uuid,text,text,text,text,text,text,text,text[],text,date,date,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_person(uuid,text,text,text,text,text,text,text,text[],text,date,date,uuid) TO authenticated;

REVOKE ALL ON FUNCTION app_private.guard_property_branch_scope() FROM PUBLIC,anon,authenticated,service_role;

-- Compatibility Property RPCs retain their signatures and validation, but a
-- checked branch-aware wrapper may pass the private capability after the same
-- authority was locked and revalidated.
CREATE FUNCTION app_private.checked_property_creation_allowed(
  p_organization_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT app_private.is_super_admin(p_organization_id)
    OR (
      coalesce(pg_catalog.current_setting('app.property_branch_assignment_context',true),'') =
        (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton)
      AND nullif(pg_catalog.current_setting('app.property_creation_branch_id',true),'') IS NOT NULL
      AND app_private.has_org_permission(p_organization_id,'properties.write'::public.organization_permission_key)
      AND app_private.can_access_branch(
        p_organization_id,
        nullif(pg_catalog.current_setting('app.property_creation_branch_id',true),'')::uuid
      )
    );
$$;

DO $$
DECLARE v_oid oid; v_definition text;
BEGIN
  FOREACH v_oid IN ARRAY ARRAY[
    'public.create_property_minimal(uuid,text,text,text,text,date,text,uuid,date,numeric)'::regprocedure::oid,
    'public.create_property(uuid,text,text,text,text,text,text,date,text,uuid,date,numeric)'::regprocedure::oid
  ] LOOP
    SELECT pg_get_functiondef(v_oid) INTO v_definition;
    v_definition := replace(
      v_definition,
      'app_private.is_org_admin(p_organization_id)',
      'app_private.checked_property_creation_allowed(p_organization_id)'
    );
    EXECUTE v_definition;
  END LOOP;
END;
$$;

ALTER FUNCTION public.update_unit(uuid,uuid,uuid,text,text,numeric,text)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.create_person(uuid,text,text,text,text,text,text,text,text[])
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.create_person(uuid,text,text,text,text,text,text,text,text[],text,date,date)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[],text,date,date)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.archive_property(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.restore_property(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.archive_unit(uuid,uuid)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.restore_unit(uuid,uuid)
  SECURITY DEFINER SET search_path='';

REVOKE ALL ON FUNCTION app_private.checked_property_creation_allowed(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Extend deterministic Person visibility without turning identity into a
-- single-branch record. The released relationship-derived resolver remains
-- intact behind this wrapper.
ALTER FUNCTION app_private.person_is_visible_in_branch(uuid,uuid,uuid)
  RENAME TO person_is_visible_in_branch_without_explicit_relationship;

CREATE FUNCTION app_private.person_is_visible_in_branch(
  p_organization_id uuid,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT
    app_private.person_is_visible_in_branch_without_explicit_relationship($1,$2,$3)
    OR (
      app_private.has_org_permission(
        $1,
        'people.view'::public.organization_permission_key
      )
      AND app_private.current_active_branch_id($1) = $3
      AND EXISTS (
        SELECT 1
        FROM public.people AS person
        JOIN public.person_branch_relationships AS relationship
          ON relationship.organization_id = person.organization_id
         AND relationship.person_id = person.id
         AND relationship.branch_id = $3
         AND relationship.archived_at IS NULL
        WHERE person.organization_id = $1
          AND person.id = $2
      )
    );
$$;

DROP POLICY IF EXISTS "Authorized users can read people" ON public.people;
CREATE POLICY "Authorized users can read people" ON public.people
FOR SELECT TO authenticated
USING (
  app_private.person_is_visible_in_branch(
    organization_id,id,app_private.current_active_branch_id(organization_id)
  )
);
DROP POLICY IF EXISTS "Authorized users can read person roles" ON public.person_roles;
CREATE POLICY "Authorized users can read person roles" ON public.person_roles
FOR SELECT TO authenticated
USING (
  app_private.person_is_visible_in_branch(
    organization_id,person_id,app_private.current_active_branch_id(organization_id)
  )
);

DROP INDEX public.person_branch_relationships_org_person_active_idx;
CREATE INDEX person_branch_relationships_org_person_idx
  ON public.person_branch_relationships(organization_id,person_id);
CREATE INDEX person_branch_relationships_org_branch_idx
  ON public.person_branch_relationships(organization_id,branch_id);

CREATE FUNCTION public.create_person_branch_relationship(
  p_organization_id uuid,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  PERFORM app_private.lock_organization_authorization_scope($1,NULL,NULL);
  PERFORM app_private.lock_current_organization_membership($1);
  PERFORM app_private.assert_role_super_admin($1);
  RETURN app_private.create_person_branch_relationship_checked($1,$2,$3);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_person_branch_relationship(
  p_organization_id uuid,
  p_relationship_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  PERFORM app_private.lock_organization_authorization_scope($1,NULL,NULL);
  PERFORM app_private.lock_current_organization_membership($1);
  PERFORM app_private.assert_role_super_admin($1);
  RETURN app_private.archive_person_branch_relationship_checked($1,$2);
END;
$$;

REVOKE ALL ON FUNCTION app_private.person_is_visible_in_branch_without_explicit_relationship(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.person_is_visible_in_branch(uuid,uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.person_is_visible_in_branch(uuid,uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.create_person_branch_relationship_checked(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.archive_person_branch_relationship_checked(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_person_branch_relationship(uuid,uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_person_branch_relationship(uuid,uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.archive_person_branch_relationship(uuid,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.archive_person_branch_relationship(uuid,uuid)
  TO authenticated;

-- An idempotent minimal replay must prove branch identity before the released
-- RPC can replay ownership convergence.
CREATE OR REPLACE FUNCTION public.create_property_minimal(
  p_organization_id uuid, p_branch_id uuid, p_name text, p_code text,
  p_property_type text, p_address text, p_registered_date date,
  p_idempotency_key text, p_owner_person_id uuid, p_owner_started_on date,
  p_owner_ownership_percent numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_token text; v_id uuid;
BEGIN
  PERFORM app_private.assert_branch_permission($1,$2,'properties.write');
  v_id := extensions.uuid_generate_v5(
    p_organization_id,
    'property_minimal_v1:' || pg_catalog.btrim(coalesce(p_idempotency_key,''))
  );
  IF EXISTS (
    SELECT 1 FROM public.properties AS property
    WHERE property.id=v_id
      AND (
        property.organization_id IS DISTINCT FROM p_organization_id
        OR property.branch_id IS DISTINCT FROM p_branch_id
      )
  ) THEN
    RAISE EXCEPTION 'Conflicting Property creation branch'
      USING ERRCODE='22023', DETAIL='property_creation_branch_conflict';
  END IF;
  SELECT capability_token INTO STRICT v_token
  FROM app_private.property_branch_assignment_context_capability WHERE singleton;
  PERFORM set_config('app.property_branch_assignment_context',v_token,true);
  PERFORM set_config('app.property_creation_branch_id',p_branch_id::text,true);
  v_id := public.create_property_minimal(p_organization_id,p_name,p_code,p_property_type,p_address,p_registered_date,p_idempotency_key,p_owner_person_id,p_owner_started_on,p_owner_ownership_percent);
  IF NOT EXISTS (
    SELECT 1 FROM public.properties AS property
    WHERE property.id=v_id AND property.organization_id=p_organization_id
      AND property.branch_id=p_branch_id
  ) THEN
    RAISE EXCEPTION 'Conflicting Property creation branch'
      USING ERRCODE='22023', DETAIL='property_creation_branch_conflict';
  END IF;
  PERFORM set_config('app.property_creation_branch_id','',true);
  PERFORM set_config('app.property_branch_assignment_context','off',true);
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.property_creation_branch_id','',true);
  PERFORM set_config('app.property_branch_assignment_context','off',true);
  RAISE;
END;
$$;

ALTER FUNCTION public.create_property(uuid,text,text,text,text,text,text,date,text,uuid,date,numeric)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.create_property(uuid,uuid,text,text,text,text,text,text,date,text,uuid,date,numeric)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.create_property_minimal(uuid,text,text,text,text,date,text,uuid,date,numeric)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.create_property_minimal(uuid,uuid,text,text,text,text,date,text,uuid,date,numeric)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text)
  SECURITY DEFINER SET search_path='';
ALTER FUNCTION public.update_unit(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text)
  SECURITY DEFINER SET search_path='';

CREATE OR REPLACE FUNCTION app_private.assert_branch_permission(
  p_organization_id uuid,
  p_branch_id uuid,
  p_permission_key public.organization_permission_key
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
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,NULL,NULL
  );
  PERFORM app_private.lock_current_organization_membership(p_organization_id);
  PERFORM app_private.lock_organization_authorization_scope(
    p_organization_id,p_branch_id,NULL
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_branches AS branch
    WHERE branch.organization_id=p_organization_id
      AND branch.id=p_branch_id
      AND branch.status='active'
      AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT app_private.has_org_permission(p_organization_id,p_permission_key)
    OR NOT app_private.can_access_branch(p_organization_id,p_branch_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  RETURN v_actor_id;
END;
$$;

CREATE INDEX person_branch_relationships_created_by_idx
  ON public.person_branch_relationships(created_by);
CREATE INDEX person_branch_relationships_archived_by_idx
  ON public.person_branch_relationships(archived_by);

REVOKE ALL ON FUNCTION app_private.assert_branch_permission(
  uuid,uuid,public.organization_permission_key
) FROM PUBLIC,anon,authenticated,service_role;
