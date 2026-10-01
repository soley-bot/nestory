CREATE TABLE app_private.owner_statement_renderings (
  organization_id uuid NOT NULL,
  publication_id uuid PRIMARY KEY,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  CONSTRAINT owner_statement_renderings_publication_fk
    FOREIGN KEY (organization_id, publication_id)
    REFERENCES public.owner_statement_publications (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT owner_statement_renderings_snapshot_check CHECK (
    pg_catalog.jsonb_typeof(snapshot) = 'object'
    AND snapshot->>'rendererVersion' IS NOT DISTINCT FROM 'owner-statement-v1'
    AND pg_catalog.jsonb_typeof(snapshot->'presentation') IS NOT DISTINCT FROM 'object'
    AND pg_catalog.octet_length(snapshot::text) <= 8388608
  )
);

ALTER TABLE app_private.owner_statement_renderings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.owner_statement_renderings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.owner_statement_renderings
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.guard_owner_statement_rendering_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'owner_statement_rendering_immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER guard_owner_statement_rendering_write
  BEFORE UPDATE OR DELETE ON app_private.owner_statement_renderings
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_owner_statement_rendering_write();

CREATE FUNCTION public.get_owner_statement_rendering(
  p_organization_id uuid,
  p_publication_id uuid,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app_private.can_access_owner_statement_publication_as_actor(
    p_organization_id, p_actor_id, p_publication_id, 'finance.publish'
  ) THEN
    RAISE EXCEPTION 'owner_statement_rendering_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT rendering.snapshot
    FROM app_private.owner_statement_renderings AS rendering
    WHERE rendering.organization_id = p_organization_id
      AND rendering.publication_id = p_publication_id
  );
END;
$$;

CREATE FUNCTION public.freeze_owner_statement_rendering(
  p_organization_id uuid,
  p_publication_id uuid,
  p_actor_id uuid,
  p_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app_private.can_access_owner_statement_publication_as_actor(
    p_organization_id, p_actor_id, p_publication_id, 'finance.publish'
  ) THEN
    RAISE EXCEPTION 'owner_statement_rendering_forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app_private.owner_statement_renderings (
    organization_id, publication_id, snapshot, created_by
  ) VALUES (
    p_organization_id, p_publication_id, p_snapshot, p_actor_id
  ) ON CONFLICT (publication_id) DO NOTHING;

  RETURN (
    SELECT rendering.snapshot
    FROM app_private.owner_statement_renderings AS rendering
    WHERE rendering.organization_id = p_organization_id
      AND rendering.publication_id = p_publication_id
  );
END;
$$;

ALTER TABLE app_private.owner_statement_renderings OWNER TO postgres;
ALTER FUNCTION app_private.guard_owner_statement_rendering_write() OWNER TO postgres;
ALTER FUNCTION public.get_owner_statement_rendering(uuid, uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.freeze_owner_statement_rendering(uuid, uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.guard_owner_statement_rendering_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_owner_statement_rendering(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.freeze_owner_statement_rendering(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_rendering(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.freeze_owner_statement_rendering(uuid, uuid, uuid, jsonb) TO service_role;
